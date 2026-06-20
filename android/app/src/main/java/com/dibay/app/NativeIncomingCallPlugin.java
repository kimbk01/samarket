package com.dibay.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 웹 수신·거절·수락 후 Android 수신 통화 알림 정리 + call/push route pending backup */
@CapacitorPlugin(name = "NativeIncomingCall")
public class NativeIncomingCallPlugin extends Plugin {
  @PluginMethod
  public void dismissNotification(PluginCall call) {
    String sessionId = call.getString("sessionId", "").trim();
    if (!sessionId.isEmpty()) {
      IncomingCallNotificationBuilder.dismissIncomingCall(getContext(), sessionId);
    }
    call.resolve();
  }

  @PluginMethod
  public void clearPendingPushRoute(PluginCall call) {
    MainActivity.clearPersistedPendingPushRoute(getContext());
    call.resolve();
  }

  @PluginMethod
  public void clearPendingCallRoute(PluginCall call) {
    MainActivity.clearPersistedCallPendingRoute(getContext());
    call.resolve();
  }

  @PluginMethod
  public void getPendingPushRoute(PluginCall call) {
    android.os.Bundle bundle = MainActivity.readPersistedPendingPushRoute(getContext());
    JSObject result = new JSObject();
    String path = bundle.getString(MainActivity.PENDING_PATH_KEY);
    if (path == null || path.trim().isEmpty()) {
      call.resolve(result);
      return;
    }
    result.put("path", path);
    String notificationId = bundle.getString(MainActivity.PENDING_NOTIFICATION_ID_KEY);
    if (notificationId != null && !notificationId.isEmpty()) {
      result.put("notificationId", notificationId);
    }
    result.put("at", bundle.getLong(MainActivity.PENDING_AT_KEY, System.currentTimeMillis()));
    call.resolve(result);
  }

  @PluginMethod
  public void getPendingCallRoute(PluginCall call) {
    android.os.Bundle bundle = MainActivity.readPersistedCallPendingRoute(getContext());
    JSObject result = new JSObject();
    String path = bundle.getString(MainActivity.PENDING_PATH_KEY);
    if (path == null || path.trim().isEmpty()) {
      call.resolve(result);
      return;
    }
    result.put("path", path);
    result.put("at", bundle.getLong(MainActivity.PENDING_AT_KEY, System.currentTimeMillis()));
    call.resolve(result);
  }

  @PluginMethod
  public void stopIncomingRingtone(PluginCall call) {
    String sessionId = call.getString("sessionId", "").trim();
    IncomingCallRingOwner.stop(getContext(), sessionId.isEmpty() ? null : sessionId);
    call.resolve();
  }

  /** Realtime/direct_ringing — FCM 전에도 native OS ring 시작 (WebAudio 금지 경로 보완). */
  @PluginMethod
  public void startIncomingRingtone(PluginCall call) {
    String sessionId = call.getString("sessionId", "").trim();
    String callType = call.getString("callType", "voice");
    if (!sessionId.isEmpty()) {
      IncomingCallRingOwner.start(getContext(), sessionId, callType);
    }
    call.resolve();
  }

  @PluginMethod
  public void markCallConsumed(PluginCall call) {
    String sessionId = call.getString("sessionId", "").trim();
    String reason = call.getString("reason", "consumed");
    if (!sessionId.isEmpty()) {
      DibayCallConsumedStore.mark(getContext(), sessionId, reason);
      IncomingCallRingOwner.stop(getContext(), sessionId);
      IncomingCallNotificationBuilder.dismissIncomingCall(getContext(), sessionId);
    }
    call.resolve();
  }

  @PluginMethod
  public void isCallConsumed(PluginCall call) {
    String sessionId = call.getString("sessionId", "").trim();
    JSObject result = new JSObject();
    if (sessionId.isEmpty()) {
      result.put("consumed", false);
      call.resolve(result);
      return;
    }
    boolean consumed = DibayCallConsumedStore.isConsumed(getContext(), sessionId);
    result.put("consumed", consumed);
    if (consumed) {
      String reason = DibayCallConsumedStore.consumedReason(getContext(), sessionId);
      if (reason != null) result.put("reason", reason);
    }
    call.resolve(result);
  }

  @PluginMethod
  public void listConsumedCallIds(PluginCall call) {
    JSArray items = new JSArray();
    for (DibayCallConsumedStore.ConsumedEntry entry : DibayCallConsumedStore.listConsumed(getContext())) {
      JSObject row = new JSObject();
      row.put("sessionId", entry.callId);
      row.put("reason", entry.reason);
      row.put("at", entry.at);
      items.put(row);
    }
    JSObject result = new JSObject();
    result.put("items", items);
    call.resolve(result);
  }

  @PluginMethod
  public void drainPendingTerminalEvents(PluginCall call) {
    JSArray items = new JSArray();
    for (DibayCallTerminalPendingQueue.Entry entry :
        DibayCallTerminalPendingQueue.drain(getContext())) {
      JSObject row = new JSObject();
      row.put("sessionId", entry.callId);
      row.put("status", entry.status);
      row.put("at", entry.at);
      items.put(row);
    }
    JSObject result = new JSObject();
    result.put("items", items);
    call.resolve(result);
  }

  @PluginMethod
  public void getForegroundIncomingCallId(PluginCall call) {
    JSObject result = new JSObject();
    String callId = ForegroundIncomingCallRegistry.getActiveCallId();
    if (callId != null && !callId.isEmpty()) {
      result.put("callId", callId);
    }
    call.resolve(result);
  }

  @PluginMethod
  public void syncCallSoundConfig(PluginCall call) {
    boolean voiceIncomingEnabled = call.getBoolean("voiceIncomingEnabled", true);
    String voiceIncomingSource = call.getString("voiceIncomingSource", "device_ringtone");
    String voiceIncomingUrl = call.getString("voiceIncomingUrl", "");
    boolean videoIncomingEnabled = call.getBoolean("videoIncomingEnabled", true);
    String videoIncomingSource = call.getString("videoIncomingSource", "device_ringtone");
    String videoIncomingUrl = call.getString("videoIncomingUrl", "");
    MessengerCallSoundNativeConfig.syncFromWeb(
        getContext(),
        voiceIncomingEnabled,
        voiceIncomingSource,
        voiceIncomingUrl,
        videoIncomingEnabled,
        videoIncomingSource,
        videoIncomingUrl);
    call.resolve();
  }
}
