package com.dibay.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.Iterator;
import java.util.Map;

/** Web consumed SSOT mirror — native ringtone / late FCM guard (120s TTL). */
public final class DibayCallConsumedStore {
  private static final String TAG = "DIBAY_CALL";
  private static final String PREFS = "dibay_call_consumed";
  private static final String KEY_PREFIX = "c:";
  private static final long TTL_MS = 120_000L;

  private DibayCallConsumedStore() {}

  public static void mark(Context context, String callId, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    prune(context, System.currentTimeMillis());
    prefs(context)
        .edit()
        .putLong(KEY_PREFIX + sid, System.currentTimeMillis())
        .putString(KEY_PREFIX + sid + ":reason", reason != null ? reason : "consumed")
        .apply();
    Log.i(TAG, "[DIBAY_CALL] terminal_tombstone_mark callId=" + sid + " reason=" + reason);
    Log.i(TAG, "[DIBAY_CALL] incoming_consumed callId=" + sid + " source=native_store reason=" + reason);
  }

  public static boolean isConsumed(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    long now = System.currentTimeMillis();
    prune(context, now);
    String sid = callId.trim();
    long at = prefs(context).getLong(KEY_PREFIX + sid, 0L);
    return at > 0L && now - at <= TTL_MS;
  }

  private static void prune(Context context, long now) {
    SharedPreferences p = prefs(context);
    SharedPreferences.Editor editor = null;
    for (Map.Entry<String, ?> entry : p.getAll().entrySet()) {
      String key = entry.getKey();
      if (!key.startsWith(KEY_PREFIX) || key.endsWith(":reason")) continue;
      Object val = entry.getValue();
      if (!(val instanceof Long)) continue;
      long at = (Long) val;
      if (now - at > TTL_MS) {
        if (editor == null) editor = p.edit();
        String sid = key.substring(KEY_PREFIX.length());
        editor.remove(key);
        editor.remove(KEY_PREFIX + sid + ":reason");
      }
    }
    if (editor != null) editor.apply();
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }
}
