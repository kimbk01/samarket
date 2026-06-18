package com.dibay.app;

import android.content.Context;
import com.dibay.app.call.CallForegroundService;

/**
 * Non-foreground incoming — wake lock, ring, notification/activity, ringing FGS.
 * Foreground unlocked is handled in {@link MainActivity} + {@link IncomingCallForegroundUiLauncher}.
 */
public final class IncomingCallRingingCoordinator {
  private IncomingCallRingingCoordinator() {}

  public static void startRingingWithPresentation(
      Context context,
      String callId,
      String callKind,
      IncomingCallPayload payload,
      IncomingCallRouteDecision decision) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (payload != null && decision != null) {
      PendingIncomingPresentation.put(sid, payload, decision);
    }

    IncomingCallWakeLock.acquire(context.getApplicationContext(), sid);
    startNativeRing(context, sid, decision != null && decision.lockBridge ? "lock_incoming" : "background_incoming");

    // Lock / sleep — UI + ring immediately; FGS is best-effort (screen-off may defer it).
    if (decision != null && decision.lockBridge) {
      deliverPendingPresentation(context.getApplicationContext(), sid);
      try {
        CallForegroundService.startRinging(context, sid, callKind);
      } catch (Exception error) {
        DibayCallPushLog.warn(
            "foreground_service_started_ringing",
            sid,
            "ok=false err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
      }
      return;
    }

    if (sid.equals(CallForegroundService.getRingingCallId())) {
      deliverPendingPresentation(context.getApplicationContext(), sid);
      return;
    }
    try {
      CallForegroundService.startRinging(context, sid, callKind);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          sid,
          "ok=false err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
      deliverPendingPresentation(context.getApplicationContext(), sid);
    }
  }

  public static void deliverPendingPresentation(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    PendingIncomingPresentation.Entry entry = PendingIncomingPresentation.take(callId.trim());
    if (entry == null) return;
    IncomingCallBackgroundPresentation.deliver(context, entry.payload, entry.decision);
  }

  private static void startNativeRing(Context context, String callId, String source) {
    String active = IncomingCallRingOwner.getActiveCallId();
    if (callId != null && callId.equals(active)) {
      IncomingCallNotificationBuilder.logRingOwnerDecision(callId, false, "skip_existing_owner:" + source);
      return;
    }
    boolean started = IncomingCallRingOwner.start(context, callId, source);
    IncomingCallNotificationBuilder.logRingOwnerDecision(callId, started, source);
    if (started) {
      DibayCallPushLog.info("ringtone_start_native", callId, "source=" + source);
    }
  }
}
