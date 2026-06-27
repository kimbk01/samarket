package com.dibay.app.nativevoice;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification actions for Native Voice Runtime only. */
public class NativeVoiceCallActionReceiver extends BroadcastReceiver {
  public static final String ACTION_ACCEPT = "com.dibay.app.nativevoice.ACCEPT";
  public static final String ACTION_REJECT = "com.dibay.app.nativevoice.REJECT";
  public static final String ACTION_END = "com.dibay.app.nativevoice.END";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(NativeVoiceCallActivity.EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String action = intent.getAction();
    if (ACTION_ACCEPT.equals(action)) {
      NativeVoiceCallLog.info("notification_accept_tapped", sid);
      NativeVoiceCallRuntime.accept(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_REJECT.equals(action)) {
      NativeVoiceCallLog.info("notification_reject_tapped", sid);
      NativeVoiceCallRuntime.reject(context.getApplicationContext(), sid);
      return;
    }
    if (ACTION_END.equals(action)) {
      NativeVoiceCallLog.info("end_tapped", sid, "source=notification");
      NativeVoiceCallRuntime.end(context.getApplicationContext(), sid);
    }
  }
}
