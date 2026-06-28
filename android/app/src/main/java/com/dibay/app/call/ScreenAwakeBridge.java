package com.dibay.app.call;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import java.lang.ref.WeakReference;

/**
 * Connected-video screen-awake lease — session-owned, applied to the current resumed Activity window.
 *
 * <p>Does not guess visible owner across activities. Does not touch lock/keyguard/FSI wake paths.
 */
public final class ScreenAwakeBridge {
  public static final String TAG = "DIBAY_SCREEN_AWAKE";

  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final long[] APPLY_RETRY_DELAYS_MS = {100L, 300L, 700L};
  private static final Object LOCK = new Object();
  private static String leasedCallId = "";
  private static WeakReference<Activity> appliedActivityRef = new WeakReference<>(null);
  private static Runnable pendingApplyRetryRunnable;
  private static int pendingApplyRetryIndex;

  private ScreenAwakeBridge() {}

  public static void acquire(String callId, String reason) {
    if (callId == null || callId.trim().isEmpty()) return;
    final String sid = callId.trim();
    final String src = safe(reason);
    runOnMain(() -> acquireOnMain(sid, src));
  }

  public static void release(String callId, String reason) {
    final String sid = callId != null ? callId.trim() : "";
    final String src = safe(reason);
    runOnMain(() -> releaseOnMain(sid, src));
  }

  /** Presentation change — reapply only, never release. */
  public static void notifyPresentationChanged(String callId, String presentation) {
    if (callId == null || callId.trim().isEmpty()) return;
    final String sid = callId.trim();
    final String src = "presentation_" + safe(presentation);
    runOnMain(() -> reapplyOnMain(sid, src));
  }

  public static void onActivityResumed(Activity activity) {
    if (activity == null) return;
    runOnMain(() -> onActivityResumedOnMain(activity));
  }

  private static void acquireOnMain(String callId, String reason) {
    synchronized (LOCK) {
      cancelPendingApplyRetriesLocked();
      boolean firstLease = leasedCallId.isEmpty();
      boolean sameCall = callId.equals(leasedCallId);
      leasedCallId = callId;
      if (firstLease || !sameCall) {
        logInfo("screen_awake_acquire callId=" + callId + " reason=" + reason);
      }
      applyToCurrentActivity("apply_current_activity");
    }
  }

  private static void releaseOnMain(String callId, String reason) {
    synchronized (LOCK) {
      if (leasedCallId.isEmpty()) return;
      if (!callId.isEmpty() && !callId.equals(leasedCallId)) return;
      String releasedCallId = leasedCallId;
      cancelPendingApplyRetriesLocked();
      clearAppliedActivity();
      leasedCallId = "";
      logInfo(
          "screen_awake_release callId="
              + releasedCallId
              + " reason="
              + reason);
    }
  }

  private static void reapplyOnMain(String callId, String reason) {
    synchronized (LOCK) {
      if (leasedCallId.isEmpty() || !leasedCallId.equals(callId)) return;
      applyToCurrentActivity(reason);
    }
  }

  private static void onActivityResumedOnMain(Activity activity) {
    synchronized (LOCK) {
      if (leasedCallId.isEmpty()) return;
      if (applyToActivity(activity, "reapply_on_resume")) {
        cancelPendingApplyRetriesLocked();
        return;
      }
      applyToCurrentActivity("reapply_on_resume_fallback");
    }
  }

  private static void applyToCurrentActivity(String marker) {
    Activity activity = resolveApplyTargetActivity();
    if (applyToActivity(activity, marker)) {
      cancelPendingApplyRetriesLocked();
      return;
    }
    logInfo(
        "screen_awake_apply_missing_activity callId="
            + leasedCallId
            + " marker="
            + marker);
    scheduleApplyRetry(marker);
  }

  /** Resumed Activity wins over last-applied ref (taskAffinity / dock transitions). */
  private static Activity resolveApplyTargetActivity() {
    Activity resumed = ResumedActivityTracker.peekResumedActivity();
    if (resumed != null && !resumed.isFinishing()) {
      return resumed;
    }
    Activity previous = appliedActivityRef.get();
    if (previous != null && !previous.isFinishing()) {
      return previous;
    }
    return null;
  }

