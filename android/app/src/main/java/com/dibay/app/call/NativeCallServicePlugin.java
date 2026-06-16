package com.dibay.app.call;

import android.content.Intent;
import com.dibay.app.DibayCallLog;
import com.dibay.app.IncomingCallIntentHelper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge — lib/call/native/native-call-service.ts */
@CapacitorPlugin(name = "NativeCallService")
public class NativeCallServicePlugin extends Plugin {

  @PluginMethod
  public void prepareAccept(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String callKind = call.getString("callKind", "voice");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    CallActivityRouter.onNativeAcceptPrep(getContext(), callId, callKind);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void startCall(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String callKind = call.getString("callKind", "voice");
    String phase = call.getString("phase", "active");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    CallForegroundService.start(getContext(), callId, callKind, phase);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void endCall(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String reason = call.getString("reason", "client_end");
    CallForegroundService.stop(getContext(), callId, reason);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void getActiveCallId(PluginCall call) {
    JSObject result = new JSObject();
    String active = CallForegroundService.getActiveCallId();
    result.put("callId", active.isEmpty() ? null : active);
    call.resolve(result);
  }

  @PluginMethod
  public void heartbeat(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    CallForegroundService.heartbeat(getContext(), callId);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }
}
