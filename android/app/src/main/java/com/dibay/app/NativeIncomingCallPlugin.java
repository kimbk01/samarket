package com.dibay.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** 웹 수신·거절·수락 후 Android 수신 통화 알림 정리 */
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
}
