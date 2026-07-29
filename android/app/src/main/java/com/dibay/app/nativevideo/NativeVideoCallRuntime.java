package com.dibay.app.nativevideo;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.dibay.app.DibayCallConsumedStore;
import com.dibay.app.DibayIncomingCallNativeStore;
import com.dibay.app.DibayKeyguardHelper;
import com.dibay.app.IncomingCallActionCoordinator;
import com.dibay.app.IncomingCallNotificationBuilder;
import com.dibay.app.IncomingCallRingOwner;
import com.dibay.app.IncomingCallSurfaceOwner;
import com.dibay.app.NativeOutgoingRingbackOwner;
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.dibay.app.call.ScreenAwakeBridge;
import com.dibay.app.nativecall.NativeCallEngineOwnership;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;
import java.util.concurrent.ConcurrentHashMap;

/** Video-only call runtime. It must not route through MainActivity or WebView before connected. */
public final class NativeVideoCallRuntime {
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

  private NativeVideoCallRuntime() {}

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
    NativeVideoCallLog.info(
        "incoming_fcm_received",
        sid,
        "roomId=" + safe(roomId) + " mediaType=" + safe(mediaType));
    /**
     * CONTRACT: single active/connecting/ringing call per process.
     * Second incoming must not present UI (callee_busy).
     *
     * DO NOT rejectAsync — Busy ≠ Reject (declined). Suppress UI only.
     */
    reclaimConsumedLiveSessions(app, sid);
    String busyVideo = findOtherLiveSessionCallId(sid);
    String busyVoice = NativeVoiceCallRuntime.findOtherLiveSessionCallId(sid);
    if (busyVideo != null || busyVoice != null) {
      NativeVideoCallLog.info(
          "incoming_busy_suppressed",
          sid,
          "otherVideo="
              + safe(busyVideo)
              + " otherVoice="
              + safe(busyVoice)
              + " action=suppress_no_reject");
      DibayCallConsumedStore.mark(app, sid, "busy_suppressed");
      return false;
    }
    if (!NativeVideoCallOwner.claimNative(sid, "incoming_fcm")) return false;
    NativeCallVisibleSurfaceOwner.logCallOwnerClaimed(sid, "video", "incoming_fcm");
    NativeVideoCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_video_runtime");
    /**
     * CONTRACT: Native Runtime owns ringing UI — claim surface owner so WebView cannot open
     * web_in_app banner / dual accept while Activity/FSI/notification is presenting.
     */
    IncomingCallSurfaceOwner.SurfaceOwner surfaceOwner =
        DibayKeyguardHelper.isKeyguardLocked(app) || !DibayKeyguardHelper.isInteractive(app)
            ? IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI
            : IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY;
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        app, sid, surfaceOwner, "native_video_runtime_incoming");

    Session session =
        new Session(
            sid,
            safe(roomId),
            safe(callerId),
            safe(callerName),
            NativeVideoCallLane.isVideoMediaType(mediaType) ? "video" : safe(mediaType),
            false);
    SESSIONS.put(sid, session);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_RINGING);
    IncomingCallRingOwner.start(app, sid);
    if (shouldStartForegroundVisibleActivity(app)) {
      startForegroundVisibleActivity(app, session);
    } else {
      NativeVideoCallLog.info("foreground_visible_activity_start_skipped", sid, "reason=not_foreground_unlocked");
      PendingIntent fullScreenIntent = NativeVideoCallNotification.showIncoming(app, session);
      scheduleSuppressNotificationWhenActivityShown(app, sid);
      if (shouldStartBackgroundUnlockedActivity(app)) {
        startBackgroundUnlockedActivity(sid, fullScreenIntent);
      } else {
        NativeVideoCallLog.info(
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

  /** Guard-only: another callId with live session state (ringing through connected). */
  public static String findOtherLiveSessionCallId(String incomingCallId) {
    if (incomingCallId == null || incomingCallId.trim().isEmpty()) return null;
    String incoming = incomingCallId.trim();
    for (Session session : SESSIONS.values()) {
      if (incoming.equals(session.callId)) continue;
      if (session.state == State.RINGING
          || session.state == State.ACCEPTING
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

  private static void reclaimConsumedLiveSessions(Context app, String incomingCallId) {
    if (app == null) return;
    String stale = findStaleSessionCallId(incomingCallId);
    if (stale != null) {
      cleanup(app, stale, "stale_state_reclaim");
    }
    String other = findOtherLiveSessionCallId(incomingCallId);
    if (other != null && DibayCallConsumedStore.isConsumed(app, other)) {
      cleanup(app, other, "stale_busy_reclaim");
    }
    String otherVoice = NativeVoiceCallRuntime.findOtherLiveSessionCallId(incomingCallId);
    if (otherVoice != null && DibayCallConsumedStore.isConsumed(app, otherVoice)) {
      NativeVoiceCallRuntime.onRemoteTerminal(app, otherVoice, "cancelled", "stale_busy_reclaim");
    }
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
    NativeVideoCallLog.info(
        "caller_outgoing_start",
        sid,
        "roomId=" + safe(roomId) + " mediaType=" + safe(mediaType));
    if (!NativeVideoCallOwner.claimNative(sid, "outgoing_start")) return;
    NativeVideoCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_video_runtime");
    if (!NativeVideoCallLane.isVideoMediaType(mediaType)) {
      fail(app, sid, "unsupported_media_type");
      return;
    }
    if (!hasMediaPermissions(app)) {
      fail(app, sid, "missing_camera_or_microphone_permission");
      return;
    }
    Session session =
        new Session(
            sid,
            safe(roomId),
            safe(peerUserId),
            safe(peerName),
            "video",
            true);
    SESSIONS.put(sid, session);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_CONNECTING);
    NativeVideoCallService.startConnecting(app, sid);
    NativeOutgoingRingbackOwner.start(app, sid, "video");
    startOutgoingDialingActivity(app, session);
    startCallerAgoraJoin(app, session);
  }

  private static void promoteCallerToConnectedIfEligible(Context app, Session session) {
    if (app == null || session == null || !session.initiator) return;
    if (session.state == State.CONNECTED
        || session.state == State.ENDING
        || session.state == State.ENDED
        || session.state == State.FAILED) {
      return;
    }
    String sid = session.callId;
    NativeOutgoingRingbackOwner.stop(sid, "connected");
    setState(app, session, State.CONNECTED);
    NativeVideoCallLog.info("state_connected", sid);
    NativeVideoCallService.startConnected(app, sid);
    NativeVideoCallBridge.syncConnected(app, sid);
  }

  private static void startCallerAgoraJoin(Context app, Session session) {
    String sid = session.callId;
    NativeVideoCallApi.fetchTokenAsync(
        app,
        sid,
        (connection, tokenError) -> {
          if (connection == null) {
            fail(app, sid, "token_fetch_failed " + safe(tokenError));
            return;
          }
          if (!prepareJoinGuard(app, sid)) return;
          NativeVideoCallAgoraEngine.joinCaller(
              app,
              sid,
              connection,
              new NativeVideoCallAgoraEngine.Listener() {
                @Override
                public void onConnected() {
                  promoteCallerToConnectedIfEligible(app, session);
                }

                @Override
                public void onRemoteVideoReady() {
                  NativeVideoCallLog.info("remote_render_connected", sid);
                }

                @Override
                public void onDisconnected(String reason) {
                  NativeVideoCallLog.info("agora_native_disconnected", sid, "reason=" + safe(reason));
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
    NativeVideoCallAcceptTiming.markAcceptTapped(sid);
    NativeVideoCallLog.info("accept_tapped", sid);
    if (!hasMediaPermissions(app)) {
      fail(app, sid, "missing_camera_or_microphone_permission");
      return;
    }
    DibayCallConsumedStore.mark(app, sid, "accepted");
    IncomingCallRingOwner.stop(app, sid);
    NativeVideoCallNotification.dismiss(app, sid);
    IncomingCallNotificationBuilder.dismissIncomingCall(app, sid);
    NativeVideoCallService.startConnecting(app, sid);

    final Object joinGate = new Object();
    final boolean[] acceptOk = {false};
    final boolean[] acceptFailed = {false};
    final boolean[] tokenReady = {false};
    final NativeVideoCallApi.TokenConnection[] tokenHolder = {null};

    Runnable maybeStartJoin =
        () -> {
          synchronized (joinGate) {
            if (acceptFailed[0] || !acceptOk[0] || !tokenReady[0] || tokenHolder[0] == null) return;
          }
          if (!prepareJoinGuard(app, sid)) return;
          setState(app, session, State.CONNECTING);
          NativeVideoCallAgoraEngine.join(
              app,
              sid,
              tokenHolder[0],
              new NativeVideoCallAgoraEngine.Listener() {
                @Override
                public void onConnected() {
                  setState(app, session, State.CONNECTED);
                  NativeVideoCallLog.info("state_connected", sid);
                  closeIncomingVisualsOnConnected(app, sid);
                  NativeVideoCallService.startConnected(app, sid);
                  NativeVideoCallBridge.syncConnected(app, sid);
                }

                @Override
                public void onRemoteVideoReady() {
                  NativeVideoCallLog.info("remote_render_connected", sid);
                }

                @Override
                public void onDisconnected(String reason) {
                  NativeVideoCallLog.info("agora_native_disconnected", sid, "reason=" + safe(reason));
                }

                @Override
                public void onError(String reason) {
                  fail(app, sid, "agora " + safe(reason));
                }
              });
        };

    NativeVideoCallApi.fetchTokenAsync(
        app,
        sid,
        (connection, tokenError) -> {
          synchronized (joinGate) {
            if (acceptFailed[0]) return;
            if (connection == null) {
              acceptFailed[0] = true;
              fail(app, sid, "token_fetch_failed " + safe(tokenError));
              return;
            }
            tokenHolder[0] = connection;
            tokenReady[0] = true;
          }
          MAIN.post(maybeStartJoin);
        });

    NativeVideoCallApi.acceptAsync(
        app,
        sid,
        (ok, status, error) -> {
          synchronized (joinGate) {
            if (acceptFailed[0]) return;
            if (!ok) {
              acceptFailed[0] = true;
              String err = safe(error);
              if (err != null && err.contains("answered_elsewhere")) {
                NativeVideoCallLog.warn("answered_elsewhere", sid, "err=" + err);
                onRemoteTerminal(app, sid, "answered_elsewhere", "accept_elsewhere");
                return;
              }
              fail(app, sid, "accept_patch_failed " + err);
              return;
            }
            acceptOk[0] = true;
          }
          MAIN.post(maybeStartJoin);
        });
  }

  public static void reject(Context context, String callId) {
    terminalPatch(context, callId, "reject");
  }

  public static void end(Context context, String callId) {
    if (context != null && callId != null) NativeVideoCallLog.info("end_tapped", callId.trim());
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
    NativeOutgoingRingbackOwner.stop(sid, reason);
    Session session = SESSIONS.get(sid);
    if (session != null && "missed".equals(reason) && session.state == State.CONNECTED) {
      NativeVideoCallLog.info(
          "native_terminal_suppressed", sid, "kind=missed source=" + safe(source) + " state=connected");
      cancelMissed(sid);
      return;
    }
    if (session != null
        && (session.state == State.ENDING || session.state == State.ENDED || session.state == State.FAILED)) {
      NativeVideoCallLog.info(
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
    NativeVideoCallLog.info("runtime_cleanup_start", sid, "reason=" + safe(reason));
    NativeVideoCallAcceptTiming.clear(sid);
    NativeOutgoingRingbackOwner.stop(sid, reason);
    cancelMissed(sid);
    NativeVideoCallAgoraEngine.leave(reason);
    NativeVideoCallNotification.dismiss(app, sid);
    NativeVideoCallLog.info("native_call_service_stop", sid, "reason=" + safe(reason));
    NativeVideoCallService.stop(app, sid, reason);
    IncomingCallRingOwner.stop(app, sid);
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_TERMINAL);
    SESSIONS.remove(sid);
    IncomingCallActionCoordinator.complete(sid, reason);
    DibayActiveCallSessionManager.clearSession();
    NativeVideoCallLog.info("cleanup_done", sid, "reason=" + safe(reason));
    NativeVideoCallOwner.release(sid, reason);
    NativeCallVisibleSurfaceOwner.release(sid, reason);
    NativeVideoCallActivity.finishIfActive(sid);
  }

  private static void terminalPatch(Context context, String callId, String action) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    NativeOutgoingRingbackOwner.stop(sid, action);
    if (session != null) setState(app, session, State.ENDING);
    cancelMissed(sid);
    NativeVideoCallApi.PatchCallback done =
        (ok, status, error) -> cleanup(app, sid, ok ? action : action + "_patch_failed");
    if ("reject".equals(action)) {
      NativeVideoCallApi.rejectAsync(app, sid, done);
    } else if ("missed".equals(action)) {
      NativeVideoCallApi.missedAsync(app, sid, done);
    } else {
      NativeVideoCallApi.endAsync(app, sid, done);
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
    ensureVideoUiVisible(context, session, state);
    NativeVideoCallActivity.renderState(session.callId, state);
    final String sid = session.callId;
    final String source = "video_runtime_state:" + state.name().toLowerCase();
    if (state == State.CONNECTED) {
      MAIN.post(() -> ScreenAwakeBridge.acquire(sid, "connected_video"));
      return;
    }
    if (state == State.ENDING || state == State.ENDED || state == State.FAILED) {
      MAIN.post(() -> ScreenAwakeBridge.release(sid, source));
    }
  }

  private static void ensureVideoUiVisible(Context context, Session session, State state) {
    if (context == null || session == null) return;
    Context app = context.getApplicationContext();
    if (session.initiator) {
      if (state == State.CONNECTING || state == State.CONNECTED) {
        startOutgoingDialingActivity(app, session);
      }
      return;
    }
    if (NativeVideoCallActivity.isShowing(session.callId)) return;
    if (state == State.RINGING || state == State.ACCEPTING || state == State.CONNECTING) {
      startForegroundVisibleActivity(app, session);
    }
  }

  private static void startOutgoingDialingActivity(Context context, Session session) {
    if (context == null || session == null) return;
    String callId = session.callId;
    if (NativeVideoCallActivity.isShowing(callId)) {
      NativeVideoCallActivity.renderState(callId, session.state);
      return;
    }
    if (!NativeCallVisibleSurfaceOwner.isClaimed(callId)) {
      NativeCallVisibleSurfaceOwner.claim(callId, "video", "dialing");
    }
    NativeVideoCallLog.info("native_dialing_surface_start", callId);
    android.content.Intent intent = new android.content.Intent(context, NativeVideoCallActivity.class);
    intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVideoCallActivity.EXTRA_UI_MODE, NativeVideoCallActivity.UI_MODE_OUTGOING);
    context.startActivity(intent);
    NativeVideoCallLog.info("native_dialing_surface_shown", callId);
  }

  private static boolean prepareJoinGuard(Context app, String sid) {
    NativeCallEngineOwnership.GuardOutcome outcome =
        NativeCallEngineOwnership.prepareJoin(app, sid, NativeCallEngineOwnership.JoinLane.VIDEO);
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
    if ("call_answered_elsewhere".equals(kind) || "answered_elsewhere".equals(kind)) {
      return "answered_elsewhere";
    }
    return kind;
  }

  private static void fail(Context context, String callId, String reason) {
    NativeVideoCallLog.warn("error_terminal", callId, "reason=" + safe(reason));
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
      NativeVideoCallLog.warn(
          "foreground_visible_activity_start_skipped", "", "reason=visibility_helper_unavailable");
      return false;
    }
  }

  private static void startForegroundVisibleActivity(Context context, Session session) {
    String callId = session.callId;
    if (NativeVideoCallActivity.isShowing(callId)) {
      NativeVideoCallLog.info("foreground_visible_activity_start_done", callId, "mode=already_showing");
      return;
    }
    NativeVideoCallLog.info("foreground_visible_activity_start_allowed", callId);
    android.content.Intent intent = new android.content.Intent(context, NativeVideoCallActivity.class);
    intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVideoCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVideoCallActivity.EXTRA_UI_MODE, NativeVideoCallActivity.UI_MODE_INCOMING);
    intent.putExtra("source", "foreground_visible");
    context.startActivity(intent);
    NativeVideoCallLog.info("foreground_visible_activity_start_done", callId);
    MAIN.postDelayed(
        () -> {
          if (NativeVideoCallActivity.isShowing(callId)) return;
          NativeVideoCallLog.warn(
              "foreground_visible_activity_start_postcheck_failed", callId, "reason=activity_not_shown");
          PendingIntent fallback = NativeVideoCallNotification.showIncoming(context, session);
          NativeVideoCallLog.info("foreground_visible_activity_fallback_to_fsi", callId);
          scheduleSuppressNotificationWhenActivityShown(context, callId);
          startBackgroundUnlockedActivity(callId, fallback);
        },
        1_200L);
  }

  private static void startBackgroundUnlockedActivity(String callId, PendingIntent fullScreenIntent) {
    NativeVideoCallLog.info("background_unlocked_activity_start_attempt", callId);
    if (NativeVideoCallActivity.isShowing(callId)) {
      NativeVideoCallLog.info("background_unlocked_pending_intent_send_done", callId, "mode=already_showing");
      return;
    }
    if (fullScreenIntent == null) {
      NativeVideoCallLog.warn("background_unlocked_activity_start_blocked", callId, "reason=no_pending_intent");
      NativeVideoCallLog.info("background_unlocked_notification_fallback_kept", callId);
      return;
    }
    try {
      NativeVideoCallLog.info("background_unlocked_pending_intent_send_start", callId);
      fullScreenIntent.send();
      NativeVideoCallLog.info("background_unlocked_pending_intent_send_done", callId);
      MAIN.postDelayed(
          () -> {
            if (!NativeVideoCallActivity.isShowing(callId)) {
              NativeVideoCallLog.warn(
                  "background_unlocked_activity_start_blocked", callId, "reason=activity_not_shown");
              NativeVideoCallLog.info("background_unlocked_notification_fallback_kept", callId);
            }
          },
          2_500L);
    } catch (PendingIntent.CanceledException | RuntimeException error) {
      NativeVideoCallLog.warn(
          "background_unlocked_activity_start_blocked", callId, "reason=" + safe(error.getClass().getSimpleName()));
      NativeVideoCallLog.info("background_unlocked_notification_fallback_kept", callId);
    }
  }

  private static boolean hasMediaPermissions(Context context) {
    return ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED
        && ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED;
  }

  private static String safe(String value) {
    return value != null && !value.trim().isEmpty() ? value.trim() : "unknown";
  }

  private static void closeIncomingVisualsOnConnected(Context app, String callId) {
    NativeVideoCallNotification.suppressVisualOnConnected(app, callId);
    IncomingCallNotificationBuilder.dismissIncomingCall(app, callId);
    NativeCallVisibleSurfaceOwner.markConnected(callId, "video");
  }

  private static void scheduleSuppressNotificationWhenActivityShown(Context context, String callId) {
    Context app = context.getApplicationContext();
    final int[] attempts = {0};
    Runnable poll =
        new Runnable() {
          @Override
          public void run() {
            if (NativeVideoCallActivity.isShowing(callId)) {
              NativeVideoCallNotification.suppressVisualAfterActivityShown(app, callId);
              return;
            }
            attempts[0] += 1;
            if (attempts[0] < 24) MAIN.postDelayed(this, 125L);
          }
        };
    MAIN.postDelayed(poll, 125L);
  }
}
