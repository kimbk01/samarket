package com.dibay.app;

import android.app.ActivityOptions;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.callv4.CallV4Lane;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Non-foreground incoming presentation SSOT — Telegram parity.
 *
 * <p>Contract: FCM starts FGS ring; Policy B also launches UI on the main thread in parallel
 * (Telegram parity — ring and surface together, not ring then wait for FGS {@code startForeground}).
 * Lock/sleep still delivers UI after FGS. One visible UI per callId (A/B/C policy):
 * <ul>
 *   <li>A — lock/sleep: CallStyle+FSI only; no manual {@code startActivity}</li>
 *   <li>B — background unlocked: Activity-first; success = {@code incoming_activity_shown};
 *       2.5s fallback notification if not shown</li>
 *   <li>C — foreground: Web sheet only (blocked here)</li>
 * </ul>
 * Activity visible → {@link IncomingCallNotificationBuilder#cancelVisibleIncomingNotificationAfterActivity}
 * only (no notification repost). Notification fallback uses {@code showIncomingCall} when Activity never shown.
 */
public final class IncomingCallBackgroundNotifier {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final String LOCKSCREEN_TAG = "DIBAY_CALL_V4_LOCKSCREEN";
  private static final long LOCK_FSI_VISIBILITY_WATCHDOG_MS = 1_500L;
  private static final long LAUNCH_VISIBILITY_VERIFY_MS = 2_500L;
  private static final long BAL_GUARD_FALLBACK_MS = 900L;
  private static final Handler MAIN_HANDLER = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, Runnable> LOCK_FSI_WATCHDOG_RUNNABLES =
      new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> LAUNCH_VERIFY_RUNNABLES =
      new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> BAL_GUARD_RUNNABLES =
      new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Long> FALLBACK_POSTED_AT =
      new ConcurrentHashMap<>();

  private IncomingCallBackgroundNotifier() {}

  public static void logLockscreenEvent(
      Context context,
      String callId,
      String marker,
      IncomingCallSurfaceOwner.SurfaceOwner owner,
      Boolean fsiAllowed,
      String extra) {
    Context app = context != null ? context.getApplicationContext() : null;
    boolean interactive = DibayKeyguardHelper.isInteractive(app);
    boolean keyguardLocked = DibayKeyguardHelper.isKeyguardLocked(app);
    boolean deviceLocked = isDeviceLocked(app);
    boolean notificationsEnabled = app != null && IncomingCallNotificationBuilder.canPostNotifications(app);
    boolean batteryOptimizationIgnored = isBatteryOptimizationIgnored(app);
    String sid = callId != null ? callId.trim() : "";
    StringBuilder message =
        new StringBuilder("[DIBAY_CALL_V4_LOCKSCREEN] ")
            .append(marker != null ? marker : "event")
            .append(" callId=")
            .append(sid)
            .append(" owner=")
            .append(owner != null ? owner.name().toLowerCase() : "unknown")
            .append(" isInteractive=")
            .append(interactive)
            .append(" isKeyguardLocked=")
            .append(keyguardLocked)
            .append(" isDeviceLocked=")
            .append(deviceLocked)
            .append(" manufacturer=")
            .append(Build.MANUFACTURER != null ? Build.MANUFACTURER : "unknown")
            .append(" model=")
            .append(Build.MODEL != null ? Build.MODEL : "unknown")
            .append(" sdkInt=")
            .append(Build.VERSION.SDK_INT)
            .append(" notificationEnabled=")
            .append(notificationsEnabled)
            .append(" fsiAllowed=")
            .append(fsiAllowed != null ? fsiAllowed : "unknown")
            .append(" batteryOptimizationIgnored=")
            .append(batteryOptimizationIgnored);
    if (extra != null && !extra.trim().isEmpty()) {
      message.append(" ").append(extra.trim());
    }
    Log.i(LOCKSCREEN_TAG, message.toString());
  }

  private static boolean isDeviceLocked(Context context) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
    try {
      android.app.KeyguardManager km = context.getSystemService(android.app.KeyguardManager.class);
      return km != null && km.isDeviceLocked();
    } catch (Exception ignored) {
      return false;
    }
  }

  private static boolean isBatteryOptimizationIgnored(Context context) {
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
    try {
      android.os.PowerManager pm = context.getSystemService(android.os.PowerManager.class);
      return pm == null || pm.isIgnoringBatteryOptimizations(context.getPackageName());
    } catch (Exception ignored) {
      return false;
    }
  }

  /** Lock / sleep — queue UI for FGS delivery. */
  public static void presentLockIncoming(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallWakeLock.acquireForLockScreen(app, callId);
    PendingIncomingPresentation.put(payload);
    Log.i(TAG, "[call-ui] lock_presentation_queued callId=" + callId);
    logLockscreenEvent(
        app,
        callId,
        "fgs_start_requested",
        IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI,
        IncomingCallNotificationBuilder.canPostFullScreenIntent(app),
        "source=present_lock_incoming");
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName());
      deliverPendingPresentation(app, callId, "fgs_start_failed");
    }
  }

  /**
   * Home / unlocked background (Policy B) — ring + Activity launch on main thread immediately;
   * FGS {@code startForeground} runs in parallel (carrier). FGS must not re-deliver UI.
   */
  public static void startRingingWithImmediateUi(Context context, IncomingCallPayload payload) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallWakeLock.acquire(app, callId);
    PendingIncomingPresentation.put(payload);
    Log.i(TAG, "[call-ui] background_ui_parallel_with_ring callId=" + callId);
    MAIN_HANDLER.post(
        () -> {
          if (DibayCallConsumedStore.isConsumed(app, callId)) return;
          if (IncomingCallRingOwner.start(app, callId)) {
            DibayCallPushLog.info("ringtone_start_native", callId, "source=push_ui_parallel");
          }
          if (CallV4Lane.isTelegramLaneEnabled(app)) {
            IncomingCallPayload pending = PendingIncomingPresentation.take(callId);
            if (pending != null) {
              presentV4NonForegroundIncoming(app, pending, "fcm_ui_parallel", true);
            }
          } else {
            IncomingCallPayload pending = PendingIncomingPresentation.take(callId);
            if (pending != null && !launchIncomingActivity(app, pending, "fcm_ui_parallel", null)) {
              IncomingCallNotificationBuilder.showIncomingCall(app, pending, true);
            }
          }
        });
    try {
      CallForegroundService.startRinging(context, callId, payload.callType);
    } catch (Exception error) {
      DibayCallPushLog.warn(
          "foreground_service_started_ringing",
          callId,
          "ok=false err=" + error.getClass().getSimpleName() + " msg=" + error.getMessage());
      deliverPendingPresentation(app, callId, "fgs_start_failed");
    }
  }

  /** @deprecated Policy B uses {@link #startRingingWithImmediateUi}; lock path uses FGS defer. */
  public static void startRingingDeferUiToFgs(Context context, IncomingCallPayload payload) {
    startRingingWithImmediateUi(context, payload);
  }

  /** After FGS {@code startForeground} — primary visible UI entry (BAL-safe context). */
  public static void deliverPendingPresentation(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    IncomingCallPayload payload = PendingIncomingPresentation.take(callId.trim());
    if (payload == null) {
      Log.i(
          TAG,
          "[call-ui] background_presentation_skip callId="
              + callId
              + " reason=already_presented source="
              + source);
      return;
    }
    Log.i(TAG, "[call-ui] background_presentation_deliver callId=" + callId + " source=" + source);
    if (CallV4Lane.isTelegramLaneEnabled(context)) {
      presentV4NonForegroundIncoming(context, payload, source, true);
      return;
    }
    if (launchIncomingActivity(context, payload, "fgs_fullscreen", null)) {
      return;
    }
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, true);
  }

  private static void presentV4NonForegroundIncoming(
      Context context, IncomingCallPayload payload, String source, boolean fgsDelivery) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();

    if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_presentation_blocked callId="
              + callId
              + " reason=accepted_transition");
      return;
    }

    boolean appVisible = MainActivity.isAppVisibleForIncomingCall();
    if (DibayKeyguardHelper.isForegroundUnlockedInteractive(appVisible, app)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_presentation_blocked callId="
              + callId
              + " reason=foreground_web_ssot");
      return;
    }

    boolean keyguardLocked = DibayKeyguardHelper.isKeyguardLocked(app);
    boolean interactive = DibayKeyguardHelper.isInteractive(app);
    boolean lockOrSleep = keyguardLocked || !interactive;

    if (lockOrSleep) {
      presentV4LockFsiOnlyIncoming(context, payload, source, fgsDelivery);
    } else {
      presentV4BackgroundActivityFirstIncoming(context, payload, source, fgsDelivery);
    }
  }

  /** Policy A — lock/sleep: FSI Activity first; visible CallStyle fallback if FSI is denied or late. */
  private static void presentV4LockFsiOnlyIncoming(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery) {
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();
    IncomingCallSurfaceOwner.SurfaceOwner owner = IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI;

    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, owner)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_owner_blocked callId="
              + callId
              + " visibility=locked"
              + " source="
              + source);
      presentV4NotificationFallback(context, payload, fgsDelivery, source, "owner_blocked");
      return;
    }

    boolean fsiAllowed = IncomingCallNotificationBuilder.canPostFullScreenIntent(app);
    logLockscreenEvent(
        app,
        callId,
        "lock_sleep_policy_enter",
        owner,
        fsiAllowed,
        "source=" + source);
    logLockscreenEvent(
        app,
        callId,
        "fsi_permission_checked",
        owner,
        fsiAllowed,
        "source=" + source);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] lock_incoming_fsi_only callId="
            + callId
            + " source="
            + source
            + " manual_start_activity=false");
    IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, owner, "locked_fsi_" + source);
    logLockscreenEvent(app, callId, "owner_claimed", owner, fsiAllowed, "reason=locked_fsi_" + source);

    if (!fsiAllowed) {
      logLockscreenEvent(
          app,
          callId,
          "fsi_denied_fallback",
          IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK,
          false,
          "source=" + source);
      presentV4NotificationFallback(context, payload, fgsDelivery, source, "fsi_denied");
      return;
    }

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] lock_incoming_native_fsi_activity_only callId=" + callId + " source=" + source);
    IncomingCallNotificationBuilder.showIncomingCallFsiBridge(context, payload, fgsDelivery);
    logLockscreenEvent(app, callId, "fsi_launch_requested", owner, true, "source=" + source);
    scheduleLockFsiVisibilityWatchdog(context, payload, source, fgsDelivery);
    CallForegroundService.refreshRingingNotification(
        context, callId, payload.callType, "incoming_fgs_carrier_only");
  }

  /**
   * Policy B — background unlocked: Activity-first. {@code startActivity} success is not UI success;
   * {@code incoming_activity_shown} is the gate. Fallback notification only after 2.5s without shown.
   */
  private static void presentV4BackgroundActivityFirstIncoming(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery) {
    String callId = payload.callId.trim();

    if (IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(
        callId, IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] incoming_owner_blocked callId="
              + callId
              + " visibility=background"
              + " source="
              + source);
      presentV4NotificationFallback(context, payload, fgsDelivery, source, "owner_blocked");
      return;
    }

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_activity_launch_start callId="
            + callId
            + " visibility=background"
            + " source="
            + source);
    boolean launchAttempted =
        launchIncomingActivity(
            context,
            payload,
            source + "_background",
            () ->
                scheduleLaunchVisibilityVerify(
                    context, payload, source, fgsDelivery, shouldUseBalGuardWindow(context)));
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_activity_launch_result callId="
            + callId
            + " launch_attempted="
            + launchAttempted
            + " awaiting=incoming_activity_shown");

    if (IncomingCallActivity.isCallVisible(callId)) {
      onIncomingActivityShown(context, callId, payload.callType);
      return;
    }

    if (!launchAttempted) {
      presentV4NotificationFallback(
          context, payload, fgsDelivery, source, "activity_launch_failed");
    }
  }

  private static void presentV4NotificationFallback(
      Context context,
      IncomingCallPayload payload,
      boolean fgsDelivery,
      String source,
      String reason) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Context app = context.getApplicationContext();

    if (IncomingCallActivity.isCallVisible(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_notification_fallback_skipped callId="
              + callId
              + " reason=activity_visible");
      return;
    }

    IncomingCallSurfaceOwner.SurfaceOwner fallback =
        IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK;
    boolean allowDespiteOwnerBlock =
        "activity_not_shown".equals(reason)
            || "activity_launch_failed".equals(reason)
            || "bal_guard_not_shown".equals(reason)
            || "fsi_denied".equals(reason)
            || "fsi_watchdog_timeout".equals(reason);
    if (!allowDespiteOwnerBlock
        && IncomingCallSurfaceOwner.shouldBlockVisibleIncomingStart(callId, fallback)) {
      return;
    }

    if (FALLBACK_POSTED_AT.putIfAbsent(callId, System.currentTimeMillis()) != null) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_notification_fallback_skipped callId="
              + callId
              + " reason=already_posted");
      return;
    }

    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_notification_fallback callId="
            + callId
            + " reason="
            + reason
            + " source="
            + source);
    IncomingCallSurfaceOwner.transitionIncomingOwner(app, callId, fallback, reason);
    logLockscreenEvent(app, callId, "owner_replaced", fallback, IncomingCallNotificationBuilder.canPostFullScreenIntent(app), "reason=" + reason);
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] incoming_notification_fallback_visible callId=" + callId + " reason=" + reason);
    IncomingCallNotificationBuilder.showIncomingCall(context, payload, fgsDelivery);
    logLockscreenEvent(app, callId, "fallback_notification_posted", fallback, IncomingCallNotificationBuilder.canPostFullScreenIntent(app), "reason=" + reason);
    CallForegroundService.refreshRingingNotification(
        context, callId, payload.callType, "notification_fallback");
  }

  private static void scheduleLockFsiVisibilityWatchdog(
      Context context, IncomingCallPayload payload, String source, boolean fgsDelivery) {
    if (context == null || payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    Runnable existing = LOCK_FSI_WATCHDOG_RUNNABLES.remove(callId);
    if (existing != null) {
      MAIN_HANDLER.removeCallbacks(existing);
    }
    Runnable runnable =
        () -> {
          LOCK_FSI_WATCHDOG_RUNNABLES.remove(callId);
          if (FALLBACK_POSTED_AT.containsKey(callId)) return;
          if (IncomingCallActivity.isCallVisible(callId)) return;
          if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(callId)) return;
          if (IncomingCallActionCoordinator.isCompleted(callId)) return;
          logLockscreenEvent(
              context,
              callId,
              "fsi_watchdog_timeout",
              IncomingCallSurfaceOwner.SurfaceOwner.NOTIFICATION_FALLBACK,
              IncomingCallNotificationBuilder.canPostFullScreenIntent(context),
              "waited_ms=" + LOCK_FSI_VISIBILITY_WATCHDOG_MS + " source=" + source);
          presentV4NotificationFallback(
              context, payload, fgsDelivery, source, "fsi_watchdog_timeout");
        };
    LOCK_FSI_WATCHDOG_RUNNABLES.put(callId, runnable);
    MAIN_HANDLER.postDelayed(runnable, LOCK_FSI_VISIBILITY_WATCHDOG_MS);
  }

  private static void scheduleLaunchVisibilityVerify(
      Context context,
      IncomingCallPayload payload,
      String source,
      boolean fgsDelivery,
      boolean balGuardEnabled) {
    if (payload == null || !payload.isValid()) return;
    String callId = payload.callId.trim();
    cancelLaunchVisibilityVerify(callId);
    if (balGuardEnabled) {
      Runnable balGuardRunnable =
          () -> {
            BAL_GUARD_RUNNABLES.remove(callId);
            if (IncomingCallActivity.isCallVisible(callId)) return;
            if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(callId)) return;
            Log.i(
                CallV4Lane.TAG,
                "[DIBAY_CALL_V4] bal_guard_fallback callId="
                    + callId
                    + " waited_ms="
                    + BAL_GUARD_FALLBACK_MS);
            presentV4NotificationFallback(
                context, payload, fgsDelivery, source, "bal_guard_not_shown");
          };
      BAL_GUARD_RUNNABLES.put(callId, balGuardRunnable);
      MAIN_HANDLER.postDelayed(balGuardRunnable, BAL_GUARD_FALLBACK_MS);
    }
    Runnable runnable =
        () -> {
          LAUNCH_VERIFY_RUNNABLES.remove(callId);
          if (FALLBACK_POSTED_AT.containsKey(callId)) {
            Log.i(
                CallV4Lane.TAG,
                "[DIBAY_CALL_V4] launch_unverified_fallback_skipped callId="
                    + callId
                    + " reason=fallback_already_posted");
            return;
          }
          if (IncomingCallActivity.isCallVisible(callId)) {
            Log.i(
                CallV4Lane.TAG,
                "[DIBAY_CALL_V4] launch_visibility_verified callId=" + callId);
            return;
          }
          if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(callId)) {
            return;
          }
          Log.i(
              CallV4Lane.TAG,
              "[DIBAY_CALL_V4] launch_unverified_fallback callId="
                  + callId
                  + " waited_ms="
                  + LAUNCH_VISIBILITY_VERIFY_MS);
          presentV4NotificationFallback(
              context, payload, fgsDelivery, source, "activity_not_shown");
        };
    LAUNCH_VERIFY_RUNNABLES.put(callId, runnable);
    MAIN_HANDLER.postDelayed(runnable, LAUNCH_VISIBILITY_VERIFY_MS);
  }

  static void cancelLaunchVisibilityVerify(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    Runnable lockFsiRunnable = LOCK_FSI_WATCHDOG_RUNNABLES.remove(sid);
    if (lockFsiRunnable != null) {
      MAIN_HANDLER.removeCallbacks(lockFsiRunnable);
    }
    Runnable runnable = LAUNCH_VERIFY_RUNNABLES.remove(sid);
    if (runnable != null) {
      MAIN_HANDLER.removeCallbacks(runnable);
    }
    Runnable balGuardRunnable = BAL_GUARD_RUNNABLES.remove(sid);
    if (balGuardRunnable != null) {
      MAIN_HANDLER.removeCallbacks(balGuardRunnable);
    }
    FALLBACK_POSTED_AT.remove(sid);
  }

  /** Called from {@link IncomingCallActivity} after {@code incoming_activity_shown}. */
  static void onIncomingActivityShown(Context context, String callId, String callType) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    cancelLaunchVisibilityVerify(sid);
    if (context == null || !CallV4Lane.isTelegramLaneEnabled(context)) return;
    Log.i(CallV4Lane.TAG, "[DIBAY_CALL_V4] launch_visibility_verified callId=" + sid);
    logLockscreenEvent(
        context,
        sid,
        "incoming_activity_visible_ack",
        IncomingCallSurfaceOwner.getSurfaceOwner(sid),
        IncomingCallNotificationBuilder.canPostFullScreenIntent(context),
        "callType=" + (callType != null ? callType : ""));
    CallForegroundService.refreshRingingNotification(
        context, sid, callType != null ? callType : "", "incoming_activity_shown");
  }

  private static boolean shouldUseBalGuardWindow(Context context) {
    if (context == null) return false;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return false;
    String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER.trim().toLowerCase() : "";
    return manufacturer.contains("samsung");
  }

  static boolean launchIncomingActivity(
      Context context, IncomingCallPayload payload, String source, Runnable afterDispatch) {
    if (context == null || payload == null || !payload.isValid()) return false;
    String sid = payload.callId.trim();
    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      Log.i(TAG, "[call-ui] incoming_activity_skipped_consumed callId=" + sid);
      return false;
    }
    if (IncomingCallSurfaceOwner.isAcceptedTransitionOwner(sid)) {
      Log.i(TAG, "[call-ui] incoming_activity_skipped_accepted callId=" + sid);
      return false;
    }
    if (!com.dibay.app.call.CallActivityRouter.shouldLaunchIncomingActivity(sid)) {
      if (IncomingCallActivity.isCallVisible(sid)) {
        Log.i(TAG, "[call-ui] incoming_activity_dedup_reuse_visible callId=" + sid + " source=" + source);
        return true;
      }
      if (IncomingCallSurfaceOwner.isNativeIncomingOwner(sid)) {
        Log.i(
            TAG,
            "[call-ui] incoming_activity_dedup_reuse_not_visible callId=" + sid + " source=" + source);
        return false;
      }
      Log.i(TAG, "[call-ui] incoming_activity_dedup_blocked callId=" + sid + " source=" + source);
      return false;
    }
    Intent incomingUi = IncomingCallIntentHelper.buildIncomingCallActivityIntent(context, payload);
    if (incomingUi == null) {
      DibayCallPushLog.warn("incoming_activity_launch_blocked", sid, "reason=invalid_intent source=" + source);
      return false;
    }
    // Reuse app task stack (API 35+ BAL blocks new background task affinity); purge clears stale instance.
    incomingUi.setFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    boolean needsDelay =
        IncomingCallSessionCleanup.prepareFreshActivityLaunch(
            context.getApplicationContext(), sid);
    Runnable launch =
        () -> {
          Context app = context.getApplicationContext();
          if (IncomingCallActivity.hasIncomingTask(app)) {
            IncomingCallActivity.finishAllIncomingTasks(app, "pre_launch_final_sweep:" + sid);
            IncomingCallTerminalHandler.broadcastFinishIncomingActivity(app, sid);
            Log.i(
                TAG,
                "[call-ui] incoming_activity_pre_launch_sweep callId="
                    + sid
                    + " has_task_after="
                    + IncomingCallActivity.hasIncomingTask(app));
          }
          startIncomingActivityBalSafe(context, incomingUi, sid, source);
          if (afterDispatch != null) {
            afterDispatch.run();
          }
        };
    long launchDelayMs =
        needsDelay ? IncomingCallSessionCleanup.FRESH_LAUNCH_DELAY_MS : 0L;
    if (launchDelayMs > 0L) {
      MAIN_HANDLER.postDelayed(launch, launchDelayMs);
    } else {
      launch.run();
    }
    return true;
  }

  private static Bundle buildBalCreatorOptionsBundle() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      return ActivityOptions.makeBasic()
          .setPendingIntentCreatorBackgroundActivityStartMode(
              ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
          .toBundle();
    }
    return null;
  }

  private static Bundle buildBalSendOptionsBundle() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return ActivityOptions.makeBasic()
          .setPendingIntentBackgroundActivityStartMode(
              ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
          .toBundle();
    }
    return null;
  }

  private static void startIncomingActivityBalSafe(
      Context context, Intent incomingUi, String sid, String source) {
    int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      piFlags |= PendingIntent.FLAG_IMMUTABLE;
    }
    try {
      PendingIntent pi =
          PendingIntent.getActivity(
              context,
              sid.hashCode() ^ 0x1CAFE,
              incomingUi,
              piFlags,
              buildBalCreatorOptionsBundle());
      Bundle sendOpts = buildBalSendOptionsBundle();
      if (sendOpts != null) {
        pi.send(null, 0, null, null, null, null, sendOpts);
      } else {
        pi.send();
      }
      DibayCallLog.once("incoming_render", sid, "source=" + source + " via=pending_intent");
      Log.i(
          TAG,
          "[call-ui] outside_app_incoming_activity_launch callId="
              + sid
              + " source="
              + source
              + " via=pending_intent");
    } catch (Exception pendingError) {
      DibayCallPushLog.warn(
          "incoming_activity_pi_launch_failed",
          sid,
          "source=" + source + " err=" + pendingError.getClass().getSimpleName());
      try {
        Bundle opts = buildBalSendOptionsBundle();
        if (opts != null) {
          context.startActivity(incomingUi, opts);
        } else {
          context.startActivity(incomingUi);
        }
        DibayCallLog.once("incoming_render", sid, "source=" + source + " via=start_activity");
        Log.i(
            TAG,
            "[call-ui] outside_app_incoming_activity_launch callId="
                + sid
                + " source="
                + source
                + " via=start_activity");
      } catch (Exception error) {
        DibayCallPushLog.warn(
            "outside_app_incoming_activity_blocked",
            sid,
            "source="
                + source
                + " err="
                + error.getClass().getSimpleName()
                + " pi_err="
                + pendingError.getClass().getSimpleName());
      }
    }
  }
}
