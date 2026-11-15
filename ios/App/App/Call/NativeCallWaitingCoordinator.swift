import AVFoundation
import CallKit
import Foundation

/**
 * 대기 통화 (WhatsApp 형태 「거절 / 종료 후 받기」, 보류 없음) — docs/audit/call-waiting-stage2-design-2026-11-15.md WI1~WI5.
 *
 * 서버가 `waiting=true` 로 보낸 수신 VoIP 가 왔고 이 기기의 다른 통화가 **연결됨**일 때만 동작한다(맥 제외). 그 밖은
 * `CallKitProvider.reportIncomingCall` 의 기존 처리(device_busy_live_call 무음 보고 후 종료)가 그대로 돈다.
 *
 * - 대기 통화는 런타임에 등록하지 않는다(연결된 통화가 있으면 등록이 거부되고, 등록하면 다른 판정이 진행 중으로 본다).
 *   정보는 여기서만 보관(동시에 1건)하고 CallKit 에는 정상 보고 → iOS 대기 화면(「종료 및 수락」「거절」).
 * - 「종료 및 수락」: CallKit 이 진행 중 통화 `CXEndCallAction` → 새 통화 `CXAnswerCallAction` 을 보낸다. 진행 중 통화는
 *   기존 종료 경로로 끝나고, 새 통화 수락은 그 정리가 끝난 뒤(엔진 1개·오디오 세션 정리 순서) 런타임에 등록하고 진행한다.
 * - 「거절」: 새 통화 `CXEndCallAction` → reject API. 진행 중 통화 유지.
 * - 진행 중 통화가 먼저 끝남: 대기 통화를 런타임에 등록 → 일반 수신으로 이어짐(런타임 무응답 타이머).
 * - 대기 통화의 종료 신호(취소·다른 기기 응답 등 → CallKit 종료) 또는 30초 경과: 대기 상태만 정리.
 */
final class NativeCallWaitingCoordinator {
  static let shared = NativeCallWaitingCoordinator()

  private struct Pending {
    let sessionId: String
    let callUUID: UUID
    let hasVideo: Bool
    let roomId: String
    let callerId: String
    let callerName: String
    let liveSessionId: String
  }

  private static let ringTimeoutSeconds: TimeInterval = 30
  private static let answerWaitSeconds: TimeInterval = 8
  private static let beepIntervalSeconds: TimeInterval = 3

  /** 모든 상태는 메인 큐에서만 읽고 쓴다(CallKit delegate queue = main). */
  private var pending: Pending?
  private var pendingAnswer: ((Bool) -> Void)?
  private var timeoutWork: DispatchWorkItem?
  private var answerTimeoutWork: DispatchWorkItem?
  private var beepTimer: Timer?
  private var beepPlayer: AVAudioPlayer?

  private init() {}

  // MARK: - Present

