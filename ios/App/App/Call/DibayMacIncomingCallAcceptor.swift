import Foundation

/**
 * D2-3 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §10-8) — 맥 전용 수신 수락.
 *
 * 맥(Designed for iPad)은 PushKit VoIP 가 오지 않고(§1-1) CallKit 통화 UI 가 FaceTime 종료로 통화를 끊는다(§8).
 * 그래서 맥에서는 웹 수신 시트(`CallV4IncomingSheet`)가 벨을 맡고, 「수락」만 이 진입점으로 네이티브에 넘긴다.
 * CallKit `reportIncomingCall` + `CXAnswerCallAction` 이 하던 일 중 CallKit 부분만 빼고 같은 순서로 실행한다:
 *   1) 네이티브 런타임에 수신 세션 등록 (`reportIncomingCall` 의 등록부와 같음)
 *   2) 기존 `NativeVoice/VideoIncomingCallCoordinator.handleAnswer` (서버 수락 → 토큰 → Agora 네이티브)
 *   3) 음성은 CallKit 수락 경로와 같이 런타임 스냅샷으로 통화 화면 표시
 * 미디어는 항상 네이티브 Agora — 웹뷰 통화 수립 금지 계약(`dibay-call-native-runtime-ssot.md`) 유지.
 * iPhone·iPad 는 이 진입점을 거부한다(CallKit 경로 그대로).
 */
enum DibayMacIncomingCallAcceptor {
  struct Request {
    let callId: String
    let isVideo: Bool
    let roomId: String
    let callerId: String
    let callerName: String
  }

  enum Outcome: String {
    case accepted
    case notMac = "platform_has_callkit"
    case invalidCallId = "invalid_call_id"
    case videoLaneDisabled = "video_lane_disabled"
    case acceptFailed = "accept_failed"
  }

  static func accept(_ request: Request, completion: @escaping (Outcome) -> Void) {
    let sid = request.callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else {
      completion(.invalidCallId)
      return
    }
    guard !DibayCallPlatformCapability.supportsCallKitCallUi else {
      DibayCallLog.warn("ios_mac_incoming_accept_rejected", sessionId: sid, detail: "reason=platform_has_callkit")
      completion(.notMac)
      return
    }
    let callerName = request.callerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      ? DibayNativeCopy.text("call_incoming_fallback")
      : request.callerName.trimmingCharacters(in: .whitespacesAndNewlines)
    let callUUID = UUID(uuidString: sid) ?? UUID()
    DibayCallLog.warn(
      "ios_mac_incoming_accept_started",
      sessionId: sid,
      detail: "video=\(request.isVideo)"
    )

    if request.isVideo {
      guard NativeVideoCallLane.isEnabled() else {
        DibayCallLog.warn("ios_mac_incoming_accept_rejected", sessionId: sid, detail: "reason=video_lane_disabled")
        completion(.videoLaneDisabled)
        return
      }
      do {
        _ = try NativeVideoCallRuntime.shared.registerIncomingSession(
          sessionId: sid,
          roomId: request.roomId,
          callerId: request.callerId,
          callerName: callerName,
          mediaType: "video",
          callUUID: callUUID
        )
      } catch {
        DibayCallLog.warn(
          "ios_mac_incoming_register_failed",
          sessionId: sid,
          detail: "video=true err=\(String(describing: error))"
        )
      }
      NativeVideoIncomingCallCoordinator.shared.handleAnswer(sessionId: sid) { fulfill in
        DispatchQueue.main.async {
          DibayCallLog.warn("ios_mac_incoming_accept_result", sessionId: sid, detail: "video=true ok=\(fulfill)")
          completion(fulfill ? .accepted : .acceptFailed)
        }
      }
      return
    }

    let session = NativeVoiceCallSession(
      sessionId: sid,
      callUUID: callUUID,
      direction: .incoming,
      roomId: request.roomId.trimmingCharacters(in: .whitespacesAndNewlines),
      callerId: request.callerId.trimmingCharacters(in: .whitespacesAndNewlines),
      callerName: callerName,
      createdAt: Date()
    )
    do {
      try NativeVoiceCallRuntime.shared.registerIncomingSession(session)
    } catch {
      DibayCallLog.warn(
        "ios_mac_incoming_register_failed",
        sessionId: sid,
        detail: "video=false err=\(String(describing: error))"
      )
    }
    NativeVoiceIncomingCallCoordinator.shared.handleAnswer(sessionId: sid) { fulfill in
      DispatchQueue.main.async {
        DibayCallLog.warn("ios_mac_incoming_accept_result", sessionId: sid, detail: "video=false ok=\(fulfill)")
        if fulfill {
          // CallKit 수락 경로(`CallKitProvider.provider(_:perform: CXAnswerCallAction)`)와 같은 화면 표시.
          NativeVoiceCallUiHost.handleRuntimeSnapshot(NativeVoiceCallRuntime.shared.snapshot())
        }
        completion(fulfill ? .accepted : .acceptFailed)
      }
    }
  }
}
