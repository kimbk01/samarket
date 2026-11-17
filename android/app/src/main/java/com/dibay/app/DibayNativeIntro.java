package com.dibay.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 진입 감사 5단계 IN-1·IN-2·IN-3·IN-8·OS-3·OS-5 (2026-11-17 · Owner 「설계안대로 진행」) — 로딩 시간 안의 인트로.
 *
 * <p>앱 시작 직후(웹이 뜨기 전) 기기에 미리 받아 둔 인트로 소재(그림 1장 + 배경색 + 고정 브랜드 줄)를 네이티브 화면으로
 * 그린다. 그 뒤에서 웹(홈)이 로드된다. 인트로가 걷히는 때 = max(어드민 표시 시간, 홈 준비 완료(웹 dismissSplash)).
 * 표시 시간은 <b>화면에 실제로 그려진 순간부터</b> 센다(IN-2). 건너뛰기 = 홈이 준비됐으면 즉시, 아니면 준비되는 즉시.
 * 시작 고장(오류 화면)이면 즉시 걷는다.
 *
 * <p>소재 목록·그림은 웹이 발견 후 {@code sync} 로 넘긴다(네이티브가 직접 받고 sha256 검사 · 목록 원자 교체 · 목록에 없는
 * 그림 삭제 = IN-6 저장 누수 방지). 진입마다 다음 소재(정렬 순서 회전, IN-3). 노출·건너뛰기·누름·완료는 웹으로 보내
 * 서버 기록(IN-8). OS 가 종료한 뒤 다시 켬(restore)도 어드민 「OS 종료 후 실행에도 보이기」가 켜져 있으면 보인다(OS-3).
 */
public final class DibayNativeIntro {
  static final String TAG = "DibayNativeIntro";
  private static final String DIR = "native-intro";
  private static final String MANIFEST = "manifest.json";
  private static final String PREFS = "dibay_native_intro";
  private static final String PREF_LAST_ID = "last_shown_id";
  private static final long MAX_DURATION_MS = 5000;
  private static final long MIN_DURATION_MS = 1000;
  private static final int SCHEMA = 1;
  /** 재감사 A4: 홈이 끝내 준비되지 않아도 인트로는 이 시간 뒤 걷는다(광고가 화면을 붙잡지 않게) */
  private static final long HARD_CAP_MS = 10_000;

  private static final ExecutorService IO = Executors.newSingleThreadExecutor();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  /** 이번 실행에서 고른 소재(없으면 null) — 웹 시작 스크립트에 {@code __DIBAY_NATIVE_INTRO__} 로 넣는다. */
  static volatile Entry selected = null;
  static volatile String exposureId = null;
  private static volatile boolean overlayDrawn = false;
  private static volatile boolean overlayAttached = false;
  private static volatile boolean homeReady = false;
  private static volatile boolean finished = false;
  private static volatile boolean skipRequested = false;
  private static volatile long drawnAtMs = 0;
  private static View overlay = null;
  private static TextView skipView = null;
  private static ViewTreeObserver drawObserver = null;
  private static ViewTreeObserver.OnDrawListener drawListener = null;
  private static androidx.activity.OnBackPressedCallback backCallback = null;
  /** 재감사 A2: 한 프로세스에서 소재 고르기는 1번 — 화면 다시 만들기(렌더러 복구·설정 변경)에 다시 고르지 않는다 */
  private static boolean processSelectionDone = false;
  private static Plugin pluginInstance = null;
  private static final List<JSObject> pendingEvents = new ArrayList<>();

  private DibayNativeIntro() {}

  static final class Entry {
    String id;
    String file;
    String sha256;
    int bgColor;
    long durationMs;
    String ctaHref;
    boolean showAdLabel;
    long startAtMs;
    long endAtMs;
    int sortOrder;
  }

  // ── 선택 (onCreate, super.onCreate 전) ────────────────────────────────

  /**
   * @param restoreHint {@code fresh | restore | unknown} (MainActivity 판정)
   */
  static boolean processSelectionDone() {
    return processSelectionDone;
  }

