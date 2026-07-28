package com.dibay.app;

import android.content.Context;
import android.util.Log;

/**
 * Single owner for foreground incoming OS ringtone.
 * All native start/stop must go through here — consumed tombstone checked before start.
 * SSOT policy: custom | default | silent (silent never falls back to OS ringtone).
 */
public final class IncomingCallRingOwner {
  private static final String TAG = "DIBAY_CALL";
  private static volatile String activeCallId = null;

  private IncomingCallRingOwner() {}

  public static boolean start(Context context, String callId) {
    return start(context, callId, null, null);
  }

  public static boolean start(Context context, String callId, String ringtoneUrl) {
    return start(context, callId, ringtoneUrl, null);
  }

  public static boolean start(Context context, String callId, String ringtoneUrl, String ringtonePolicy) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (DibayCallConsumedStore.isConsumed(app, sid)) {
      Log.i(TAG, "[DIBAY_CALL] incoming_ignored_consumed callId=" + sid + " source=ring_owner");
      return false;
    }
    if (sid.equals(activeCallId)) {
      Log.i(TAG, "[DIBAY_CALL] ring_deduped callId=" + sid + " source=ring_owner");
      return false;
    }
    stop(app, null);

    String policy =
        ringtonePolicy != null && !ringtonePolicy.trim().isEmpty()
            ? IncomingCallRingtoneSsotCache.normalizePolicy(ringtonePolicy.trim(), ringtoneUrl)
            : IncomingCallRingtoneSsotCache.policyForCallId(sid);
    String resolvedRingtoneUrl =
        ringtoneUrl != null && !ringtoneUrl.trim().isEmpty()
            ? ringtoneUrl.trim()
            : IncomingCallRingtoneSsotCache.ringtoneUrlForCallId(sid);

    if (IncomingCallRingtoneSsotCache.POLICY_SILENT.equals(policy)) {
      Log.i(
          TAG,
          "[DIBAY_CALL] native_call_ringtone_silent callId="
              + sid
              + " reason=admin_disabled source=ring_owner");
      activeCallId = sid;
      return true;
    }

    DibayForegroundRingtone.start(app, sid, resolvedRingtoneUrl, policy);
    activeCallId = sid;
    return true;
  }

  public static void stop(Context context, String callId) {
    if (context == null) return;
    String sid = callId != null ? callId.trim() : "";
    if (!sid.isEmpty()) {
      DibayForegroundRingtone.stop(sid);
      IncomingCallRingtoneSsotCache.clear(sid);
      if (sid.equals(activeCallId)) {
        activeCallId = null;
      }
      return;
    }
    DibayForegroundRingtone.stop(activeCallId);
    IncomingCallRingtoneSsotCache.clear(activeCallId);
    activeCallId = null;
  }

  public static void stopAll(Context context) {
    stop(context, null);
  }

  public static String getActiveCallId() {
    return activeCallId;
  }

  /** Robolectric unit tests — reset in-memory ring owner between cases. */
  static void clearForTests() {
    activeCallId = null;
  }

  /** Robolectric unit tests — mirrors {@link #start} block reasons without side effects. */
  static String describeStartBlockReason(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return "invalid";
    String sid = callId.trim();
    if (DibayCallConsumedStore.isConsumed(context.getApplicationContext(), sid)) {
      return "consumed";
    }
    if (sid.equals(activeCallId)) {
      return "deduped";
    }
    return "";
  }
}
