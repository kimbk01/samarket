package com.dibay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * W4 — Android 백그라운드(FCM) 일반 알림의 이벤트별 SSOT 음원 채널.
 *
 * <p>규칙 (§23 W4 설계 고정):
 *
 * <ul>
 *   <li>메시지·일반 알림 전용. call_* 이벤트와 통화 채널은 절대 다루지 않는다 (Native Call HARD LOCK 무관).
 *   <li>채널 ID = {@code dibay_ev_<eventKey>_v<version>}. 채널은 생성 후 소리 변경 불가(Android 불변) →
 *       음원이 바뀌면 version 을 올린 새 채널을 쓰고 이전 채널을 삭제한다.
 *   <li>사용자 설정 보호: 이전 버전(없으면 기본 채널)의 중요도·진동·잠금화면·배지를 승계한다. 사용자가 차단(IMPORTANCE_NONE)한
 *       경우 그대로 승계한다.
 *   <li>음원 파일은 MediaStore(Notifications/DIBAY, IS_NOTIFICATION)에 저장 — Phase 0-B 에서 재부팅 후 유지가 확인된 경로.
 *       FileProvider URI 는 시스템 기본음으로 떨어지므로 사용하지 않는다.
 *   <li>실패·미동기화·자산 불일치·Android 10 미만 → 기존 기본 채널(기본음)로 명확히 fallback.
 * </ul>
 */
public final class DibayNotificationSoundChannelStore {
  private static final String TAG = "DIBAY_NOTIF_SND_CH";
  static final String PREFS = "dibay_notification_sound_channels_v1";
  static final String KEY_RECORDS = "records";
  static final String CHANNEL_PREFIX = "dibay_ev_";
  static final String MEDIA_RELATIVE_DIR = "DIBAY";
  private static final int MAX_SOUND_BYTES = 2 * 1024 * 1024;
  private static final int HTTP_TIMEOUT_MS = 15_000;

  private static volatile Context appContext;
  private static final Object RESOLVE_LOCK = new Object();

  private DibayNotificationSoundChannelStore() {}

  /** {@link DibayApplication#onCreate()} — FCM 서비스가 Context 없이 채널을 결정할 수 있게 한다. */
  public static void init(Context context) {
    if (context != null) appContext = context.getApplicationContext();
  }

  /** Tests only. */
  static synchronized void resetForTest(Context context) {
    appContext = context != null ? context.getApplicationContext() : null;
    if (context != null) prefs(context).edit().clear().commit();
  }

  // ---------------------------------------------------------------- pure helpers

  static boolean isEligibleEventKey(String eventKey) {
    if (eventKey == null) return false;
    String k = eventKey.trim();
    if (k.isEmpty() || k.startsWith("call_")) return false;
    for (int i = 0; i < k.length(); i++) {
      char c = k.charAt(i);
      boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
      if (!ok) return false;
    }
    return true;
  }

  static String channelIdFor(String eventKey, int version) {
    return CHANNEL_PREFIX + eventKey + "_v" + version;
  }

  static boolean isEventSoundChannelId(String channelId) {
    return channelId != null && channelId.startsWith(CHANNEL_PREFIX);
  }

  static String mimeTypeForUrl(String url) {
    String path = url == null ? "" : url.toLowerCase();
    int q = path.indexOf('?');
    if (q >= 0) path = path.substring(0, q);
    if (path.endsWith(".wav")) return "audio/wav";
    if (path.endsWith(".ogg")) return "audio/ogg";
    if (path.endsWith(".m4a") || path.endsWith(".aac")) return "audio/mp4";
    return "audio/mpeg";
  }

  private static String extensionForMime(String mime) {
    switch (mime) {
      case "audio/wav":
        return ".wav";
      case "audio/ogg":
        return ".ogg";
      case "audio/mp4":
        return ".m4a";
      default:
        return ".mp3";
    }
  }

  private static String trim(String s) {
    return s == null ? "" : s.trim();
  }

  private static String firstNonEmpty(String... values) {
    for (String v : values) {
      if (v != null && !v.trim().isEmpty()) return v.trim();
    }
    return "";
  }

  // ---------------------------------------------------------------- persistence

