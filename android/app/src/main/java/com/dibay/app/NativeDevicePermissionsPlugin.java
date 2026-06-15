package com.dibay.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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
import com.getcapacitor.annotation.PermissionCallback;

/**
 * DiBaY Android — 마이크·카메라·위치·알림 런타임 권한 (WebView GUM/Geolocation 보조).
 * JS: {@code NativeDevicePermissions} — lib/permissions/native-device-permissions-plugin.ts
 */
@CapacitorPlugin(
  name = "NativeDevicePermissions",
  permissions = {
    @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = NativeDevicePermissionsPlugin.ALIAS_MICROPHONE),
    @Permission(strings = { Manifest.permission.CAMERA }, alias = NativeDevicePermissionsPlugin.ALIAS_CAMERA),
    @Permission(
      strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
      alias = NativeDevicePermissionsPlugin.ALIAS_LOCATION
    ),
    @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = NativeDevicePermissionsPlugin.ALIAS_NOTIFICATION),
  }
)
public class NativeDevicePermissionsPlugin extends Plugin {

  static final String ALIAS_MICROPHONE = "microphone";
  static final String ALIAS_CAMERA = "camera";
  static final String ALIAS_LOCATION = "location";
  static final String ALIAS_NOTIFICATION = "notification";

  private static final int NOTIFICATION_RUNTIME_MIN_SDK = Build.VERSION_CODES.TIRAMISU;

  @PluginMethod
  public void checkPermission(PluginCall call) {
    String kind = normalizeKind(call.getString("kind"));
    if (kind == null) {
      call.reject("invalid_kind");
      return;
    }
    JSObject result = new JSObject();
    result.put("kind", kind);
    result.put("state", permissionStateToJs(readRuntimeState(kind)));
    call.resolve(result);
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    String kind = normalizeKind(call.getString("kind"));
    if (kind == null) {
      call.reject("invalid_kind");
      return;
    }

    PermissionState current = readRuntimeState(kind);
    if (current == PermissionState.GRANTED) {
      resolvePermission(call, kind, "granted");
      return;
    }

    if (notificationNotRequiredOnThisApi(kind)) {
      resolvePermission(call, kind, "granted");
      return;
    }

    String alias = aliasForKind(kind);
    if (alias == null) {
      call.reject("invalid_kind");
      return;
    }

    requestPermissionForAlias(alias, call, "permissionRequestCallback");
  }

  static final int REQUEST_CODE_CALL_MEDIA = 0xD1BB;
  private static volatile PluginCall pendingCallMediaPluginCall;

