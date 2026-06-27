package com.dibay.app.nativevideo;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification actions for Native Video Runtime only. */
public class NativeVideoCallActionReceiver extends BroadcastReceiver {
  public static final String ACTION_ACCEPT = "com.dibay.app.nativevideo.ACCEPT";
  public static final String ACTION_REJECT = "com.dibay.app.nativevideo.REJECT";
  public static final String ACTION_END = "com.dibay.app.nativevideo.END";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(NativeVideoCallActivity.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      NativeVideoCallLog.info("notification_accept_tapped", sid);
      NativeVideoCallRuntime.accept(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_REJECT.equals(action)) {
      NativeVideoCallLog.info("notification_reject_tapped", sid);
      NativeVideoCallRuntime.reject(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_END.equals(action)) {
      NativeVideoCallLog.info("end_tapped", sid, "source=notification");
      NativeVideoCallRuntime.end(context.getApplicationContext(), sid);
    }
  }
}
