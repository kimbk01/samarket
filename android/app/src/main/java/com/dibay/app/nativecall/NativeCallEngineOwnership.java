package com.dibay.app.nativecall;

import android.content.Context;
import com.dibay.app.nativevideo.NativeVideoCallAgoraEngine;
import com.dibay.app.nativevideo.NativeVideoCallLog;
import com.dibay.app.nativevideo.NativeVideoCallRuntime;
import com.dibay.app.nativevoice.NativeVoiceCallAgoraEngine;
import com.dibay.app.nativevoice.NativeVoiceCallLog;
import com.dibay.app.nativevoice.NativeVoiceCallRuntime;

/**
 * Process-wide native Agora join guard (O2 establishment).
 *
 * <p>Runs before {@code joinCaller}/{@code join} so {@code RtcEngine.create()} never runs while a
 * live foreign occupant blocks the singleton. Stale reclaim uses Native Runtime signals only.
 */
public final class NativeCallEngineOwnership {
  public enum JoinLane {
    VOICE,
    VIDEO
  }

  public enum GuardOutcome {
    PROCEED,
    IDEMPOTENT_SKIP,
    BUSY
  }

  private static final int MAX_STALE_PASSES = 3;

  private NativeCallEngineOwnership() {}

  public static GuardOutcome prepareJoin(Context context, String incomingCallId, JoinLane lane) {
    if (context == null || incomingCallId == null || incomingCallId.trim().isEmpty()) {
      return GuardOutcome.BUSY;
    }
    Context app = context.getApplicationContext();
    String incoming = incomingCallId.trim();
    logInfo(lane, "native_engine_guard_start", incoming, "lane=" + lane.name().toLowerCase());

    GuardOutcome idempotent = checkIdempotentSkip(incoming, lane);
    if (idempotent != null) return idempotent;

    for (int pass = 0; pass < MAX_STALE_PASSES; pass++) {
      if (!reclaimStaleOnce(app, incoming, lane)) break;
    }

    String busyReason = findBusyReason(incoming);
    if (busyReason != null) {
      logWarn(lane, "native_engine_busy", incoming, busyReason);
      return GuardOutcome.BUSY;
    }

    logInfo(lane, "native_engine_guard_proceed", incoming, "");
    return GuardOutcome.PROCEED;
  }

  private static GuardOutcome checkIdempotentSkip(String incoming, JoinLane lane) {
    String voiceOcc = NativeVoiceCallAgoraEngine.peekOccupantCallId();
    String videoOcc = NativeVideoCallAgoraEngine.peekOccupantCallId();
    if (incoming.equals(voiceOcc) || incoming.equals(videoOcc)) {
      logInfo(lane, "native_join_idempotent_skip", incoming, "reason=occupant_match");
      return GuardOutcome.IDEMPOTENT_SKIP;
    }
    NativeVoiceCallRuntime.Session voiceSession = NativeVoiceCallRuntime.getSession(incoming);
    if (voiceSession != null && voiceSession.state == NativeVoiceCallRuntime.State.CONNECTED) {
      logInfo(lane, "native_join_idempotent_skip", incoming, "reason=voice_session_connected");
      return GuardOutcome.IDEMPOTENT_SKIP;
    }
    NativeVideoCallRuntime.Session videoSession = NativeVideoCallRuntime.getSession(incoming);
    if (videoSession != null && videoSession.state == NativeVideoCallRuntime.State.CONNECTED) {
      logInfo(lane, "native_join_idempotent_skip", incoming, "reason=video_session_connected");
      return GuardOutcome.IDEMPOTENT_SKIP;
    }
    return null;
  }

