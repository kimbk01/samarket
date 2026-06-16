package com.dibay.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;

/** Keyguard / screen interactive state for incoming-call native vs web delegate. */
public final class DibayKeyguardHelper {
  private DibayKeyguardHelper() {}

  public static boolean isKeyguardLocked(Context context) {
    if (context == null) return false;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    KeyguardManager km = context.getSystemService(KeyguardManager.class);
    return km != null && km.isKeyguardLocked();
  }

  public static boolean isInteractive(Context context) {
    if (context == null) return true;
    PowerManager pm = context.getSystemService(PowerManager.class);
    return pm == null || pm.isInteractive();
  }

  /**
   * Foreground unlocked interactive — native in-app pill is primary; Web banner is fallback only.
   * Keyguard locked or background — native notification + lock IncomingCallActivity.
   */
  public static boolean isForegroundUnlockedInteractive(boolean appVisible, Context context) {
    return appVisible && !isKeyguardLocked(context) && isInteractive(context);
  }

  /** @deprecated Use {@link #isForegroundUnlockedInteractive} — Web delegate removed for incoming UI. */
  @Deprecated
  public static boolean shouldDelegateIncomingCallToWeb(boolean appVisible, Context context) {
    return isForegroundUnlockedInteractive(appVisible, context);
  }
}
