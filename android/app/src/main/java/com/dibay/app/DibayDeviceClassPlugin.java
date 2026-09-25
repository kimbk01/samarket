package com.dibay.app;

import android.content.res.Configuration;
import android.content.res.Resources;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * FD1 DeviceClass authority — Android.
 * PRIMARY: Configuration.smallestScreenWidthDp (>= 600 tablet).
 * FALLBACK: screenLayout SIZE_MASK only when smallestScreenWidthDp is unusable.
 * JS: {@code DibayDeviceClass} — lib/device/dibay-device-class-native.ts
 */
@CapacitorPlugin(name = "DibayDeviceClass")
public class DibayDeviceClassPlugin extends Plugin {

  static final int TABLET_SMALLEST_WIDTH_DP = 600;

  @PluginMethod
  public void getDeviceClass(PluginCall call) {
    call.resolve(classifyCurrentConfiguration());
  }

  JSObject classifyCurrentConfiguration() {
    Integer smallestScreenWidthDp = null;
    String screenLayoutSize = null;
    try {
      Resources resources = getContext() != null ? getContext().getResources() : null;
      Configuration config = resources != null ? resources.getConfiguration() : null;
      if (config != null) {
        if (config.smallestScreenWidthDp > 0) {
          smallestScreenWidthDp = config.smallestScreenWidthDp;
        }
        screenLayoutSize = screenLayoutSizeName(config.screenLayout & Configuration.SCREENLAYOUT_SIZE_MASK);
      }
    } catch (RuntimeException ignored) {
      smallestScreenWidthDp = null;
      screenLayoutSize = null;
    }
    return classify(smallestScreenWidthDp, screenLayoutSize);
  }

  static JSObject classify(Integer smallestScreenWidthDp, String screenLayoutSize) {
    JSObject result = new JSObject();
    boolean swUsable = smallestScreenWidthDp != null && smallestScreenWidthDp > 0;
    String layoutVerdict = layoutTabletVerdict(screenLayoutSize);

    if (swUsable) {
      boolean tablet = smallestScreenWidthDp >= TABLET_SMALLEST_WIDTH_DP;
      boolean conflict = layoutVerdict != null && tablet != "tablet".equals(layoutVerdict);
      result.put("deviceClass", tablet ? "TABLET_ANDROID" : "PHONE_ANDROID");
      result.put("source", "smallestScreenWidthDp");
      result.put("smallestScreenWidthDp", smallestScreenWidthDp.intValue());
      if (screenLayoutSize != null) {
        result.put("screenLayoutSize", screenLayoutSize);
        result.put("fallbackScreenLayout", screenLayoutSize);
      }
      result.put("conflict", conflict);
      return result;
    }

    if ("tablet".equals(layoutVerdict)) {
      result.put("deviceClass", "TABLET_ANDROID");
      result.put("source", "screenLayout");
      putLayoutFields(result, smallestScreenWidthDp, screenLayoutSize, false);
      return result;
    }
    if ("phone".equals(layoutVerdict)) {
      result.put("deviceClass", "PHONE_ANDROID");
      result.put("source", "screenLayout");
      putLayoutFields(result, smallestScreenWidthDp, screenLayoutSize, false);
      return result;
    }

    result.put("deviceClass", "UNKNOWN");
    result.put("source", "android_configuration_unavailable");
    result.put("reason", "android_configuration_unavailable");
    putLayoutFields(result, smallestScreenWidthDp, screenLayoutSize, false);
    return result;
  }

  static String screenLayoutSizeName(int size) {
    switch (size) {
      case Configuration.SCREENLAYOUT_SIZE_SMALL:
        return "SMALL";
      case Configuration.SCREENLAYOUT_SIZE_NORMAL:
        return "NORMAL";
      case Configuration.SCREENLAYOUT_SIZE_LARGE:
        return "LARGE";
      case Configuration.SCREENLAYOUT_SIZE_XLARGE:
        return "XLARGE";
      case Configuration.SCREENLAYOUT_SIZE_UNDEFINED:
        return "UNDEFINED";
      default:
        return "UNKNOWN";
    }
  }

  static String layoutTabletVerdict(String size) {
    if ("LARGE".equals(size) || "XLARGE".equals(size)) return "tablet";
    if ("NORMAL".equals(size) || "SMALL".equals(size)) return "phone";
    return null;
  }

  private static void putLayoutFields(
    JSObject result,
    Integer smallestScreenWidthDp,
    String screenLayoutSize,
    boolean conflict
  ) {
    if (smallestScreenWidthDp != null) {
      result.put("smallestScreenWidthDp", smallestScreenWidthDp.intValue());
    }
    if (screenLayoutSize != null) {
      result.put("screenLayoutSize", screenLayoutSize);
      result.put("fallbackScreenLayout", screenLayoutSize);
    }
    result.put("conflict", conflict);
  }
}
