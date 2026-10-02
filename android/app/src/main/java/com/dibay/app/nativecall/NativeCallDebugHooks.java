package com.dibay.app.nativecall;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import java.lang.reflect.Method;

/**
 * WP-3 AFTER — debug-build-only test hook for the forced join-failure test.
 *
 * <p>{@code adb shell setprop debug.dibay.force_join_fail 1} makes the next native Agora join fail
 * before {@code joinChannel} (as a real join error would). Reset with value 0. Only debuggable
 * builds read the property.
 */
public final class NativeCallDebugHooks {
  private static final String PROP = "debug.dibay.force_join_fail";

  private NativeCallDebugHooks() {}

  public static boolean shouldForceJoinFailure(Context context) {
    if (context == null) return false;
    if ((context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) return false;
    try {
      Class<?> sp = Class.forName("android.os.SystemProperties");
      Method get = sp.getMethod("get", String.class, String.class);
      Object value = get.invoke(null, PROP, "0");
      return "1".equals(value);
    } catch (Throwable ignored) {
      return false;
    }
  }
}
