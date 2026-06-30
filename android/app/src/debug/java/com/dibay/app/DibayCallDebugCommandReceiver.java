package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import com.dibay.app.callv4.CallV4Lane;
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
  public static final String EXTRA_RINGTONE_URL = "ringtoneUrl";
  public static final String EXTRA_CALL_SOUND_EVENT_KEY = "callSoundEventKey";
  public static final String EXTRA_SOUND_ASSET_ID = "soundAssetId";
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
      String ringtoneUrl = intent.getStringExtra(EXTRA_RINGTONE_URL);
      if (ringtoneUrl != null && !ringtoneUrl.trim().isEmpty()) {
        data.put("ringtoneUrl", ringtoneUrl.trim());
      }
      String callSoundEventKey = intent.getStringExtra(EXTRA_CALL_SOUND_EVENT_KEY);
      if (callSoundEventKey != null && !callSoundEventKey.trim().isEmpty()) {
        data.put("callSoundEventKey", callSoundEventKey.trim());
      }
      String soundAssetId = intent.getStringExtra(EXTRA_SOUND_ASSET_ID);
      if (soundAssetId != null && !soundAssetId.trim().isEmpty()) {
        data.put("soundAssetId", soundAssetId.trim());
      }
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

    String pendingRoute =
        CallV4Lane.isTelegramLaneEnabled(app)
            ? "/community-messenger/calls-v4/" + Uri.encode(callId) + "?source=native_push"
            : "/community-messenger/calls/" + Uri.encode(callId) + "?source=native_push";
    DibayIncomingCallNativeStore.setRinging(app, payload, pendingRoute, 0L);
    MainActivity.persistCallPendingRoute(app, pendingRoute, payload, 0L);
    IncomingCallRingtoneSsotCache.putFromPayload(payload);

    IncomingCallPushDelivery.deliver(context, payload);
  }
}
