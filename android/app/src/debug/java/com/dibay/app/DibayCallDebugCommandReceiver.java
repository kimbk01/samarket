package com.dibay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import java.util.HashMap;
import java.util.Map;

/**
 * Debug APK only — adb-driven incoming/cancel smoke without a second device.
 *
 * <pre>
 * adb shell am broadcast -a com.dibay.DEBUG_INCOMING_CALL --es callId test-call-1 com.dibay.app
 * adb shell am broadcast -a com.dibay.DEBUG_INCOMING_CALL --es callId test-call-1 --es callType video com.dibay.app
 * adb shell am broadcast -a com.dibay.DEBUG_CALL_CANCELED --es callId test-call-1 com.dibay.app
 * adb shell am broadcast -a com.dibay.DEBUG_STALE_TERMINAL --es callId stale-id com.dibay.app
 * </pre>
 *
 * DO NOT register in release — see {@code src/debug/AndroidManifest.xml}.
 */
public final class DibayCallDebugCommandReceiver extends BroadcastReceiver {
  public static final String ACTION_DEBUG_INCOMING = "com.dibay.DEBUG_INCOMING_CALL";
  public static final String ACTION_DEBUG_CANCELED = "com.dibay.DEBUG_CALL_CANCELED";
  public static final String ACTION_DEBUG_STALE_TERMINAL = "com.dibay.DEBUG_STALE_TERMINAL";
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
      postDebugIncoming(app, payload);
      Log.i(TAG, "[DIBAY_CALL] debug_incoming_posted callId=" + sid + " callType=" + callType);
      return;
    }
    if (ACTION_DEBUG_CANCELED.equals(action)) {
      IncomingCallTerminalHandler.handle(app, sid, "rejected", "debug_adb");
      Log.i(TAG, "[DIBAY_CALL] debug_call_terminal callId=" + sid + " kind=rejected");
      return;
    }
    if (ACTION_DEBUG_STALE_TERMINAL.equals(action)) {
      IncomingCallTerminalHandler.handle(app, sid, "cancelled", "debug_adb_stale");
      Log.i(TAG, "[DIBAY_CALL] debug_stale_terminal callId=" + sid);
    }
  }

  /** Mirrors production FCM incoming path — session machine + route decision + RingOwner SSOT. */
  static void postDebugIncoming(Context app, IncomingCallPayload payload) {
    long receivedAtMs = System.currentTimeMillis();
    String callId = payload.callId;
    IncomingCallSessionMachine.ReceiveDecision receive =
        IncomingCallSessionMachine.onIncomingFcmReceived(app, payload, receivedAtMs);
    if (!receive.proceed) {
      if (receive.duplicateMerge) {
        Log.i(TAG, "[call-push] incoming_duplicate_fcm_merge callId=" + callId);
        boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
        IncomingCallRouteDecision mergeDecision = IncomingCallRouteDecision.resolve(app, appVisible, callId);
        if (!mergeDecision.foregroundUnlockedInteractive) {
          IncomingCallNotificationBuilder.refreshIncomingCallIfPresent(app, payload, mergeDecision);
        }
      }
      return;
    }
    DibayIncomingCallNativeStore.setRinging(app, payload, "/community-messenger/calls/" + callId, 0L);
    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
    IncomingCallRouteDecision decision = IncomingCallRouteDecision.resolve(app, appVisible, callId);
    IncomingCallSessionMachine.onRouted(callId, "debug_adb");
    if (decision.foregroundUnlockedInteractive) {
      IncomingCallRingOwner.start(app, callId, "debug_foreground");
      MainActivity.deliverCallIncomingEvent(payload);
      return;
    }
    IncomingCallRingingCoordinator.startRingingWithPresentation(app, callId, payload.callType, payload, decision);
    IncomingCallActionCoordinator.scheduleMissedTimeout(app, payload);
  }
}