  static void selectForLaunch(Context ctx, String restoreHint) {
    processSelectionDone = true;
    selected = null;
    exposureId = null;
    overlayDrawn = false;
    overlayAttached = false;
    drawnAtMs = 0;
    homeReady = false;
    finished = false;
    skipRequested = false;
    try {
      JSONObject m = readManifest(ctx);
      if (m == null) return;
      if (!m.optBoolean("enabled", false)) return;
      boolean restore = "restore".equals(restoreHint);
      if (restore && !m.optBoolean("showOnOsRestore", false)) return;
      List<Entry> eligible = new ArrayList<>();
      long now = System.currentTimeMillis();
      JSONArray arr = m.optJSONArray("entries");
      if (arr == null) return;
      File dir = new File(ctx.getNoBackupFilesDir(), DIR);
      for (int i = 0; i < arr.length(); i++) {
        Entry e = parseEntry(arr.optJSONObject(i));
        if (e == null) continue;
        if (e.startAtMs > 0 && now < e.startAtMs) continue;
        if (e.endAtMs > 0 && now >= e.endAtMs) continue;
        if (!new File(dir, e.file).isFile()) continue;
        eligible.add(e);
      }
      if (eligible.isEmpty()) return;
      eligible.sort((a, b) -> a.sortOrder != b.sortOrder ? a.sortOrder - b.sortOrder : a.id.compareTo(b.id));
      SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      String last = p.getString(PREF_LAST_ID, null);
      int idx = 0;
      if (last != null) {
        for (int i = 0; i < eligible.size(); i++) {
          if (eligible.get(i).id.equals(last)) {
            idx = (i + 1) % eligible.size();
            break;
          }
        }
      }
      Entry pick = eligible.get(idx);
      p.edit().putString(PREF_LAST_ID, pick.id).apply();
      selected = pick;
      exposureId = UUID.randomUUID().toString();
      Log.i(TAG, "selected id=" + pick.id + " restore_hint=" + restoreHint + " eligible=" + eligible.size());
    } catch (Exception e) {
      Log.w(TAG, "select_failed " + e.getClass().getSimpleName());
      selected = null;
    }
  }

  /** 화면 다시 만들기 — 이전 화면의 인트로는 기록 없이 닫고, 다시 그리지 않는다 */
  static void clearSelection() {
    if (selected != null && !finished) finish("recreate", null);
    overlayAttached = false;
  }

  /** OS 시작 화면 유지 조건 — 인트로 화면이 붙었으면 시작 화면을 걷어 인트로가 바로 보이게 한다 */
  static boolean isOverlayAttached() {
    return overlayAttached && !finished;
  }

  /** 웹 시작 스크립트 값 — 고른 소재 id(없으면 빈 문자열). */
  static String documentStartValue() {
    Entry e = selected;
    return e != null && !finished ? e.id : "";
  }

  // ── 그리기 ────────────────────────────────────────────────────────────

