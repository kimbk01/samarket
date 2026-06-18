package com.dibay.app;

import android.content.Context;
import android.util.Log;
import java.util.concurrent.ConcurrentHashMap;

/**
 * callId 단일 session owner — 상태 전이·stale/duplicate guard·cleanup reason SSOT.
 * UI/벨/notification 은 session phase 를 따라가며, lifecycle 만으로 종료하지 않는다.
 */
public final class IncomingCallSessionMachine {
  private static final String TAG = "DIBAY_CALL";

  private static final ConcurrentHashMap<String, SessionRecord> SESSIONS = new ConcurrentHashMap<>();
  private static volatile String activeCallId = null;

  private IncomingCallSessionMachine() {}

  public static final class ReceiveDecision {
    public final boolean proceed;
    public final boolean duplicateMerge;
    public final boolean staleIgnored;
    public final boolean busyRejected;
    public final String callId;

    ReceiveDecision(boolean proceed, boolean duplicateMerge, boolean staleIgnored, boolean busyRejected, String callId) {
      this.proceed = proceed;
      this.duplicateMerge = duplicateMerge;
      this.staleIgnored = staleIgnored;
      this.busyRejected = busyRejected;
      this.callId = callId;
    }
  }

  private static final class SessionRecord {
    volatile IncomingCallSessionPhase phase = IncomingCallSessionPhase.RECEIVED;
    volatile long createdAtMs = System.currentTimeMillis();
    volatile long ringStartedAtMs = 0L;
    volatile String mediaType = "audio";
  }

  public static String getActiveCallId() {
    return activeCallId != null ? activeCallId : "";
  }

  public static IncomingCallSessionPhase getPhase(String callId) {
    SessionRecord r = session(callId);
    return r != null ? r.phase : null;
  }

  public static boolean canRepresentIncomingUi(String callId) {
    SessionRecord r = session(callId);
    if (r == null) return true;
    return !r.phase.blocksIncomingUiRepresent();
  }

  public static boolean canApplyMissedTimeout(String callId) {
    SessionRecord r = session(callId);
    if (r == null) return true;
    return !r.phase.blocksMissedTimeout();
  }

  public static boolean canCleanupFromStale(String callId) {
    SessionRecord r = session(callId);
    if (r == null) return true;
    return !r.phase.blocksStaleCleanup();
  }

  public static boolean isActiveRingingCall(String callId) {
    if (callId == null || callId.trim().isEmpty()) return false;
    String sid = callId.trim();
    if (!sid.equals(activeCallId)) return false;
    SessionRecord r = SESSIONS.get(sid);
    if (r == null) return false;
    IncomingCallSessionPhase p = r.phase;
    return p == IncomingCallSessionPhase.RINGING
        || p == IncomingCallSessionPhase.PRESENTED
        || p == IncomingCallSessionPhase.ROUTED
        || p == IncomingCallSessionPhase.RECEIVED;
  }

  /** FCM / native receive entry — duplicate merge, stale ignore, single-call busy. */
  public static ReceiveDecision onIncomingFcmReceived(Context context, IncomingCallPayload payload, long receivedAtMs) {
    if (payload == null || !payload.isValid()) {
      return new ReceiveDecision(false, false, false, false, "");
    }
    String sid = payload.callId.trim();
    String active = activeCallId != null ? activeCallId.trim() : "";

    if (!active.isEmpty() && active.equals(sid)) {
      SessionRecord existing = SESSIONS.get(sid);
      if (existing != null && existing.phase.blocksStaleCleanup()) {
        logTransition(sid, existing.phase, existing.phase, "duplicate_fcm_merge", "fcm");
        return new ReceiveDecision(true, true, false, false, sid);
      }
    }

    if (!active.isEmpty() && !active.equals(sid)) {
      SessionRecord activeRecord = SESSIONS.get(active);
      if (activeRecord != null && !activeRecord.phase.isTerminal()) {
        logTransition(sid, null, IncomingCallSessionPhase.RECEIVED, "busy_rejected_new_call", "fcm");
        DibayCallPushLog.info("incoming_busy_rejected", sid, "activeCallId=" + active);
        return new ReceiveDecision(false, false, false, true, sid);
      }
    }

    if (DibayCallConsumedStore.isConsumed(context, sid)) {
      return new ReceiveDecision(false, false, true, false, sid);
    }

    SessionRecord record = SESSIONS.computeIfAbsent(sid, k -> new SessionRecord());
    record.mediaType = payload.callType != null ? payload.callType : "audio";
    record.createdAtMs = receivedAtMs > 0L ? receivedAtMs : System.currentTimeMillis();
    transition(sid, record, IncomingCallSessionPhase.RECEIVED, "fcm_received", "fcm");
    activeCallId = sid;
    return new ReceiveDecision(true, false, false, false, sid);
  }

