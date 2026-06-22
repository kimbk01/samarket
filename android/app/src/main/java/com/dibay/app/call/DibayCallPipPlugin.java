package com.dibay.app.call;

import android.os.Build;
import android.content.pm.PackageManager;
import com.dibay.app.MainActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge — lib/call/native/dibay-call-pip.ts */
@CapacitorPlugin(name = "DibayCallPip")
public class DibayCallPipPlugin extends Plugin {

  private static volatile DibayCallPipPlugin instance;
  private static volatile boolean enteringPip;

  @Override
  public void load() {
    super.load();
    instance = this;
  }

  public static DibayCallPipPlugin getInstance() {
    return instance;
  }

  @PluginMethod
  public void isPipSupported(PluginCall call) {
    boolean supported =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && getActivity()
                .getPackageManager()
                .hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    JSObject result = new JSObject();
    result.put("supported", supported);
    call.resolve(result);
  }

  @PluginMethod
  public void enterCallPip(PluginCall call) {
    if (enteringPip) {
      JSObject blocked = new JSObject();
      blocked.put("ok", false);
      call.resolve(blocked);
      return;
    }
    if (!(getActivity() instanceof MainActivity)) {
      call.reject("no_main_activity");
      return;
    }
    enteringPip = true;
    try {
      boolean ok = ((MainActivity) getActivity()).requestVideoCallPipFromBridge();
      JSObject result = new JSObject();
      result.put("ok", ok);
      call.resolve(result);
    } finally {
      enteringPip = false;
    }
  }

  @PluginMethod
  public void exitCallPip(PluginCall call) {
    boolean ok = false;
    if (getActivity() != null
        && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
        && getActivity().isInPictureInPictureMode()) {
      getActivity().moveTaskToBack(false);
      ok = true;
    }
    JSObject result = new JSObject();
    result.put("ok", ok);
    call.resolve(result);
  }

  public void emitPipModeChanged(boolean inPipMode, String callId) {
    JSObject data = new JSObject();
    data.put("inPipMode", inPipMode);
    if (callId != null && !callId.isEmpty()) {
      data.put("callId", callId);
    }
    notifyListeners("pipModeChanged", data);
  }

  public void emitPipAction(String action, String callId) {
    JSObject data = new JSObject();
    data.put("action", action);
    if (callId != null && !callId.isEmpty()) {
      data.put("callId", callId);
    }
    notifyListeners("pipAction", data);
  }

  public void emitPipFallbackDock(String callId) {
    emitPipAction("restore", callId);
  }
}
