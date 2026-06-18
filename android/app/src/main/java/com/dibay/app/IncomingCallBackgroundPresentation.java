package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;

/**
 * Background / lock incoming UI — runs after ringing FGS is foreground (required for CallStyle on API 34+).
 * Foreground unlocked uses {@link IncomingCallForegroundUiLauncher} from MainActivity instead.
 */
public final class IncomingCallBackgroundPresentation {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallBackgroundPresentation() {}

  public static void deliver(Context context, IncomingCallPayload payload, IncomingCallRouteDecision decision) {
    if (context == null || payload == null || !payload.isValid() || decision == null) return;
    if (decision.foregroundUnlockedInteractive) return;

    String callId = payload.callId.trim();
    Log.i(
        TAG,
        "[call-ui] background_presentation_deliver callId="
            + callId
            + " surface="
            + decision.selectedSurfaceName()
            + " lockBridge="
            + decision.lockBridge);

    IncomingCallNotificationBuilder.showIncomingCall(context, payload, decision);
    IncomingCallLockUiLauncher.launchIfNeeded(context, payload, decision);

    boolean fromRingingFgs = context instanceof CallForegroundService;
    if (decision.lockBridge || fromRingingFgs) {
      IncomingCallOutsideAppLauncher.launchFullScreenIncoming(context, payload, decision);
    }

    if (decision.shouldLaunchDirectIncomingActivity()) {
      Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, payload);
      if (incomingUi != null) {
        incomingUi.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
          context.getApplicationContext().startActivity(incomingUi);
          DibayCallLog.once("incoming_render", callId, "source=lock_activity_fallback");
          Log.i(TAG, "[call-ui] incoming_activity_lock_launch callId=" + callId + " surface=callstyle_fallback");
        } catch (Exception error) {
          DibayCallPushLog.warn(
              "incoming_activity_lock_launch_blocked", callId, "err=" + error.getClass().getSimpleName());
        }
      }
    }
  }
}