  /// 대기 통화로 보여줄 수 있으면 진행 중(연결됨) 통화의 sessionId, 아니면 nil.
  func eligibleLiveSessionId(incoming sessionId: String) -> String? {
    guard DibayCallPlatformCapability.supportsCallKitCallUi else { return nil }
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return nil }
    if let current = pending, current.sessionId != sid { return nil }
    guard let live = CallTerminationPolicy.liveCallSessionId(excluding: sid) else { return nil }
    guard CallTerminationPolicy.runtimePhase(callId: live) == .connected else { return nil }
    return live
  }

  func registerPending(
    sessionId: String,
    callUUID: UUID,
    hasVideo: Bool,
    roomId: String?,
    callerId: String?,
    callerName: String,
    liveSessionId: String
  ) {
    onMain {
      self.pending = Pending(
        sessionId: sessionId,
        callUUID: callUUID,
        hasVideo: hasVideo,
        roomId: roomId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        callerId: callerId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
        callerName: callerName,
        liveSessionId: liveSessionId
      )
      self.log("ios_call_waiting_pending", sessionId, "live=\(liveSessionId) video=\(hasVideo)")
    }
  }

  /// CallKit 보고 결과. 실패면 대기 상태를 버린다, 성공이면 대기음·무응답 타이머 시작.
  func onReported(sessionId: String, error: Error?) {
    onMain {
      guard let current = self.pending, current.sessionId == sessionId else { return }
      if let error {
        self.log("ios_call_waiting_report_failed", sessionId, "err=\(error.localizedDescription)")
        self.clear()
        return
      }
      self.startBeep()
      self.scheduleTimeout(sessionId: sessionId)
      self.log("ios_call_waiting_presented", sessionId, "live=\(current.liveSessionId)")
    }
  }

  func isWaiting(sessionId: String) -> Bool {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    if Thread.isMainThread { return pending?.sessionId == sid }
    return DispatchQueue.main.sync { pending?.sessionId == sid }
  }

  // MARK: - CallKit actions

  /// 새 통화 「거절」(CXEndCallAction on waiting UUID).
  func decline(sessionId: String) {
    onMain {
      guard let current = self.pending, current.sessionId == sessionId else { return }
      self.clear()
      self.log("ios_call_waiting_decline", sessionId, "video=\(current.hasVideo)")
      if current.hasVideo {
        NativeVideoCallApi.rejectAsync(callId: sessionId) { ok, status, _ in
          DibayCallLog.info("ios_call_waiting_decline_done", sessionId: sessionId, detail: "ok=\(ok) status=\(status)")
        }
      } else {
        NativeVoiceCallApi.rejectAsync(callId: sessionId) { ok, status, _ in
          DibayCallLog.info("ios_call_waiting_decline_done", sessionId: sessionId, detail: "ok=\(ok) status=\(status)")
        }
      }
    }
  }

  /**
   * 새 통화 수락 준비(CXAnswerCallAction on waiting UUID). 진행 중 통화가 정리될 때까지 기다렸다가 런타임에 등록한다.
   * completion(true) 뒤 호출부가 같은 answer action 을 일반 경로로 다시 처리한다.
   */
  func prepareAnswer(sessionId: String, completion: @escaping (Bool) -> Void) {
    onMain {
      guard let current = self.pending, current.sessionId == sessionId else {
        completion(false)
        return
      }
      self.stopBeep()
      self.cancelTimeout()
      if CallTerminationPolicy.liveCallSessionId(excluding: sessionId) == nil {
        completion(self.promote(current, reason: "answer_no_live"))
        return
      }
      self.log("ios_call_waiting_answer_wait_live_cleanup", sessionId, "live=\(current.liveSessionId)")
      self.pendingAnswer = completion
      let work = DispatchWorkItem { [weak self] in
        guard let self, let waiting = self.pending, waiting.sessionId == sessionId,
          let done = self.pendingAnswer
        else { return }
        self.pendingAnswer = nil
        if CallTerminationPolicy.liveCallSessionId(excluding: sessionId) == nil {
          done(self.promote(waiting, reason: "answer_after_timeout_check"))
        } else {
          self.log("ios_call_waiting_answer_timeout", sessionId, "live_still_present")
          self.clear()
          done(false)
        }
      }
      self.answerTimeoutWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + Self.answerWaitSeconds, execute: work)
    }
  }

  // MARK: - Hooks

  /// 음성·영상 정리 끝에서 호출 — 진행 중 통화가 모두 정리되면 대기 통화를 이어서 처리한다.
  func onCallCleanedUp(sessionId cleaned: String) {
    onMain {
      guard let current = self.pending, current.sessionId != cleaned else { return }
      guard CallTerminationPolicy.liveCallSessionId(excluding: current.sessionId) == nil else { return }
      if let done = self.pendingAnswer {
        self.pendingAnswer = nil
        self.answerTimeoutWork?.cancel()
        self.answerTimeoutWork = nil
        done(self.promote(current, reason: "answer_after_live_cleanup"))
        return
      }
      // 진행 중 통화가 먼저 끝남 → 일반 수신으로 전환(런타임 무응답 타이머가 이어받음).
      _ = self.promote(current, reason: "live_ended_while_waiting")
    }
  }

  /// CallKit 에서 이 통화가 끝났을 때(취소·다른 기기 응답·무응답 표시 등) 대기 상태 정리.
  func onCallKitSessionEnded(sessionId: String) {
    onMain {
      guard let current = self.pending, current.sessionId == sessionId else { return }
      self.log("ios_call_waiting_callkit_ended", sessionId)
      if let done = self.pendingAnswer {
        self.pendingAnswer = nil
        done(false)
      }
      self.clear()
    }
  }

  // MARK: - Private

  /// 대기 해제 + 런타임 등록(일반 수신 상태). 등록 실패면 false.
  private func promote(_ current: Pending, reason: String) -> Bool {
    clear()
    var ok = false
    if current.hasVideo {
      if NativeVideoCallLane.isEnabled() {
        do {
          ok = try NativeVideoCallRuntime.shared.registerIncomingSession(
            sessionId: current.sessionId,
            roomId: current.roomId,
            callerId: current.callerId,
            callerName: current.callerName,
            mediaType: "video",
            callUUID: current.callUUID
          )
        } catch {
          log("ios_call_waiting_register_failed", current.sessionId, "err=\(String(describing: error))")
        }
      }
    } else {
      do {
        try NativeVoiceCallRuntime.shared.registerIncomingSession(
          NativeVoiceCallSession(
            sessionId: current.sessionId,
            callUUID: current.callUUID,
            direction: .incoming,
            roomId: current.roomId,
            callerId: current.callerId,
            callerName: current.callerName,
            createdAt: Date()
          )
        )
        ok = true
      } catch {
        log("ios_call_waiting_register_failed", current.sessionId, "err=\(String(describing: error))")
      }
    }
    log("ios_call_waiting_promote", current.sessionId, "reason=\(reason) registered=\(ok)")
    return ok
  }

  private func clear() {
    pending = nil
    stopBeep()
    cancelTimeout()
    answerTimeoutWork?.cancel()
    answerTimeoutWork = nil
  }

  private func scheduleTimeout(sessionId: String) {
    cancelTimeout()
    let work = DispatchWorkItem { [weak self] in
      guard let self, let current = self.pending, current.sessionId == sessionId, self.pendingAnswer == nil else {
        return
      }
      self.log("ios_call_waiting_timeout", sessionId, "afterSec=\(Int(Self.ringTimeoutSeconds))")
      self.clear()
      // 서버가 울림 만료로 missed 를 확정한다(부재중 알림은 서버 경로). 여기서는 CallKit 대기 화면만 닫는다.
      CallKitProvider.shared.markTerminalSuppressed(sessionId: sessionId, reason: "call_waiting_timeout")
      CallKitProvider.shared.endCallKitSession(
        sessionId: sessionId,
        reason: .unanswered,
        logDetail: "call_waiting_timeout"
      )
    }
    timeoutWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.ringTimeoutSeconds, execute: work)
  }

  private func cancelTimeout() {
    timeoutWork?.cancel()
    timeoutWork = nil
  }

  /// 같은 앱의 두 번째 CallKit 통화는 시스템 대기음이 안 날 수 있어 짧은 대기음을 직접 낸다(진행 중 통화 세션 안에서,
  /// 카테고리·경로를 바꾸지 않음).
  private func startBeep() {
    stopBeep()
    guard let data = Self.makeBeepWav() else { return }
    do {
      let player = try AVAudioPlayer(data: data)
      player.volume = 0.25
      player.prepareToPlay()
      beepPlayer = player
    } catch {
      log("ios_call_waiting_beep_unavailable", pending?.sessionId ?? "-", "err=\(error.localizedDescription)")
      return
    }
    beepPlayer?.play()
    beepTimer = Timer.scheduledTimer(withTimeInterval: Self.beepIntervalSeconds, repeats: true) { [weak self] _ in
      guard let self, let player = self.beepPlayer else { return }
      player.currentTime = 0
      player.play()
    }
  }

  private func stopBeep() {
    beepTimer?.invalidate()
    beepTimer = nil
    beepPlayer?.stop()
    beepPlayer = nil
  }

  /// 440Hz 짧은 두 번(0.15초 + 0.1초 쉼 + 0.15초) 16bit mono WAV.
  private static func makeBeepWav() -> Data? {
    let sampleRate = 16_000
    let tone = Int(Double(sampleRate) * 0.15)
    let gap = Int(Double(sampleRate) * 0.1)
    let total = tone * 2 + gap
    var samples = [Int16](repeating: 0, count: total)
    for i in 0..<total {
      let inTone = i < tone || i >= tone + gap
      guard inTone else { continue }
      let t = Double(i) / Double(sampleRate)
      let local = i < tone ? i : i - tone - gap
      let envelope = min(1.0, Double(local) / 160.0) * min(1.0, Double(tone - local) / 160.0)
      samples[i] = Int16(sin(2.0 * Double.pi * 440.0 * t) * 0.3 * envelope * Double(Int16.max))
    }
    var data = Data()
    func append<T>(_ value: T) {
      var v = value
      withUnsafeBytes(of: &v) { data.append(contentsOf: $0) }
    }
    let byteCount = total * 2
    data.append(contentsOf: Array("RIFF".utf8))
    append(UInt32(36 + byteCount).littleEndian)
    data.append(contentsOf: Array("WAVEfmt ".utf8))
    append(UInt32(16).littleEndian)
    append(UInt16(1).littleEndian)
    append(UInt16(1).littleEndian)
    append(UInt32(sampleRate).littleEndian)
    append(UInt32(sampleRate * 2).littleEndian)
    append(UInt16(2).littleEndian)
    append(UInt16(16).littleEndian)
    data.append(contentsOf: Array("data".utf8))
    append(UInt32(byteCount).littleEndian)
    for s in samples { append(s.littleEndian) }
    return data
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
  }

  private func log(_ event: String, _ sessionId: String, _ extra: String = "") {
    DibayCallLog.info(event, sessionId: sessionId, detail: extra)
  }
}
