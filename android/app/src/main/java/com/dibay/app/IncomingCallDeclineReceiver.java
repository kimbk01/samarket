package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Notification decline action — web call-route reject signal (V3 PATCH owner). */
public class IncomingCallDeclineReceiver extends BroadcastReceiver {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  public static final String ACTION_DECLINE = "com.dibay.app.action.INCOMING_CALL_NOTIFICATION_DECLINE";
  public static final String EXTRA_CALL_ID = "callId";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String callId = intent.getStringExtra(EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sessionId = callId.trim();
    if (ACTION_DECLINE.equals(intent.getAction())) {
      Log.i(TAG, "[call-ui] reject_clicked callId=" + sessionId + " source=notification");
      if (IncomingCallSurfaceOwner.isNotificationFallbackOwner(sessionId)) {
        IncomingCallBackgroundNotifier.logLockscreenEvent(
            context,
            sessionId,
            "fallback_reject_action",
            IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK,
            IncomingCallNotificationBuilder.canPostFullScreenIntent(context),
            "source=notification");
      }
      IncomingCallActionCoordinator.handleReject(context.getApplicationContext(), sessionId);
    }
  }
}