  static void attach(Activity act) {
    final Entry e = selected;
    if (e == null) return;
    Bitmap bmp = decode(act, e);
    if (bmp == null) {
      Log.w(TAG, "decode_failed id=" + e.id);
      selected = null;
      return;
    }
    Context ui = DibayNativeLocale.wrap(act);
    float dp = act.getResources().getDisplayMetrics().density;

    FrameLayout root = new FrameLayout(act);
    root.setBackgroundColor(e.bgColor);
    root.setClickable(true);
    root.setElevation(10000f);
    root.setTranslationZ(10000f);

    // 소재 — 투명 PNG 는 배경색 위에 그대로(contain)
    ImageView img = new ImageView(act);
    img.setImageBitmap(bmp);
    img.setScaleType(ImageView.ScaleType.FIT_CENTER);
    img.setAdjustViewBounds(false);
    FrameLayout.LayoutParams imgLp =
        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    imgLp.bottomMargin = (int) (88 * dp);
    imgLp.topMargin = (int) (56 * dp);
    root.addView(img, imgLp);
    if (e.ctaHref != null && !e.ctaHref.isEmpty()) {
      img.setOnClickListener(v -> onCta());
    }

    // 고정 브랜드 줄(아래) — 앱 아이콘 + dibaY
    LinearLayout brand = new LinearLayout(act);
    brand.setOrientation(LinearLayout.HORIZONTAL);
    brand.setGravity(Gravity.CENTER);
    ImageView icon = new ImageView(act);
    icon.setImageResource(R.mipmap.ic_launcher);
    brand.addView(icon, new LinearLayout.LayoutParams((int) (28 * dp), (int) (28 * dp)));
    TextView word = new TextView(act);
    SpannableString s = new SpannableString("dibaY");
    s.setSpan(new ForegroundColorSpan(Color.parseColor("#E0A800")), 4, 5, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    word.setText(s);
    word.setTextColor(Color.WHITE);
    word.setTypeface(Typeface.DEFAULT_BOLD);
    word.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
    LinearLayout.LayoutParams wordLp =
        new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    wordLp.leftMargin = (int) (8 * dp);
    brand.addView(word, wordLp);
    FrameLayout.LayoutParams brandLp =
        new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, (int) (88 * dp), Gravity.BOTTOM);
    root.addView(brand, brandLp);

    // 위쪽 줄 — 「광고」 표기(왼쪽) · 건너뛰기(오른쪽)
    if (e.showAdLabel) {
      TextView ad = pill(act, DibayNativeLocale.string(ui, R.string.native_intro_ad_label), dp);
      FrameLayout.LayoutParams adLp =
          new FrameLayout.LayoutParams(
              ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
      adLp.topMargin = (int) (16 * dp);
      adLp.leftMargin = (int) (16 * dp);
      root.addView(ad, adLp);
    }
    TextView skip = pill(act, DibayNativeLocale.string(ui, R.string.native_intro_skip), dp);
    skip.setMinHeight((int) (36 * dp));
    skip.setOnClickListener(v -> onSkip());
    skipView = skip;
    FrameLayout.LayoutParams skipLp =
        new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.END);
    skipLp.topMargin = (int) (12 * dp);
    skipLp.rightMargin = (int) (12 * dp);
    root.addView(skip, skipLp);

    root.setOnApplyWindowInsetsListener(
        (v, insets) -> {
          v.setPadding(
              0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
          return insets;
        });

    ViewGroup content = act.findViewById(android.R.id.content);
    if (content == null) {
      selected = null;
      return;
    }
    content.addView(
        root, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    overlay = root;
    // 재감사 A7: 인트로 중 뒤로 가기 = 건너뛰기(웹으로 새지 않음)
    if (act instanceof androidx.activity.ComponentActivity) {
      backCallback =
          new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
              onSkip();
            }
          };
      ((androidx.activity.ComponentActivity) act).getOnBackPressedDispatcher().addCallback(backCallback);
    }
    // 시작 화면 유지 조건은 「인트로 화면이 붙었다」로 푼다(붙기 전엔 그대로). 표시 시간은 실제 첫 그림 뒤부터(IN-2).
    overlayAttached = true;
    final ViewTreeObserver.OnDrawListener[] holder = new ViewTreeObserver.OnDrawListener[1];
    holder[0] =
        () -> {
          if (finished || drawnAtMs != 0) return;
          drawnAtMs = SystemClock.uptimeMillis();
          MAIN.post(
              () -> {
                detachDrawListener();
                if (finished) return;
                overlayDrawn = true;
                Log.i(TAG, "drawn id=" + e.id);
                emit("impression", null);
                MAIN.postDelayed(DibayNativeIntro::maybeFinish, e.durationMs);
              });
        };
    drawObserver = root.getViewTreeObserver();
    drawListener = holder[0];
    drawObserver.addOnDrawListener(drawListener);
    // 재감사 A4: 상한 — 홈 준비가 끝내 안 와도(고장 판정 전) 광고가 화면을 붙잡지 않는다
    MAIN.postDelayed(() -> finish("timeout", null), HARD_CAP_MS);
  }

  /** 창의 그리기 감시를 뗀다 — 화면에서 떨어진 뒤에는 떠도는 관찰자라 창 것을 따로 들고 있다(재감사 A6) */
  private static void detachDrawListener() {
    ViewTreeObserver o = drawObserver;
    ViewTreeObserver.OnDrawListener l = drawListener;
    drawObserver = null;
    drawListener = null;
    if (o != null && l != null && o.isAlive()) {
      try {
        o.removeOnDrawListener(l);
      } catch (Exception ignored) {
        // 이미 떨어진 창
      }
    }
  }

  private static TextView pill(Context ctx, String text, float dp) {
    TextView t = new TextView(ctx);
    t.setText(text);
    t.setTextColor(Color.WHITE);
    t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
    t.setTypeface(Typeface.DEFAULT_BOLD);
    t.setGravity(Gravity.CENTER);
    int h = (int) (10 * dp);
    int v = (int) (5 * dp);
    t.setPadding(h, v, h, v);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(Color.argb(140, 0, 0, 0));
    bg.setCornerRadius(999 * dp);
    t.setBackground(bg);
    return t;
  }

