package com.dibay.app.nativevoice;

import android.content.Context;
import android.app.PendingIntent;
import android.os.Handler;
import android.os.Looper;
import com.dibay.app.DibayCallConsumedStore;
import com.dibay.app.DibayIncomingCallNativeStore;
import com.dibay.app.DibayKeyguardHelper;
import com.dibay.app.IncomingCallActionCoordinator;
import com.dibay.app.IncomingCallNotificationBuilder;
import com.dibay.app.IncomingCallRingOwner;
import java.util.concurrent.ConcurrentHashMap;

/** Voice-only call runtime. It must not route through MainActivity or WebView before connected. */
public final class NativeVoiceCallRuntime {
  public enum State {
    RINGING,
    ACCEPTING,
    CONNECTING,
    CONNECTED,
    ENDING,
    ENDED,
    FAILED
  }

  public static final class Session {
    public final String callId;
    public final String roomId;
    public final String callerId;
    public final String callerName;
    public final String mediaType;
    public volatile State state;

    Session(String callId, String roomId, String callerId, String callerName, String mediaType) {
      this.callId = callId;
      this.roomId = roomId;
      this.callerId = callerId;
      this.callerName = callerName;
      this.mediaType = mediaType;
      this.state = State.RINGING;
    }
  }

  private static final long MISSED_TIMEOUT_MS = 30_000L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, Session> SESSIONS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> MISSED_TIMEOUTS = new ConcurrentHashMap<>();

  private NativeVoiceCallRuntime() {}

  public static boolean handleIncoming(
      Context context,
      String callId,
      String roomId,
      String callerId,
      String callerName,
      String mediaType) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    NativeVoiceCallLog.info(
        "incoming_fcm_received",
        sid,
        "roomId=" + safe(roomId) + " mediaType=" + safe(mediaType));
    if (!NativeVoiceCallOwner.claimNative(sid, "incoming_fcm")) return false;
    NativeVoiceCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_voice_runtime");

