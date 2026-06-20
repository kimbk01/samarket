package com.dibay.app.call;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.dibay.app.DibayCallLog;
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

  /** PiP 탭 복귀 — WebView 전체화면으로 되돌린다. */
  @PluginMethod
  public void restoreFromPictureInPicture(PluginCall call) {
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("no_activity");
      return;
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode()) {
        Intent intent = new Intent(activity, activity.getClass());
        intent.setFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        activity.startActivity(intent);
      } else {
        ActivityManager manager = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
        if (manager != null) {
          manager.moveTaskToFront(activity.getTaskId(), ActivityManager.MOVE_TASK_WITH_HOME);
        }
      }
      DibayCallLog.once("active_call_pip_restore", DibayActiveCallSessionManager.getActiveCallId(), "ok=true");
      call.resolve(new JSObject().put("ok", true));
    } catch (Exception e) {
      call.reject("pip_restore_failed", e);
    }
  }
}
