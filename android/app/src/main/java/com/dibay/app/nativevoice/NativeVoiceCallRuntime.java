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
import com.dibay.app.IncomingCallSessionStatusProbe;
import com.dibay.app.IncomingCallSurfaceOwner;
import com.dibay.app.NativeOutgoingRingbackOwner;
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.dibay.app.nativecall.NativeCallEngineOwnership;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

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

  /** Local UX timer — proposer only. Canonical missed = server CUT2 deadline/CAS. */
  private static final long MISSED_TIMEOUT_MS = 30_000L;
  /** After early `ring_deadline_not_reached`, re-propose (parity with iOS missedRetryDelaySeconds). */
  private static final long MISSED_RETRY_DELAY_MS = 2_000L;
  private static final int MISSED_RETRY_MAX_ATTEMPTS = 30;
  private static final long TERMINAL_PATCH_BOUND_MS = 8_000L;
  private static final long OUTGOING_TERMINAL_OBSERVER_POLL_MS = 1_000L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, Session> SESSIONS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> MISSED_TIMEOUTS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Integer> MISSED_RETRY_ATTEMPTS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> MISSED_PROPOSE_INFLIGHT = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Boolean> PATCH_REQUESTED = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> PATCH_BOUNDS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> OUTGOING_TERMINAL_OBSERVERS = new ConcurrentHashMap<>();

  interface TerminalPatchDispatcher {
    void dispatch(Context app, String callId, String action, NativeVoiceCallApi.PatchCallback callback);
  }

  interface SessionStatusObserver {
    String fetch(Context app, String callId);
  }

  private static final TerminalPatchDispatcher DEFAULT_PATCH_DISPATCHER =
      (app, callId, action, callback) -> {
        if ("reject".equals(action)) {
          NativeVoiceCallApi.rejectAsync(app, callId, callback);
        } else if ("missed".equals(action)) {
          NativeVoiceCallApi.missedAsync(app, callId, callback);
        } else {
          NativeVoiceCallApi.endAsync(app, callId, callback);
        }
      };

  static volatile TerminalPatchDispatcher terminalPatchDispatcherForTests;
  static volatile SessionStatusObserver sessionStatusObserverForTests;
  static volatile boolean skipAgoraLeaveForTests;
  /** When true, leave path throws before engine leave — mandatory cleanup must still complete. */
  static volatile boolean injectLeaveFailureForTests;

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
    /**
     * CONTRACT: single active/connecting/ringing call per process.
     * Second incoming must not present UI (callee_busy) — server peer_busy is primary;
     * this blocks same-device FCM races.
     *
     * DO NOT rejectAsync here: that writes status=rejected / ended_reason=declined
     * (callee_rejected) for a call the user never declined — corrupts timeout/cancel QA
     * and History (Busy ≠ Reject).
     */
    reclaimConsumedLiveSessions(app, sid);
    String busyVoice = findOtherLiveSessionCallId(sid);
    String busyVideo = NativeVideoCallRuntime.findOtherLiveSessionCallId(sid);
    if (busyVoice != null || busyVideo != null) {
      NativeVoiceCallLog.info(
          "incoming_busy_suppressed",
          sid,
          "otherVoice="
              + safe(busyVoice)
              + " otherVideo="
              + safe(busyVideo)
              + " action=suppress_no_reject");
      DibayCallConsumedStore.mark(app, sid, "busy_suppressed");
      return false;
    }
    if (!NativeVoiceCallOwner.claimNative(sid, "incoming_fcm")) return false;
    NativeCallVisibleSurfaceOwner.logCallOwnerClaimed(sid, "voice", "incoming_fcm");
    NativeVoiceCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_voice_runtime");
    /**
     * CONTRACT: Native Runtime owns ringing UI — claim surface owner so WebView cannot open
     * web_in_app banner / dual accept while Activity/FSI/notification is presenting.
     */
    IncomingCallSurfaceOwner.SurfaceOwner surfaceOwner =
        DibayKeyguardHelper.isKeyguardLocked(app) || !DibayKeyguardHelper.isInteractive(app)
            ? IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_FSI
            : IncomingCallSurfaceOwner.SurfaceOwner.NATIVE_ACTIVITY;
    IncomingCallSurfaceOwner.tryClaimIncomingOwner(
        app, sid, surfaceOwner, "native_voice_runtime_incoming");

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

  /**
   * Drop in-memory live sessions that are already terminal-consumed (cancel/reject/end race)
   * so a new incoming is not busy-suppressed forever.
   */
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
    String otherVideo = NativeVideoCallRuntime.findOtherLiveSessionCallId(incomingCallId);
    if (otherVideo != null && DibayCallConsumedStore.isConsumed(app, otherVideo)) {
      NativeVideoCallRuntime.onRemoteTerminal(app, otherVideo, "cancelled", "stale_busy_reclaim");
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
    NativeOutgoingRingbackOwner.start(app, sid, "voice");
    startOutgoingDialingActivity(app, session);
    startOutgoingTerminalObserver(app, sid);
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
    stopOutgoingTerminalObserver(sid);
    setState(app, session, State.CONNECTED);
    NativeVoiceCallLog.info("state_connected", sid);
    NativeVoiceCallService.startConnected(app, sid);
    NativeVoiceCallBridge.syncConnected(app, sid);
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
                  promoteCallerToConnectedIfEligible(app, session);
                }

                @Override
                public void onDisconnected(String reason) {
                  NativeVoiceCallLog.info("agora_native_disconnected", sid, "reason=" + safe(reason));
                }

                @Override
                public void onRemotePeerLeft(String reason) {
                  onRemoteTerminal(app, sid, "ended", reason);
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
            String err = safe(error);
            if (err != null && err.contains("answered_elsewhere")) {
              NativeVoiceCallLog.warn("answered_elsewhere", sid, "err=" + err);
              onRemoteTerminal(app, sid, "answered_elsewhere", "accept_elsewhere");
              return;
            }
            fail(app, sid, "accept_patch_failed " + err);
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
                      public void onRemotePeerLeft(String reason) {
                        onRemoteTerminal(app, sid, "ended", reason);
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
    beginLocalTerminal(context, callId, "reject");
  }

  public static void end(Context context, String callId) {
    if (context != null && callId != null) NativeVoiceCallLog.info("end_tapped", callId.trim());
    beginLocalTerminal(context, callId, "end");
  }

  /**
   * CUT7 — local missed is a PROPOSER only. Do not terminal-cleanup until server accepts missed.
   * Early `ring_deadline_not_reached` keeps ringing + schedules bounded retry.
   */
  public static void missed(Context context, String callId) {
    proposeMissed(context, callId, "local_timer");
  }

  public static void onRemoteTerminal(Context context, String callId, String terminalKind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String reason = normalizeTerminalReason(terminalKind);
    NativeOutgoingRingbackOwner.stop(sid, reason);
    Session session = SESSIONS.get(sid);
    if (session != null && "missed".equals(reason) && session.state == State.CONNECTED) {
      NativeVoiceCallLog.info(
          "native_terminal_suppressed", sid, "kind=missed source=" + safe(source) + " state=connected");
      cancelMissed(sid);
      return;
    }
    if (NativeVoiceCallTerminalOnce.isCompleted(sid)) {
      NativeVoiceCallLog.info(
          "native_terminal_already_completed",
          sid,
          "kind=" + reason + " source=" + safe(source) + " thread=" + Thread.currentThread().getName());
      return;
    }
    if (NativeVoiceCallTerminalOnce.isInProgress(sid)) {
      NativeVoiceCallLog.info(
          "native_terminal_in_progress",
          sid,
          "kind=" + reason + " source=" + safe(source) + " thread=" + Thread.currentThread().getName());
      return;
    }
    if (session != null) setState(app, session, State.ENDING);
    cleanup(app, sid, reason);
  }

  public static void cleanup(Context context, String callId, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (!NativeVoiceCallTerminalOnce.tryBegin(sid)) {
      if (NativeVoiceCallTerminalOnce.isInProgress(sid)) {
        NativeVoiceCallLog.info(
            "runtime_cleanup_in_progress",
            sid,
            "reason=" + safe(reason) + " thread=" + Thread.currentThread().getName());
      } else {
        NativeVoiceCallLog.info(
            "runtime_cleanup_already_completed",
            sid,
            "reason=" + safe(reason) + " thread=" + Thread.currentThread().getName());
      }
      return;
    }
    NativeVoiceCallLog.info(
        "runtime_cleanup_start",
        sid,
        "reason="
            + safe(reason)
            + " thread="
            + Thread.currentThread().getName()
            + " phase=IN_PROGRESS");
    try {
      NativeOutgoingRingbackOwner.stop(sid, reason);
      cancelMissed(sid);
      stopOutgoingTerminalObserver(sid);
      if (!skipAgoraLeaveForTests) {
      NativeVoiceCallLog.info(
            "agora_leave_async", sid, "thread=" + Thread.currentThread().getName());
        try {
          if (injectLeaveFailureForTests) {
            throw new RuntimeException("forced_leave_failure");
          }
          NativeVoiceCallAgoraEngine.leave(reason);
        } catch (RuntimeException error) {
          NativeVoiceCallLog.warn(
              "error_terminal", sid, "agora_leave=" + error.getClass().getSimpleName());
        }
      }
    } finally {
      runMandatoryCleanup(app, sid, reason);
    }
  }

  /** Always runs after RTC teardown attempt — never skipped by leave stall/failure within leave(). */
  private static void runMandatoryCleanup(Context app, String sid, String reason) {
    NativeVoiceCallLog.info(
        "mandatory_cleanup_start", sid, "reason=" + safe(reason) + " thread=" + Thread.currentThread().getName());
    try {
      NativeVoiceCallNotification.dismiss(app, sid);
      NativeVoiceCallLog.info("native_call_service_stop", sid, "reason=" + safe(reason));
      NativeVoiceCallService.stop(app, sid, reason);
      IncomingCallRingOwner.stop(app, sid);
      DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_TERMINAL);
      SESSIONS.remove(sid);
      IncomingCallActionCoordinator.complete(sid, reason);
      DibayActiveCallSessionManager.clearSession();
      NativeVoiceCallOwner.release(sid, reason);
      NativeCallVisibleSurfaceOwner.release(sid, reason);
      NativeVoiceCallLog.info(
          "activity_finish", sid, "thread=" + Thread.currentThread().getName());
      NativeVoiceCallActivity.finishIfActive(sid);
    } finally {
      NativeVoiceCallTerminalOnce.markCompleted(sid);
      NativeVoiceCallLog.info(
          "cleanup_done",
          sid,
          "reason=" + safe(reason) + " thread=" + Thread.currentThread().getName() + " phase=COMPLETED");
    }
  }

  /**
   * Local hangup/reject: local resources are released immediately. Server PATCH is best-effort
   * and must never block cleanup. Missed must NOT use this path (proposer-only).
   */
  private static void beginLocalTerminal(Context context, String callId, String action) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    if ("missed".equals(action)) {
      proposeMissed(context, callId, "local_timer");
      return;
    }
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    NativeOutgoingRingbackOwner.stop(sid, action);
    if (session != null) setState(app, session, State.ENDING);
    cancelMissed(sid);
    cleanup(app, sid, action);
    requestTerminalPatchBestEffort(app, sid, action);
  }

  private static void proposeMissed(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    if (session == null || session.state != State.RINGING) {
      NativeVoiceCallLog.info(
          "missed_propose_skipped", sid, "source=" + safe(source) + " reason=not_ringing");
      return;
    }
    if (MISSED_PROPOSE_INFLIGHT.putIfAbsent(sid, Boolean.TRUE) != null) {
      NativeVoiceCallLog.info(
          "missed_propose_inflight_skip", sid, "source=" + safe(source));
      return;
    }
    NativeVoiceCallLog.info("missed_propose", sid, "source=" + safe(source));
    NativeVoiceCallApi.PatchCallback done =
        (ok, status, error) -> handleMissedProposeResult(app, sid, ok, status, error);
    TerminalPatchDispatcher dispatcher = terminalPatchDispatcherForTests;
    if (dispatcher == null) dispatcher = DEFAULT_PATCH_DISPATCHER;
    dispatcher.dispatch(app, sid, "missed", done);
  }

  private static void handleMissedProposeResult(
      Context app, String sid, boolean ok, int status, String error) {
    MISSED_PROPOSE_INFLIGHT.remove(sid);
    Session session = SESSIONS.get(sid);
    String err = safe(error);
    if (session == null || session.state != State.RINGING) {
      NativeVoiceCallLog.info(
          "missed_propose_ignored",
          sid,
          "reason=no_longer_ringing status=" + status + " err=" + err);
      return;
    }
    if (!ok && "ring_deadline_not_reached".equals(err)) {
      NativeVoiceCallLog.info(
          "missed_early_rejected", sid, "status=" + status + " keep_presentation=1");
      scheduleMissedRetry(app, sid);
      return;
    }
    if (!ok && ("already_answered".equals(err) || "bad_action".equals(err))) {
      NativeVoiceCallLog.info(
          "missed_propose_blocked", sid, "error=" + err + " keep_presentation=1");
      cancelMissed(sid);
      return;
    }
    if (!ok) {
      NativeVoiceCallLog.info(
          "missed_propose_failed",
          sid,
          "status=" + status + " error=" + err + " keep_presentation=1");
      return;
    }
    cancelMissed(sid);
    NativeVoiceCallLog.info("missed_canonical_accepted", sid, "status=" + status);
    cleanup(app, sid, "missed");
  }

  private static void scheduleMissedRetry(Context app, String callId) {
    if (app == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    if (session == null || session.state != State.RINGING) return;
    int attempt = MISSED_RETRY_ATTEMPTS.merge(sid, 1, Integer::sum);
    if (attempt > MISSED_RETRY_MAX_ATTEMPTS) {
      NativeVoiceCallLog.info(
          "missed_retry_exhausted", sid, "attempts=" + attempt + " keep_presentation=1");
      return;
    }
    Runnable previous = MISSED_TIMEOUTS.remove(sid);
    if (previous != null) MAIN.removeCallbacks(previous);
    Runnable runnable =
        () -> {
          Session live = SESSIONS.get(sid);
          if (live == null || live.state != State.RINGING) return;
          proposeMissed(app, sid, "retry");
        };
    MISSED_TIMEOUTS.put(sid, runnable);
    MAIN.postDelayed(runnable, MISSED_RETRY_DELAY_MS);
    NativeVoiceCallLog.info(
        "missed_retry_scheduled",
        sid,
        "delayMs=" + MISSED_RETRY_DELAY_MS + " attempt=" + attempt);
  }

  private static void requestTerminalPatchBestEffort(Context app, String sid, String action) {
    if (PATCH_REQUESTED.putIfAbsent(sid, Boolean.TRUE) != null) {
      NativeVoiceCallLog.info("terminal_patch_idempotent_skip", sid, "action=" + action);
      return;
    }
    final AtomicBoolean finished = new AtomicBoolean(false);
    Runnable timeout =
        () -> {
          if (!finished.compareAndSet(false, true)) return;
          PATCH_BOUNDS.remove(sid);
          NativeVoiceCallLog.warn("terminal_patch_bounded_timeout", sid, "action=" + action);
        };
    PATCH_BOUNDS.put(sid, timeout);
    MAIN.postDelayed(timeout, TERMINAL_PATCH_BOUND_MS);
    NativeVoiceCallApi.PatchCallback done =
        (ok, status, error) -> {
          if (!finished.compareAndSet(false, true)) {
            NativeVoiceCallLog.info("terminal_patch_late_or_duplicate", sid, "action=" + action);
            return;
          }
          Runnable posted = PATCH_BOUNDS.remove(sid);
          if (posted != null) MAIN.removeCallbacks(posted);
          if (ok) {
            NativeVoiceCallLog.info(
                "terminal_patch_done", sid, "action=" + action + " status=" + status);
          } else {
            NativeVoiceCallLog.warn(
                "terminal_patch_failed",
                sid,
                "action=" + action + " err=" + safe(error));
          }
        };
    TerminalPatchDispatcher dispatcher = terminalPatchDispatcherForTests;
    if (dispatcher == null) dispatcher = DEFAULT_PATCH_DISPATCHER;
    dispatcher.dispatch(app, sid, action, done);
  }

  static void putSessionForTests(Session session) {
    if (session == null || session.callId == null) return;
    SESSIONS.put(session.callId, session);
  }

  static void resetForTests() {
    for (Runnable posted : MISSED_TIMEOUTS.values()) {
      MAIN.removeCallbacks(posted);
    }
    SESSIONS.clear();
    MISSED_TIMEOUTS.clear();
    MISSED_RETRY_ATTEMPTS.clear();
    MISSED_PROPOSE_INFLIGHT.clear();
    PATCH_REQUESTED.clear();
    for (Runnable posted : PATCH_BOUNDS.values()) {
      MAIN.removeCallbacks(posted);
    }
    PATCH_BOUNDS.clear();
    for (Runnable posted : OUTGOING_TERMINAL_OBSERVERS.values()) {
      MAIN.removeCallbacks(posted);
    }
    OUTGOING_TERMINAL_OBSERVERS.clear();
    NativeVoiceCallTerminalOnce.clearForTests();
    terminalPatchDispatcherForTests = null;
    sessionStatusObserverForTests = null;
    skipAgoraLeaveForTests = false;
    injectLeaveFailureForTests = false;
  }

  static void handleOutgoingTerminalObserverStatusForTests(
      Context context, String callId, String status) {
    if (context == null || callId == null) return;
    handleOutgoingTerminalObserverStatus(
        context.getApplicationContext(), callId.trim(), status, null);
  }

  static int missedRetryAttemptsForTests(String callId) {
    if (callId == null) return 0;
    Integer n = MISSED_RETRY_ATTEMPTS.get(callId.trim());
    return n == null ? 0 : n;
  }

  static void fireMissedTimerForTests(Context context, String callId) {
    proposeMissed(context, callId, "local_timer");
  }

  static void advanceMissedRetryForTests(Context context, String callId) {
    if (context == null || callId == null) return;
    String sid = callId.trim();
    Runnable runnable = MISSED_TIMEOUTS.remove(sid);
    if (runnable != null) {
      MAIN.removeCallbacks(runnable);
      runnable.run();
    }
  }

  private static void scheduleMissed(Context context, String callId) {
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    MISSED_RETRY_ATTEMPTS.remove(sid);
    Runnable runnable =
        () -> {
          Session session = SESSIONS.get(sid);
          if (session == null || session.state != State.RINGING) return;
          proposeMissed(app, sid, "local_timer");
        };
    Runnable previous = MISSED_TIMEOUTS.put(sid, runnable);
    if (previous != null) MAIN.removeCallbacks(previous);
    MAIN.postDelayed(runnable, MISSED_TIMEOUT_MS);
    NativeVoiceCallLog.info(
        "missed_timer_scheduled", sid, "timeoutMs=" + MISSED_TIMEOUT_MS);
  }

  private static void cancelMissed(String callId) {
    if (callId == null) return;
    String sid = callId.trim();
    Runnable runnable = MISSED_TIMEOUTS.remove(sid);
    if (runnable != null) MAIN.removeCallbacks(runnable);
    MISSED_RETRY_ATTEMPTS.remove(sid);
    MISSED_PROPOSE_INFLIGHT.remove(sid);
  }

  private static void startOutgoingTerminalObserver(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    stopOutgoingTerminalObserver(sid);
    Runnable runnable =
        new Runnable() {
          @Override
          public void run() {
            Session session = SESSIONS.get(sid);
            if (session == null || !session.initiator || session.state != State.CONNECTING) {
              OUTGOING_TERMINAL_OBSERVERS.remove(sid, this);
              return;
            }
            new Thread(
                    () -> {
                      SessionStatusObserver observer = sessionStatusObserverForTests;
                      String status =
                          observer != null
                              ? observer.fetch(app, sid)
                              : IncomingCallSessionStatusProbe.fetchStatus(app, sid);
                      MAIN.post(
                          () -> handleOutgoingTerminalObserverStatus(app, sid, status, this));
                    })
                .start();
          }
        };
    OUTGOING_TERMINAL_OBSERVERS.put(sid, runnable);
    MAIN.postDelayed(runnable, OUTGOING_TERMINAL_OBSERVER_POLL_MS);
    NativeVoiceCallLog.info(
        "caller_terminal_observer_start",
        sid,
        "pollMs=" + OUTGOING_TERMINAL_OBSERVER_POLL_MS);
  }

  private static void handleOutgoingTerminalObserverStatus(
      Context app, String sid, String status, Runnable runnable) {
    Session session = SESSIONS.get(sid);
    if (session == null || !session.initiator || session.state != State.CONNECTING) {
      if (runnable != null) OUTGOING_TERMINAL_OBSERVERS.remove(sid, runnable);
      return;
    }
    String normalized = normalizeTerminalReason(status);
    if (isObservedOutgoingMissedStatus(normalized)) {
      NativeVoiceCallLog.info(
          "caller_terminal_observer_detected", sid, "status=" + safe(normalized));
      if (runnable != null) OUTGOING_TERMINAL_OBSERVERS.remove(sid, runnable);
      onRemoteTerminal(app, sid, normalized, "server_session_observer");
      return;
    }
    if (runnable != null) MAIN.postDelayed(runnable, OUTGOING_TERMINAL_OBSERVER_POLL_MS);
  }

  private static boolean isObservedOutgoingMissedStatus(String status) {
    if (status == null) return false;
    return "missed".equals(status.trim().toLowerCase());
  }

  private static void stopOutgoingTerminalObserver(String callId) {
    if (callId == null) return;
    String sid = callId.trim();
    Runnable runnable = OUTGOING_TERMINAL_OBSERVERS.remove(sid);
    if (runnable != null) {
      MAIN.removeCallbacks(runnable);
      NativeVoiceCallLog.info("caller_terminal_observer_stop", sid);
    }
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
    if ("call_answered_elsewhere".equals(kind) || "answered_elsewhere".equals(kind)) {
      return "answered_elsewhere";
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
