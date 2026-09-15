package com.dibay.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Native Startup Intro Surface — Admin cache driven.
 * CONTRACT: never wait on network at cold start; next-cold applies after atomic cache swap.
 * DO NOT: fake AppShell / BottomNav / Web Intro.
 */
public final class DibayStartupIntroSurface {
  private static final String TAG = "DIBAY_StartupIntro";
  private static final String DIR = "startup";
  private static final String CONFIG_ACTIVE = "startup-config.json";
  private static final String CONFIG_STAGING = "startup-config.staging.json";
  private static final String LOGO_ACTIVE = "startup-logo.bin";
  private static final String LOGO_STAGING = "startup-logo.staging.bin";
  private static final String BG_ACTIVE = "startup-background.bin";
  private static final String BG_STAGING = "startup-background.staging.bin";
  private static final String PI_CONFIG_ACTIVE = "product-intro.json";
  private static final String PI_CONFIG_STAGING = "product-intro.staging.json";
  private static final String PI_MEDIA_ACTIVE = "product-intro-media.bin";
  private static final String PI_MEDIA_STAGING = "product-intro-media.staging.bin";
  /** Commit marker — cold FE reads only when this exists with matching generationId. */
  private static final String PI_GENERATION_ACTIVE = "product-intro.generation";
  private static final String PI_GENERATION_STAGING = "product-intro.generation.staging";
  /** Bundled launch canvas + Admin FE default background. */
  private static final int CANVAS_BG = 0xFFFFFCFC;

  private final Activity activity;
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newSingleThreadExecutor();
  private FrameLayout root;
  private View content;
  private boolean attached;
  private boolean dismissing;
  private JSONObject activeConfig = new JSONObject();
  private boolean usingProductIntro;

  public DibayStartupIntroSurface(Activity activity) {
    this.activity = activity;
  }

