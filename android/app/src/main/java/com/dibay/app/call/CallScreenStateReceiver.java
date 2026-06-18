package com.dibay.app.call;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import com.dibay.app.DibayCallLog;

/** Screen off / user present — active call session phase only (never ends call). */
public final class CallScreenStateReceiver extends BroadcastReceiver {
  private static CallScreenStateReceiver registered;
  private static boolean isRegistered;

  private CallScreenStateReceiver() {}

  public static synchronized void register(Context context) {
    if (context == null || isRegistered) return;
    Context app = context.getApplicationContext();
    CallScreenStateReceiver receiver = new CallScreenStateReceiver();
    IntentFilter filter = new IntentFilter();
    filter.addAction(Intent.ACTION_SCREEN_OFF);
    filter.addAction(Intent.ACTION_USER_PRESENT);
    filter.addAction(Intent.ACTION_SCREEN_ON);
    app.registerReceiver(receiver, filter);
    registered = receiver;
    isRegistered = true;
    DibayCallLog.once("call_screen_state_receiver_registered", "system", "ok=true");
  }

  public static synchronized void unregister(Context context) {
    if (context == null || !isRegistered || registered == null) return;
    try {
      context.getApplicationContext().unregisterReceiver(registered);
    } catch (Exception ignored) {
      /* already unregistered */
    }
    registered = null;
    isRegistered = false;
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String action = intent.getAction();
    String callId = DibayActiveCallSessionManager.getActiveCallId();
    if (callId == null || callId.isEmpty()) return;
    if (Intent.ACTION_SCREEN_OFF.equals(action)) {
      DibayActiveCallSessionManager.onScreenOff(callId);
    } else if (Intent.ACTION_USER_PRESENT.equals(action) || Intent.ACTION_SCREEN_ON.equals(action)) {
      DibayActiveCallSessionManager.onScreenOn(callId);
    }
  }
}
