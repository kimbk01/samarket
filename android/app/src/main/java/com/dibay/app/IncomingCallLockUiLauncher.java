package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallActivityRouter;

/**
 * Lock / sleep incoming — KakaoTalk·Telegram·Viber style immediate full-screen UI.
 * FSI on notification is still attached; this avoids OEM delay where only ring is heard.
 */
public final class IncomingCallLockUiLauncher {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallLockUiLauncher() {}

  public static void launchIfNeeded(
      Context context, IncomingCallPayload payload, IncomingCallRouteDecision decision) {
    if (context == null || payload == null || !payload.isValid() || decision == null) return;
    if (decision.selectedSurface != IncomingCallRouteDecision.SelectedSurface.INCOMING_ACTIVITY) {
      return;
    }
    if (!decision.lockBridge) return;

    String sid = payload.callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-ui] lock_incoming_skipped_consumed callId=" + sid);
      return;
    }
    if (!CallActivityRouter.shouldLaunchIncomingActivity(sid)) return;

    Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, payload);
    if (incomingUi == null) {
      DibayCallPushLog.warn("incoming_activity_lock_launch_blocked", sid, "reason=invalid_intent");
      return;
    }
    incomingUi.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    try {
      context.getApplicationContext().startActivity(incomingUi);
      DibayCallLog.once("incoming_render", sid, "source=lock_activity");
      DibayCallPushLog.info("incoming_activity_lock_direct_launch", sid, "fsiAllowed=" + decision.fsiAllowed);
      Log.i(
          TAG,
          "[call-ui] incoming_activity_lock_direct_launch callId="
              + sid
              + " fsiAllowed="
              + decision.fsiAllowed);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "incoming_activity_lock_launch_blocked",
          sid,
          "err=" + error.getClass().getSimpleName());
    }
  }
}
