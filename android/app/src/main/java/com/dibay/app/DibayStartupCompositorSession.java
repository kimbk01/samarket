package com.dibay.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.TextView;
import com.dibay.app.intro.DibayIntroLiveDelivery;
import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * R14-P7 — ONE session driving DibayStartupCompositorHost:
 * BOOT → envelope resolve → SYSTEM START → optional INTRO → HOME_READY → one HANDOFF.
 *
 * GIF/MP4 native playback = OPEN / NOT_PROVEN (static first frame / skip video).
 */
public final class DibayStartupCompositorSession {
  public static final String TAG = "DibayStartupSession";

  public interface Listener {
    void onFirstProductFrame();

    void onSkipped(String reason);

    void onHandoffComplete();
  }

  private final Activity activity;
  private final DibayStartupCompositorHost host;
  private final DibayStartupEnvelopeVerifiedStore store;
  private final Handler main = new Handler(Looper.getMainLooper());
  private Listener listener;
  private boolean started;
  private boolean skipped;
  private boolean firstFrame;
  private boolean homeReady;
  private boolean introComplete;
  private boolean handoffDone;
  private boolean retainingLastFrame;
  private long ssVisibleAtMs;
  private int minVisibleMs = 800;
  private JSONObject envelope;
  private final List<JSONObject> introScenes = new ArrayList<>();
  private int sceneIndex;
  private Runnable sceneAdvance;

  public DibayStartupCompositorSession(Activity activity) {
    this.activity = activity;
    this.host = DibayStartupCompositorHost.getOrCreate(activity);
    this.store = new DibayStartupEnvelopeVerifiedStore(activity);
  }

  public void setListener(Listener listener) {
    this.listener = listener;
  }

  public boolean isSkipped() {
    return skipped;
  }

  public boolean hasFirstProductFrame() {
    return firstFrame;
  }

  /** Background sync + main-thread start. */
  public void startCold() {
    if (started) return;
    started = true;
    if (!DibayStartupCompositorHost.PRODUCTION_PRESENTATION_ACTIVE) {
      skip("production_presentation_inactive");
      return;
    }
    new Thread(
            () -> {
              try {
                syncEnvelope();
                JSONObject env = store.readEnvelopeOrNull();
                main.post(() -> beginWithEnvelope(env));
              } catch (Exception e) {
                Log.w(TAG, "cold_sync_failed", e);
                main.post(() -> skip("cold_sync_failed"));
              }
            },
            "dibay-startup-cold")
        .start();
  }

  private void syncEnvelope() {
    // Reuse Intro Live delivery for pack assets; then pull envelope when URL present.
    DibayIntroLiveDelivery delivery = new DibayIntroLiveDelivery(activity);
    DibayIntroLiveDelivery.Result introResult = delivery.syncForColdStart();
    Log.i(TAG, "intro_delivery reason=" + introResult.reason + " canRender=" + introResult.canRender);

    String origin = DibayServerOrigin.resolve(activity);
    if (origin == null || origin.isEmpty()) return;
    try {
      JSONObject live = httpGetJson(origin + "/api/intro/device/live", 2000);
      if (live == null || !"LIVE".equals(live.optString("kind", ""))) return;
      String authority = live.optString("packageAuthority", "");
      String envelopeUrl = live.optString("envelopeRetrievalUrl", "");
      String generationHint = live.optString("packageId", "");
      String releaseId = live.optString("releaseId", "");
      String packageId = live.optString("packageId", "");
      if (!"StartupPackageEnvelope".equals(authority) || envelopeUrl.isEmpty()) {
        Log.i(TAG, "envelope_absent_on_live authority=" + authority);
        return;
      }
      byte[] envBytes = httpGetBytes(envelopeUrl, 2500);
      if (envBytes == null || envBytes.length == 0) return;
      JSONObject env = new JSONObject(new String(envBytes, java.nio.charset.StandardCharsets.UTF_8));
      if (env.optInt("schemaVersion", -1) != 14) return;
      if (!"OWNER".equalsIgnoreCase(env.optString("contentClass", ""))) {
        Log.w(TAG, "live_envelope_not_owner");
        return;
      }
      String generationId = env.optString("generationId", generationHint);
      String integrity = env.optString("integrity", "");
      if (integrity.isEmpty()) return;
      if (store.hasVerifiedMatching(generationId, integrity)) {
        Log.i(TAG, "envelope_verified_match generationId=" + generationId);
        return;
      }
      Map<String, byte[]> media = new HashMap<>();
      JSONObject assetUrls = live.optJSONObject("assetRetrievalUrls");
      JSONArray manifest = env.optJSONArray("mediaManifest");
      if (manifest != null && assetUrls != null) {
        for (int i = 0; i < manifest.length(); i++) {
          JSONObject entry = manifest.optJSONObject(i);
          if (entry == null) continue;
          String mediaId = entry.optString("mediaId", "");
          String url = assetUrls.optString(mediaId, "");
          if (mediaId.isEmpty() || url.isEmpty()) continue;
          byte[] bytes = httpGetBytes(url, 2500);
          if (bytes != null && bytes.length > 0) media.put(mediaId, bytes);
        }
      }
      store.atomicCommit(envBytes, media, generationId, integrity, packageId, releaseId);
    } catch (Exception e) {
      Log.w(TAG, "envelope_sync_failed", e);
    }
  }

