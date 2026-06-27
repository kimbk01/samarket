package com.dibay.app.call;

import android.content.Context;
import android.content.Intent;
import com.dibay.app.DibayCallLog;
import com.dibay.app.nativevideo.NativeVideoCallApi;
import com.dibay.app.nativevideo.NativeVideoCallLane;
import com.dibay.app.nativevideo.NativeVideoCallOwner;
import com.dibay.app.nativevoice.NativeVoiceCallApi;
import com.dibay.app.nativevoice.NativeVoiceCallLane;
import com.dibay.app.nativevoice.NativeVoiceCallOwner;
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
    CallScreenStateReceiver.register(getContext());
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
    CallScreenStateReceiver.register(getContext());
    DibayActiveCallSessionManager.bindActiveCall(
        callId, callKind, DibayActiveCallSessionManager.PHASE_CONNECTED);
    CallForegroundService.start(getContext(), callId, callKind, phase);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void endCall(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String reason = call.getString("reason", "client_end");
    if (!DibayActiveCallSessionManager.canCleanup(reason)) {
      DibayCallLog.once("active_call_cleanup_blocked", callId, "reason=" + reason);
      JSObject blocked = new JSObject();
      blocked.put("ok", false);
      call.resolve(blocked);
      return;
    }
    DibayActiveCallSessionManager.requestCleanup(getContext(), callId, reason);
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void getActiveCallId(PluginCall call) {
    JSObject result = new JSObject();
    String active = DibayActiveCallSessionManager.getActiveCallId();
    if (active.isEmpty()) {
      active = CallForegroundService.getActiveCallId();
    }
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

  @PluginMethod
  public void reportAppState(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String state = call.getString("state", "foreground");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    switch (state) {
      case "background":
        DibayActiveCallSessionManager.onAppBackground(callId);
        break;
      case "screen_off":
        DibayActiveCallSessionManager.onScreenOff(callId);
        break;
      case "foreground":
      default:
        DibayActiveCallSessionManager.onAppForeground(getContext(), callId);
        break;
    }
    JSObject result = new JSObject();
    result.put("ok", true);
    call.resolve(result);
  }

  @PluginMethod
  public void getActiveCallSnapshot(PluginCall call) {
    JSObject result = new JSObject();
    String active = DibayActiveCallSessionManager.getActiveCallId();
    if (active.isEmpty()) {
      active = CallForegroundService.getActiveCallId();
    }
    result.put("callId", active.isEmpty() ? null : active);
    result.put("phase", DibayActiveCallSessionManager.getPhase());
    result.put("mediaType", DibayActiveCallSessionManager.getMediaType());
    result.put("connected", DibayActiveCallSessionManager.isConnected());
    call.resolve(result);
  }

  @PluginMethod
  public void reportRemoteEnded(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    DibayActiveCallSessionManager.onRemoteEnded(getContext(), callId);
    call.resolve(new JSObject().put("ok", true));
  }

  /** O2 — outgoing establishment handoff only (no FGS / Connected bind). */
  @PluginMethod
  public void startNativeOutgoingEstablishment(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    String roomId = call.getString("roomId", "");
    String mediaType = call.getString("mediaType", "voice");
    String peerUserId = call.getString("peerUserId", "");
    String peerName = call.getString("peerName", "");
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    Context app = getContext().getApplicationContext();
    boolean nativeOwned = false;
    if (NativeVoiceCallLane.isEnabled(app) && NativeVoiceCallLane.isVoiceMediaType(mediaType)) {
      NativeVoiceCallApi.startCallerJoinAsync(app, callId, roomId, peerUserId, peerName, mediaType);
      nativeOwned = NativeVoiceCallOwner.isNativeOwned(callId);
    } else if (NativeVideoCallLane.isEnabled(app) && NativeVideoCallLane.isVideoMediaType(mediaType)) {
      NativeVideoCallApi.startCallerJoinAsync(app, callId, roomId, peerUserId, peerName, mediaType);
      nativeOwned = NativeVideoCallOwner.isNativeOwned(callId);
    }
    JSObject result = new JSObject();
    result.put("ok", nativeOwned);
    result.put("nativeOwned", nativeOwned);
    call.resolve(result);
  }

  @PluginMethod
  public void isNativeEstablishmentOwned(PluginCall call) {
    String callId = call.getString("callId", "").trim();
    if (callId.isEmpty()) {
      call.reject("invalid_call_id");
      return;
    }
    boolean owned =
        NativeVoiceCallOwner.isNativeOwned(callId) || NativeVideoCallOwner.isNativeOwned(callId);
    call.resolve(new JSObject().put("owned", owned));
  }
}
