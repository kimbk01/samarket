package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallActivityRouter;
import com.dibay.app.call.CallForegroundService;

/**
 * Full-screen incoming UI outside the app task — Telegram/Kakao parity.
 * Launch from ringing {@link CallForegroundService} after {@code startForeground} (BAL exempt).
 */
public final class IncomingCallOutsideAppLauncher {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallOutsideAppLauncher() {}

  public static void launchFullScreenIncoming(
      Context context, IncomingCallPayload payload, IncomingCallRouteDecision decision) {
    if (context == null || payload == null || !payload.isValid() || decision == null) return;
    if (decision.foregroundUnlockedInteractive) return;

    String sid = payload.callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-ui] outside_app_incoming_skipped_consumed callId=" + sid);
      return;
    }
    if (!CallActivityRouter.shouldLaunchIncomingActivity(sid)) return;

    Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, payload);
    if (incomingUi == null) {
      DibayCallPushLog.warn("outside_app_incoming_activity_blocked", sid, "reason=invalid_intent");
      return;
    }
    incomingUi.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP
            | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    try {
      context.getApplicationContext().startActivity(incomingUi);
      String source =
          decision.lockBridge
              ? "lock_activity"
              : (context instanceof CallForegroundService ? "fgs_fullscreen" : "outside_app_activity");
      DibayCallLog.once("incoming_render", sid, "source=" + source);
      Log.i(
          TAG,
          "[call-ui] outside_app_incoming_activity_launch callId="
              + sid
              + " source="
              + source
              + " surface="
              + decision.selectedSurfaceName());
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "outside_app_incoming_activity_blocked",
          sid,
          "err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
    }
  }
}