  private void beginWithEnvelope(JSONObject env) {
    if (env == null) {
      skip("no_owner_envelope");
      return;
    }
    envelope = env;
    host.attach();
    host.setSurfaceVisible(true);
    paintSystemStart();
    markFirstFrame();
    host.notifyPaintable();
    host.notifyFirstFrameCommitted();
    host.notifyOwnerVisible();
    ssVisibleAtMs = System.currentTimeMillis();
    JSONObject ss = env.optJSONObject("systemStart");
    if (ss != null) {
      minVisibleMs = Math.max(0, ss.optInt("minVisibleMs", 800));
    }
    parseIntroScenes(env.optJSONObject("intro"));
    main.postDelayed(this::afterSystemStartMinVisible, minVisibleMs);
  }

  private void paintSystemStart() {
    FrameLayout surface = host.surfaceOrNull();
    if (surface == null || envelope == null) return;
    surface.removeAllViews();
    JSONObject ss = envelope.optJSONObject("systemStart");
    if (ss == null) return;
    String bg = ss.optString("backgroundColor", "#FFFFFF");
    try {
      surface.setBackgroundColor(Color.parseColor(bg));
    } catch (Exception e) {
      surface.setBackgroundColor(Color.WHITE);
    }
    String brandId =
        ss.optBoolean("brandAssetEnabled", false) ? ss.optString("brandAssetMediaId", "") : "";
    if (!brandId.isEmpty()) {
      File media = store.mediaFile(brandId);
      Bitmap bmp = decodeStill(media);
      if (bmp != null) {
        ImageView iv = new ImageView(activity);
        iv.setImageBitmap(bmp);
        iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
        float sizeNorm = brandSizeNorm(ss.optString("brandSizePreset", "M"));
        float x = (float) ss.optDouble("brandXNorm", 0.5);
        float y = (float) ss.optDouble("brandYNorm", 0.5);
        FrameLayout.LayoutParams lp =
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.CENTER;
        surface.addView(iv, lp);
        surface.post(
            () -> {
              int w = surface.getWidth();
              int h = surface.getHeight();
              if (w <= 0 || h <= 0) return;
              int side = Math.round(Math.min(w, h) * sizeNorm);
              FrameLayout.LayoutParams p =
                  new FrameLayout.LayoutParams(side, side);
              p.leftMargin = Math.round(w * x - side / 2f);
              p.topMargin = Math.round(h * y - side / 2f);
              iv.setLayoutParams(p);
            });
      }
    }
    Log.i(TAG, "SYSTEM_START painted generationId=" + envelope.optString("generationId", ""));
  }

  private void parseIntroScenes(JSONObject intro) {
    introScenes.clear();
    if (intro == null || !intro.optBoolean("present", false)) return;
    JSONObject doc = intro.optJSONObject("document");
    if (doc == null) return;
    JSONArray scenes = doc.optJSONArray("scenes");
    if (scenes == null) return;
    for (int i = 0; i < scenes.length(); i++) {
      JSONObject s = scenes.optJSONObject(i);
      if (s != null) introScenes.add(s);
    }
  }

  private void afterSystemStartMinVisible() {
    if (handoffDone || skipped) return;
    if (introScenes.isEmpty()) {
      introComplete = true;
      maybeHandoff("ss_to_home_intro_absent");
      return;
    }
    sceneIndex = 0;
    paintIntroScene(sceneIndex);
    scheduleSceneAdvance();
  }