  /** Attach overlay ASAP after Activity content exists. Uses last atomic cache or defaults. */
  public void attachIfNeeded() {
    if (attached) return;
    ViewGroup decor = (ViewGroup) activity.getWindow().getDecorView();
    if (decor == null) return;
    ViewGroup contentParent = decor.findViewById(android.R.id.content);
    if (contentParent == null) return;

    activeConfig = readActiveConfig(activity);
    JSONObject productIntro = readActiveProductIntroGeneration(activity);
    Bitmap productBmp = productIntro != null ? loadLocalProductIntroMedia() : null;
    usingProductIntro = productIntro != null && productBmp != null;

    root = new FrameLayout(activity);
    root.setLayoutParams(
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    root.setClickable(true);
    root.setFocusable(true);

    if (usingProductIntro) {
      String bg = productIntro.optString("backgroundColor", "#FFFCFC");
      root.setBackgroundColor(parseColor(bg, CANVAS_BG));
      content = buildProductIntroContent(productIntro, productBmp);
      root.addView(
          content,
          new FrameLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    } else {
      // V2 logo canvas: same bundled cream + centered logo (no Technical FE product).
      root.setBackgroundColor(CANVAS_BG);
      content = buildLogoCanvasContent();
      root.addView(
          content,
          new FrameLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }
    contentParent.addView(root);
    attached = true;
    // OS Splash → Native continuation = ONE continuous canvas (no enter anim).
    holdTechnicalHandoffAtRest();
    Log.i(
        TAG,
        "intro_attach version="
            + activeConfig.optInt("version", 0)
            + " product_intro="
            + usingProductIntro
            + " continuity=os_native_handoff enter=none fit=contain");
  }

  public boolean isAttached() {
    return attached && root != null;
  }

  /**
   * Persist JSON from Web bridge + download remote assets in background.
   * Atomic activate only when config+assets OK. Never blocks UI.
   */
  public void persistFromBridgeJson(String json) {
    if (json == null || json.trim().isEmpty()) return;
    io.execute(
        () -> {
          try {
            JSONObject next = new JSONObject(json);
            File dir = dir(activity);
            if (!dir.exists() && !dir.mkdirs()) {
              Log.w(TAG, "persist_mkdir_failed");
              return;
            }
            writeText(new File(dir, CONFIG_STAGING), next.toString());

            String logoUrl = optHttpUrl(next.optString("logoUrl", null));
            String bgUrl = optHttpUrl(next.optString("backgroundImageUrl", null));
            boolean logoOk = true;
            boolean bgOk = true;
            if (logoUrl != null) {
              logoOk = downloadTo(logoUrl, new File(dir, LOGO_STAGING));
            } else {
              new File(dir, LOGO_STAGING).delete();
            }
            if ("image".equals(next.optString("backgroundType", "solid")) && bgUrl != null) {
              bgOk = downloadTo(bgUrl, new File(dir, BG_STAGING));
            } else {
              new File(dir, BG_STAGING).delete();
            }
            if (!logoOk || !bgOk) {
              Log.w(TAG, "persist_assets_incomplete logoOk=" + logoOk + " bgOk=" + bgOk);
              return;
            }
            // Atomic-ish swap: rename staging → active
            swapFile(new File(dir, CONFIG_STAGING), new File(dir, CONFIG_ACTIVE));
            if (logoUrl != null) {
              swapFile(new File(dir, LOGO_STAGING), new File(dir, LOGO_ACTIVE));
            } else {
              new File(dir, LOGO_ACTIVE).delete();
            }
            if (bgUrl != null && "image".equals(next.optString("backgroundType", "solid"))) {
              swapFile(new File(dir, BG_STAGING), new File(dir, BG_ACTIVE));
            } else {
              new File(dir, BG_ACTIVE).delete();
            }
            String surface = next.optString("initialSurface", "community");
            activity
                .getSharedPreferences("dibay_startup", Context.MODE_PRIVATE)
                .edit()
                .putString("initial_surface", surface)
                .apply();
            Log.i(TAG, "persist_ok surface=" + surface);
          } catch (Exception e) {
            Log.w(TAG, "persist_failed: " + e.getMessage());
          }
        });
  }

  /**
   * Persist Admin Product Intro as one ACTIVE generation for next cold.
   * Never blocks App Ready. Incomplete download keeps prior generation.
   * Forbidden: orphan media, JSON-only, mixed generations.
   */
  public void persistProductIntroFromBridgeJson(String json) {
    if (json == null || json.trim().isEmpty()) return;
    io.execute(
        () -> {
          try {
            JSONObject next = new JSONObject(json);
            File dir = dir(activity);
            if (!dir.exists() && !dir.mkdirs()) {
              Log.w(TAG, "pi_persist_mkdir_failed");
              return;
            }
            String status = next.optString("status", "inactive");
            String mediaUrl = optHttpUrl(next.optString("mediaUrl", null));
            String generationId = next.optString("generationId", "");
            if (generationId == null || generationId.trim().isEmpty()) {
              generationId =
                  next.optString("updatedAt", "") + "|" + next.optString("mediaUrl", "");
              next.put("generationId", generationId);
            }

            File genActive = new File(dir, PI_GENERATION_ACTIVE);
            if (genActive.exists()) {
              try {
                String prev = readTextLimited(genActive, 4096);
                JSONObject prevGen = new JSONObject(prev);
                if (generationId.equals(prevGen.optString("generationId", ""))
                    && "active".equals(status)
                    && mediaUrl != null
                    && new File(dir, PI_MEDIA_ACTIVE).exists()
                    && new File(dir, PI_CONFIG_ACTIVE).exists()) {
                  Log.i(TAG, "pi_persist_skip identity_unchanged");
                  return;
                }
              } catch (Exception ignored) {
                /* continue materialize */
              }
            }

            if (!"active".equals(status) || mediaUrl == null) {
              clearActiveProductIntroGeneration(dir);
              writeText(new File(dir, PI_CONFIG_STAGING), next.toString());
              swapFile(new File(dir, PI_CONFIG_STAGING), new File(dir, PI_CONFIG_ACTIVE));
              Log.i(TAG, "pi_persist_cleared status=" + status);
              return;
            }

            File mediaStaging = new File(dir, PI_MEDIA_STAGING);
            boolean mediaOk = downloadTo(mediaUrl, mediaStaging);
            if (!mediaOk) {
              Log.w(TAG, "pi_persist_media_incomplete");
              return;
            }
            Bitmap probe =
                BitmapFactory.decodeStream(new FileInputStream(mediaStaging));
            if (probe == null || probe.getWidth() <= 0 || probe.getHeight() <= 0) {
              mediaStaging.delete();
              Log.w(TAG, "pi_persist_media_undecodable");
              return;
            }
            probe.recycle();

            next.put("objectFit", "contain");
            writeText(new File(dir, PI_CONFIG_STAGING), next.toString());
            JSONObject gen = new JSONObject();
            gen.put("generationId", generationId);
            gen.put("mediaUrl", mediaUrl);
            gen.put("mediaBytes", mediaStaging.length());
            gen.put("committedAt", System.currentTimeMillis());
            writeText(new File(dir, PI_GENERATION_STAGING), gen.toString());

            // Commit order: media → config → generation marker (ACTIVE only when complete).
            swapFile(mediaStaging, new File(dir, PI_MEDIA_ACTIVE));
            swapFile(new File(dir, PI_CONFIG_STAGING), new File(dir, PI_CONFIG_ACTIVE));
            swapFile(new File(dir, PI_GENERATION_STAGING), genActive);
            Log.i(TAG, "pi_persist_ok generation=" + generationId);
          } catch (Exception e) {
            Log.w(TAG, "pi_persist_failed: " + e.getMessage());
          }
        });
  }

  /**
   * V2 Admin First Entry — full-device canvas + CONTAIN creative. No crop/card/shadow/radius.
   */
  private View buildProductIntroContent(JSONObject pi, Bitmap bmp) {
    FrameLayout wrap = new FrameLayout(activity);
    ImageView image = new ImageView(activity);
    image.setImageBitmap(bmp);
    image.setScaleType(ImageView.ScaleType.FIT_CENTER);
    image.setAdjustViewBounds(true);
    FrameLayout.LayoutParams imgLp =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    imgLp.gravity = Gravity.CENTER;
    wrap.addView(image, imgLp);
    return wrap;
  }

  /** Same-canvas logo placeholder when no ACTIVE Admin generation (fail-open). */
  private View buildLogoCanvasContent() {
    FrameLayout wrap = new FrameLayout(activity);
    ImageView logo = new ImageView(activity);
    Bitmap bmp = loadLocalLogo();
    if (bmp != null) {
      logo.setImageBitmap(bmp);
    } else {
      try {
        logo.setImageResource(R.drawable.ic_dibay_splash_logo);
      } catch (Exception e) {
        try {
          logo.setImageResource(activity.getApplicationInfo().icon);
        } catch (Exception ignored) {
          /* empty canvas still OK */
        }
      }
    }
    logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
    int size =
        (int)
            TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, 128f, activity.getResources().getDisplayMetrics());
    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(size, size);
    lp.gravity = Gravity.CENTER;
    wrap.addView(logo, lp);
    return wrap;
  }

  private static boolean isProductIntroEligible(JSONObject pi) {
    if (pi == null || pi.length() == 0) return false;
    if (!"active".equals(pi.optString("status", "inactive"))) return false;
    String url = pi.optString("mediaUrl", "");
    if (url == null || url.trim().isEmpty()) return false;
    long now = System.currentTimeMillis();
    Long startMs = parseIsoMillis(pi.optString("startsAt", null));
    Long endMs = parseIsoMillis(pi.optString("endsAt", null));
    if (startMs != null && now < startMs) return false;
    if (endMs != null && now >= endMs) return false;
    return true;
  }

  /** Best-effort ISO-8601 parse for API 24+ without requiring java.time. */
  private static Long parseIsoMillis(String raw) {
    if (raw == null || raw.trim().isEmpty()) return null;
    try {
      String t = raw.trim();
      if (t.endsWith("Z")) t = t.substring(0, t.length() - 1) + "+0000";
      // Support both +00:00 and +0000
      if (t.length() > 5 && (t.charAt(t.length() - 3) == ':') && (t.charAt(t.length() - 6) == '+' || t.charAt(t.length() - 6) == '-')) {
        t = t.substring(0, t.length() - 3) + t.substring(t.length() - 2);
      }
      java.text.SimpleDateFormat fmt =
          new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", java.util.Locale.US);
      fmt.setLenient(true);
      java.util.Date d = fmt.parse(t);
      return d != null ? d.getTime() : null;
    } catch (Exception e) {
      try {
        java.text.SimpleDateFormat fmt2 =
            new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", java.util.Locale.US);
        String t = raw.trim();
        if (t.endsWith("Z")) t = t.substring(0, t.length() - 1) + "+0000";
        java.util.Date d = fmt2.parse(t);
        return d != null ? d.getTime() : null;
      } catch (Exception ignored) {
        return null;
      }
    }
  }

  /**
   * Cold FE reads only a complete ACTIVE generation (config + media + generation marker).
   * Orphan / partial states → null (logo canvas fail-open).
   * One-time repair: pre-V2 json+media without marker → write generation if eligible.
   */
  private static JSONObject readActiveProductIntroGeneration(Context ctx) {
    File dir = dir(ctx);
    File genFile = new File(dir, PI_GENERATION_ACTIVE);
    File cfgFile = new File(dir, PI_CONFIG_ACTIVE);
    File mediaFile = new File(dir, PI_MEDIA_ACTIVE);
    if (!cfgFile.exists() || !mediaFile.exists() || mediaFile.length() <= 0) {
      return null;
    }
    try {
      JSONObject pi = new JSONObject(readTextLimited(cfgFile, 256_000));
      if (!isProductIntroEligible(pi)) return null;
      String piId = pi.optString("generationId", "");
      if (piId == null || piId.trim().isEmpty()) {
        piId = pi.optString("updatedAt", "") + "|" + pi.optString("mediaUrl", "");
        pi.put("generationId", piId);
      }
      if (!genFile.exists()) {
        JSONObject gen = new JSONObject();
        gen.put("generationId", piId);
        gen.put("mediaUrl", pi.optString("mediaUrl", ""));
        gen.put("mediaBytes", mediaFile.length());
        gen.put("committedAt", System.currentTimeMillis());
        gen.put("repaired", true);
        writeText(genFile, gen.toString());
        writeText(cfgFile, pi.toString());
      } else {
        JSONObject gen = new JSONObject(readTextLimited(genFile, 8192));
        String genId = gen.optString("generationId", "");
        if (genId.isEmpty() || !genId.equals(piId)) {
          return null;
        }
      }
      return pi;
    } catch (Exception e) {
      return null;
    }
  }

  private static void clearActiveProductIntroGeneration(File dir) {
    new File(dir, PI_GENERATION_ACTIVE).delete();
    new File(dir, PI_MEDIA_ACTIVE).delete();
    new File(dir, PI_CONFIG_STAGING).delete();
    new File(dir, PI_MEDIA_STAGING).delete();
    new File(dir, PI_GENERATION_STAGING).delete();
  }

  private static String readTextLimited(File f, int maxBytes) throws Exception {
    byte[] buf = new byte[(int) Math.min(f.length(), maxBytes)];
    try (FileInputStream in = new FileInputStream(f)) {
      int n = in.read(buf);
      if (n <= 0) return "";
      return new String(buf, 0, n, StandardCharsets.UTF_8);
    }
  }

  private static JSONObject readActiveProductIntro(Context ctx) {
    File f = new File(dir(ctx), PI_CONFIG_ACTIVE);
    if (!f.exists()) return new JSONObject();
    try {
      return new JSONObject(readTextLimited(f, 256_000));
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  private Bitmap loadLocalProductIntroMedia() {
    File f = new File(dir(activity), PI_MEDIA_ACTIVE);
    if (!f.exists() || f.length() <= 0) return null;
    try {
      return BitmapFactory.decodeStream(new FileInputStream(f));
    } catch (Exception e) {
      return null;
    }
  }

  /** shellReady path — exit animation then remove. Safety cleanup if animator never ends. */
  public void dismissWithExit(Runnable after) {
    if (!attached || root == null) {
      if (after != null) after.run();
      return;
    }
    if (dismissing) return;
    dismissing = true;
    // Admin First Entry: no second exit stage — drop immediately on app ready.
    String exit = usingProductIntro ? "none" : activeConfig.optString("exitAnimation", "fade_out");
    int dur = usingProductIntro ? 0 : clampDur(activeConfig.optInt("exitDurationMs", 220));
    Animator anim = buildExitAnimator(content != null ? content : root, exit, dur);
    final boolean[] done = {false};
    Runnable finish =
        () -> {
          if (done[0]) return;
          done[0] = true;
          try {
            if (root != null && root.getParent() instanceof ViewGroup) {
              ((ViewGroup) root.getParent()).removeView(root);
            }
          } catch (Exception ignored) {
            /* ignore */
          }
          root = null;
          content = null;
          attached = false;
          Log.i(TAG, "intro_removed");
          if (after != null) after.run();
        };
    if (anim == null || "none".equals(exit) || dur <= 0) {
      finish.run();
      return;
    }
    anim.addListener(
        new AnimatorListenerAdapter() {
          @Override
          public void onAnimationEnd(Animator animation) {
            finish.run();
          }
        });
    anim.start();
    mainHandler.postDelayed(finish, dur + 80L);
  }

  /**
   * Technical Boot handoff after OS Splash — keep logo/bg at rest.
   * Enter/ambient animators must not replay on OS→Native attach (CUT 1).
   * Exit animators remain for shellReady dismiss.
   */
  private void holdTechnicalHandoffAtRest() {
    if (content == null) return;
    content.setAlpha(1f);
    content.setScaleX(1f);
    content.setScaleY(1f);
    content.setTranslationX(0f);
    content.setTranslationY(0f);
  }

  private View buildContent(JSONObject cfg) {
    LinearLayout col = new LinearLayout(activity);
    col.setOrientation(LinearLayout.VERTICAL);
    col.setGravity(Gravity.CENTER_HORIZONTAL);
    String vertical = cfg.optString("logoVertical", "center");
    int gravity =
        "upper".equals(vertical)
            ? Gravity.TOP | Gravity.CENTER_HORIZONTAL
            : "lower".equals(vertical)
                ? Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL
                : Gravity.CENTER;
    col.setGravity(gravity);
    int pad = dp(24);
    col.setPadding(pad, pad * 2, pad, pad * 2);

    ImageView logo = new ImageView(activity);
    int size = logoWidthDp(cfg);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(size), dp(size));
    logo.setLayoutParams(lp);
    logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
    Bitmap bmp = loadLocalLogo();
    if (bmp != null) {
      logo.setImageBitmap(bmp);
    } else {
      try {
        logo.setImageResource(R.drawable.ic_dibay_splash_logo);
      } catch (Exception e) {
        logo.setImageResource(android.R.drawable.sym_def_app_icon);
      }
    }
    col.addView(logo);

    if (cfg.optBoolean("showWordmark", true)) {
      TextView wm = new TextView(activity);
      wm.setText(cfg.optString("wordmark", "DIBAY"));
      wm.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
      wm.setTypeface(wm.getTypeface(), android.graphics.Typeface.BOLD);
      wm.setTextColor(parseColor(cfg.optString("captionColor", "#0B421A"), 0xFF0B421A));
      wm.setGravity(Gravity.CENTER);
      LinearLayout.LayoutParams wlp =
          new LinearLayout.LayoutParams(
              ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      wlp.topMargin = dp(12);
      wm.setLayoutParams(wlp);
      col.addView(wm);
    }

    if (cfg.optBoolean("captionEnabled", false)) {
      String caption = cfg.optString("captionKo", "");
      if (caption.isEmpty()) caption = cfg.optString("captionEn", "");
      if (!caption.isEmpty()) {
        TextView cap = new TextView(activity);
        cap.setText(caption);
        cap.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        cap.setTextColor(parseColor(cfg.optString("captionColor", "#0B421A"), 0xFF0B421A));
        cap.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams clp =
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.topMargin = dp(8);
        cap.setLayoutParams(clp);
        col.addView(cap);
      }
    }

    if (cfg.optBoolean("showSpinner", true)
        || "spinner".equals(cfg.optString("ambientAnimation", "none"))) {
      ProgressBar spinner = new ProgressBar(activity);
      LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(dp(28), dp(28));
      slp.topMargin = dp(16);
      spinner.setLayoutParams(slp);
      col.addView(spinner);
    }
    return col;
  }

  private void applyBackground(View target, JSONObject cfg) {
    String type = cfg.optString("backgroundType", "solid");
    int solid = parseColor(cfg.optString("backgroundColor", "#FFFCFC"), 0xFFFFFCFC);
    if ("gradient".equals(type)) {
      int from = parseColor(cfg.optString("gradientFrom", "#FFFCFC"), solid);
      int to = parseColor(cfg.optString("gradientTo", "#FFFCFC"), solid);
      GradientDrawable gd =
          new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {from, to});
      String dir = cfg.optString("gradientDirection", "vertical");
      if ("horizontal".equals(dir)) gd.setOrientation(GradientDrawable.Orientation.LEFT_RIGHT);
      if ("diagonal".equals(dir)) gd.setOrientation(GradientDrawable.Orientation.TL_BR);
      target.setBackground(gd);
      return;
    }
    if ("image".equals(type)) {
      Bitmap bg = loadLocalBg();
      if (bg != null) {
        ImageView iv = new ImageView(activity);
        iv.setImageBitmap(bg);
        // Technical boot bg — CONTAIN (COVER/CENTER_CROP rejected for all startup surfaces).
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        if (root != null) {
          root.setBackgroundColor(solid);
          root.addView(
              iv,
              0,
              new FrameLayout.LayoutParams(
                  ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
          return;
        }
      }
    }
    target.setBackgroundColor(solid);
  }

  private Bitmap loadLocalLogo() {
    File f = new File(dir(activity), LOGO_ACTIVE);
    if (!f.exists() || f.length() <= 0) return null;
    try {
      return BitmapFactory.decodeStream(new FileInputStream(f));
    } catch (Exception e) {
      return null;
    }
  }

  private Bitmap loadLocalBg() {
    File f = new File(dir(activity), BG_ACTIVE);
    if (!f.exists() || f.length() <= 0) return null;
    try {
      return BitmapFactory.decodeStream(new FileInputStream(f));
    } catch (Exception e) {
      return null;
    }
  }

  private static JSONObject readActiveConfig(Context ctx) {
    File f = new File(dir(ctx), CONFIG_ACTIVE);
    if (!f.exists()) return defaultConfig();
    try {
      byte[] buf = new byte[(int) Math.min(f.length(), 256_000)];
      try (FileInputStream in = new FileInputStream(f)) {
        int n = in.read(buf);
        if (n <= 0) return defaultConfig();
        return new JSONObject(new String(buf, 0, n, StandardCharsets.UTF_8));
      }
    } catch (Exception e) {
      return defaultConfig();
    }
  }

  private static JSONObject defaultConfig() {
    try {
      JSONObject o = new JSONObject();
      o.put("version", 2);
      o.put("initialSurface", "community");
      o.put("backgroundType", "solid");
      o.put("backgroundColor", "#FFFCFC");
      o.put("logoSource", "default");
      o.put("logoWidthPreset", "medium");
      o.put("logoVertical", "center");
      o.put("wordmark", "DIBAY");
      o.put("showWordmark", true);
      o.put("showSpinner", true);
      o.put("enterAnimation", "none");
      o.put("exitAnimation", "fade_out");
      o.put("ambientAnimation", "none");
      o.put("enterDurationMs", 280);
      o.put("exitDurationMs", 220);
      return o;
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  private static File dir(Context ctx) {
    return new File(ctx.getFilesDir(), DIR);
  }

  private static void writeText(File file, String text) throws Exception {
    try (FileOutputStream out = new FileOutputStream(file)) {
      out.write(text.getBytes(StandardCharsets.UTF_8));
    }
  }

  private static void swapFile(File from, File to) {
    if (!from.exists()) return;
    if (to.exists()) to.delete();
    if (!from.renameTo(to)) {
      try {
        try (FileInputStream in = new FileInputStream(from);
            FileOutputStream out = new FileOutputStream(to)) {
          byte[] buf = new byte[8192];
          int n;
          while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        }
        from.delete();
      } catch (Exception e) {
        Log.w(TAG, "swap_copy_failed: " + e.getMessage());
      }
    }
  }

  private static boolean downloadTo(String urlStr, File dest) {
    HttpURLConnection conn = null;
    try {
      URL url = new URL(urlStr);
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(12_000);
      conn.setReadTimeout(20_000);
      conn.setInstanceFollowRedirects(true);
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) return false;
      File tmp = new File(dest.getAbsolutePath() + ".part");
      try (InputStream in = new BufferedInputStream(conn.getInputStream());
          FileOutputStream out = new FileOutputStream(tmp)) {
        byte[] buf = new byte[8192];
        int n;
        long total = 0;
        while ((n = in.read(buf)) > 0) {
          out.write(buf, 0, n);
          total += n;
          if (total > 3_000_000L) {
            tmp.delete();
            return false;
          }
        }
      }
      if (dest.exists()) dest.delete();
      return tmp.renameTo(dest) || (copyFile(tmp, dest) && tmp.delete());
    } catch (Exception e) {
      Log.w(TAG, "download_failed: " + e.getMessage());
      return false;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static boolean copyFile(File from, File to) {
    try (FileInputStream in = new FileInputStream(from);
        FileOutputStream out = new FileOutputStream(to)) {
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  private static String optHttpUrl(String raw) {
    if (raw == null) return null;
    String t = raw.trim();
    if (t.startsWith("https://") || t.startsWith("http://")) return t;
    return null;
  }

  private static int clampDur(int ms) {
    if (ms < 150) return 150;
    if (ms > 1200) return 1200;
    return ms;
  }

  private static int logoWidthDp(JSONObject cfg) {
    String preset = cfg.optString("logoWidthPreset", "medium");
    if ("small".equals(preset)) return 56;
    if ("large".equals(preset)) return 96;
    if ("custom".equals(preset)) {
      int c = cfg.optInt("logoCustomWidthPx", 72);
      return Math.min(160, Math.max(40, c));
    }
    return 72;
  }

  private int dp(int v) {
    return Math.round(TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v, activity.getResources().getDisplayMetrics()));
  }

  private static int parseColor(String hex, int fallback) {
    try {
      if (hex == null || hex.isEmpty()) return fallback;
      return Color.parseColor(hex);
    } catch (Exception e) {
      return fallback;
    }
  }

  private static Animator buildEnterAnimator(View v, String enter, int dur) {
    switch (enter) {
      case "scale_in":
        v.setScaleX(0.86f);
        v.setScaleY(0.86f);
        v.setAlpha(1f);
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 0.86f, 1f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.86f, 1f))
            .setDuration(dur);
      case "fade_scale_in":
        v.setScaleX(0.9f);
        v.setScaleY(0.9f);
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.ALPHA, 0f, 1f),
                PropertyValuesHolder.ofFloat(View.SCALE_X, 0.9f, 1f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 0.9f, 1f))
            .setDuration(dur);
      case "slide_up":
        v.setTranslationY(dpStatic(v, 36));
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.ALPHA, 0f, 1f),
                PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, dpStatic(v, 36), 0f))
            .setDuration(dur);
      case "slide_down":
        v.setTranslationY(-dpStatic(v, 36));
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.ALPHA, 0f, 1f),
                PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, -dpStatic(v, 36), 0f))
            .setDuration(dur);
      case "fade_in":
      default:
        return ObjectAnimator.ofFloat(v, View.ALPHA, 0f, 1f).setDuration(dur);
    }
  }

  private static Animator buildExitAnimator(View v, String exit, int dur) {
    switch (exit) {
      case "scale_out":
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 0.9f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 0.9f),
                PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0f))
            .setDuration(dur);
      case "fade_scale_out":
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 0.88f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 0.88f),
                PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0f))
            .setDuration(dur);
      case "slide_up":
        return ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 0f, -dpStatic(v, 40)),
                PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0f))
            .setDuration(dur);
      case "fade_out":
      default:
        return ObjectAnimator.ofFloat(v, View.ALPHA, 1f, 0f).setDuration(dur);
    }
  }

  private static float dpStatic(View v, int dp) {
    return TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, dp, v.getResources().getDisplayMetrics());
  }
}