  private static SharedPreferences prefs(Context ctx) {
    return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static JSONObject readRecords(Context ctx) {
    try {
      return new JSONObject(prefs(ctx).getString(KEY_RECORDS, "{}"));
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  private static void writeRecords(Context ctx, JSONObject records) {
    prefs(ctx).edit().putString(KEY_RECORDS, records.toString()).apply();
  }

  // ---------------------------------------------------------------- sync (JS → native)

  /**
   * Full-state sync from the hydrated admin SSOT snapshot. Blocking (network) — call off the main thread.
   *
   * @param entries [{eventKey, assetId, url, baseChannelId, label}] — url empty ⇒ no custom sound.
   * @return summary {updated, unchanged, removed, skipped, failed}
   */
  public static synchronized JSONObject syncEventSounds(Context ctx, JSONArray entries) {
    JSONObject summary = new JSONObject();
    int updated = 0, unchanged = 0, removed = 0, skipped = 0, failed = 0;
    if (ctx == null) {
      putQuiet(summary, "reason", "no_context");
      return summary;
    }
    Context app = ctx.getApplicationContext();
    if (appContext == null) appContext = app;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      putQuiet(summary, "reason", "pre_q_default_sound");
      return summary;
    }
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    JSONObject records = readRecords(app);
    Set<String> seen = new HashSet<>();

    for (int i = 0; entries != null && i < entries.length(); i++) {
      JSONObject e = entries.optJSONObject(i);
      if (e == null) continue;
      String eventKey = trim(e.optString("eventKey", ""));
      String baseChannelId = trim(e.optString("baseChannelId", ""));
      if (!isEligibleEventKey(eventKey)
          || !DibayNotificationChannelRegistry.isAllowedMessageChannelId(baseChannelId)) {
        skipped++;
        continue;
      }
      seen.add(eventKey);
      String assetId = trim(e.optString("assetId", ""));
      String url = trim(e.optString("url", ""));
      String label = trim(e.optString("label", ""));
      JSONObject prev = records.optJSONObject(eventKey);

      if (assetId.isEmpty() || !url.startsWith("https://")) {
        if (prev != null) {
          retireRecord(app, nm, prev);
          records.remove(eventKey);
          removed++;
        } else {
          unchanged++;
        }
        continue;
      }

      if (prev != null
          && assetId.equals(prev.optString("assetId"))
          && url.equals(prev.optString("url"))
          && baseChannelId.equals(prev.optString("baseChannelId"))
          && uriReadable(app, prev.optString("uri"))) {
        unchanged++;
        continue;
      }

      Uri uri = downloadToMediaStore(app, eventKey, assetId, url);
      if (uri == null) {
        // 기존 버전 유지(마지막 정상값) — 새 음원 반영 실패만 기록.
        failed++;
        continue;
      }
      int version = prev != null ? prev.optInt("version", 0) + 1 : 1;
      JSONObject next = new JSONObject();
      putQuiet(next, "eventKey", eventKey);
      putQuiet(next, "assetId", assetId);
      putQuiet(next, "url", url);
      putQuiet(next, "uri", uri.toString());
      putQuiet(next, "baseChannelId", baseChannelId);
      putQuiet(next, "label", label);
      putQuiet(next, "version", version);
      if (prev != null) {
        inheritFromChannel(nm, prev.optString("channelId"), next, prev);
        retireRecord(app, nm, prev);
      }
      putQuiet(next, "channelId", channelIdFor(eventKey, version));
      try {
        records.put(eventKey, next);
      } catch (Exception ignored) {
        /* unreachable */
      }
      updated++;
    }

    // 스냅샷에서 사라진 이벤트 → 기본 채널로 복귀.
    Iterator<String> it = records.keys();
    Set<String> stale = new HashSet<>();
    while (it.hasNext()) {
      String k = it.next();
      if (!seen.contains(k)) stale.add(k);
    }
    for (String k : stale) {
      JSONObject prev = records.optJSONObject(k);
      if (prev != null) retireRecord(app, nm, prev);
      records.remove(k);
      removed++;
    }

    writeRecords(app, records);
    putQuiet(summary, "updated", updated);
    putQuiet(summary, "unchanged", unchanged);
    putQuiet(summary, "removed", removed);
    putQuiet(summary, "skipped", skipped);
    putQuiet(summary, "failed", failed);
    Log.i(TAG, "[sync] " + summary);
    return summary;
  }

  private static void inheritFromChannel(
      NotificationManager nm, String channelId, JSONObject target, JSONObject prev) {
    if (nm == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationChannel ch = channelId == null ? null : nm.getNotificationChannel(channelId);
    if (ch != null) {
      putQuiet(target, "inheritImportance", ch.getImportance());
      putQuiet(target, "inheritVibrate", ch.shouldVibrate());
      putQuiet(target, "inheritLockscreen", ch.getLockscreenVisibility());
      putQuiet(target, "inheritBadge", ch.canShowBadge());
      return;
    }
    // 채널이 아직 생성되지 않았으면 이전 기록의 승계값을 그대로 이어받는다.
    for (String k : new String[] {"inheritImportance", "inheritVibrate", "inheritLockscreen", "inheritBadge"}) {
      if (prev.has(k)) putQuiet(target, k, prev.opt(k));
    }
  }

  private static void retireRecord(Context app, NotificationManager nm, JSONObject rec) {
    String channelId = rec.optString("channelId", "");
    if (nm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && isEventSoundChannelId(channelId)) {
      try {
        if (nm.getNotificationChannel(channelId) != null) nm.deleteNotificationChannel(channelId);
      } catch (Exception e) {
        Log.w(TAG, "[retire] channel_delete_failed id=" + channelId, e);
      }
    }
    String uri = rec.optString("uri", "");
    if (!uri.isEmpty()) {
      try {
        app.getContentResolver().delete(Uri.parse(uri), null, null);
      } catch (Exception e) {
        Log.w(TAG, "[retire] media_delete_failed uri=" + uri, e);
      }
    }
  }

  private static Uri downloadToMediaStore(Context app, String eventKey, String assetId, String url) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null;
    ContentResolver cr = app.getContentResolver();
    String mime = mimeTypeForUrl(url);
    String safeAsset = assetId.replaceAll("[^A-Za-z0-9_-]", "_");
    ContentValues values = new ContentValues();
    values.put(MediaStore.MediaColumns.DISPLAY_NAME, "dibay_" + eventKey + "_" + safeAsset + extensionForMime(mime));
    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
    values.put(
        MediaStore.MediaColumns.RELATIVE_PATH,
        Environment.DIRECTORY_NOTIFICATIONS + "/" + MEDIA_RELATIVE_DIR);
    values.put(MediaStore.Audio.Media.IS_NOTIFICATION, 1);
    values.put(MediaStore.Audio.Media.IS_RINGTONE, 0);
    values.put(MediaStore.Audio.Media.IS_ALARM, 0);
    values.put(MediaStore.Audio.Media.IS_MUSIC, 0);
    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
    Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
    Uri item = null;
    HttpURLConnection conn = null;
    try {
      item = cr.insert(collection, values);
      if (item == null) return null;
      conn = (HttpURLConnection) new URL(url).openConnection();
      conn.setConnectTimeout(HTTP_TIMEOUT_MS);
      conn.setReadTimeout(HTTP_TIMEOUT_MS);
      conn.setInstanceFollowRedirects(true);
      int code = conn.getResponseCode();
      if (code < 200 || code >= 300) throw new IllegalStateException("http_" + code);
      long total = 0;
      try (InputStream in = conn.getInputStream();
          OutputStream out = cr.openOutputStream(item)) {
        if (out == null) throw new IllegalStateException("no_output_stream");
        byte[] buf = new byte[16 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) {
          total += n;
          if (total > MAX_SOUND_BYTES) throw new IllegalStateException("too_large");
          out.write(buf, 0, n);
        }
      }
      if (total == 0) throw new IllegalStateException("empty_body");
      ContentValues done = new ContentValues();
      done.put(MediaStore.MediaColumns.IS_PENDING, 0);
      cr.update(item, done, null, null);
      return item;
    } catch (Exception e) {
      Log.w(TAG, "[download] failed eventKey=" + eventKey + " reason=" + e.getMessage());
      if (item != null) {
        try {
          cr.delete(item, null, null);
        } catch (Exception ignored) {
          /* best effort */
        }
      }
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static boolean uriReadable(Context app, String uri) {
    if (uri == null || uri.isEmpty()) return false;
    try (Cursor c =
        app.getContentResolver()
            .query(Uri.parse(uri), new String[] {MediaStore.MediaColumns._ID}, null, null, null)) {
      return c != null && c.moveToFirst();
    } catch (Exception e) {
      return false;
    }
  }

  // ---------------------------------------------------------------- resolve (FCM receive)

  /**
   * FCM 메시지 알림 채널 결정. 기존 기본 채널(baseChannelId)은 레지스트리가 이미 결정한 값이다.
   * 이벤트 음원 채널을 쓸 수 있으면 (필요 시 생성 후) 그 ID 를, 아니면 baseChannelId 를 그대로 돌려준다.
   */
  public static String resolveChannelForPush(Map<String, String> data, String baseChannelId) {
    // sync(네트워크 포함) 락과 분리 — 수신 알림 표시가 동기화 다운로드를 기다리지 않는다.
    synchronized (RESOLVE_LOCK) {
      return resolveChannelForPushLocked(data, baseChannelId);
    }
  }

  private static String resolveChannelForPushLocked(Map<String, String> data, String baseChannelId) {
    Context app = appContext;
    if (app == null || data == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return baseChannelId;
    String eventKey = firstNonEmpty(data.get("eventKey"), data.get("event_key"));
    String soundAssetId = firstNonEmpty(data.get("soundAssetId"), data.get("sound_asset_id"));
    if (!isEligibleEventKey(eventKey) || soundAssetId.isEmpty()) return baseChannelId;
    JSONObject rec = readRecords(app).optJSONObject(eventKey);
    if (rec == null) return baseChannelId;
    if (!soundAssetId.equals(rec.optString("assetId"))) {
      Log.i(TAG, "[resolve] asset_mismatch eventKey=" + eventKey + " → base");
      return baseChannelId;
    }
    if (!baseChannelId.equals(rec.optString("baseChannelId"))) return baseChannelId;
    String channelId = rec.optString("channelId", "");
    if (!isEventSoundChannelId(channelId)) return baseChannelId;
    NotificationManager nm = app.getSystemService(NotificationManager.class);
    if (nm == null) return baseChannelId;
    if (nm.getNotificationChannel(channelId) != null) return channelId;
    String uri = rec.optString("uri", "");
    if (!uriReadable(app, uri)) {
      Log.w(TAG, "[resolve] media_missing eventKey=" + eventKey + " → base");
      return baseChannelId;
    }
    try {
      nm.createNotificationChannel(buildChannel(nm, rec, channelId, Uri.parse(uri)));
      Log.i(TAG, "[resolve] channel_created id=" + channelId);
      return nm.getNotificationChannel(channelId) != null ? channelId : baseChannelId;
    } catch (Exception e) {
      Log.w(TAG, "[resolve] channel_create_failed id=" + channelId, e);
      return baseChannelId;
    }
  }

  private static NotificationChannel buildChannel(
      NotificationManager nm, JSONObject rec, String channelId, Uri soundUri) {
    NotificationChannel base = nm.getNotificationChannel(rec.optString("baseChannelId"));
    int importance =
        rec.has("inheritImportance")
            ? rec.optInt("inheritImportance")
            : base != null ? base.getImportance() : NotificationManager.IMPORTANCE_HIGH;
    boolean vibrate =
        rec.has("inheritVibrate") ? rec.optBoolean("inheritVibrate") : base == null || base.shouldVibrate();
    int lockscreen =
        rec.has("inheritLockscreen")
            ? rec.optInt("inheritLockscreen")
            : base != null ? base.getLockscreenVisibility() : Notification.VISIBILITY_PUBLIC;
    boolean badge = rec.has("inheritBadge") ? rec.optBoolean("inheritBadge") : base == null || base.canShowBadge();
    String label = rec.optString("label", "");
    String baseName = base != null && base.getName() != null ? base.getName().toString() : "DIBAY 알림";
    String name = label.isEmpty() ? baseName : label;
    NotificationChannel ch = new NotificationChannel(channelId, name, importance);
    ch.setDescription(baseName + " · DIBAY 알림음");
    ch.enableVibration(vibrate);
    if (lockscreen != NotificationManager.VISIBILITY_NO_OVERRIDE) ch.setLockscreenVisibility(lockscreen);
    ch.setShowBadge(badge);
    ch.setSound(
        soundUri,
        new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build());
    return ch;
  }

  private static void putQuiet(JSONObject o, String k, Object v) {
    try {
      o.put(k, v);
    } catch (Exception ignored) {
      /* JSONException only on NaN keys */
    }
  }
}
