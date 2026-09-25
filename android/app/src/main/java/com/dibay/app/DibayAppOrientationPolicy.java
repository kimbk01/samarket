package com.dibay.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.res.Resources;

/**
 * FD3 application-shell orientation.
 * Consumes {@link DibayDeviceClassClassifier}. Does not copy 600dp logic.
 * Call Activities are not this owner.
 */
public final class DibayAppOrientationPolicy {
  private DibayAppOrientationPolicy() {}

  public static boolean shouldRequestPortrait(String deviceClass) {
    return "PHONE_ANDROID".equals(deviceClass);
  }

  /**
   * Single enforcement point for MainActivity. Call before first WebView frame.
   * TABLET_ANDROID / UNKNOWN: do not request any orientation.
   */
  public static void applyToAppShell(Activity activity) {
    if (activity == null) return;
    Resources resources = activity.getResources();
    DibayDeviceClassClassifier.Result classified =
      DibayDeviceClassClassifier.classify(resources != null ? resources.getConfiguration() : null);
    if (!shouldRequestPortrait(classified.deviceClass)) {
      return;
    }
    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
  }
}