    Session session =
        new Session(
            sid,
            safe(roomId),
            safe(callerId),
            safe(callerName),
            NativeVoiceCallLane.isVoiceMediaType(mediaType) ? "voice" : safe(mediaType));
    SESSIONS.put(sid, session);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_RINGING);
    IncomingCallRingOwner.start(app, sid);
    if (shouldStartForegroundVisibleActivity(app)) {
      startForegroundVisibleActivity(app, sid);
    } else {
      NativeVoiceCallLog.info("foreground_visible_activity_start_skipped", sid, "reason=not_foreground_unlocked");
      PendingIntent fullScreenIntent = NativeVoiceCallNotification.showIncoming(app, session);
      if (shouldStartBackgroundUnlockedActivity(app)) {
        startBackgroundUnlockedActivity(sid, fullScreenIntent);
      } else {
        NativeVoiceCallLog.info(
            "background_unlocked_notification_fallback_kept", sid, "reason=not_background_unlocked");
      }
    }
    scheduleMissed(app, sid);
    return true;
  }

  public static Session getSession(String callId) {
    if (callId == null) return null;
    return SESSIONS.get(callId.trim());
  }

  public static void accept(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    if (session == null) return;
    cancelMissed(sid);
    setState(app, session, State.ACCEPTING);
    NativeVoiceCallLog.info("accept_tapped", sid);
    DibayCallConsumedStore.mark(app, sid, "accepted");
    IncomingCallRingOwner.stop(app, sid);
    NativeVoiceCallNotification.dismiss(app, sid);
    IncomingCallNotificationBuilder.dismissIncomingCall(app, sid);
    NativeVoiceCallService.startConnecting(app, sid);
    NativeVoiceCallApi.acceptAsync(
        app,
        sid,
        (ok, status, error) -> {
          if (!ok) {
            fail(app, sid, "accept_patch_failed " + safe(error));
            return;
          }
          setState(app, session, State.CONNECTING);
          NativeVoiceCallApi.fetchTokenAsync(
              app,
              sid,
              (connection, tokenError) -> {
                if (connection == null) {
                  fail(app, sid, "token_fetch_failed " + safe(tokenError));
                  return;
                }
                NativeVoiceCallAgoraEngine.join(
                    app,
                    sid,
                    connection,
                    new NativeVoiceCallAgoraEngine.Listener() {
                      @Override
                      public void onConnected() {
                        setState(app, session, State.CONNECTED);
                        NativeVoiceCallLog.info("state_connected", sid);
                        NativeVoiceCallService.startConnected(app, sid);
                        NativeVoiceCallBridge.syncConnected(app, sid);
                      }

                      @Override
                      public void onDisconnected(String reason) {
                        NativeVoiceCallLog.info("agora_native_disconnected", sid, "reason=" + safe(reason));
                      }

                      @Override
                      public void onError(String reason) {
                        fail(app, sid, "agora " + safe(reason));
                      }
                    });
              });
        });
  }

  public static void reject(Context context, String callId) {
    terminalPatch(context, callId, "reject");
  }

  public static void end(Context context, String callId) {
    if (context != null && callId != null) NativeVoiceCallLog.info("end_tapped", callId.trim());
    terminalPatch(context, callId, "end");
  }

  public static void missed(Context context, String callId) {
    terminalPatch(context, callId, "missed");
  }

  public static void cleanup(Context context, String callId, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    cancelMissed(sid);
    NativeVoiceCallAgoraEngine.leave(reason);
    NativeVoiceCallNotification.dismiss(app, sid);
    NativeVoiceCallService.stop(app, sid, reason);
    IncomingCallRingOwner.stop(app, sid);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_TERMINAL);
    SESSIONS.remove(sid);
    IncomingCallActionCoordinator.complete(sid, reason);
    NativeVoiceCallLog.info("cleanup_done", sid, "reason=" + safe(reason));
    NativeVoiceCallOwner.release(sid, reason);
    NativeVoiceCallActivity.finishIfActive(sid);
  }

  private static void terminalPatch(Context context, String callId, String action) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    if (session != null) setState(app, session, State.ENDING);
    cancelMissed(sid);
    NativeVoiceCallApi.PatchCallback done =
        (ok, status, error) -> cleanup(app, sid, ok ? action : action + "_patch_failed");
    if ("reject".equals(action)) {
      NativeVoiceCallApi.rejectAsync(app, sid, done);
    } else if ("missed".equals(action)) {
      NativeVoiceCallApi.missedAsync(app, sid, done);
    } else {
      NativeVoiceCallApi.endAsync(app, sid, done);
    }
  }

  private static void scheduleMissed(Context context, String callId) {
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Runnable runnable = () -> {
      Session session = SESSIONS.get(sid);
      if (session == null || session.state != State.RINGING) return;
      missed(app, sid);
    };
    MISSED_TIMEOUTS.put(sid, runnable);
    MAIN.postDelayed(runnable, MISSED_TIMEOUT_MS);
  }

  private static void cancelMissed(String callId) {
    Runnable runnable = MISSED_TIMEOUTS.remove(callId);
    if (runnable != null) MAIN.removeCallbacks(runnable);
  }

  private static void setState(Context context, Session session, State state) {
    session.state = state;
    if (state == State.CONNECTING) {
      DibayIncomingCallNativeStore.markState(context, session.callId, DibayIncomingCallNativeStore.STATE_CONNECTING);
    } else if (state == State.CONNECTED) {
      DibayIncomingCallNativeStore.markState(context, session.callId, DibayIncomingCallNativeStore.STATE_ACTIVE);
    }
    NativeVoiceCallActivity.renderState(session.callId, state);
  }

  private static void fail(Context context, String callId, String reason) {
    NativeVoiceCallLog.warn("error_terminal", callId, "reason=" + safe(reason));
    Session session = SESSIONS.get(callId);
    if (session != null) setState(context, session, State.FAILED);
    cleanup(context, callId, "failed");
  }

  private static boolean shouldStartForegroundVisibleActivity(Context context) {
    boolean appVisible = isAppVisibleForIncomingCall();
    return DibayKeyguardHelper.isForegroundUnlockedInteractive(appVisible, context);
  }

  private static boolean shouldStartBackgroundUnlockedActivity(Context context) {
    boolean appVisible = isAppVisibleForIncomingCall();
    return !appVisible && !DibayKeyguardHelper.isKeyguardLocked(context) && DibayKeyguardHelper.isInteractive(context);
  }

  private static boolean isAppVisibleForIncomingCall() {
    try {
      Class<?> mainActivity = Class.forName("com.dibay.app.MainActivity");
      Object result = mainActivity.getMethod("isAppVisibleForIncomingCall").invoke(null);
      return result instanceof Boolean && (Boolean) result;
    } catch (Throwable error) {
      NativeVoiceCallLog.warn(
          "foreground_visible_activity_start_skipped", "", "reason=visibility_helper_unavailable");
      return false;
    }
  }

  private static void startForegroundVisibleActivity(Context context, String callId) {
    if (NativeVoiceCallActivity.isShowing(callId)) {
      NativeVoiceCallLog.info("foreground_visible_activity_start_done", callId, "mode=already_showing");
      return;
    }
    NativeVoiceCallLog.info("foreground_visible_activity_start_allowed", callId);
    android.content.Intent intent = new android.content.Intent(context, NativeVoiceCallActivity.class);
    intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra("source", "foreground_visible");
    context.startActivity(intent);
    NativeVoiceCallLog.info("foreground_visible_activity_start_done", callId);
  }

  private static void startBackgroundUnlockedActivity(String callId, PendingIntent fullScreenIntent) {
    NativeVoiceCallLog.info("background_unlocked_activity_start_attempt", callId);
    if (NativeVoiceCallActivity.isShowing(callId)) {
      NativeVoiceCallLog.info(
          "background_unlocked_pending_intent_send_done", callId, "mode=already_showing");
      return;
    }
    if (fullScreenIntent == null) {
      NativeVoiceCallLog.warn("background_unlocked_activity_start_blocked", callId, "reason=no_pending_intent");
      NativeVoiceCallLog.info("background_unlocked_notification_fallback_kept", callId);
      return;
    }
    try {
      NativeVoiceCallLog.info("background_unlocked_pending_intent_send_start", callId);
      fullScreenIntent.send();
      NativeVoiceCallLog.info("background_unlocked_pending_intent_send_done", callId);
      MAIN.postDelayed(
          () -> {
            if (!NativeVoiceCallActivity.isShowing(callId)) {
              NativeVoiceCallLog.warn(
                  "background_unlocked_activity_start_blocked", callId, "reason=activity_not_shown");
              NativeVoiceCallLog.info("background_unlocked_notification_fallback_kept", callId);
            }
          },
          2_500L);
    } catch (PendingIntent.CanceledException | RuntimeException error) {
      NativeVoiceCallLog.warn(
          "background_unlocked_activity_start_blocked", callId, "reason=" + safe(error.getClass().getSimpleName()));
      NativeVoiceCallLog.info("background_unlocked_notification_fallback_kept", callId);
    }
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }
}