  private void paintIntroScene(int index) {
    FrameLayout surface = host.surfaceOrNull();
    if (surface == null || index < 0 || index >= introScenes.size()) return;
    surface.removeAllViews();
    JSONObject scene = introScenes.get(index);
    JSONObject bg = scene.optJSONObject("background");
    String color = "#000000";
    if (bg != null && "COLOR".equals(bg.optString("type", ""))) {
      color = bg.optString("color", color);
    }
    try {
      surface.setBackgroundColor(Color.parseColor(color));
    } catch (Exception e) {
      surface.setBackgroundColor(Color.BLACK);
    }
    // elements or layers (v1 shapes)
    JSONArray elements = scene.optJSONArray("elements");
    if (elements == null) elements = scene.optJSONArray("layers");
    if (elements != null) {
      for (int i = 0; i < elements.length(); i++) {
        JSONObject el = elements.optJSONObject(i);
        if (el == null) continue;
        String type = el.optString("type", "");
        if ("TEXT".equals(type)) {
          TextView tv = new TextView(activity);
          tv.setText(el.optString("text", el.optString("content", "")));
          tv.setTextColor(Color.WHITE);
          tv.setGravity(Gravity.CENTER);
          FrameLayout.LayoutParams lp =
              new FrameLayout.LayoutParams(
                  ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
          lp.gravity = Gravity.CENTER;
          surface.addView(tv, lp);
        } else if ("IMAGE".equals(type) || "LOGO".equals(type)) {
          String mediaId = el.optString("mediaId", "");
          if (mediaId.isEmpty()) continue;
          Bitmap bmp = decodeStill(store.mediaFile(mediaId));
          if (bmp == null) continue;
          ImageView iv = new ImageView(activity);
          iv.setImageBitmap(bmp);
          iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
          surface.addView(
              iv,
              new FrameLayout.LayoutParams(
                  ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        // GIF / MP4: OPEN — no native playback in P7
      }
    }
    Log.i(TAG, "INTRO scene painted index=" + index);
  }

  private void scheduleSceneAdvance() {
    if (sceneAdvance != null) main.removeCallbacks(sceneAdvance);
    if (sceneIndex >= introScenes.size()) return;
    int duration = Math.max(400, introScenes.get(sceneIndex).optInt("durationMs", 2000));
    sceneAdvance =
        () -> {
          if (handoffDone || skipped) return;
          if (sceneIndex + 1 < introScenes.size()) {
            sceneIndex++;
            paintIntroScene(sceneIndex);
            scheduleSceneAdvance();
          } else {
            introComplete = true;
            retainingLastFrame = true;
            Log.i(TAG, "INTRO last_frame_hold awaiting HOME_PRESENTATION_READY");
            maybeHandoff("intro_complete");
          }
        };
    main.postDelayed(sceneAdvance, duration);
  }

  public void onHomePresentationReady(String source) {
    homeReady = true;
    host.forwardHomePresentationReady(source);
    maybeHandoff("home_ready:" + (source != null ? source : "unknown"));
  }

  public void onForeground() {
    host.onForeground();
  }

  public void onBackground() {
    host.onBackground();
  }

  private void maybeHandoff(String reason) {
    if (handoffDone || skipped) return;
    if (!introComplete) return;
    if (!homeReady && !introScenes.isEmpty()) {
      // Keep last intro frame until HOME ready (canonical hold).
      retainingLastFrame = true;
      Log.i(TAG, "handoff_deferred reason=" + reason + " retainingLastFrame=true");
      return;
    }
    if (!homeReady && introScenes.isEmpty()) {
      // SS→Home still waits for home ready when possible; if already ready, proceed.
      if (!homeReady) {
        Log.i(TAG, "ss_home_wait reason=" + reason);
        return;
      }
    }
    handoffDone = true;
    retainingLastFrame = false;
    host.requestHandoffYield();
    Log.i(TAG, "HANDOFF complete reason=" + reason);
    if (listener != null) listener.onHandoffComplete();
  }

  private void markFirstFrame() {
    if (firstFrame) return;
    firstFrame = true;
    Log.i(TAG, "FIRST_PRODUCT_FRAME");
    if (listener != null) listener.onFirstProductFrame();
  }

  private void skip(String reason) {
    skipped = true;
    Log.i(TAG, "compositor_skipped reason=" + reason);
    if (listener != null) listener.onSkipped(reason);
  }

  private static float brandSizeNorm(String preset) {
    if ("S".equalsIgnoreCase(preset)) return 0.18f;
    if ("L".equalsIgnoreCase(preset)) return 0.40f;
    return 0.28f;
  }

  private static Bitmap decodeStill(File f) {
    if (f == null || !f.isFile()) return null;
    String name = f.getName().toLowerCase();
    if (name.endsWith(".mp4") || name.endsWith(".webm") || name.endsWith(".gif")) {
      // OPEN: GIF/MP4 native playback not claimed in P7
      Bitmap bmp = BitmapFactory.decodeFile(f.getAbsolutePath());
      return bmp; // GIF may decode first frame via BitmapFactory on some devices
    }
    return BitmapFactory.decodeFile(f.getAbsolutePath());
  }

  private static JSONObject httpGetJson(String url, int timeoutMs) {
    try {
      byte[] bytes = httpGetBytes(url, timeoutMs);
      if (bytes == null) return null;
      return new JSONObject(new String(bytes, java.nio.charset.StandardCharsets.UTF_8));
    } catch (Exception e) {
      return null;
    }
  }

  private static byte[] httpGetBytes(String urlStr, int timeoutMs) {
    java.net.HttpURLConnection conn = null;
    try {
      java.net.URL url = new java.net.URL(urlStr);
      conn = (java.net.HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(Math.max(500, timeoutMs));
      conn.setReadTimeout(Math.max(500, timeoutMs));
      conn.setRequestMethod("GET");
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) return null;
      java.io.InputStream in = conn.getInputStream();
      java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) >= 0) bos.write(buf, 0, n);
      in.close();
      return bos.toByteArray();
    } catch (Exception e) {
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }
}