  /**
   * 통화용 — mic 또는 mic+camera 를 한 번에 요청 (영상 발신·수락 경로).
   */
  @PluginMethod
  public void requestCallMediaPermissions(PluginCall call) {
    String callKind = call.getString("callKind", "voice");
    boolean video = "video".equalsIgnoreCase(callKind.trim());

    java.util.ArrayList<String> needed = new java.util.ArrayList<>();
    if (
      ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO) !=
      android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      needed.add(Manifest.permission.RECORD_AUDIO);
    }
    if (
      video &&
      ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA) !=
      android.content.pm.PackageManager.PERMISSION_GRANTED
    ) {
      needed.add(Manifest.permission.CAMERA);
    }

    if (needed.isEmpty()) {
      resolveCallMediaPermissions(call, true);
      return;
    }

    if (getActivity() == null) {
      call.reject("activity_not_found");
      return;
    }

    call.setKeepAlive(true);
    pendingCallMediaPluginCall = call;
    ActivityCompat.requestPermissions(
      getActivity(),
      needed.toArray(new String[0]),
      REQUEST_CODE_CALL_MEDIA
    );
  }

  /** MainActivity.onRequestPermissionsResult → 통화 mic/camera 일괄 요청 결과 */
  public static boolean handleCallMediaPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != REQUEST_CODE_CALL_MEDIA) return false;
    PluginCall call = pendingCallMediaPluginCall;
    pendingCallMediaPluginCall = null;
    if (call == null) return true;

    boolean allGranted = grantResults != null && grantResults.length > 0;
    if (allGranted) {
      for (int result : grantResults) {
        if (result != android.content.pm.PackageManager.PERMISSION_GRANTED) {
          allGranted = false;
          break;
        }
      }
    } else {
      allGranted = false;
    }

    JSObject result = new JSObject();
    result.put("callKind", call.getString("callKind", "voice"));
    result.put("state", allGranted ? "granted" : "denied");
    call.resolve(result);
    return true;
  }

  private void resolveCallMediaPermissions(PluginCall call, boolean granted) {
    JSObject result = new JSObject();
    result.put("callKind", call.getString("callKind", "voice"));
    result.put("state", granted ? "granted" : "denied");
    call.resolve(result);
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
      call.reject("open_settings_failed", error);
    }
  }

  @PluginMethod
  public void checkFullScreenIntent(PluginCall call) {
    JSObject result = new JSObject();
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      result.put("granted", true);
      call.resolve(result);
      return;
    }
    NotificationManager nm = getContext().getSystemService(NotificationManager.class);
    result.put("granted", nm != null && nm.canUseFullScreenIntent());
    call.resolve(result);
  }

  @PluginMethod
  public void openFullScreenIntentSettings(PluginCall call) {
    JSObject result = new JSObject();
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      result.put("opened", false);
      call.resolve(result);
      return;
    }
    try {
      IncomingCallNotificationBuilder.openFullScreenIntentSettings(getContext());
      result.put("opened", true);
      call.resolve(result);
    } catch (Exception error) {
      call.reject("open_fsi_settings_failed", error);
    }
  }

  @PermissionCallback
  private void permissionRequestCallback(PluginCall call) {
    String kind = normalizeKind(call.getString("kind"));
    if (kind == null) {
      call.reject("invalid_kind");
      return;
    }
    PermissionState state = readRuntimeState(kind);
    resolvePermission(call, kind, state == PermissionState.GRANTED ? "granted" : "denied");
  }

  static String normalizeKind(String raw) {
    if (raw == null) return null;
    String kind = raw.trim().toLowerCase();
    if (
      ALIAS_MICROPHONE.equals(kind) ||
      ALIAS_CAMERA.equals(kind) ||
      ALIAS_LOCATION.equals(kind) ||
      ALIAS_NOTIFICATION.equals(kind)
    ) {
      return kind;
    }
    return null;
  }

  static String aliasForKind(String kind) {
    if (ALIAS_MICROPHONE.equals(kind)) return ALIAS_MICROPHONE;
    if (ALIAS_CAMERA.equals(kind)) return ALIAS_CAMERA;
    if (ALIAS_LOCATION.equals(kind)) return ALIAS_LOCATION;
    if (ALIAS_NOTIFICATION.equals(kind)) return ALIAS_NOTIFICATION;
    return null;
  }

  static boolean notificationNotRequiredOnThisApi(String kind) {
    return ALIAS_NOTIFICATION.equals(kind) && Build.VERSION.SDK_INT < NOTIFICATION_RUNTIME_MIN_SDK;
  }

  PermissionState readRuntimeState(String kind) {
    if (notificationNotRequiredOnThisApi(kind)) {
      return PermissionState.GRANTED;
    }
    String alias = aliasForKind(kind);
    if (alias == null) return PermissionState.PROMPT;
    return getPermissionState(alias);
  }

  static boolean hasAllAndroidPermissions(android.content.Context context, String[] permissions) {
    if (permissions == null || permissions.length == 0) return true;
    for (String permission : permissions) {
      if (ContextCompat.checkSelfPermission(context, permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        return false;
      }
    }
    return true;
  }

  static String permissionStateToJs(PermissionState state) {
    if (state == PermissionState.GRANTED) return "granted";
    if (state == PermissionState.DENIED) return "denied";
    return "prompt";
  }

  private void resolvePermission(PluginCall call, String kind, String state) {
    JSObject result = new JSObject();
    result.put("kind", kind);
    result.put("state", state);
    call.resolve(result);
  }
}
