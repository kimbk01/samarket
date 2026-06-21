package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** @deprecated Foreground unlocked now uses the Web `IncomingCallSurface`; do not call from push delivery. */
public final class IncomingCallForegroundUiLauncher {
  private static final String TAG = "DIBAY_INCOMING_CALL";

  private IncomingCallForegroundUiLauncher() {}

  public static void showUi(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String sid = payload.callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-ui] foreground_incoming_skipped_consumed callId=" + sid);
      return;
    }
    if (IncomingCallActionCoordinator.isCompleted(sid)) {
      Log.i(TAG, "[call-ui] foreground_incoming_skipped_completed callId=" + sid);
      return;
    }

    Intent intent = IncomingCallIntentHelper.buildForegroundIncomingCallActivityIntent(context, payload);
    if (intent == null) return;

    ForegroundIncomingCallRegistry.setActive(sid);
    MainActivity.notifyForegroundIncomingUiState(sid, true);

    MainActivity act = MainActivity.getActiveInstance();
    if (act != null) {
      act.startActivity(intent);
    } else {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.getApplicationContext().startActivity(intent);
    }

    DibayCallLog.once("incoming_render", sid, "source=foreground_activity");
    Log.i(TAG, "[call-ui] foreground_incoming_activity_launch callId=" + sid);
  }
}
