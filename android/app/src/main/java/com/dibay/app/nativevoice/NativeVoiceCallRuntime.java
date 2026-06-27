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
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.dibay.app.nativecall.NativeCallEngineOwnership;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
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
    public final boolean initiator;
    public volatile State state;

    Session(
        String callId,
        String roomId,
        String callerId,
        String callerName,
        String mediaType,
        boolean initiator) {
      this.callId = callId;
      this.roomId = roomId;
      this.callerId = callerId;
      this.callerName = callerName;
      this.mediaType = mediaType;
      this.initiator = initiator;
      this.state = initiator ? State.CONNECTING : State.RINGING;
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
    NativeCallVisibleSurfaceOwner.logCallOwnerClaimed(sid, "voice", "incoming_fcm");
    NativeVoiceCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_voice_runtime");

    Session session =
        new Session(
            sid,
            safe(roomId),
            safe(callerId),
            safe(callerName),
            NativeVoiceCallLane.isVoiceMediaType(mediaType) ? "voice" : safe(mediaType),
            false);
    SESSIONS.put(sid, session);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_RINGING);
    IncomingCallRingOwner.start(app, sid);
    if (shouldStartForegroundVisibleActivity(app)) {
      startForegroundVisibleActivity(app, session);
    } else {
      NativeVoiceCallLog.info("foreground_visible_activity_start_skipped", sid, "reason=not_foreground_unlocked");
      PendingIntent fullScreenIntent = NativeVoiceCallNotification.showIncoming(app, session);
      scheduleSuppressNotificationWhenActivityShown(app, sid);
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

  /** Guard-only: another callId with live session state. */
  public static String findOtherLiveSessionCallId(String incomingCallId) {
    if (incomingCallId == null || incomingCallId.trim().isEmpty()) return null;
    String incoming = incomingCallId.trim();
    for (Session session : SESSIONS.values()) {
      if (incoming.equals(session.callId)) continue;
      if (session.state == State.ACCEPTING
          || session.state == State.CONNECTING
          || session.state == State.CONNECTED) {
        return session.callId;
      }
    }
    return null;
  }

  /** Guard-only: stale session eligible for reclaim cleanup. */
  public static String findStaleSessionCallId(String incomingCallId) {
    if (incomingCallId == null || incomingCallId.trim().isEmpty()) return null;
    String incoming = incomingCallId.trim();
    for (Session session : SESSIONS.values()) {
      if (incoming.equals(session.callId)) continue;
      if (session.state == State.ENDING || session.state == State.ENDED || session.state == State.FAILED) {
        return session.callId;
      }
    }
    return null;
  }

  /** Outgoing caller path — token fetch and Agora join without WebView establishment. */
  public static void handleOutgoing(
      Context context,
      String callId,
      String roomId,
      String peerUserId,
      String peerName,
      String mediaType) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    NativeVoiceCallLog.info(
        "caller_outgoing_start",
        sid,
        "roomId=" + safe(roomId) + " mediaType=" + safe(mediaType));
    if (!NativeVoiceCallOwner.claimNative(sid, "outgoing_start")) return;
    NativeVoiceCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_voice_runtime");
    if (!NativeVoiceCallLane.isVoiceMediaType(mediaType)) {
      fail(app, sid, "unsupported_media_type");
      return;
    }
    NativeVoiceCallLog.info("session_created", sid, "roomId=" + safe(roomId));
    Session session =
        new Session(
            sid,
            safe(roomId),
            safe(peerUserId),
            safe(peerName),
            "voice",
            true);
    SESSIONS.put(sid, session);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_CONNECTING);
    NativeVoiceCallService.startConnecting(app, sid);
    startOutgoingDialingActivity(app, session);
    startCallerAgoraJoin(app, session);
  }

  private static void startCallerAgoraJoin(Context app, Session session) {
    String sid = session.callId;
    NativeVoiceCallApi.fetchTokenAsync(
        app,
        sid,
        (connection, tokenError) -> {
          if (connection == null) {
            fail(app, sid, "token_fetch_failed " + safe(tokenError));
            return;
          }
          if (!prepareJoinGuard(app, sid)) return;
          NativeVoiceCallAgoraEngine.joinCaller(
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
                if (!prepareJoinGuard(app, sid)) return;
                NativeVoiceCallAgoraEngine.join(
                    app,
                    sid,
                    connection,
                    new NativeVoiceCallAgoraEngine.Listener() {
                      @Override
                      public void onConnected() {
                        setState(app, session, State.CONNECTED);
                        NativeVoiceCallLog.info("state_connected", sid);
                        closeIncomingVisualsOnConnected(app, sid);
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

  public static void onRemoteTerminal(Context context, String callId, String terminalKind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String reason = normalizeTerminalReason(terminalKind);
    Session session = SESSIONS.get(sid);
    if (session != null && "missed".equals(reason) && session.state == State.CONNECTED) {
      NativeVoiceCallLog.info(
          "native_terminal_suppressed", sid, "kind=missed source=" + safe(source) + " state=connected");
      cancelMissed(sid);
      return;
    }
    if (session != null
        && (session.state == State.ENDING || session.state == State.ENDED || session.state == State.FAILED)) {
      NativeVoiceCallLog.info(
          "native_terminal_skip",
          sid,
          "kind=" + reason + " source=" + safe(source) + " state=" + session.state.name().toLowerCase());
      return;
    }
    if (session != null) setState(app, session, State.ENDING);
    cleanup(app, sid, reason);
  }

  public static void cleanup(Context context, String callId, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    NativeVoiceCallLog.info("runtime_cleanup_start", sid, "reason=" + safe(reason));
    cancelMissed(sid);
    NativeVoiceCallAgoraEngine.leave(reason);
    NativeVoiceCallNotification.dismiss(app, sid);
    NativeVoiceCallLog.info("native_call_service_stop", sid, "reason=" + safe(reason));
    NativeVoiceCallService.stop(app, sid, reason);
    IncomingCallRingOwner.stop(app, sid);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_TERMINAL);
    SESSIONS.remove(sid);
    IncomingCallActionCoordinator.complete(sid, reason);
    DibayActiveCallSessionManager.clearSession();
    NativeVoiceCallLog.info("cleanup_done", sid, "reason=" + safe(reason));
    NativeVoiceCallOwner.release(sid, reason);
    NativeCallVisibleSurfaceOwner.release(sid, reason);
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
    ensureVoiceUiVisible(context, session, state);
    NativeVoiceCallActivity.renderState(session.callId, state);
  }

  private static void ensureVoiceUiVisible(Context context, Session session, State state) {
    if (context == null || session == null) return;
    Context app = context.getApplicationContext();
    if (session.initiator) {
      if (state == State.CONNECTING || state == State.CONNECTED) {
        startOutgoingDialingActivity(app, session);
      }
      return;
    }
    if (NativeVoiceCallActivity.isShowing(session.callId)) return;
    if (state == State.RINGING || state == State.ACCEPTING || state == State.CONNECTING) {
      startForegroundVisibleActivity(app, session);
    }
  }

  private static void startOutgoingDialingActivity(Context context, Session session) {
    if (context == null || session == null) return;
    String callId = session.callId;
    if (NativeVoiceCallActivity.isShowing(callId)) {
      NativeVoiceCallActivity.renderState(callId, session.state);
      return;
    }
    if (!NativeCallVisibleSurfaceOwner.isClaimed(callId)) {
      NativeCallVisibleSurfaceOwner.claim(callId, "voice", "dialing");
    }
    NativeVoiceCallLog.info("native_dialing_surface_start", callId);
    android.content.Intent intent = new android.content.Intent(context, NativeVoiceCallActivity.class);
    intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, NativeVoiceCallActivity.UI_MODE_OUTGOING);
    context.startActivity(intent);
    NativeVoiceCallLog.info("native_dialing_surface_shown", callId);
  }

  private static boolean prepareJoinGuard(Context app, String sid) {
    NativeCallEngineOwnership.GuardOutcome outcome =
        NativeCallEngineOwnership.prepareJoin(app, sid, NativeCallEngineOwnership.JoinLane.VOICE);
    if (outcome == NativeCallEngineOwnership.GuardOutcome.IDEMPOTENT_SKIP) return false;
    if (outcome == NativeCallEngineOwnership.GuardOutcome.BUSY) {
      fail(app, sid, "native_engine_busy");
      return false;
    }
    return true;
  }

  private static String normalizeTerminalReason(String terminalKind) {
    if (terminalKind == null) return "ended";
    String kind = terminalKind.trim().toLowerCase();
    if (kind.isEmpty()) return "ended";
    if ("call_ended".equals(kind) || "ended".equals(kind) || "remote_ended".equals(kind)) return "ended";
    if ("end".equals(kind) || "client_end".equals(kind) || "local_ended".equals(kind)) return "end";
    if ("call_rejected".equals(kind) || "rejected".equals(kind) || "reject".equals(kind)) return "rejected";
    if ("call_missed".equals(kind) || "missed_call".equals(kind) || "missed".equals(kind)) return "missed";
    if ("call_canceled".equals(kind) || "call_cancelled".equals(kind) || "cancelled".equals(kind) || "canceled".equals(kind)) {
      return "cancelled";
    }
    return kind;
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

  private static void startForegroundVisibleActivity(Context context, Session session) {
    String callId = session.callId;
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
    MAIN.postDelayed(
        () -> {
          if (NativeVoiceCallActivity.isShowing(callId)) return;
          NativeVoiceCallLog.warn(
              "foreground_visible_activity_start_postcheck_failed", callId, "reason=activity_not_shown");
          PendingIntent fallback = NativeVoiceCallNotification.showIncoming(context, session);
          NativeVoiceCallLog.info("foreground_visible_activity_fallback_to_fsi", callId);
          scheduleSuppressNotificationWhenActivityShown(context, callId);
          startBackgroundUnlockedActivity(callId, fallback);
        },
        1_200L);
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

  private static void closeIncomingVisualsOnConnected(Context app, String callId) {
    NativeVoiceCallNotification.suppressVisualOnConnected(app, callId);
    IncomingCallNotificationBuilder.dismissIncomingCall(app, callId);
    NativeCallVisibleSurfaceOwner.markConnected(callId, "voice");
  }

  private static void scheduleSuppressNotificationWhenActivityShown(Context context, String callId) {
    Context app = context.getApplicationContext();
    final int[] attempts = {0};
    Runnable poll =
        new Runnable() {
          @Override
          public void run() {
            if (NativeVoiceCallActivity.isShowing(callId)) {
              NativeVoiceCallNotification.suppressVisualAfterActivityShown(app, callId);
              return;
            }
            attempts[0] += 1;
            if (attempts[0] < 24) MAIN.postDelayed(this, 125L);
          }
        };
    MAIN.postDelayed(poll, 125L);
  }
}
