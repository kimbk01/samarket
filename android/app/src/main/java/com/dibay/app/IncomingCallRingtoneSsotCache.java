package com.dibay.app;

import android.util.Log;
import java.util.concurrent.ConcurrentHashMap;

/** CallId-scoped admin SSOT ringtone policy+URL cache for FCM incoming-call native ringing. */
public final class IncomingCallRingtoneSsotCache {
  private static final String TAG = "DIBAY_CALL";

  public static final String POLICY_CUSTOM = "custom";
  public static final String POLICY_DEFAULT = "default";
  public static final String POLICY_SILENT = "silent";

  private static final class Entry {
    final String ringtoneUrl;
    final String callSoundEventKey;
    final String soundAssetId;
    final String ringtonePolicy;
    final String mediaType;

    Entry(
        String ringtoneUrl,
        String callSoundEventKey,
        String soundAssetId,
        String ringtonePolicy,
        String mediaType) {
      this.ringtoneUrl = ringtoneUrl;
      this.callSoundEventKey = callSoundEventKey;
      this.soundAssetId = soundAssetId;
      this.ringtonePolicy = ringtonePolicy;
      this.mediaType = mediaType;
    }
  }

  private static final ConcurrentHashMap<String, Entry> ENTRIES = new ConcurrentHashMap<>();

  private IncomingCallRingtoneSsotCache() {}

  public static void putFromPayload(IncomingCallPayload payload) {
    if (payload == null || !payload.isValid()) return;
    put(
        payload.callId,
        payload.ringtoneUrl,
        payload.callSoundEventKey,
        payload.soundAssetId,
        payload.ringtonePolicy,
        payload.callType);
  }

  public static void put(
      String callId, String ringtoneUrl, String callSoundEventKey, String soundAssetId) {
    put(callId, ringtoneUrl, callSoundEventKey, soundAssetId, null, null);
  }

  public static void put(
      String callId,
      String ringtoneUrl,
      String callSoundEventKey,
      String soundAssetId,
      String ringtonePolicy,
      String mediaType) {
    String sid = normalize(callId);
    if (sid == null) return;

    String url = normalize(ringtoneUrl);
    String eventKey = normalize(callSoundEventKey);
    String assetId = normalize(soundAssetId);
    String policy = normalizePolicy(ringtonePolicy, url);
    String media = normalize(mediaType);
    if (url == null && eventKey == null && assetId == null && policy == null) {
      ENTRIES.remove(sid);
      return;
    }

    ENTRIES.put(sid, new Entry(url, eventKey, assetId, policy, media));
    Log.i(
        TAG,
        "[DIBAY_CALL] native_call_ringtone_ssot_cache_put callId="
            + sid
            + " eventKey="
            + safe(eventKey)
            + " assetId="
            + safe(assetId)
            + " policy="
            + safe(policy)
            + " mediaType="
            + safe(media)
            + " hasUrl="
            + (url != null));
  }

  /**
   * Resolve play policy for callId.
   * Cache miss → default (never silent) so Web hydrate without FCM still rings OS default.
   */
  public static String policyForCallId(String callId) {
    String sid = normalize(callId);
    if (sid == null) return POLICY_DEFAULT;
    Entry entry = ENTRIES.get(sid);
    if (entry == null) {
      Log.i(TAG, "[DIBAY_CALL] native_call_ringtone_ssot_cache_miss callId=" + sid);
      return POLICY_DEFAULT;
    }
    return entry.ringtonePolicy != null ? entry.ringtonePolicy : POLICY_DEFAULT;
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
            + safe(entry.soundAssetId)
            + " policy="
            + safe(entry.ringtonePolicy));
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

  /** Prefer explicit policy; if absent, URL present → custom else default. Never invent silent. */
  static String normalizePolicy(String ringtonePolicy, String url) {
    String p = normalize(ringtonePolicy);
    if (POLICY_SILENT.equals(p) || POLICY_CUSTOM.equals(p) || POLICY_DEFAULT.equals(p)) {
      return p;
    }
    if (url != null) return POLICY_CUSTOM;
    return POLICY_DEFAULT;
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