  public static void onRouted(String callId, String source) {
    SessionRecord r = requireActive(callId);
    if (r == null) return;
    transition(callId, r, IncomingCallSessionPhase.ROUTED, "route_decided", source);
  }

  public static void onRinging(String callId, String source) {
    SessionRecord r = requireActive(callId);
    if (r == null) return;
    transition(callId, r, IncomingCallSessionPhase.RINGING, "ring_started", source);
    r.ringStartedAtMs = System.currentTimeMillis();
  }

  public static void onPresented(String callId, String source) {
    SessionRecord r = session(callId);
    if (r == null) return;
    if (r.phase.blocksIncomingUiRepresent()) {
      Log.w(TAG, "[DIBAY_CALL] incoming_ui_represent_blocked callId=" + callId + " phase=" + r.phase.wire());
      return;
    }
    transition(callId, r, IncomingCallSessionPhase.PRESENTED, "ui_shown", source);
  }

  public static boolean tryBeginAccepting(String callId, String source) {
    SessionRecord r = requireActive(callId);
    if (r == null) return false;
    if (r.phase.blocksMissedTimeout()) return false;
    transition(callId, r, IncomingCallSessionPhase.ACCEPTING, "accept_begin", source);
    return true;
  }

  public static void onAccepted(String callId, String source) {
    SessionRecord r = session(callId);
    if (r == null) return;
    transition(callId, r, IncomingCallSessionPhase.ACCEPTED, "accept_done", source);
  }

  public static boolean tryBeginRejecting(String callId, String source) {
    SessionRecord r = requireActive(callId);
    if (r == null) return false;
    transition(callId, r, IncomingCallSessionPhase.REJECTING, "reject_begin", source);
    return true;
  }

  public static void onRejected(String callId, String source) {
    SessionRecord r = session(callId);
    if (r == null) return;
    transition(callId, r, IncomingCallSessionPhase.REJECTED, "reject_done", source);
    markCleaned(callId, r, IncomingCallCleanupReason.REJECTED, source);
  }

  public static void onMissed(String callId, String source) {
    SessionRecord r = session(callId);
    if (r == null) return;
    if (r.phase.blocksMissedTimeout()) {
      Log.w(
          TAG,
          "[DIBAY_CALL] missed_timeout_ignored callId="
              + callId
              + " phase="
              + r.phase.wire()
              + " source="
              + source);
      return;
    }
    transition(callId, r, IncomingCallSessionPhase.MISSED, "missed_timeout", source);
    markCleaned(callId, r, IncomingCallCleanupReason.MISSED_TIMEOUT, source);
  }

  public static boolean onCallerCancelled(Context context, String callId, String source) {
    return onCallerCancelled(context, callId, source, false);
  }