  /** @return true if any stale reclaim ran on this pass */
  private static boolean reclaimStaleOnce(Context app, String incoming, JoinLane lane) {
    boolean reclaimed = false;

    if (NativeVoiceCallAgoraEngine.releaseZombieEngine("stale_engine_zombie")) {
      logInfo(lane, "native_stale_engine_detected", incoming, "kind=zombie lane=voice");
      logInfo(lane, "native_stale_engine_cleanup_done", incoming, "kind=zombie lane=voice");
      reclaimed = true;
    }
    if (NativeVideoCallAgoraEngine.releaseZombieEngine("stale_engine_zombie")) {
      logInfo(lane, "native_stale_engine_detected", incoming, "kind=zombie lane=video");
      logInfo(lane, "native_stale_engine_cleanup_done", incoming, "kind=zombie lane=video");
      reclaimed = true;
    }

    String staleVoiceSession = NativeVoiceCallRuntime.findStaleSessionCallId(incoming);
    if (staleVoiceSession != null) {
      reclaimed |= reclaimCall(app, incoming, lane, staleVoiceSession, "voice", "stale_session");
    }

    String staleVideoSession = NativeVideoCallRuntime.findStaleSessionCallId(incoming);
    if (staleVideoSession != null) {
      reclaimed |= reclaimCall(app, incoming, lane, staleVideoSession, "video", "stale_session");
    }

    String voiceOcc = NativeVoiceCallAgoraEngine.peekOccupantCallId();
    if (voiceOcc != null
        && !voiceOcc.equals(incoming)
        && NativeVoiceCallRuntime.getSession(voiceOcc) == null
        && NativeVideoCallRuntime.getSession(voiceOcc) == null) {
      reclaimed |= reclaimCall(app, incoming, lane, voiceOcc, "voice", "orphan_occupant");
    }

    String videoOcc = NativeVideoCallAgoraEngine.peekOccupantCallId();
    if (videoOcc != null
        && !videoOcc.equals(incoming)
        && NativeVoiceCallRuntime.getSession(videoOcc) == null
        && NativeVideoCallRuntime.getSession(videoOcc) == null) {
      reclaimed |= reclaimCall(app, incoming, lane, videoOcc, "video", "orphan_occupant");
    }

    return reclaimed;
  }

  private static boolean reclaimCall(
      Context app, String incoming, JoinLane lane, String staleCallId, String ownerLane, String kind) {
    logInfo(lane, "native_stale_engine_detected", incoming, "occupant=" + staleCallId + " kind=" + kind);
    logInfo(lane, "native_stale_engine_cleanup_start", incoming, "occupant=" + staleCallId + " kind=" + kind);
    if ("voice".equals(ownerLane)) {
      NativeVoiceCallRuntime.cleanup(app, staleCallId, "stale_engine_reclaim");
    } else {
      NativeVideoCallRuntime.cleanup(app, staleCallId, "stale_engine_reclaim");
    }
    logInfo(lane, "native_stale_engine_cleanup_done", incoming, "occupant=" + staleCallId + " kind=" + kind);
    return true;
  }

  private static String findBusyReason(String incoming) {
    String liveVoice = NativeVoiceCallRuntime.findOtherLiveSessionCallId(incoming);
    if (liveVoice != null) return "live_voice_session=" + liveVoice;
    String liveVideo = NativeVideoCallRuntime.findOtherLiveSessionCallId(incoming);
    if (liveVideo != null) return "live_video_session=" + liveVideo;

    String voiceOcc = NativeVoiceCallAgoraEngine.peekOccupantCallId();
    if (voiceOcc != null && !voiceOcc.equals(incoming)) {
      return "voice_engine_occupant=" + voiceOcc;
    }
    String videoOcc = NativeVideoCallAgoraEngine.peekOccupantCallId();
    if (videoOcc != null && !videoOcc.equals(incoming)) {
      return "video_engine_occupant=" + videoOcc;
    }
    return null;
  }

  private static void logInfo(JoinLane lane, String marker, String callId, String details) {
    if (lane == JoinLane.VOICE) {
      NativeVoiceCallLog.info(marker, callId, details);
    } else {
      NativeVideoCallLog.info(marker, callId, details);
    }
  }

  private static void logWarn(JoinLane lane, String marker, String callId, String details) {
    if (lane == JoinLane.VOICE) {
      NativeVoiceCallLog.warn(marker, callId, details);
    } else {
      NativeVideoCallLog.warn(marker, callId, details);
    }
  }
}
