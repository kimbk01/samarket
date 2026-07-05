package com.dibay.app.call;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** 통화 전용 권한 — call 도메인 API */
@CapacitorPlugin(
  name = "CallPermission",
  permissions = {
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = CallPermissionPlugin.ALIAS_MICROPHONE),
    @Permission(strings = { Manifest.permission.CAMERA }, alias = CallPermissionPlugin.ALIAS_CAMERA),
  }
)
public class CallPermissionPlugin extends Plugin {
  static final String ALIAS_MICROPHONE = "microphone";
  static final String ALIAS_CAMERA = "camera";
  static final int REQUEST_CODE_CALL_MEDIA = 0xD1BC;
  private static volatile PluginCall pendingCallMediaPluginCall;
  private static volatile CallPermissionPlugin pendingCallMediaPlugin;

  static final String OS_GRANTED = "granted";
  static final String OS_PROMPT_AVAILABLE = "prompt_available";
  static final String OS_PERMANENTLY_DENIED = "permanently_denied";

  @PluginMethod
  public void checkPermissions(PluginCall call) {
    JSObject result = new JSObject();
    result.put("microphone", readOsGateState(ALIAS_MICROPHONE));
    result.put("camera", readOsGateState(ALIAS_CAMERA));
    call.resolve(result);
  }

  @PluginMethod
  public void requestCallMediaPermissions(PluginCall call) {
    String callKind = call.getString("callKind", "voice");
    boolean video = "video".equalsIgnoreCase(callKind.trim());
    java.util.ArrayList<String> needed = new java.util.ArrayList<>();
    if (OS_PROMPT_AVAILABLE.equals(readOsGateState(ALIAS_MICROPHONE))) {
      needed.add(Manifest.permission.RECORD_AUDIO);
    }
    if (video && OS_PROMPT_AVAILABLE.equals(readOsGateState(ALIAS_CAMERA))) {
      needed.add(Manifest.permission.CAMERA);
    }
    if (needed.isEmpty()) {
      resolveCallMedia(call);
      return;
    }
    if (getActivity() == null) {
      call.reject("activity_not_found");
      return;
    }
    call.setKeepAlive(true);
    pendingCallMediaPluginCall = call;
    pendingCallMediaPlugin = this;
    ActivityCompat.requestPermissions(
        getActivity(), needed.toArray(new String[0]), REQUEST_CODE_CALL_MEDIA);
  }

  public static boolean handleCallMediaPermissionsResult(
      int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != REQUEST_CODE_CALL_MEDIA) return false;
    PluginCall call = pendingCallMediaPluginCall;
    CallPermissionPlugin plugin = pendingCallMediaPlugin;
    pendingCallMediaPluginCall = null;
    pendingCallMediaPlugin = null;
    if (call == null) return true;
    if (plugin == null) {
      call.reject("plugin_missing");
      return true;
    }
    plugin.resolveCallMedia(call);
    return true;
  }

  @PluginMethod
  public void openAppSettings(PluginCall call) {
    try {
      Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
      intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(intent);
      JSObject result = new JSObject();
      result.put("opened", true);
      call.resolve(result);
    } catch (Exception error) {
      call.reject(error.getMessage());
    }
  }

  private void resolveCallMedia(PluginCall call) {
    JSObject result = new JSObject();
    result.put("callKind", call.getString("callKind", "voice"));
    result.put("microphone", readOsGateState(ALIAS_MICROPHONE));
    result.put("camera", readOsGateState(ALIAS_CAMERA));
    call.resolve(result);
  }

  /** Capacitor PermissionState — granted / prompt_available / permanently_denied */
  String readOsGateState(String alias) {
    PermissionState cap = getPermissionState(alias);
    if (cap == PermissionState.GRANTED) return OS_GRANTED;
    if (cap == PermissionState.PROMPT) return OS_PROMPT_AVAILABLE;
    return OS_PERMANENTLY_DENIED;
  }
}
