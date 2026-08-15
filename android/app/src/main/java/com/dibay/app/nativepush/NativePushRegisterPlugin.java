package com.dibay.app.nativepush;

import com.dibay.app.DibayBoundPushTokenStore;
import com.dibay.app.DibayCanonicalDeviceIdStore;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** B-0: Capacitor bridge — JS triggers native HTTP device register / logout unbind. */
@CapacitorPlugin(name = "NativePushRegister")
public class NativePushRegisterPlugin extends Plugin {

  @PluginMethod
  public void registerPushDevice(PluginCall call) {
    String deviceId = call.getString("device_id");
    String pushToken = call.getString("push_token");
    String platform = call.getString("platform", "android");
    String pushProvider = call.getString("push_provider", "fcm");
    String appVersion = call.getString("app_version");
    String userId = call.getString("user_id");

    if (deviceId == null
        || deviceId.trim().isEmpty()
        || pushToken == null
        || pushToken.trim().isEmpty()) {
      call.reject("invalid_device");
      return;
    }

    // Persist proof locally even before HTTP completes — logout needs token if session dies mid-flight.
    DibayCanonicalDeviceIdStore.save(getContext(), deviceId);
    DibayBoundPushTokenStore.save(getContext(), pushToken, pushProvider);

    NativePushRegisterHelper.RegisterRequest request =
        new NativePushRegisterHelper.RegisterRequest(
            platform, deviceId, pushToken, pushProvider, appVersion, userId);

    new Thread(
            () -> {
              NativePushRegisterHelper.RegisterResult result =
                  NativePushRegisterHelper.register(getContext(), request);
              JSObject ret = new JSObject();
              ret.put("ok", result.ok);
              ret.put("http_status", result.httpStatus);
              if (result.error != null) {
                ret.put("error", result.error);
              }
              if (result.deviceRowId != null) {
                ret.put("device_row_id", result.deviceRowId);
              }
              android.app.Activity activity = getActivity();
              if (activity == null) {
                call.resolve(ret);
                return;
              }
              activity.runOnUiThread(() -> call.resolve(ret));
            })
        .start();
  }

  @PluginMethod
  public void deactivateBoundPushDevice(PluginCall call) {
    String reason = call.getString("reason", "logout");
    new Thread(
            () -> {
              NativePushDeactivateHelper.DeactivateResult result =
                  NativePushDeactivateHelper.deactivate(getContext(), reason);
              JSObject ret = new JSObject();
              ret.put("ok", result.ok);
              ret.put("http_status", result.httpStatus);
              ret.put("deactivated", result.deactivated);
              if (result.error != null) {
                ret.put("error", result.error);
              }
              android.app.Activity activity = getActivity();
              if (activity == null) {
                call.resolve(ret);
                return;
              }
              activity.runOnUiThread(() -> call.resolve(ret));
            })
        .start();
  }
}
