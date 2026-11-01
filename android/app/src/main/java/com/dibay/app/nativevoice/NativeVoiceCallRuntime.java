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
import com.dibay.app.IncomingCallSurfaceOwner;
import com.dibay.app.NativeOutgoingRingbackOwner;
import com.dibay.app.call.DibayActiveCallSessionManager;
import com.dibay.app.nativecall.CallTerminationPolicy;
import com.dibay.app.nativecall.NativeCallEngineOwnership;
import com.dibay.app.nativecall.NativeCallVisibleSurfaceOwner;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import java.util.Set;
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
    /** WP-3 NEW-28: mute lives on the session (survives Activity recreation), engine is source of truth. */
    public volatile boolean micMuted;

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

  /** Local UX missed timer — H1 NORMAL: scheduleMissed → terminalPatch → cleanup. */
  private static final long MISSED_TIMEOUT_MS = 30_000L;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, Session> SESSIONS = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> MISSED_TIMEOUTS = new ConcurrentHashMap<>();
  /** 종료 PATCH 진행 중 callId — 같은 통화의 중복 종료 요청(버튼 연타·알림+화면 동시)은 PATCH 1회만. */
  private static final Set<String> TERMINAL_PATCH_IN_FLIGHT = ConcurrentHashMap.newKeySet();
  private static final Object PREPARING_LOCK = new Object();
  private static volatile PreparingState preparingState;

  /** CUT-5C — local PREPARING (no server session / no SESSIONS entry). */
  private static final class PreparingState {
    final String attemptId;
    final String peerName;
    final String peerUserId;
    final String roomId;

    PreparingState(String attemptId, String peerName, String peerUserId, String roomId) {
      this.attemptId = attemptId;
      this.peerName = peerName;
      this.peerUserId = peerUserId;
      this.roomId = roomId;
    }
  }

  interface TerminalPatchDispatcher {
    void dispatch(
        Context app,
        String callId,
        String action,
        String clientEndedReason,
        NativeVoiceCallApi.PatchCallback callback);
  }

  private static final TerminalPatchDispatcher DEFAULT_PATCH_DISPATCHER =
      (app, callId, action, clientEndedReason, callback) -> {
        if ("reject".equals(action)) {
          NativeVoiceCallApi.rejectAsync(app, callId, callback);
        } else if ("missed".equals(action)) {
          NativeVoiceCallApi.missedAsync(app, callId, callback);
        } else {
          NativeVoiceCallApi.endAsync(app, callId, clientEndedReason, callback);
        }
      };

  static volatile TerminalPatchDispatcher terminalPatchDispatcherForTests;
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
    if (NativeVoiceCallTerminalOnce.isClaimed(sid)) {
      // 이미 정리된 통화의 늦은·중복 수신 푸시 — 다시 울리면 정리 1회 보장 때문에 끝낼 수 없는 벨이 된다.
      NativeVoiceCallLog.info("incoming_after_terminal_ignored", sid);
      return false;
    }
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

  /** 연결 전(ESTABLISHING) 발신 통화 id — 읽기 전용 (renderer-gone 발신 감시 시작용 · 상태 변경 없음). */
  public static java.util.List<String> outgoingEstablishingCallIds() {
    java.util.List<String> out = new java.util.ArrayList<>();
    for (Session session : SESSIONS.values()) {
      if (session != null
          && session.initiator
          && phaseOf(session) == CallTerminationPolicy.Phase.ESTABLISHING) {
        out.add(session.callId);
      }
    }
    return out;
  }

  /**
   * 통화 중 다시 발신 버튼(1회 통화) — 진행 중인 음성 통화 화면(준비 중 포함)을 앞으로 가져온다.
   * 같은 통화 id 로 다시 여는 것이라 통화 상태는 바뀌지 않는다(onNewIntent → applyState). 없으면 false.
   */
  public static boolean bringLiveCallToFront(Context context) {
    if (context == null) return false;
    android.content.Intent intent = new android.content.Intent(context, NativeVoiceCallActivity.class);
    intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PreparingState prep = preparingState;
    String key;
    if (prep != null && prep.attemptId != null && !prep.attemptId.isEmpty()) {
      key = prep.attemptId;
      intent.putExtra(NativeVoiceCallActivity.EXTRA_ATTEMPT_ID, prep.attemptId);
      intent.putExtra(NativeVoiceCallActivity.EXTRA_PREPARING, true);
      intent.putExtra(NativeVoiceCallActivity.EXTRA_PEER_NAME, prep.peerName != null ? prep.peerName : "");
      intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, prep.attemptId);
      intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, NativeVoiceCallActivity.UI_MODE_OUTGOING);
    } else {
      Session live = null;
      for (Session session : SESSIONS.values()) {
        if (session.state == State.RINGING
            || session.state == State.ACCEPTING
            || session.state == State.CONNECTING
            || session.state == State.CONNECTED) {
          live = session;
          break;
        }
      }
      if (live == null) return false;
      key = live.callId;
      intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, live.callId);
      intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, live.initiator ? NativeVoiceCallActivity.UI_MODE_OUTGOING : NativeVoiceCallActivity.UI_MODE_INCOMING);
    }
    intent.putExtra("source", "bring_to_front");
    try {
      context.startActivity(intent);
    } catch (RuntimeException e) {
      return false;
    }
    NativeVoiceCallLog.info("bring_live_call_to_front", key);
    return true;
  }

  /** CONNECTED 세션 callId (없으면 null). 플러그인 활성 통화 조회 보강용. */
  public static String findConnectedCallId() {
    for (Session session : SESSIONS.values()) {
      if (session.state == State.CONNECTED) return session.callId;
    }
    return null;
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
      // 이미 끝난 세션(ENDING·ENDED·FAILED) — 판단표상 항상 CONVERGE.
      cleanup(app, stale, "stale_state_reclaim");
    }
    // A3: 살아 있는 통화는 consumed 기록(수락 표시 포함)만으로 정리하지 않는다 (RECLAIM → KEEP).
    // 끝난 통화는 서버 terminal 푸시·상태 조회로 별도 정리되고, 사용자는 진행 중 통화 알림으로 끊을 수 있다.
    String other = findOtherLiveSessionCallId(incomingCallId);
    if (other != null) {
      logDecision(
          other,
          CallTerminationPolicy.Cause.RECLAIM,
          phaseOf(SESSIONS.get(other)),
          "incoming:" + incomingCallId + " decision=KEEP");
    }
  }

  /** 두 lane 을 합쳐 다른 살아 있는 통화(벨~연결됨) callId. 없으면 null. */
  private static String findAnyOtherLiveCallId(String callId) {
    String voice = findOtherLiveSessionCallId(callId);
    if (voice != null) return voice;
    return NativeVideoCallRuntime.findOtherLiveSessionCallId(callId);
  }

  /**
   * A4: 새 발신은 진행 중 통화를 끝내지 않는다 (SUPERSEDED → KEEP). 살아 있는 통화가 있으면 새 발신을 막고
   * 진행 중 통화 화면을 앞으로 가져온다. 이미 서버 세션이 만들어진 새 발신(경합)은 그 새 세션만 종료한다.
   *
   * @return true 면 새 발신을 막았다.
   */
  private static boolean refuseOutgoingWhileLive(Context app, String newCallId, String serverCallIdToEnd) {
    String live = findAnyOtherLiveCallId(newCallId);
    if (live == null) return false;
    Session liveVoice = SESSIONS.get(live);
    logDecision(
        live,
        CallTerminationPolicy.Cause.SUPERSEDED,
        liveVoice != null ? phaseOf(liveVoice) : NativeVideoCallRuntime.phaseOfCall(live),
        "outgoing:" + newCallId + " decision=KEEP");
    NativeVoiceCallLog.info("outgoing_blocked_live_call", newCallId, "live=" + live);
    if (serverCallIdToEnd != null && !serverCallIdToEnd.isEmpty()) {
      NativeVoiceCallApi.endAsync(app, serverCallIdToEnd, (ok, status, error) -> {});
    }
    if (!bringLiveCallToFront(app)) NativeVideoCallRuntime.bringLiveCallToFront(app);
    return true;
  }

  /**
   * CUT-5C — show outgoing PREPARING Activity keyed by attemptId.
   * No ringback / CONNECTING FGS / Agora / SESSIONS.put(server id).
   */
  public static boolean startPreparing(
      Context context, String attemptId, String peerName, String peerUserId, String roomId) {
    if (context == null || attemptId == null || attemptId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String aid = attemptId.trim();
    if (refuseOutgoingWhileLive(app, aid, null)) return false;
    PreparingState superseded;
    synchronized (PREPARING_LOCK) {
      superseded = preparingState;
      if (superseded != null && aid.equals(superseded.attemptId)) {
        NativeVoiceCallLog.info("outgoing_preparing_idempotent", aid);
        if (!NativeVoiceCallActivity.isShowingPreparing(aid)) {
          startPreparingDialingActivity(app, aid, safePeerName(peerName));
        }
        return true;
      }
      preparingState =
          new PreparingState(aid, safePeerName(peerName), safe(peerUserId), safe(roomId));
    }
    if (superseded != null) {
      NativeVoiceCallLog.info(
          "outgoing_preparing_supersede", aid, "priorAttempt=" + superseded.attemptId);
      NativeCallVisibleSurfaceOwner.release(superseded.attemptId, "preparing_superseded");
      NativeVoiceCallActivity.finishIfPreparing(superseded.attemptId);
    }
    NativeVideoCallRuntime.finishAnyPreparing(app);
    NativeVoiceCallLog.info(
        "outgoing_preparing_start",
        aid,
        "roomId=" + safe(roomId) + " peer=" + safePeerName(peerName));
    startPreparingDialingActivity(app, aid, safePeerName(peerName));
    return true;
  }

  /** CUT-5C — close PREPARING without BIND / without server patch / without abandon event. */
  public static void finishPreparing(Context context, String attemptId) {
    if (attemptId == null || attemptId.trim().isEmpty()) return;
    String aid = attemptId.trim();
    boolean cleared;
    synchronized (PREPARING_LOCK) {
      PreparingState current = preparingState;
      cleared = current != null && aid.equals(current.attemptId);
      if (cleared) preparingState = null;
    }
    if (!cleared) return;
    NativeVoiceCallLog.info("outgoing_preparing_finish", aid);
    NativeCallVisibleSurfaceOwner.release(aid, "preparing_finished");
    NativeVoiceCallActivity.finishIfPreparing(aid);
  }

  /** Close any active PREPARING on this lane (cross-lane / legacy handoff). */
  public static void finishAnyPreparing(Context context) {
    String aid;
    synchronized (PREPARING_LOCK) {
      PreparingState current = preparingState;
      aid = current != null ? current.attemptId : null;
    }
    if (aid != null) finishPreparing(context, aid);
  }

  /**
   * CUT-5C — user/system abandoned PREPARING UI. Publish JS event; no server patch.
   */
  public static void abandonPreparingFromUi(Context context, String attemptId, String source) {
    if (attemptId == null || attemptId.trim().isEmpty()) return;
    String aid = attemptId.trim();
    boolean cleared;
    synchronized (PREPARING_LOCK) {
      PreparingState current = preparingState;
      cleared = current != null && aid.equals(current.attemptId);
      if (cleared) preparingState = null;
    }
    if (!cleared) return;
    String src = source != null && !source.trim().isEmpty() ? source.trim() : "ui";
    NativeVoiceCallLog.info("outgoing_preparing_abandoned", aid, "source=" + src);
    NativeCallVisibleSurfaceOwner.release(aid, "preparing_abandoned");
    NativeVoiceCallActivity.finishIfPreparing(aid);
    com.dibay.app.call.NativeCallServicePlugin.publishNativeOutgoingPreparingAbandoned(aid, src);
  }

  public static boolean isPreparing(String attemptId) {
    if (attemptId == null || attemptId.trim().isEmpty()) return false;
    PreparingState current = preparingState;
    return current != null && attemptId.trim().equals(current.attemptId);
  }

  /**
   * CUT-5C — BIND real session.id onto active PREPARING, then post-session establishment
   * (FGS + ringback + Agora). Remaps Activity without recreate when already showing.
   */
  public static boolean bindOutgoingFromPreparing(
      Context context,
      String attemptId,
      String callId,
      String roomId,
      String peerUserId,
      String peerName,
      String mediaType) {
    if (context == null
        || attemptId == null
        || attemptId.trim().isEmpty()
        || callId == null
        || callId.trim().isEmpty()) {
      return false;
    }
    Context app = context.getApplicationContext();
    String aid = attemptId.trim();
    String sid = callId.trim();
    PreparingState matched;
    synchronized (PREPARING_LOCK) {
      PreparingState current = preparingState;
      if (current == null || !aid.equals(current.attemptId)) {
        NativeVoiceCallLog.info(
            "outgoing_preparing_bind_mismatch",
            sid,
            "attemptId=" + aid + " active=" + (current != null ? current.attemptId : "none"));
        return false;
      }
      matched = current;
      preparingState = null;
    }
    if (!NativeVoiceCallLane.isVoiceMediaType(mediaType)) {
      NativeCallVisibleSurfaceOwner.release(aid, "preparing_bind_unsupported_media");
      NativeVoiceCallActivity.finishIfPreparing(aid);
      return false;
    }
    String boundPeerName =
        peerName != null && !peerName.trim().isEmpty()
            ? safePeerName(peerName)
            : matched.peerName;
    String boundPeerUserId =
        peerUserId != null && !peerUserId.trim().isEmpty() ? safe(peerUserId) : matched.peerUserId;
    String boundRoomId =
        roomId != null && !roomId.trim().isEmpty() ? safe(roomId) : matched.roomId;
    NativeVoiceCallLog.info(
        "outgoing_preparing_bind",
        sid,
        "attemptId=" + aid + " roomId=" + boundRoomId);
    if (refuseOutgoingWhileLive(app, sid, sid)) {
      NativeCallVisibleSurfaceOwner.release(aid, "preparing_bind_blocked_live_call");
      NativeVoiceCallActivity.finishIfPreparing(aid);
      return false;
    }
    if (!NativeVoiceCallOwner.claimNative(sid, "outgoing_bind")) {
      NativeCallVisibleSurfaceOwner.release(aid, "preparing_bind_claim_failed");
      NativeVoiceCallActivity.finishIfPreparing(aid);
      return false;
    }
    NativeVoiceCallLog.info("legacy_web_handoff_blocked", sid, "reason=native_voice_runtime");
    NativeVoiceCallLog.info("session_created", sid, "roomId=" + boundRoomId);
    Session session =
        new Session(sid, boundRoomId, boundPeerUserId, boundPeerName, "voice", true);
    SESSIONS.put(sid, session);
    NativeCallVisibleSurfaceOwner.release(aid, "preparing_bound");
    if (!NativeCallVisibleSurfaceOwner.isClaimed(sid)) {
      NativeCallVisibleSurfaceOwner.claim(sid, "voice", "dialing");
    }
    boolean remapped = NativeVoiceCallActivity.bindToCallId(aid, sid);
    if (!remapped && !NativeVoiceCallActivity.isShowing(sid)) {
      // Activity was lost; post-session path will recreate dialing surface.
      NativeVoiceCallLog.info("outgoing_preparing_bind_activity_missing", sid, "attemptId=" + aid);
    }
    startOutgoingEstablishmentAfterSession(app, session);
    return true;
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
    // Legacy path must not leave a PREPARING surface hanging.
    finishAnyPreparing(app);
    NativeVideoCallRuntime.finishAnyPreparing(app);
    if (refuseOutgoingWhileLive(app, sid, sid)) return;
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
    startOutgoingEstablishmentAfterSession(app, session);
  }

  /** Post-session outgoing establish — FGS connecting + ringback + dialing Activity + Agora. */
  private static void startOutgoingEstablishmentAfterSession(Context app, Session session) {
    if (app == null || session == null) return;
    String sid = session.callId;
    DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_CONNECTING);
    NativeVoiceCallService.startConnecting(app, sid);
    NativeOutgoingRingbackOwner.start(app, sid, "voice");
    startOutgoingDialingActivity(app, session);
    startCallerAgoraJoin(app, session);
  }

  private static void startPreparingDialingActivity(
      Context context, String attemptId, String peerName) {
    if (context == null || attemptId == null || attemptId.isEmpty()) return;
    if (NativeVoiceCallActivity.isShowingPreparing(attemptId)) {
      NativeVoiceCallLog.info("native_preparing_surface_already_showing", attemptId);
      return;
    }
    if (!NativeCallVisibleSurfaceOwner.isClaimed(attemptId)) {
      NativeCallVisibleSurfaceOwner.claim(attemptId, "voice", "preparing");
    }
    NativeVoiceCallLog.info("native_preparing_surface_start", attemptId);
    android.content.Intent intent = new android.content.Intent(context, NativeVoiceCallActivity.class);
    intent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK
            | android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_ATTEMPT_ID, attemptId);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_PREPARING, true);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_PEER_NAME, peerName != null ? peerName : "");
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, attemptId);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, NativeVoiceCallActivity.UI_MODE_OUTGOING);
    context.startActivity(intent);
    NativeVoiceCallLog.info("native_preparing_surface_shown", attemptId);
  }

  private static String safePeerName(String peerName) {
    if (peerName == null || peerName.trim().isEmpty()) return "DIBAY";
    return peerName.trim();
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
    NativeVoiceCallLog.info("state_connected", sid);
    NativeVoiceCallService.startConnected(app, sid);
    NativeVoiceCallBridge.syncConnected(app, sid);
  }

  private static boolean isCallerJoinStillLive(String sid) {
    if (NativeVoiceCallTerminalOnce.isClaimed(sid)) return false;
    Session live = SESSIONS.get(sid);
    if (live == null) return false;
    return live.state == State.CONNECTING
        || live.state == State.RINGING
        || live.state == State.ACCEPTING
        || live.state == State.CONNECTED;
  }

  private static void startCallerAgoraJoin(Context app, Session session) {
    String sid = session.callId;
    NativeVoiceCallApi.fetchTokenAsync(
        app,
        sid,
        (connection, tokenError) -> {
          if (!isCallerJoinStillLive(sid)) {
            NativeVoiceCallLog.info(
                "caller_token_stale_skip",
                sid,
                "reason=session_not_live_after_token");
            return;
          }
          if (connection == null) {
            fail(app, sid, "token_fetch_failed " + safe(tokenError));
            return;
          }
          if (!prepareJoinGuard(app, sid)) return;
          if (!isCallerJoinStillLive(sid)) {
            NativeVoiceCallLog.info(
                "caller_join_stale_skip",
                sid,
                "reason=session_not_live_after_guard");
            return;
          }
          NativeVoiceCallAgoraEngine.joinCaller(
              app,
              sid,
              connection,
              new NativeVoiceCallAgoraEngine.Listener() {
                @Override
                public void onConnected() {
                  if (!isCallerJoinStillLive(sid)) {
                    NativeVoiceCallLog.info(
                        "caller_connected_stale_skip", sid, "reason=session_not_live");
                    return;
                  }
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
                  if (!isCallerJoinStillLive(sid)) {
                    NativeVoiceCallLog.info(
                        "caller_agora_error_stale_skip", sid, "reason=" + safe(reason));
                    return;
                  }
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
    terminalPatch(context, callId, "reject", null, CallTerminationPolicy.Cause.USER_DECLINE, null);
  }

  public static void end(Context context, String callId) {
    end(context, callId, "ui");
  }

  /** Local hangup / cancel. {@code source} is logged only (patch action remains {@code end}). */
  public static void end(Context context, String callId, String source) {
    if (context != null && callId != null) {
      NativeVoiceCallLog.info("end_tapped", callId.trim(), "source=" + safe(source));
    }
    terminalPatch(context, callId, "end", null, CallTerminationPolicy.Cause.USER_END, null);
  }

  public static void missed(Context context, String callId) {
    terminalPatch(context, callId, "missed", null, CallTerminationPolicy.Cause.NO_ANSWER_LOCAL_TIMER, null);
  }

  /** 서버 상태로 확인된 terminal (FCM terminal 푸시·상태 조회·accept PATCH 응답·Agora 상대 퇴장·heartbeat). */
  public static void onRemoteTerminal(Context context, String callId, String terminalKind, String source) {
    applyNonUserTermination(
        context, callId, CallTerminationPolicy.causeForServerTerminalKind(terminalKind), terminalKind, source);
  }

  /**
   * 웹(endCall)이 보낸 종료 요청. 서버 상태에서 온 사유만 상대 종료로 받고, 그 외(failed·정리·감시 타이머)는
   * 살아 있는 통화를 끝내지 않는다 (A9 · WEB_REQUEST_UNCONFIRMED → KEEP).
   */
  public static CallTerminationPolicy.Decision onWebEndRequest(
      Context context, String callId, String reason, String source) {
    return applyNonUserTermination(
        context, callId, CallTerminationPolicy.causeForWebEndReason(reason), reason, source);
  }

  /**
   * 통화 화면 파괴(최근 앱 카드 제거·OS 정리·Dock 정리·PiP 닫기). 통화는 끝내지 않는다 (A1 · SURFACE_LOST → KEEP).
   * 돌아갈 수단: 벨이면 수신 알림을 다시 올리고, 수락 이후는 진행 중 통화 알림(FGS)이 그대로 있다.
   */
  public static void onSurfaceLost(Context context, String callId, String source) {
    applyNonUserTermination(context, callId, CallTerminationPolicy.Cause.SURFACE_LOST, "surface_lost", source);
  }

  /**
   * 회원 통화 자격이 없는 기기의 수신 화면 차단 — 이 기기의 벨·화면만 정리하고 서버에는 거절을 보내지 않는다.
   * (기존: 화면 파괴 경로로 서버 reject 가 나가 상대에게 「거절」로 전달됨.)
   */
  public static void dismissIneligibleIncomingLocally(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    if (session == null || session.initiator || session.state != State.RINGING) return;
    NativeVoiceCallLog.info("incoming_ineligible_local_dismiss", sid, "serverPatch=none");
    cleanup(context.getApplicationContext(), sid, "guest_ineligible_local");
  }

  private static CallTerminationPolicy.Decision applyNonUserTermination(
      Context context, String callId, CallTerminationPolicy.Cause cause, String kind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) {
      return CallTerminationPolicy.Decision.KEEP;
    }
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String reason = normalizeTerminalReason(kind);
    Session session = SESSIONS.get(sid);
    CallTerminationPolicy.Phase phase = phaseOf(session);
    CallTerminationPolicy.Decision decision = CallTerminationPolicy.decide(cause, phase);
    logDecision(sid, cause, phase, "kind=" + reason + " source=" + safe(source) + " decision=" + decision);
    if (decision == CallTerminationPolicy.Decision.KEEP) {
      if (cause == CallTerminationPolicy.Cause.NO_ANSWER) {
        NativeVoiceCallLog.info(
            "native_terminal_suppressed", sid, "kind=missed source=" + safe(source) + " state=connected");
        cancelMissed(sid);
      } else if (cause == CallTerminationPolicy.Cause.SURFACE_LOST) {
        ensureReturnPathAfterSurfaceLost(app, session);
      }
      return decision;
    }
    // CONVERGE (non-user causes never TERMINATE here: no server PATCH from this path).
    NativeOutgoingRingbackOwner.stop(sid, reason);
    if (NativeVoiceCallTerminalOnce.isClaimed(sid)) {
      NativeVoiceCallLog.info(
          "native_terminal_skip",
          sid,
          "kind=" + reason + " source=" + safe(source) + " state=already_cleaned");
      return decision;
    }
    if (session != null) setState(app, session, State.ENDING);
    cleanup(app, sid, reason);
    return decision;
  }

  /** §2-3 불변식: 살아 있는 통화에는 사용자가 돌아가 끊을 수단이 항상 있어야 한다. */
  private static void ensureReturnPathAfterSurfaceLost(Context app, Session session) {
    if (app == null || session == null) return;
    String sid = session.callId;
    if (NativeVoiceCallActivity.isShowing(sid)) {
      NativeVoiceCallLog.info("surface_lost_call_kept", sid, "returnPath=activity_still_showing");
      return;
    }
    if (!session.initiator && session.state == State.RINGING) {
      // 수신 벨 중 화면이 사라짐 — 받기·거절 버튼이 있는 수신 알림을 다시 올린다(벨·부재중 30초 타이머는 그대로).
      NativeVoiceCallNotification.dismiss(app, sid);
      NativeVoiceCallNotification.showIncoming(app, session);
      NativeVoiceCallLog.info("surface_lost_call_kept", sid, "returnPath=incoming_notification");
      return;
    }
    // 수락 이후·발신: 진행 중 통화 알림(FGS — 화면 복귀·종료 버튼)이 유지된다.
    NativeVoiceCallLog.info(
        "surface_lost_call_kept", sid, "returnPath=ongoing_notification state=" + session.state);
  }

  /** 다른 lane 이 판단 로그에 쓰는 단계 조회. */
  public static CallTerminationPolicy.Phase phaseOfCall(String callId) {
    return phaseOf(getSession(callId));
  }

  static CallTerminationPolicy.Phase phaseOf(Session session) {
    if (session == null || session.state == null) return CallTerminationPolicy.Phase.NONE;
    switch (session.state) {
      case RINGING:
        return session.initiator ? CallTerminationPolicy.Phase.ESTABLISHING : CallTerminationPolicy.Phase.RINGING;
      case ACCEPTING:
      case CONNECTING:
        return CallTerminationPolicy.Phase.ESTABLISHING;
      case CONNECTED:
        return CallTerminationPolicy.Phase.CONNECTED;
      default:
        return CallTerminationPolicy.Phase.TERMINAL;
    }
  }

  private static void logDecision(
      String callId, CallTerminationPolicy.Cause cause, CallTerminationPolicy.Phase phase, String details) {
    NativeVoiceCallLog.info(
        "termination_decision",
        callId,
        "cause=" + cause + " phase=" + phase + (details != null ? " " + details : ""));
  }

  /**
   * ⑥ 고아 회수 — 소유 callId 의 세션이 없는데 남은 FGS·Agora 점유를 정리한다. 정리 끝·앱 복귀 때 실행.
   * 살아 있는 세션의 리소스는 건드리지 않는다.
   */
  public static void reclaimOrphanResources(Context context, String reason) {
    if (context == null) return;
    Context app = context.getApplicationContext();
    String fgsOwner = NativeVoiceCallService.currentOwnerCallId();
    if (fgsOwner != null && !hasSessionInAnyLane(fgsOwner)) {
      NativeVoiceCallService.stopOrphan(app, reason);
    }
    String occupant = NativeVoiceCallAgoraEngine.peekOccupantCallId();
    if (occupant != null && !hasSessionInAnyLane(occupant) && !skipAgoraLeaveForTests) {
      NativeVoiceCallLog.info("orphan_agora_leave", occupant, "reason=" + safe(reason));
      try {
        NativeVoiceCallAgoraEngine.leave(occupant, "orphan_reclaim");
      } catch (RuntimeException error) {
        NativeVoiceCallLog.warn("orphan_agora_leave_failed", occupant, "err=" + error.getClass().getSimpleName());
      }
    }
  }

  private static boolean hasSessionInAnyLane(String callId) {
    return SESSIONS.containsKey(callId) || NativeVideoCallRuntime.getSession(callId) != null;
  }

  public static void cleanup(Context context, String callId, String reason) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (!NativeVoiceCallTerminalOnce.claim(sid)) {
      NativeVoiceCallLog.info("runtime_cleanup_idempotent_skip", sid, "reason=" + safe(reason));
      return;
    }
    NativeVoiceCallActivity.finishIfActive(sid, reason);
    NativeVoiceCallLog.info("runtime_cleanup_start", sid, "reason=" + safe(reason));
    try {
      com.dibay.app.call.NativeActiveCallHeartbeatOwner.stop(sid, reason);
      com.dibay.app.call.NativePresenceLeaseRenewOwner.stop(sid, reason);
      NativeOutgoingRingbackOwner.stop(sid, reason);
      cancelMissed(sid);
      if (!skipAgoraLeaveForTests) {
        NativeVoiceCallLog.info(
            "agora_leave_async", sid, "thread=" + Thread.currentThread().getName());
        try {
          if (injectLeaveFailureForTests) {
            throw new RuntimeException("forced_leave_failure");
          }
          // MERGE: leaveChannel without destroy (CURRENT). Do not restore NORMAL destroy().
          // Only leave if this call still owns the engine (busy-fail must not leave a foreign occupant).
          NativeVoiceCallAgoraEngine.leave(sid, reason);
        } catch (RuntimeException error) {
          NativeVoiceCallLog.warn(
              "error_terminal", sid, "agora_leave=" + error.getClass().getSimpleName());
        }
      }
    } finally {
      NativeVoiceCallNotification.dismiss(app, sid);
      NativeVoiceCallLog.info("native_call_service_stop", sid, "reason=" + safe(reason));
      NativeVoiceCallService.stop(app, sid, reason);
      IncomingCallRingOwner.stop(app, sid);
      DibayIncomingCallNativeStore.markState(app, sid, DibayIncomingCallNativeStore.STATE_TERMINAL);
      SESSIONS.remove(sid);
      IncomingCallActionCoordinator.complete(sid, reason);
      DibayActiveCallSessionManager.clearSession(sid);
      TERMINAL_PATCH_IN_FLIGHT.remove(sid);
      NativeVoiceCallLog.info("cleanup_done", sid, "reason=" + safe(reason));
      NativeVoiceCallOwner.release(sid, reason);
      NativeCallVisibleSurfaceOwner.release(sid, reason);
      NativeVoiceCallActivity.finishIfActive(sid, reason);
      reclaimOrphanResources(app, "after_cleanup:" + sid);
    }
  }

  /**
   * H1 NORMAL / Wave-1 R1: reject|end|missed → server PATCH first, then cleanup on callback
   * (same order as NativeVideoCallRuntime.terminalPatch). 종료 판단(②) → TERMINATE 일 때만 서버 PATCH(③) →
   * 콜백에서 정리(④⑤).
   *
   * @param phaseOverride 판단에 쓸 단계. null 이면 현재 세션 상태. fail() 은 FAILED 로 바꾸기 전 단계를 넘긴다.
   */
  private static void terminalPatch(
      Context context,
      String callId,
      String action,
      String clientEndedReason,
      CallTerminationPolicy.Cause cause,
      CallTerminationPolicy.Phase phaseOverride) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (NativeVoiceCallTerminalOnce.isClaimed(sid)) {
      NativeVoiceCallLog.info(
          "terminal_patch_skip", sid, "action=" + action + " state=already_cleaned");
      return;
    }
    if (TERMINAL_PATCH_IN_FLIGHT.contains(sid)) {
      // C: 중복 종료 요청 — 진행 중 PATCH 콜백이 정리한다. 서버 상태 변경은 1회.
      NativeVoiceCallLog.info(
          "terminal_patch_skip", sid, "action=" + action + " state=patch_in_flight");
      return;
    }
    Session session = SESSIONS.get(sid);
    CallTerminationPolicy.Phase phase = phaseOverride != null ? phaseOverride : phaseOf(session);
    CallTerminationPolicy.Decision decision = CallTerminationPolicy.decide(cause, phase);
    logDecision(sid, cause, phase, "action=" + action + " decision=" + decision);
    if (decision == CallTerminationPolicy.Decision.KEEP) return;
    if (decision == CallTerminationPolicy.Decision.CONVERGE) {
      NativeOutgoingRingbackOwner.stop(sid, action);
      cleanup(app, sid, action + "_converge");
      return;
    }
    if (!TERMINAL_PATCH_IN_FLIGHT.add(sid)) {
      NativeVoiceCallLog.info(
          "terminal_patch_skip", sid, "action=" + action + " state=patch_in_flight");
      return;
    }
    NativeOutgoingRingbackOwner.stop(sid, action);
    if (session != null) setState(app, session, State.ENDING);
    DibayCallConsumedStore.mark(app, sid, action);
    NativeVoiceCallActivity.finishIfActive(sid, action);
    // Release Agora at terminal intent so remote observes USER_OFFLINE promptly.
    if (!skipAgoraLeaveForTests) {
      try {
        NativeVoiceCallAgoraEngine.leave(sid, "ending_media_release");
      } catch (RuntimeException ignored) {
        // Cleanup callback still runs leave again.
      }
    }
    cancelMissed(sid);
    NativeVoiceCallApi.PatchCallback done =
        (ok, status, error) -> cleanup(app, sid, ok ? action : action + "_patch_failed");
    TerminalPatchDispatcher dispatcher = terminalPatchDispatcherForTests;
    if (dispatcher == null) dispatcher = DEFAULT_PATCH_DISPATCHER;
    dispatcher.dispatch(app, sid, action, clientEndedReason, done);
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
    TERMINAL_PATCH_IN_FLIGHT.clear();
    synchronized (PREPARING_LOCK) {
      preparingState = null;
    }
    NativeVoiceCallTerminalOnce.clearForTests();
    NativeVoiceCallService.resetOwnerForTests();
    terminalPatchDispatcherForTests = null;
    skipAgoraLeaveForTests = false;
    injectLeaveFailureForTests = false;
    com.dibay.app.call.NativePresenceLeaseRenewOwner.resetForTests();
  }

  static void fireMissedTimerForTests(Context context, String callId) {
    missed(context, callId);
  }

  private static void scheduleMissed(Context context, String callId) {
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    Runnable runnable =
        () -> {
          Session session = SESSIONS.get(sid);
          if (session == null || session.state != State.RINGING) return;
          missed(app, sid);
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
  }

  private static void setState(Context context, Session session, State state) {
    session.state = state;
    if (state == State.CONNECTING) {
      DibayIncomingCallNativeStore.markState(context, session.callId, DibayIncomingCallNativeStore.STATE_CONNECTING);
    } else if (state == State.CONNECTED) {
      DibayIncomingCallNativeStore.markState(context, session.callId, DibayIncomingCallNativeStore.STATE_ACTIVE);
      startActiveHeartbeat(context, session.callId);
      startPresenceRenew(context, session.callId);
    } else if (state == State.ENDING || state == State.ENDED || state == State.FAILED) {
      com.dibay.app.call.NativeActiveCallHeartbeatOwner.stop(session.callId, state.name().toLowerCase());
      com.dibay.app.call.NativePresenceLeaseRenewOwner.stop(session.callId, state.name().toLowerCase());
    }
    ensureVoiceUiVisible(context, session, state);
    NativeVoiceCallActivity.renderState(session.callId, state);
  }

  private static void startPresenceRenew(Context app, String sid) {
    com.dibay.app.call.NativePresenceLeaseRenewOwner.start(
        app,
        sid,
        (ctx, callId, cb) ->
            NativeVoiceCallApi.presenceRenewAsync(
                ctx, callId, (ok, status, error) -> cb.onDone(ok, status, error)),
        callId -> {
          if (NativeVoiceCallTerminalOnce.isClaimed(callId)) return false;
          Session live = SESSIONS.get(callId);
          return live != null && live.state == State.CONNECTED;
        });
  }

  private static void startActiveHeartbeat(Context app, String sid) {
    com.dibay.app.call.NativeActiveCallHeartbeatOwner.start(
        app,
        sid,
        (ctx, callId, cb) ->
            NativeVoiceCallApi.activeHeartbeatAsync(
                ctx,
                callId,
                (ok, status, error) -> {
                  cb.onDone(ok, status, error);
                  // 서버 세션이 active 가 아님(서버 확정) — KEEP 된 통화가 남지 않게 수렴한다.
                  if (!ok && error != null && error.contains("not_live")) {
                    onRemoteTerminal(ctx, callId, "ended", "heartbeat_server_not_live");
                  }
                }),
        callId -> {
          if (NativeVoiceCallTerminalOnce.isClaimed(callId)) return false;
          Session live = SESSIONS.get(callId);
          return live != null && live.state == State.CONNECTED;
        });
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
    if (context == null || callId == null) {
      cleanup(context, callId, "failed");
      return;
    }
    String sid = callId.trim();
    Session session = SESSIONS.get(sid);
    // Capture pre-fail state before FAILED — Phase A applies only pre-CONNECTED outgoing.
    State priorState = session != null ? session.state : null;
    CallTerminationPolicy.Phase priorPhase = phaseOf(session);
    if (session != null && TERMINAL_PATCH_IN_FLIGHT.contains(sid)) {
      // 이미 종료 PATCH 진행 중(사용자 종료 직후 Agora 오류 등) — 콜백이 정리한다.
      NativeVoiceCallLog.info("fail_skip_patch_in_flight", sid, "reason=" + safe(reason));
      return;
    }
    if (session != null) setState(context, session, State.FAILED);
    // WP-3 NEW-29: a native startup/engine failure must tell the server so the peer does not stay
    // ringing / connected (orphan). Reuse the canonical terminal writer (idempotent via TerminalOnce):
    // the initiator cancels the ringing session (end), the callee rejects.
    // E-C2-B Phase A: outgoing + pre-CONNECTED + code-proven TRUSTED map only → clientEndedReason;
    // action remains end/reject (no reject-path change; Agora unmapped → legacy end without reason).
    if (session != null && !NativeVoiceCallTerminalOnce.isClaimed(sid)) {
      String action = session.initiator ? "end" : "reject";
      String clientEndedReason = null;
      if (session.initiator && isOutgoingPreConnectedFailState(priorState)) {
        clientEndedReason = NativeVoiceOutgoingFailClientEndedReason.mapIfTrusted(reason);
      }
      NativeVoiceCallLog.info(
          "fail_terminal_propagate",
          sid,
          "action="
              + action
              + " clientEndedReason="
              + (clientEndedReason != null ? clientEndedReason : "")
              + " reason="
              + safe(reason));
      terminalPatch(
          context, sid, action, clientEndedReason, CallTerminationPolicy.Cause.MEDIA_FATAL, priorPhase);
      return;
    }
    cleanup(context, sid, "failed");
  }

  /** Outgoing establishment states before media connected (CONNECTED excluded). */
  private static boolean isOutgoingPreConnectedFailState(State priorState) {
    return priorState == State.CONNECTING
        || priorState == State.RINGING
        || priorState == State.ACCEPTING;
  }

  /** Package-visible for E-C2-B Phase A unit tests. */
  static void failForTests(Context context, String callId, String reason) {
    fail(context, callId, reason);
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
