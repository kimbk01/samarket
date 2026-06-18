package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import java.util.HashMap;
import java.util.Map;

/**
 * Debug APK only — adb-driven incoming/cancel smoke without a second device.
 * {@link #postDebugIncoming} mirrors {@link IncomingCallPushDelivery} production path.
 */
public final class DibayCallDebugCommandReceiver extends BroadcastReceiver {
  public static final String ACTION_DEBUG_INCOMING = "com.dibay.DEBUG_INCOMING_CALL";
  public static final String ACTION_DEBUG_CANCELED = "com.dibay.DEBUG_CALL_CANCELED";
  public static final String EXTRA_CALL_ID = "callId";
  public static final String EXTRA_CALL_TYPE = "callType";
  private static final String TAG = "DIBAY_CALL";

  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String callId = intent.getStringExtra(EXTRA_CALL_ID);
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String action = intent.getAction();
    Context app = context.getApplicationContext();
    if (ACTION_DEBUG_INCOMING.equals(action)) {
      String callType = intent.getStringExtra(EXTRA_CALL_TYPE);
      if (callType == null || callType.trim().isEmpty()) {
        callType = "audio";
      }
      Map<String, String> data = new HashMap<>();
      data.put("type", "incoming_call");
      data.put("callId", sid);
      data.put("roomId", "debug-room");
      data.put("callerId", "debug-caller");
      data.put("callerName", "Debug Caller");
      data.put("callType", callType);
      IncomingCallPayload payload = FcmPayloadResolver.resolveIncomingCallPayload(data, "음성 통화", "Debug");
      if (!payload.isValid()) {
        Log.w(TAG, "[DIBAY_CALL] debug_incoming_invalid callId=" + sid);
        return;
      }
      postDebugIncoming(context, app, payload);
      Log.i(TAG, "[DIBAY_CALL] debug_incoming_posted callId=" + sid);
      return;
    }
    if (ACTION_DEBUG_CANCELED.equals(action)) {
      IncomingCallTerminalHandler.handle(app, sid, "cancelled", "debug_adb");
      Log.i(TAG, "[DIBAY_CALL] debug_call_canceled callId=" + sid);
    }
  }

  static void postDebugIncoming(Context context, Context app, IncomingCallPayload payload) {
    String callId = payload.callId;
    DibayCallLog.once("push_received", callId, "roomId=" + payload.roomId + " source=debug_adb");
    Log.i("DIBAY_FCM", "[call-push] incoming_call_received callId=" + callId + " roomId=" + payload.roomId);

    String pendingRoute = "/community-messenger/calls/" + Uri.encode(callId) + "?source=native_push";
    DibayIncomingCallNativeStore.setRinging(app, payload, pendingRoute, 0L);
    MainActivity.persistCallPendingRoute(app, pendingRoute, payload, 0L);

    IncomingCallPushDelivery.deliver(context, payload);
  }
}