  private static Bitmap decode(Activity act, Entry e) {
    try {
      File f = new File(new File(act.getNoBackupFilesDir(), DIR), e.file);
      BitmapFactory.Options bounds = new BitmapFactory.Options();
      bounds.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(f.getAbsolutePath(), bounds);
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
      DisplayMetrics dm = act.getResources().getDisplayMetrics();
      int target = Math.max(dm.widthPixels, dm.heightPixels);
      int sample = 1;
      // 재감사 A1: 화면 긴 변 이하로 줄여 읽는다(큰 그림 = 수백 MB 비트맵 → 실행 때 충돌)
      while (Math.max(bounds.outWidth, bounds.outHeight) / sample > target) sample *= 2;
      BitmapFactory.Options o = new BitmapFactory.Options();
      o.inSampleSize = sample;
      return BitmapFactory.decodeFile(f.getAbsolutePath(), o);
    } catch (Throwable t) {
      return null;
    }
  }

  // ── 걷기 ──────────────────────────────────────────────────────────────

  /** 웹 dismissSplash(홈 준비) — MainActivity 가 시작 화면 해제와 같은 때 부른다. */
  static void onHomeReady() {
    homeReady = true;
    MAIN.post(DibayNativeIntro::maybeFinish);
  }

  /** 시작 고장(오류 화면) — 기다리지 않고 걷는다. */
  static void onStartupFault() {
    MAIN.post(() -> finish("fault", null));
  }

  private static void maybeFinish() {
    Entry e = selected;
    if (finished || e == null || !overlayDrawn) return;
    // 위: 아직 안 그려졌으면 그린 뒤 타이머가 다시 부른다
    boolean elapsed = SystemClock.uptimeMillis() - drawnAtMs >= e.durationMs;
    if (homeReady && (elapsed || skipRequested)) finish(skipRequested ? "skip" : "complete", null);
  }

  private static void onSkip() {
    skipRequested = true;
    maybeFinish();
    // 재감사 A5: 홈 준비 전이면 누른 표시(준비되는 즉시 걷힘)
    TextView sv = skipView;
    if (!finished && sv != null) {
      sv.setText(DibayNativeLocale.string(sv.getContext(), R.string.native_intro_wait));
      sv.setAlpha(0.6f);
      sv.setEnabled(false);
    }
  }

  private static void onCta() {
    Entry e = selected;
    if (e == null || finished) return;
    // 목적지는 웹이 연다(홈 준비 뒤) — 인트로는 바로 걷는다
    finish("click", e.ctaHref);
  }

  private static void finish(String reason, String href) {
    if (finished) return;
    finished = true;
    detachDrawListener();
    androidx.activity.OnBackPressedCallback cb = backCallback;
    backCallback = null;
    if (cb != null) cb.remove();
    skipView = null;
    View v = overlay;
    overlay = null;
    if (v != null && v.getParent() instanceof ViewGroup) {
      ((ViewGroup) v.getParent()).removeView(v);
    }
    Log.i(TAG, "finished reason=" + reason);
    // 고장·화면 다시 만들기·상한은 사용자가 고른 끝이 아니라 기록하지 않는다(done 만)
    if (!"fault".equals(reason) && !"recreate".equals(reason) && !"timeout".equals(reason)) emit(reason, href);
    emit("done", null);
  }

  // ── 웹으로 보내기 ─────────────────────────────────────────────────────

  private static void emit(String type, String href) {
    Entry e = selected;
    if (e == null) return;
    JSObject o = new JSObject();
    o.put("type", type);
    o.put("creativeId", e.id);
    o.put("exposureId", exposureId);
    if (href != null) o.put("href", href);
    synchronized (pendingEvents) {
      Plugin p = pluginInstance;
      if (p == null) {
        pendingEvents.add(o);
        return;
      }
    }
    MAIN.post(() -> notify(o));
  }

  private static void notify(JSObject o) {
    Plugin p = pluginInstance;
    if (p instanceof NativeIntroPlugin) ((NativeIntroPlugin) p).send(o);
  }

  // ── 저장소 ────────────────────────────────────────────────────────────

  private static JSONObject readManifest(Context ctx) {
    File f = new File(new File(ctx.getNoBackupFilesDir(), DIR), MANIFEST);
    if (!f.isFile()) return null;
    try (FileInputStream in = new FileInputStream(f)) {
      byte[] buf = new byte[(int) Math.min(f.length(), 256 * 1024)];
      int n = 0;
      while (n < buf.length) {
        int r = in.read(buf, n, buf.length - n);
        if (r < 0) break;
        n += r;
      }
      JSONObject o = new JSONObject(new String(buf, 0, n, StandardCharsets.UTF_8));
      return o.optInt("schema") == SCHEMA ? o : null;
    } catch (Exception e) {
      return null;
    }
  }

