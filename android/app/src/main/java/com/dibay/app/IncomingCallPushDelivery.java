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

    DibayCallAuthEligibilityStore.PresentDecision present =
        DibayCallAuthEligibilityStore.presentDecision(app, "");
    if (!present.ok) {
      android.util.Log.w(
          "DIBAY_FCM",
          "[call-push] incoming_blocked_guest_ineligible callId="
              + callId
              + " reason="
              + present.reason);
      DibayCallPushLog.warn(
          "incoming_blocked_guest_ineligible",
          callId,
          "reason=" + present.reason);
      IncomingCallPushAckHelper.sendPresentationAsync(
          app, callId, payload.callType, "suppressed", "auth_ineligible:" + present.reason, null);
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
      IncomingCallPushAckHelper.sendPresentationAsync(
          app,
          callId,
          payload.callType,
          "suppressed",
          "notification_gate:" + (notifGate.blockReason != null ? notifGate.blockReason : "unknown"),
          null);
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
      boolean presented =
          NativeVoiceCallRuntime.handleIncoming(
              app,
              callId,
              payload.roomId,
              payload.callerId,
              payload.callerName,
              payload.callType);
      reportRuntimePresentation(app, payload, presented);
      return;
    }

    if (NativeVideoCallLane.shouldHandleIncoming(app, payload.callType)) {
      boolean presented =
          NativeVideoCallRuntime.handleIncoming(
              app,
              callId,
              payload.roomId,
              payload.callerId,
              payload.callerName,
              payload.callType);
      reportRuntimePresentation(app, payload, presented);
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
    IncomingCallPushAckHelper.sendPresentationAsync(
        app, callId, payload.callType, "suppressed", "no_native_lane", null);
  }

  /**
   * R4 (2026-11-09) — 런타임이 벨·수신 화면을 시작했는지(true) 사후 보고. 수신 동작에는 관여하지 않는다.
   * false = 이미 종료된 통화·통화 중(busy)·다른 소유자 선점 — 런타임 로그(incoming_*)에 세부 사유.
   */
  private static void reportRuntimePresentation(
      Context app, IncomingCallPayload payload, boolean presented) {
    String surface =
        DibayKeyguardHelper.isKeyguardLocked(app) || !DibayKeyguardHelper.isInteractive(app)
            ? "lock_screen"
            : "unlocked";
    IncomingCallPushAckHelper.sendPresentationAsync(
        app,
        payload.callId,
        payload.callType,
        presented ? "presented" : "suppressed",
        presented ? null : "runtime_declined",
        surface);
  }
}
