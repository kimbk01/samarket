import Foundation

/**
 * Process-wide Agora singleton join / destroy guard (iOS G1).
 * Android parity: `NativeCallEngineOwnership.prepareJoin`.
 * iOS-only: `shouldDestroySharedEngine` — shared `AgoraRtcEngineKit` teardown gate.
 */
enum NativeCallAgoraJoinLane: Sendable {
  case voice
  case video
}

enum NativeCallAgoraGuardOutcome: Sendable {
  case proceed
  case idempotentSkip
  case busy(reason: String)
}

enum NativeCallAgoraLaneGuard {
  /// Runs before engine `join` / `joinCaller`. G1: occupant + idempotent only (no stale reclaim).
  static func prepareJoin(callId: String, lane: NativeCallAgoraJoinLane) -> NativeCallAgoraGuardOutcome {
    let incoming = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !incoming.isEmpty else {
      logWarn(lane, "native_engine_busy", callId: incoming, details: "reason=invalid_call_id")
      return .busy(reason: "invalid_call_id")
    }

    logInfo(lane, "native_engine_guard_start", callId: incoming, details: "lane=\(laneName(lane))")

    let voiceOcc = NativeVoiceCallAgoraEngine.shared.peekOccupantCallId()
    let videoOcc = NativeVideoCallAgoraEngine.shared.peekOccupantCallId()

    if incoming == voiceOcc || incoming == videoOcc {
      logInfo(lane, "native_join_idempotent_skip", callId: incoming, details: "reason=occupant_match")
      return .idempotentSkip
    }

    if let videoOcc, videoOcc != incoming {
      let reason = "video_engine_occupant=\(videoOcc)"
      logWarn(lane, "native_engine_busy", callId: incoming, details: reason)
      return .busy(reason: reason)
    }

    if let voiceOcc, voiceOcc != incoming {
      let reason = "voice_engine_occupant=\(voiceOcc)"
      logWarn(lane, "native_engine_busy", callId: incoming, details: reason)
      return .busy(reason: reason)
    }

    logInfo(lane, "native_engine_guard_proceed", callId: incoming, details: "")
    return .proceed
  }

  /**
   * Runs after `leaveChannel` and before `AgoraRtcEngineKit.destroy()`.
   * Returns false when the opposite lane still owns the shared singleton.
   */
  static func shouldDestroySharedEngine(
    leavingLane: NativeCallAgoraJoinLane,
    leavingCallId: String?
  ) -> Bool {
    switch leavingLane {
    case .voice:
      if NativeVideoCallAgoraEngine.shared.peekOccupantCallId() != nil {
        if let leavingCallId, !leavingCallId.isEmpty {
          logInfo(
            .voice,
            "agora_destroy_skipped_foreign_lane",
            callId: leavingCallId,
            details: "foreign_lane=video"
          )
        }
        return false
      }
    case .video:
      if NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() != nil {
        if let leavingCallId, !leavingCallId.isEmpty {
          NativeVideoCallLog.info(
            "agora_destroy_skipped_foreign_lane",
            callId: leavingCallId,
            details: "foreign_lane=voice"
          )
        }
        return false
      }
    }
    return true
  }

  // MARK: - Logging (Android `logInfo`/`logWarn` lane routing)

  private static func laneName(_ lane: NativeCallAgoraJoinLane) -> String {
    switch lane {
    case .voice: return "voice"
    case .video: return "video"
    }
  }

  private static func logInfo(
    _ lane: NativeCallAgoraJoinLane,
    _ marker: String,
    callId: String,
    details: String
  ) {
    switch lane {
    case .voice:
      voiceLog(marker, callId: callId, details: details)
    case .video:
      NativeVideoCallLog.info(marker, callId: callId, details: details)
    }
  }

  private static func logWarn(
    _ lane: NativeCallAgoraJoinLane,
    _ marker: String,
    callId: String,
    details: String
  ) {
    switch lane {
    case .voice:
      voiceLog(marker, callId: callId, details: details, warn: true)
    case .video:
      NativeVideoCallLog.warn(marker, callId: callId, details: details)
    }
  }

  private static func voiceLog(
    _ marker: String,
    callId: String,
    details: String,
    warn: Bool = false
  ) {
    let extra = details.trimmingCharacters(in: .whitespacesAndNewlines)
    DibayCallLog.info("ios_native_\(marker)", sessionId: callId, detail: extra)
  }
}
