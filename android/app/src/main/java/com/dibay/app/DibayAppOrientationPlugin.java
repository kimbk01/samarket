package com.dibay.app;

import android.app.Activity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Admin v4 §2-2 B — web admin shell route mode → app-shell orientation.
 * Policy lives in {@link DibayAppOrientationPolicy}. Do not request orientation here.
 */
@CapacitorPlugin(name = "DibayAppOrientation")
public class DibayAppOrientationPlugin extends Plugin {

  @PluginMethod
  public void setRouteMode(PluginCall call) {
    String mode = call.getString("mode");
    if (!"admin".equals(mode) && !"default".equals(mode)) {
      call.reject("invalid_mode");
      return;
    }
    Activity activity = getActivity();
    if (activity == null) {
      call.reject("activity_unavailable");
      return;
    }
    final boolean adminRoute = "admin".equals(mode);
    activity.runOnUiThread(
      () -> {
        try {
          DibayAppOrientationPolicy.applyForRoute(activity, adminRoute);
          JSObject result = new JSObject();
          result.put("mode", mode);
          result.put("requestedOrientation", activity.getRequestedOrientation());
          call.resolve(result);
        } catch (RuntimeException e) {
          call.reject("orientation_apply_failed", e);
        }
      }
    );
  }
}
