package com.dibay.app.call;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
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
  private static volatile android.content.Context pendingCallMediaContext;

  @PluginMethod
  public void checkPermissions(PluginCall call) {
    JSObject result = new JSObject();
    result.put("microphone", mapState(readState(Manifest.permission.RECORD_AUDIO)));
    result.put("camera", mapState(readState(Manifest.permission.CAMERA)));
    call.resolve(result);
  }

  @PluginMethod
  public void requestCallMediaPermissions(PluginCall call) {
    String callKind = call.getString("callKind", "voice");
    boolean video = "video".equalsIgnoreCase(callKind.trim());
    java.util.ArrayList<String> needed = new java.util.ArrayList<>();
    if (readState(Manifest.permission.RECORD_AUDIO) != PermissionState.GRANTED) {
      needed.add(Manifest.permission.RECORD_AUDIO);
    }
    if (video && readState(Manifest.permission.CAMERA) != PermissionState.GRANTED) {
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
    pendingCallMediaContext = getContext();
    ActivityCompat.requestPermissions(
        getActivity(), needed.toArray(new String[0]), REQUEST_CODE_CALL_MEDIA);
  }

  public static boolean handleCallMediaPermissionsResult(
      int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != REQUEST_CODE_CALL_MEDIA) return false;
    PluginCall call = pendingCallMediaPluginCall;
    android.content.Context context = pendingCallMediaContext;
    pendingCallMediaPluginCall = null;
    pendingCallMediaContext = null;
    if (call == null) return true;
    if (context == null) {
      call.reject("context_missing");
      return true;
    }
    resolveCallMediaStatic(call, context);
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
    resolveCallMediaStatic(call, getContext());
  }

  private static void resolveCallMediaStatic(PluginCall call, android.content.Context context) {
    JSObject result = new JSObject();
    result.put("callKind", call.getString("callKind", "voice"));
    result.put(
        "microphone",
        mapState(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED
                ? PermissionState.GRANTED
                : PermissionState.DENIED));
    result.put(
        "camera",
        mapState(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
                    == android.content.pm.PackageManager.PERMISSION_GRANTED
                ? PermissionState.GRANTED
                : PermissionState.DENIED));
    call.resolve(result);
  }

  private PermissionState readState(String permission) {
    return ContextCompat.checkSelfPermission(getContext(), permission)
            == android.content.pm.PackageManager.PERMISSION_GRANTED
        ? PermissionState.GRANTED
        : PermissionState.DENIED;
  }

  private static String mapState(PermissionState state) {
    if (state == PermissionState.GRANTED) return "granted";
    if (state == PermissionState.DENIED) return "denied";
    return "prompt";
  }
}