  private static boolean applyToActivity(Activity activity, String marker) {
    if (activity == null || activity.isFinishing()) return false;
    Activity previous = appliedActivityRef.get();
    if (previous != null && previous != activity && !previous.isFinishing()) {
      clearActivityHold(previous);
    }
    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    View decor = activity.getWindow().getDecorView();
    if (decor != null) decor.setKeepScreenOn(true);
    if (activity instanceof BridgeActivity) {
      Bridge bridge = ((BridgeActivity) activity).getBridge();
      if (bridge != null && bridge.getWebView() != null) {
        bridge.getWebView().setKeepScreenOn(true);
      }
    }
    appliedActivityRef = new WeakReference<>(activity);
    logInfo(
        "screen_awake_apply_current_activity callId="
            + leasedCallId
            + " activity="
            + activity.getClass().getSimpleName()
            + " marker="
            + marker);
    if ("reapply_on_resume".equals(marker) || marker.startsWith("presentation_")) {
      logInfo(
          "screen_awake_reapply_on_resume callId="
              + leasedCallId
              + " activity="
              + activity.getClass().getSimpleName()
              + " marker="
              + marker);
    }
    return true;
  }

  private static void scheduleApplyRetry(String marker) {
    if (leasedCallId.isEmpty()) return;
    cancelPendingApplyRetriesLocked();
    pendingApplyRetryIndex = 0;
    postApplyRetryAttempt(marker);
  }

  private static void postApplyRetryAttempt(String marker) {
    if (leasedCallId.isEmpty()) return;
    if (pendingApplyRetryIndex >= APPLY_RETRY_DELAYS_MS.length) {
      logInfo(
          "screen_awake_apply_retry_giveup callId="
              + leasedCallId
              + " marker="
              + marker
              + " attempts="
              + APPLY_RETRY_DELAYS_MS.length);
      return;
    }
    final long delayMs = APPLY_RETRY_DELAYS_MS[pendingApplyRetryIndex];
    final int attempt = pendingApplyRetryIndex + 1;
    logInfo(
        "screen_awake_apply_retry_scheduled callId="
            + leasedCallId
            + " marker="
            + marker
            + " attempt="
            + attempt
            + " delayMs="
            + delayMs);
    pendingApplyRetryRunnable =
        () -> {
          synchronized (LOCK) {
            if (leasedCallId.isEmpty()) return;
            Activity activity = resolveApplyTargetActivity();
            if (applyToActivity(activity, "apply_retry_" + attempt)) {
              logInfo(
                  "screen_awake_apply_retry_success callId="
                      + leasedCallId
                      + " marker="
                      + marker
                      + " attempt="
                      + attempt
                      + " activity="
                      + (activity != null ? activity.getClass().getSimpleName() : "null"));
              cancelPendingApplyRetriesLocked();
              return;
            }
            pendingApplyRetryIndex++;
            postApplyRetryAttempt(marker);
          }
        };
    MAIN.postDelayed(pendingApplyRetryRunnable, delayMs);
  }

  private static void cancelPendingApplyRetriesLocked() {
    if (pendingApplyRetryRunnable != null) {
      MAIN.removeCallbacks(pendingApplyRetryRunnable);
      pendingApplyRetryRunnable = null;
    }
    pendingApplyRetryIndex = 0;
  }

  private static void clearAppliedActivity() {
    Activity activity = appliedActivityRef.get();
    if (activity == null) {
      activity = ResumedActivityTracker.peekResumedActivity();
    }
    clearActivityHold(activity);
    appliedActivityRef = new WeakReference<>(null);
  }

  private static void clearActivityHold(Activity activity) {
    if (activity == null || activity.isFinishing()) return;
    activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    View decor = activity.getWindow().getDecorView();
    if (decor != null) decor.setKeepScreenOn(false);
    if (activity instanceof BridgeActivity) {
      Bridge bridge = ((BridgeActivity) activity).getBridge();
      if (bridge != null && bridge.getWebView() != null) {
        bridge.getWebView().setKeepScreenOn(false);
      }
    }
  }

  private static void runOnMain(Runnable runnable) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      runnable.run();
    } else {
      MAIN.post(runnable);
    }
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }

  private static void logInfo(String message) {
    Log.i(TAG, "[DIBAY_SCREEN_AWAKE] " + message);
  }
}
