package com.dibay.app;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

/** Any resumed activity in the DiBaY task — used for incoming-call route (not MainActivity onStart alone). */
public final class DibayAppVisibility implements Application.ActivityLifecycleCallbacks {
  private static volatile int resumedActivityCount = 0;

  private DibayAppVisibility() {}

  public static void register(Application application) {
    if (application == null) return;
    application.registerActivityLifecycleCallbacks(new DibayAppVisibility());
  }

  public static boolean hasResumedActivity() {
    return resumedActivityCount > 0;
  }

  @Override
  public void onActivityResumed(Activity activity) {
    resumedActivityCount++;
  }

  @Override
  public void onActivityPaused(Activity activity) {
    resumedActivityCount = Math.max(0, resumedActivityCount - 1);
  }

  @Override
  public void onActivityCreated(Activity activity, Bundle savedInstanceState) {}

  @Override
  public void onActivityStarted(Activity activity) {}

  @Override
  public void onActivityStopped(Activity activity) {}

  @Override
  public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}

  @Override
  public void onActivityDestroyed(Activity activity) {}
}