  private static Entry parseEntry(JSONObject o) {
    if (o == null) return null;
    try {
      Entry e = new Entry();
      e.id = o.getString("id");
      e.sha256 = o.getString("sha256");
      if (!e.sha256.matches("[0-9a-f]{64}")) return null;
      e.file = o.getString("file");
      if (!e.file.matches("[0-9a-f]{64}\\.(png|jpg|webp)")) return null;
      e.bgColor = Color.parseColor(o.optString("bgColor", "#075740"));
      e.durationMs = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, o.optLong("durationMs", 2000)));
      String href = o.optString("ctaHref", "");
      e.ctaHref = href.startsWith("/") || href.startsWith("https://") ? href : null;
      e.showAdLabel = o.optBoolean("showAdLabel", true);
      e.startAtMs = o.optLong("startAtMs", 0);
      e.endAtMs = o.optLong("endAtMs", 0);
      e.sortOrder = o.optInt("sortOrder", 0);
      return e;
    } catch (Exception ex) {
      return null;
    }
  }

  private static String extFor(String mime) {
    if ("image/png".equals(mime)) return "png";
    if ("image/jpeg".equals(mime)) return "jpg";
    if ("image/webp".equals(mime)) return "webp";
    return null;
  }

  private static String sha256Hex(File f) throws Exception {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    try (InputStream in = new FileInputStream(f)) {
      byte[] buf = new byte[64 * 1024];
      int r;
      while ((r = in.read(buf)) > 0) md.update(buf, 0, r);
    }
    StringBuilder sb = new StringBuilder();
    for (byte b : md.digest()) sb.append(String.format("%02x", b));
    return sb.toString();
  }

  private static boolean download(String url, File dest, String sha256, long maxBytes) {
    File tmp = new File(dest.getParentFile(), dest.getName() + ".part");
    HttpURLConnection c = null;
    try {
      URL u = new URL(url);
      if (!"https".equals(u.getProtocol())) return false;
      c = (HttpURLConnection) u.openConnection();
      c.setConnectTimeout(15000);
      c.setReadTimeout(30000);
      if (c.getResponseCode() != 200) return false;
      long total = 0;
      try (InputStream in = c.getInputStream();
          FileOutputStream out = new FileOutputStream(tmp)) {
        byte[] buf = new byte[64 * 1024];
        int r;
        while ((r = in.read(buf)) > 0) {
          total += r;
          if (total > maxBytes) return false;
          out.write(buf, 0, r);
        }
      }
      if (!sha256.equals(sha256Hex(tmp))) return false;
      return tmp.renameTo(dest);
    } catch (Exception e) {
      return false;
    } finally {
      if (c != null) c.disconnect();
      if (tmp.exists()) //noinspection ResultOfMethodCallIgnored
        tmp.delete();
    }
  }

  /**
   * 웹이 넘긴 목록으로 기기 저장소를 맞춘다. 그림이 모두 검사를 통과해야 목록을 원자 교체하고(부분 성공은 반영 안 함),
   * 교체 뒤 목록에 없는 그림은 지운다. 꺼짐·빈 목록이면 그림을 모두 지운다.
   */
  static boolean sync(Context ctx, JSONObject req) {
    File dir = new File(ctx.getNoBackupFilesDir(), DIR);
    if (!dir.isDirectory() && !dir.mkdirs()) return false;
    boolean enabled = req.optBoolean("enabled", false);
    JSONArray in = req.optJSONArray("entries");
    JSONArray out = new JSONArray();
    Set<String> keep = new HashSet<>();
    boolean anyFailed = false;
    try {
      if (enabled && in != null) {
        for (int i = 0; i < Math.min(in.length(), 20); i++) {
          JSONObject o = in.optJSONObject(i);
          if (o == null) continue;
          String sha = o.optString("sha256", "");
          String ext = extFor(o.optString("mime", ""));
          String url = o.optString("url", "");
          if (!sha.matches("[0-9a-f]{64}") || ext == null || url.isEmpty()) continue;
          String file = sha + "." + ext;
          File dest = new File(dir, file);
          if (!dest.isFile() || !sha.equals(sha256Hex(dest))) {
            // 재감사 A8: 한 소재 실패가 전체 갱신을 막지 않는다 — 그 소재만 빼고, 실패 표시로 웹이 다음 발견 때 다시 맞춘다
            if (!download(url, dest, sha, 5L * 1024 * 1024)) {
              anyFailed = true;
              continue;
            }
          }
          JSONObject e = new JSONObject();
          e.put("id", o.getString("id"));
          e.put("sha256", sha);
          e.put("file", file);
          e.put("bgColor", o.optString("bgColor", "#075740"));
          e.put("durationMs", o.optLong("durationMs", 2000));
          e.put("ctaHref", o.optString("ctaHref", ""));
          e.put("showAdLabel", o.optBoolean("showAdLabel", true));
          e.put("startAtMs", o.optLong("startAtMs", 0));
          e.put("endAtMs", o.optLong("endAtMs", 0));
          e.put("sortOrder", o.optInt("sortOrder", 0));
          out.put(e);
          keep.add(file);
        }
      }
      JSONObject m = new JSONObject();
      m.put("schema", SCHEMA);
      m.put("enabled", enabled && out.length() > 0);
      m.put("showOnOsRestore", req.optBoolean("showOnOsRestore", false));
      m.put("revision", req.optString("revision", ""));
      m.put("entries", out);
      File tmp = new File(dir, MANIFEST + ".tmp");
      try (FileOutputStream fo = new FileOutputStream(tmp)) {
        fo.write(m.toString().getBytes(StandardCharsets.UTF_8));
        fo.getFD().sync();
      }
      if (!tmp.renameTo(new File(dir, MANIFEST))) return false;
      // 저장 누수 방지(IN-6): 목록에 없는 그림 삭제 — 지금 화면에 떠 있는 소재 그림은 이번 실행이 끝날 때까지 둔다
      Entry showing = selected;
      File[] files = dir.listFiles();
      if (files != null) {
        for (File f : files) {
          String n = f.getName();
          if (MANIFEST.equals(n) || keep.contains(n)) continue;
          if (showing != null && !finished && n.equals(showing.file)) continue;
          //noinspection ResultOfMethodCallIgnored
          f.delete();
        }
      }
      Log.i(TAG, "synced entries=" + out.length() + " enabled=" + (enabled && out.length() > 0) + " failed=" + anyFailed);
      return !anyFailed;
    } catch (Exception e) {
      Log.w(TAG, "sync_failed " + e.getClass().getSimpleName());
      return false;
    }
  }

  /** 웹 ↔ 네이티브 다리. */
  @CapacitorPlugin(name = "DibayNativeIntro")
  public static class NativeIntroPlugin extends Plugin {
    @Override
    public void load() {
      List<JSObject> drain;
      synchronized (pendingEvents) {
        pluginInstance = this;
        drain = new ArrayList<>(pendingEvents);
        pendingEvents.clear();
      }
      for (JSObject o : drain) MAIN.post(() -> send(o));
    }

    void send(JSObject o) {
      // 웹 듣기 전 보낸 것은 남겨 두었다가 처음 듣는 쪽에 준다
      notifyListeners("introEvent", o, true);
    }

    @PluginMethod
    public void getState(PluginCall call) {
      JSObject r = new JSObject();
      Entry e = selected;
      r.put("supported", true);
      r.put("active", e != null && !finished);
      r.put("creativeId", e != null ? e.id : null);
      r.put("exposureId", exposureId);
      JSONObject m = readManifest(getContext());
      r.put("revision", m != null ? m.optString("revision", "") : "");
      call.resolve(r);
    }

    @PluginMethod
    public void sync(PluginCall call) {
      final JSObject data = call.getData();
      final Context ctx = getContext().getApplicationContext();
      IO.execute(
          () -> {
            boolean ok;
            try {
              ok = DibayNativeIntro.sync(ctx, new JSONObject(data.toString()));
            } catch (Exception e) {
              ok = false;
            }
            JSObject r = new JSObject();
            r.put("ok", ok);
            call.resolve(r);
          });
    }

    /** 시험용이 아닌 진단 — 저장된 목록 개수. */
    @PluginMethod
    public void inspect(PluginCall call) {
      JSONObject m = readManifest(getContext());
      JSObject r = new JSObject();
      JSONArray arr = m != null ? m.optJSONArray("entries") : null;
      r.put("entries", arr != null ? arr.length() : 0);
      r.put("enabled", m != null && m.optBoolean("enabled", false));
      JSArray ids = new JSArray();
      if (arr != null) for (int i = 0; i < arr.length(); i++) ids.put(arr.optJSONObject(i).optString("id"));
      r.put("ids", ids);
      call.resolve(r);
    }
  }
}