  public static boolean onCallerCancelled(
      Context context, String callId, String source, boolean serverAlreadyVerified) {
    String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) return false;
    if (!sid.equals(activeCallId) && !SESSIONS.containsKey(sid)) {
      logStaleIgnored(sid, source);
      return false;
    }
    if (!serverAlreadyVerified) {
      IncomingCallSessionStatusProbe.ProbeResult probe =
          IncomingCallSessionStatusProbe.probe(context, sid);
      if (!probe.ok) {
        IncomingCallSessionStatusProbe.logProbeDeferred(sid, source, probe.failureDetail);
        return false;
      }
      if (!isCancelledStatus(probe.status)) {
        Log.w(
            TAG,
            "[DIBAY_CALL] caller_cancel_blocked_server_status callId="
                + sid
                + " status="
                + probe.status
                + " source="
                + source);
        return false;
      }
    }
    SessionRecord r = session(sid);
    if (r != null && r.phase.blocksMissedTimeout()) {
      Log.w(TAG, "[DIBAY_CALL] caller_cancel_ignored_phase callId=" + sid + " phase=" + r.phase.wire());
      return false;
    }
    if (r != null) {
      transition(sid, r, IncomingCallSessionPhase.CANCELLED_BY_CALLER, "caller_cancelled", source);
      markCleaned(sid, r, IncomingCallCleanupReason.CALLER_CANCELLED, source);
    }
    return true;
  }

  public static void onRemoteEnded(String callId, String source) {
    SessionRecord r = session(callId);
    if (r == null) return;
    transition(callId, r, IncomingCallSessionPhase.ENDED, "remote_ended", source);
    markCleaned(callId, r, IncomingCallCleanupReason.REMOTE_ENDED, source);
  }

  public static boolean shouldStopRing(String callId, IncomingCallCleanupReason reason) {
    if (reason == null) {
      Log.e(TAG, "[DIBAY_CALL] ring_stop_forbidden reason=null callId=" + callId);
      return false;
    }
    SessionRecord r = session(callId);
    long elapsed = r != null && r.ringStartedAtMs > 0L ? System.currentTimeMillis() - r.ringStartedAtMs : -1L;
    if (elapsed >= 0L
        && elapsed < IncomingCallCleanupReason.earlyRingStopAllowedMs()
        && !reason.allowsEarlyRingStop()) {
      Log.e(
          TAG,
          "[DIBAY_CALL] ring_stop_early_failure"
              + " callId="
              + callId
              + " reason="
              + reason.wire
              + " elapsedMs="
              + elapsed
              + " stopCaller=session_machine");
      return false;
    }
    return true;
  }

  public static void logIncomingCleanup(
      String callId,
      IncomingCallCleanupReason reason,
      String source,
      boolean ringStopped,
      boolean serviceStopped,
      boolean notificationCancelled,
      boolean activityFinished) {
    if (reason == null) {
      Log.e(TAG, "[DIBAY_CALL] incoming_cleanup_forbidden reason=null callId=" + callId);
      return;
    }
    Log.i(
        TAG,
        "[DIBAY_CALL] incoming_cleanup"
            + " callId="
            + callId
            + " reason="
            + reason.wire
            + " source="
            + source
            + " ringStopped="
            + ringStopped
            + " serviceStopped="
            + serviceStopped
            + " notificationCancelled="
            + notificationCancelled
            + " activityFinished="
            + activityFinished);
  }

  private static void markCleaned(String callId, SessionRecord r, IncomingCallCleanupReason reason, String source) {
    transition(callId, r, IncomingCallSessionPhase.CLEANED, reason.wire, source);
    if (callId.equals(activeCallId)) {
      activeCallId = null;
    }
    SESSIONS.remove(callId);
  }

  private static void logStaleIgnored(String callId, String source) {
    Log.i(
        TAG,
        "[DIBAY_CALL] stale_duplicate_ignored callId=" + callId + " activeCallId=" + activeCallId + " source=" + source);
    logIncomingCleanup(
        callId,
        IncomingCallCleanupReason.STALE_DUPLICATE_IGNORED,
        source,
        false,
        false,
        false,
        false);
  }

  private static SessionRecord requireActive(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    String sid = callId.trim();
    if (activeCallId != null && !activeCallId.equals(sid)) {
      return null;
    }
    return SESSIONS.get(sid);
  }

  private static SessionRecord session(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return SESSIONS.get(callId.trim());
  }

  private static void transition(
      String callId, SessionRecord record, IncomingCallSessionPhase to, String reason, String source) {
    if (record == null || to == null) return;
    IncomingCallSessionPhase from = record.phase;
    if (from != null && to.ordinal() < from.ordinal() && !from.isTerminal()) {
      Log.w(
          TAG,
          "[DIBAY_CALL] call_session_transition_blocked callId="
              + callId
              + " from="
              + from.wire()
              + " to="
              + to.wire()
              + " reason="
              + reason);
      return;
    }
    record.phase = to;
    logTransition(callId, from, to, reason, source);
  }

  private static void logTransition(
      String callId, IncomingCallSessionPhase from, IncomingCallSessionPhase to, String reason, String source) {
    Log.i(
        TAG,
        "[DIBAY_CALL] call_session_state_transition"
            + " callId="
            + callId
            + " from="
            + (from != null ? from.wire() : "null")
            + " to="
            + (to != null ? to.wire() : "null")
            + " reason="
            + reason
            + " source="
            + source);
  }

  private static boolean isCancelledStatus(String status) {
    if (status == null) return false;
    String s = status.trim().toLowerCase();
    return "cancelled".equals(s) || "canceled".equals(s);
  }

  /** Robolectric / unit test isolation only — not used in production paths. */
  static void resetForTest() {
    SESSIONS.clear();
    activeCallId = null;
  }
}
