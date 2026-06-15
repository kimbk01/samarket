package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Notification decline action — native PATCH reject without opening IncomingCallActivity. */
public class IncomingCallDeclineReceiver extends BroadcastReceiver {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  public static final String ACTION_DECLINE = "com.dibay.app.action.INCOMING_CALL_NOTIFICATION_DECLINE";
  public static final String EXTRA_CALL_ID = "callId";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null || !ACTION_DECLINE.equals(intent.getAction())) return;
    String callId = intent.getStringExtra(EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sessionId = callId.trim();
    Log.i(TAG, "[incoming-call-native] notification_decline callId=" + sessionId);
    IncomingCallNotificationBuilder.dismissIncomingCall(context.getApplicationContext(), sessionId);
    new Thread(() -> CallSessionPatchHelper.patch(context.getApplicationContext(), sessionId, "reject"))
        .start();
  }
}
