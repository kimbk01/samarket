package com.dibay.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.res.Resources;

/**
 * FD3 application-shell orientation.
 * Consumes {@link DibayDeviceClassClassifier}. Does not copy 600dp logic.
 * Call Activities are not this owner.
 *
 * Admin v4 §2-2 B: route mode ("admin" | "default") from {@link DibayAppOrientationPlugin}.
 * - PHONE_ANDROID: always portrait (unchanged).
 * - TABLET_ANDROID + admin: SCREEN_ORIENTATION_SENSOR_LANDSCAPE.
 * - TABLET_ANDROID + default: SCREEN_ORIENTATION_UNSPECIFIED (today's tablet behaviour).
 * - UNKNOWN: no request.
 * Safety: every main-frame page start resets to default; configuration changes re-apply the
 * current mode. Both are no-ops until a route mode was requested in this process, so the member
 * app keeps the exact FD3 behaviour. Android 16+ large screens may ignore the request — the web
 * guard (layer A) is the final authority.
 */
public final class DibayAppOrientationPolicy {
  private DibayAppOrientationPolicy() {}

  /** Current route mode requested by the web admin shell. UI thread only. */
  private static boolean adminRouteActive = false;

  /** True once any route mode was requested in this process (keeps FD3 untouched otherwise). */
  private static boolean routeModeEngaged = false;

  public static boolean shouldRequestPortrait(String deviceClass) {
    return "PHONE_ANDROID".equals(deviceClass);
  }

  /** Admin landscape lock is requested only for TABLET_ANDROID. */
  public static boolean shouldRequestAdminLandscape(String deviceClass, boolean adminRoute) {
    return adminRoute && "TABLET_ANDROID".equals(deviceClass);
  }

  /**
   * Single enforcement point for MainActivity. Call before first WebView frame.
   * TABLET_ANDROID / UNKNOWN: do not request any orientation.
   */
  public static void applyToAppShell(Activity activity) {
    if (activity == null) return;
    String deviceClass = classifyDeviceClass(activity);
    if (!shouldRequestPortrait(deviceClass)) {
      return;
    }
    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
  }

  /**
   * Route mode from the web admin shell. Must run on the UI thread.
   * Re-classifies the device on every call (split screen changes smallestScreenWidthDp).
   */
  public static void applyForRoute(Activity activity, boolean adminRoute) {
    if (activity == null) return;
    adminRouteActive = adminRoute;
    routeModeEngaged = true;
    String deviceClass = classifyDeviceClass(activity);
    int target;
    if (shouldRequestPortrait(deviceClass)) {
      target = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
    } else if ("TABLET_ANDROID".equals(deviceClass)) {
      target =
        shouldRequestAdminLandscape(deviceClass, adminRoute)
          ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
          : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    } else {
      return;
    }
    if (activity.getRequestedOrientation() != target) {
      activity.setRequestedOrientation(target);
    }
  }

  /** onPageStarted (main frame): never let an admin lock survive a reload or crash. */
  public static void resetRouteOnPageStarted(Activity activity) {
    if (!routeModeEngaged) return;
    applyForRoute(activity, false);
  }

  /** onConfigurationChanged: re-classify and re-apply the current route mode. */
  public static void reapplyOnConfigurationChanged(Activity activity) {
    if (!routeModeEngaged) return;
    applyForRoute(activity, adminRouteActive);
  }

  private static String classifyDeviceClass(Activity activity) {
    Resources resources = activity.getResources();
    DibayDeviceClassClassifier.Result classified =
      DibayDeviceClassClassifier.classify(resources != null ? resources.getConfiguration() : null);
    return classified.deviceClass;
  }
}
