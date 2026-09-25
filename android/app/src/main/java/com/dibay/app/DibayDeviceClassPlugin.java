package com.dibay.app;

import android.content.res.Resources;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * FD1 DeviceClass authority — Android plugin surface.
 * Classification lives in {@link DibayDeviceClassClassifier}. Do not recopy 600dp here.
 */
@CapacitorPlugin(name = "DibayDeviceClass")
public class DibayDeviceClassPlugin extends Plugin {

  static final int TABLET_SMALLEST_WIDTH_DP = DibayDeviceClassClassifier.TABLET_SMALLEST_WIDTH_DP;

  @PluginMethod
  public void getDeviceClass(PluginCall call) {
    call.resolve(classifyCurrentConfiguration());
  }

  JSObject classifyCurrentConfiguration() {
    try {
      Resources resources = getContext() != null ? getContext().getResources() : null;
      return DibayDeviceClassClassifier.classify(resources != null ? resources.getConfiguration() : null)
        .toJsObject();
    } catch (RuntimeException ignored) {
      return DibayDeviceClassClassifier.classify(null, null).toJsObject();
    }
  }

  static JSObject classify(Integer smallestScreenWidthDp, String screenLayoutSize) {
    return DibayDeviceClassClassifier.classify(smallestScreenWidthDp, screenLayoutSize).toJsObject();
  }
}
