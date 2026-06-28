package com.dibay.app.call;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;
import java.lang.ref.WeakReference;

/** Tracks the current resumed Activity for connected-video screen-awake lease apply. */
public final class ResumedActivityTracker implements Application.ActivityLifecycleCallbacks {
  private static volatile WeakReference<Activity> resumedRef = new WeakReference<>(null);
  private static volatile boolean registered;

  private ResumedActivityTracker() {}

  public static void register(Application application) {
    if (application == null || registered) return;
    application.registerActivityLifecycleCallbacks(new ResumedActivityTracker());
    registered = true;
  }

  public static Activity peekResumedActivity() {
    return resumedRef.get();
  }

  @Override
  public void onActivityResumed(Activity activity) {
    if (activity == null) return;
    resumedRef = new WeakReference<>(activity);
    ScreenAwakeBridge.onActivityResumed(activity);
  }

  @Override
  public void onActivityPaused(Activity activity) {
    Activity current = resumedRef.get();
    if (current == activity) {
      resumedRef = new WeakReference<>(null);
    }
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
  public void onActivityDestroyed(Activity activity) {
    Activity current = resumedRef.get();
    if (current == activity) {
      resumedRef = new WeakReference<>(null);
    }
  }
}
