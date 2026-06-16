package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.HashMap;
import java.util.Map;

/**
 * Debug APK only — adb-driven incoming/cancel smoke without a second device.
 *
 * <pre>
 * adb shell am broadcast -a com.dibay.DEBUG_INCOMING_CALL --es callId test-call-1 com.dibay.app
 * adb shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId test-call-1 com.dibay.app
 * </pre>
 *
 * DO NOT register in release — see {@code src/debug/AndroidManifest.xml}.
 */
public final class DibayCallDebugCommandReceiver extends BroadcastReceiver {
  public static final String ACTION_DEBUG_INCOMING = "com.dibay.DEBUG_INCOMING_CALL";
  public static final String ACTION_DEBUG_CANCELED = "com.dibay.DEBUG_CALL_CANCELED";
  public static final String EXTRA_CALL_ID = "callId";
  private static final String TAG = "DIBAY_CALL";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String action = intent.getAction();
    if (ACTION_DEBUG_INCOMING.equals(action)) {
      Map<String, String> data = new HashMap<>();
      data.put("type", "incoming_call");
      data.put("callId", sid);
      data.put("roomId", "debug-room");
      data.put("callerId", "debug-caller");
      data.put("callerName", "Debug Caller");
      data.put("callType", "audio");
      IncomingCallPayload payload = FcmPayloadResolver.resolveIncomingCallPayload(data, "음성 통화", "Debug");
      if (!payload.isValid()) {
        Log.w(TAG, "[DIBAY_CALL] debug_incoming_invalid callId=" + sid);
        return;
      }
      IncomingCallNotificationBuilder.showIncomingCall(context.getApplicationContext(), payload);
      DibayForegroundRingtone.start(context.getApplicationContext(), sid);
      Log.i(TAG, "[DIBAY_CALL] debug_incoming_posted callId=" + sid);
      return;
    }
    if (ACTION_DEBUG_CANCELED.equals(action)) {
      IncomingCallTerminalHandler.handle(context.getApplicationContext(), sid, "cancelled", "debug_adb");
      Log.i(TAG, "[DIBAY_CALL] debug_call_canceled callId=" + sid);
    }
  }
}
