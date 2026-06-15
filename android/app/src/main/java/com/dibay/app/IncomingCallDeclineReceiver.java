package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Notification decline action — native PATCH reject without opening IncomingCallActivity. */
public class IncomingCallDeclineReceiver extends BroadcastReceiver {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  public static final String ACTION_DECLINE = "com.dibay.app.action.INCOMING_CALL_NOTIFICATION_DECLINE";
  public static final String ACTION_ACCEPT = "com.dibay.app.action.INCOMING_CALL_NOTIFICATION_ACCEPT";
  public static final String EXTRA_CALL_ID = "callId";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String callId = intent.getStringExtra(EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sessionId = callId.trim();
    if (ACTION_ACCEPT.equals(intent.getAction())) {
      Log.i(TAG, "[call-ui] answer_clicked callId=" + sessionId + " source=notification");
      IncomingCallActionCoordinator.handleAccept(context.getApplicationContext(), sessionId);
      return;
    }
    if (ACTION_DECLINE.equals(intent.getAction())) {
      Log.i(TAG, "[call-ui] reject_clicked callId=" + sessionId + " source=notification");
      IncomingCallActionCoordinator.handleReject(context.getApplicationContext(), sessionId);
    }
  }
}
