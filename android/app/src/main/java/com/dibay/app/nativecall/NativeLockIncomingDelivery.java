package com.dibay.app.nativecall;

import android.app.ActivityOptions;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.dibay.app.DibayCallConsumedStore;
import com.dibay.app.DibayKeyguardHelper;
import com.dibay.app.IncomingCallRingOwner;
import com.dibay.app.IncomingCallWakeLock;
import com.dibay.app.nativevideo.NativeVideoCallActivity;
import com.dibay.app.nativevideo.NativeVideoCallLog;
import com.dibay.app.nativevideo.NativeVideoCallNotification;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevideo.NativeVideoCallService;
import com.dibay.app.nativevoice.NativeVoiceCallActivity;
import com.dibay.app.nativevoice.NativeVoiceCallLog;
import com.dibay.app.nativevoice.NativeVoiceCallNotification;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallService;

/** Native Runtime lock-screen incoming — WakeLock, FGS ring, Activity-first (FSI-independent). */
public final class NativeLockIncomingDelivery {
  public static final String SOURCE_NATIVE_LOCK_INCOMING = "native_lock_incoming";
  private static final long ACTIVITY_POSTCHECK_MS = 1_200L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  public enum CallType {
    VOICE,
    VIDEO
  }

  private NativeLockIncomingDelivery() {}

  public static boolean isLockIncoming(Context context) {
    if (context == null) return false;
    Context app = context.getApplicationContext();
    return DibayKeyguardHelper.isKeyguardLocked(app) || !DibayKeyguardHelper.isInteractive(app);
  }

  public static void present(Context context, CallType callType, Object session, boolean fsiAllowed) {
    if (context == null || callType == null || session == null) return;
    if (callType == CallType.VOICE) {
      if (!(session instanceof NativeVoiceCallRuntime.Session)) return;
      presentVoice(context, (NativeVoiceCallRuntime.Session) session, fsiAllowed);
    } else {
      if (!(session instanceof NativeVideoCallRuntime.Session)) return;
      presentVideo(context, (NativeVideoCallRuntime.Session) session, fsiAllowed);
    }
  }

  public static void onLockSurfaceInteractive(Context context, String callId, CallType callType) {
    if (context == null || callId == null || callId.trim().isEmpty() || callType == null) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (!isLockIncoming(app)) return;
    if (DibayCallConsumedStore.isConsumed(app, sid)) return;
    if (IncomingCallRingOwner.reinforceForLockScreen(app, sid)) {
      logInfo(callType, "native_lock_incoming_ring_reinforced", sid, "");
    }
  }

  private static void presentVoice(Context context, NativeVoiceCallRuntime.Session session, boolean fsiAllowed) {
    Context app = context.getApplicationContext();
    String sid = session.callId;
    logLockPresent(CallType.VOICE, app, sid, fsiAllowed);
    IncomingCallWakeLock.acquireForLockScreen(app, sid);
    startVoiceRinging(app, sid);
    Runnable launch =
        () -> {
          if (DibayCallConsumedStore.isConsumed(app, sid)) return;
          launchLockActivity(app, CallType.VOICE, sid);
          scheduleActivityPostcheck(app, CallType.VOICE, session, fsiAllowed);
        };
    postMain(launch);
  }

  private static void presentVideo(Context context, NativeVideoCallRuntime.Session session, boolean fsiAllowed) {
    Context app = context.getApplicationContext();
    String sid = session.callId;
    logLockPresent(CallType.VIDEO, app, sid, fsiAllowed);
    IncomingCallWakeLock.acquireForLockScreen(app, sid);
    startVideoRinging(app, sid);
    Runnable launch =
        () -> {
          if (DibayCallConsumedStore.isConsumed(app, sid)) return;
          launchLockActivity(app, CallType.VIDEO, sid);
          scheduleActivityPostcheck(app, CallType.VIDEO, session, fsiAllowed);
        };
    postMain(launch);
  }

  private static void logLockPresent(CallType callType, Context app, String sid, boolean fsiAllowed) {
    boolean keyguardLocked = DibayKeyguardHelper.isKeyguardLocked(app);
    boolean screenInteractive = DibayKeyguardHelper.isInteractive(app);
    logInfo(
        callType,
        "native_lock_incoming_present",
        sid,
        "keyguardLocked="
            + keyguardLocked
            + " screenInteractive="
            + screenInteractive
            + " fsiAllowed="
            + fsiAllowed);
  }

