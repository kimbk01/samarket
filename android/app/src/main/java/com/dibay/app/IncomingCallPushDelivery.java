package com.dibay.app;

import android.content.Context;
import android.util.Log;
import com.dibay.app.nativevideo.NativeVideoCallLane;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallLane;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;

/**
 * Push incoming delivery SSOT — FCM {@link DibayFirebaseMessagingService} and debug adb share one path.
 *
 * <p>Native Voice/Video Runtime owns production incoming delivery. Legacy Web pending-route / V4
 * owner handoff in this class was detached (Phase 2 P2-1); non-native fall-through logs only.
 */
public final class IncomingCallPushDelivery {
  private IncomingCallPushDelivery() {}

  /**
   * Deliver incoming call after payload validation and native store persistence.
   * Caller must have set ringing store before invoke (Web pending-route skipped for native FCM).
   */
  public static void deliver(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    Context app = context.getApplicationContext();
    String callId = payload.callId.trim();

    if (!DibayCallAuthEligibilityStore.isMemberCallEligible(app)) {
      android.util.Log.w(
          "DIBAY_FCM",
          "[call-push] incoming_blocked_guest_ineligible callId=" + callId);
      DibayCallPushLog.warn(
          "incoming_blocked_guest_ineligible",
          callId,
          "reason=member_call_not_eligible");
      return;
    }

    NotificationReceiveGate.Snapshot notifGate = NotificationReceiveGate.snapshot(app);
    if (!notifGate.receiveReady) {
      android.util.Log.w(
          "DIBAY_FCM",
          "[call-push] incoming_blocked_notification_permission callId="
              + callId
              + " reason="
              + (notifGate.blockReason != null ? notifGate.blockReason : "unknown"));
      DibayCallPushLog.warn(
          "incoming_blocked_notification_permission",
          callId,
          "reason="
              + (notifGate.blockReason != null ? notifGate.blockReason : "unknown")
              + " runtimeGranted="
              + notifGate.notificationRuntimeGranted
              + " appEnabled="
              + notifGate.notificationsEnabled
              + " incomingChannelEnabled="
              + notifGate.incomingCallChannelEnabled);
      return;
    }

    if (!notifGate.lockScreenIncomingReady) {
      DibayCallPushLog.info(
          "incoming_push_lock_screen_tier_blocked",
          callId,
          "reason="
              + (notifGate.lockScreenBlockReason != null ? notifGate.lockScreenBlockReason : "unknown")
              + " receiveReady=true runtimeAllowed=true");
    }

    if (NativeVoiceCallLane.shouldHandleIncoming(app, payload.callType)) {
      NativeVoiceCallRuntime.handleIncoming(
          app,
          callId,
          payload.roomId,
          payload.callerId,
          payload.callerName,
          payload.callType);
      return;
    }

    if (NativeVideoCallLane.shouldHandleIncoming(app, payload.callType)) {
      NativeVideoCallRuntime.handleIncoming(
          app,
          callId,
          payload.roomId,
          payload.callerId,
          payload.callerName,
          payload.callType);
      return;
    }

    Log.i(
        "DIBAY_FCM",
        "[call-native] legacy_web_pending_route_detached callId="
            + callId
            + " mediaType="
            + payload.callType
            + " reason=native_runtime_ssot");
    DibayCallPushLog.info(
        "legacy_web_pending_route_detached",
        callId,
        "mediaType=" + payload.callType + " reason=native_runtime_ssot");
  }
}
