package com.dibay.app;

import android.util.Log;
import java.util.concurrent.ConcurrentHashMap;

/** CallId-scoped admin SSOT ringtone URL cache for FCM incoming-call native ringing. */
public final class IncomingCallRingtoneSsotCache {
  private static final String TAG = "DIBAY_CALL";

  private static final class Entry {
    final String ringtoneUrl;
    final String callSoundEventKey;
    final String soundAssetId;

    Entry(String ringtoneUrl, String callSoundEventKey, String soundAssetId) {
      this.ringtoneUrl = ringtoneUrl;
      this.callSoundEventKey = callSoundEventKey;
      this.soundAssetId = soundAssetId;
    }
  }

  private static final ConcurrentHashMap<String, Entry> ENTRIES = new ConcurrentHashMap<>();

  private IncomingCallRingtoneSsotCache() {}

  public static void putFromPayload(IncomingCallPayload payload) {
    if (payload == null || !payload.isValid()) return;
    put(payload.callId, payload.ringtoneUrl, payload.callSoundEventKey, payload.soundAssetId);
  }

  public static void put(
      String callId, String ringtoneUrl, String callSoundEventKey, String soundAssetId) {
    String sid = normalize(callId);
    if (sid == null) return;

    String url = normalize(ringtoneUrl);
    String eventKey = normalize(callSoundEventKey);
    String assetId = normalize(soundAssetId);
    if (url == null && eventKey == null && assetId == null) {
      ENTRIES.remove(sid);
      return;
    }

    ENTRIES.put(sid, new Entry(url, eventKey, assetId));
    Log.i(
        TAG,
        "[DIBAY_CALL] native_call_ringtone_ssot_cache_put callId="
            + sid
            + " eventKey="
            + safe(eventKey)
            + " assetId="
            + safe(assetId)
            + " hasUrl="
            + (url != null));
  }

  public static String ringtoneUrlForCallId(String callId) {
    String sid = normalize(callId);
    if (sid == null) return null;

    Entry entry = ENTRIES.get(sid);
    if (entry == null || entry.ringtoneUrl == null) {
      Log.i(TAG, "[DIBAY_CALL] native_call_ringtone_ssot_cache_miss callId=" + sid);
      return null;
    }

    Log.i(
        TAG,
        "[DIBAY_CALL] native_call_ringtone_ssot_cache_hit callId="
            + sid
            + " eventKey="
            + safe(entry.callSoundEventKey)
            + " assetId="
            + safe(entry.soundAssetId));
    return entry.ringtoneUrl;
  }

  public static void clear(String callId) {
    String sid = normalize(callId);
    if (sid != null) {
      ENTRIES.remove(sid);
    }
  }

  public static void clearForTests() {
    ENTRIES.clear();
  }

  private static String normalize(String value) {
    if (value == null) return null;
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String safe(String value) {
    return value == null ? "" : value;
  }
}