  private static void startVoiceRinging(Context app, String sid) {
    try {
      NativeVoiceCallService.startRinging(app, sid);
    } catch (Exception error) {
      NativeVoiceCallLog.warn(
          "native_lock_incoming_fgs_start_failed",
          sid,
          "callType=voice err=" + error.getClass().getSimpleName());
    }
  }

  private static void startVideoRinging(Context app, String sid) {
    try {
      NativeVideoCallService.startRinging(app, sid);
    } catch (Exception error) {
      NativeVideoCallLog.warn(
          "native_lock_incoming_fgs_start_failed",
          sid,
          "callType=video err=" + error.getClass().getSimpleName());
    }
  }

  private static void launchLockActivity(Context app, CallType callType, String sid) {
    logInfo(callType, "native_lock_incoming_activity_launch_attempt", sid, "");
    Intent intent = buildLockIncomingIntent(app, callType, sid);
    try {
      Bundle opts = buildBalSendOptionsBundle();
      if (opts != null) {
        app.startActivity(intent, opts);
      } else {
        app.startActivity(intent);
      }
    } catch (Exception error) {
      logWarn(
          callType,
          "native_lock_incoming_activity_launch_failure",
          sid,
          "phase=immediate err=" + error.getClass().getSimpleName());
    }
  }

  private static Intent buildLockIncomingIntent(Context app, CallType callType, String sid) {
    Class<?> activityClass =
        callType == CallType.VOICE ? NativeVoiceCallActivity.class : NativeVideoCallActivity.class;
    String extraCallId =
        callType == CallType.VOICE
            ? NativeVoiceCallActivity.EXTRA_CALL_ID
            : NativeVideoCallActivity.EXTRA_CALL_ID;
    Intent intent = new Intent(app, activityClass);
    intent.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(extraCallId, sid);
    intent.putExtra("source", SOURCE_NATIVE_LOCK_INCOMING);
    return intent;
  }

  private static Bundle buildBalSendOptionsBundle() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      return ActivityOptions.makeBasic()
          .setPendingIntentBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED)
          .toBundle();
    }
    return null;
  }

  private static void scheduleActivityPostcheck(
      Context app, CallType callType, Object session, boolean fsiAllowed) {
    String sid = extractCallId(session);
    if (sid == null) return;
    MAIN.postDelayed(
        () -> {
          if (isActivityShowing(callType, sid)) {
            logInfo(callType, "native_lock_incoming_activity_launch_success", sid, "");
            return;
          }
          logWarn(
              callType,
              "native_lock_incoming_activity_launch_failure",
              sid,
              "phase=postcheck fsiAllowed=" + fsiAllowed);
          presentTertiaryNotification(app, callType, session);
        },
        ACTIVITY_POSTCHECK_MS);
  }

  private static void presentTertiaryNotification(Context app, CallType callType, Object session) {
    String sid = extractCallId(session);
    if (sid == null) return;
    logInfo(
        callType,
        "native_lock_incoming_notification_tertiary",
        sid,
        "reason=lock_activity_launch_failed");
    if (callType == CallType.VOICE && session instanceof NativeVoiceCallRuntime.Session) {
      NativeVoiceCallNotification.showIncoming(app, (NativeVoiceCallRuntime.Session) session);
    } else if (callType == CallType.VIDEO && session instanceof NativeVideoCallRuntime.Session) {
      NativeVideoCallNotification.showIncoming(app, (NativeVideoCallRuntime.Session) session);
    }
  }

  private static boolean isActivityShowing(CallType callType, String sid) {
    if (callType == CallType.VOICE) {
      return NativeVoiceCallActivity.isShowing(sid);
    }
    return NativeVideoCallActivity.isShowing(sid);
  }

  private static String extractCallId(Object session) {
    if (session instanceof NativeVoiceCallRuntime.Session) {
      return ((NativeVoiceCallRuntime.Session) session).callId;
    }
    if (session instanceof NativeVideoCallRuntime.Session) {
      return ((NativeVideoCallRuntime.Session) session).callId;
    }
    return null;
  }

  private static void postMain(Runnable runnable) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      runnable.run();
    } else {
      MAIN.post(runnable);
    }
  }

  private static void logInfo(CallType callType, String marker, String callId, String details) {
    if (callType == CallType.VOICE) {
      NativeVoiceCallLog.info(marker, callId, details);
    } else {
      NativeVideoCallLog.info(marker, callId, details);
    }
  }

  private static void logWarn(CallType callType, String marker, String callId, String details) {
    if (callType == CallType.VOICE) {
      NativeVoiceCallLog.warn(marker, callId, details);
    } else {
      NativeVideoCallLog.warn(marker, callId, details);
    }
  }
}
