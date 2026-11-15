import AVFoundation
import Foundation

/** AVAudioSession for active voice/video calls */
final class DibayCallAudioSessionController {
  static let shared = DibayCallAudioSessionController()

  private static let outgoingActivationTimeoutSeconds: TimeInterval = 8

  private var interruptionObserver: NSObjectProtocol?
  private let gateLock = NSLock()
  private var callKitSessionActivated = false
  private var pendingOutgoingJoinSessionId: String?
  private var pendingOutgoingJoinWork: (() -> Void)?
  private var pendingOutgoingJoinTimeout: (() -> Void)?
  private var activationTimeoutWorkItem: DispatchWorkItem?

  private init() {
    registerInterruptionObserver()
  }

  deinit {
    if let observer = interruptionObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  func activateForCall(video: Bool) {
    let session = AVAudioSession.sharedInstance()
    do {
      let mode: AVAudioSession.Mode = video ? .videoChat : .voiceChat
      // Voice must NOT defaultToSpeaker (receiver contract). Video keeps speaker default.
      var options: AVAudioSession.CategoryOptions = [.allowBluetooth]
      if video {
        options.insert(.defaultToSpeaker)
      }
      try session.setCategory(.playAndRecord, mode: mode, options: options)
      try session.setActive(true)
      DibayCallLog.info("ios_audio_session_activated", detail: "video=\(video ? "true" : "false")")
    } catch {
      DibayCallLog.info("ios_audio_session_failed", detail: "err=\(error.localizedDescription)")
    }
  }

  /** Native Voice V1 — prepare category/mode; CallKit `didActivate` owns setActive(true). */
  func prepareForNativeVoiceCall() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
      activateWithoutCallKitIfNeeded(session, detail: "video=false")
      DibayCallLog.info("ios_audio_session_prepared", detail: "video=false")
    } catch {
      DibayCallLog.info("ios_audio_session_failed", detail: "err=\(error.localizedDescription)")
    }
  }

  /** Native Video incoming — prepare category/mode; CallKit `didActivate` owns setActive(true). */
  func prepareForNativeVideoCall() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .videoChat,
        options: [.allowBluetooth, .defaultToSpeaker]
      )
      activateWithoutCallKitIfNeeded(session, detail: "video=true")
      DibayCallLog.info("ios_audio_session_prepared", detail: "video=true")
    } catch {
      DibayCallLog.info("ios_audio_session_failed", detail: "err=\(error.localizedDescription)")
    }
  }

  /**
   * Outgoing ringback only — activate session + built-in route BEFORE ringback play.
   * EXTERNAL BT/wired → preserve. VOICE → receiver. VIDEO → speaker.
   * Does not own CallKit incoming ringtone.
   */
  func prepareOutgoingRingbackRoute(mediaType: String, callId: String) {
    let media = Self.canonicalRingbackMedia(mediaType)
    let session = AVAudioSession.sharedInstance()
    do {
      if media == "video" {
        try session.setCategory(
          .playAndRecord,
          mode: .videoChat,
          options: [.allowBluetooth, .defaultToSpeaker]
        )
      } else {
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
      }
      try session.setActive(true, options: [])

      if Self.hasExternalAudioRoute(session) {
        DibayCallLog.info(
          "ringback_route_prepare",
          sessionId: callId,
          detail: "media=\(media) route=external"
        )
        return
      }

      if media == "video" {
        try session.overrideOutputAudioPort(.speaker)
        DibayCallLog.info(
          "ringback_route_prepare",
          sessionId: callId,
          detail: "media=video route=speaker"
        )
      } else {
        try session.overrideOutputAudioPort(.none)
        DibayCallLog.info(
          "ringback_route_prepare",
          sessionId: callId,
          detail: "media=voice route=receiver"
        )
      }
    } catch {
      DibayCallLog.info(
        "ringback_route_prepare",
        sessionId: callId,
        detail: "media=\(media) route=failed err=\(error.localizedDescription)"
      )
    }
  }

  /** Clear ringback-only speaker override when ringback stops (non-connected). */
  func clearOutgoingRingbackRouteOverride() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.overrideOutputAudioPort(.none)
    } catch {
      /* best-effort */
    }
  }

  static func canonicalRingbackMedia(_ mediaType: String) -> String {
    if NativeVideoCallLane.isVideoMediaType(mediaType) { return "video" }
    if NativeVoiceCallLane.isVoiceMediaType(mediaType) { return "voice" }
    let normalized = mediaType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return normalized.contains("video") ? "video" : "voice"
  }

  private static func hasExternalAudioRoute(_ session: AVAudioSession) -> Bool {
    for output in session.currentRoute.outputs {
      switch output.portType {
      case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .headphones, .headsetMic, .usbAudio:
        return true
      default:
        continue
      }
    }
    return false
  }

  /** Clears outgoing join gate state — call at outgoing start and after native voice cleanup. */
  func resetOutgoingJoinGate() {
    gateLock.lock()
    activationTimeoutWorkItem?.cancel()
    activationTimeoutWorkItem = nil
    pendingOutgoingJoinSessionId = nil
    pendingOutgoingJoinWork = nil
    pendingOutgoingJoinTimeout = nil
    callKitSessionActivated = false
    gateLock.unlock()
  }

  /**
   * Outgoing only — defer Agora join until CallKit `didActivate`.
   * Incoming path never registers; `notifyCallKitDidActivate()` is a no-op flush.
   */
  func registerPendingOutgoingJoin(
    sessionId: String,
    work: @escaping () -> Void,
    onTimeout: @escaping () -> Void
  ) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }

    gateLock.lock()
    pendingOutgoingJoinSessionId = sid
    pendingOutgoingJoinWork = work
    pendingOutgoingJoinTimeout = onTimeout
    let alreadyActivated = callKitSessionActivated
    gateLock.unlock()

    DibayCallLog.info("ios_audio_session_gate_registered", sessionId: sid)

    // D3 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md): Mac 은 CallKit `didActivate` 가
    // 오지 않는다(2026-11-15 실측 — 8초 gate timeout 으로 발신 실패). 앱이 세션을 직접 활성화하고
    // `didActivate` 도착과 같은 flush 를 한다. iPhone·iPad 는 아래 기존 CallKit gate 그대로.
    if !DibayCallPlatformCapability.supportsCallKitAudioActivation {
      activateSessionWithoutCallKit(sessionId: sid)
      DibayCallLog.warn(
        "ios_audio_session_gate_flush_immediate",
        sessionId: sid,
        detail: "reason=platform_no_callkit_activation"
      )
      flushPendingOutgoingJoin()
      return
    }

    if alreadyActivated {
      DibayCallLog.info(
        "ios_audio_session_gate_flush_immediate",
        sessionId: sid,
        detail: "reason=callkit_already_active"
      )
      flushPendingOutgoingJoin()
      return
    }

    startActivationTimeout(sessionId: sid)
  }

  /** CallKit activated the session — shared entry for incoming (no-op) and outgoing (flush join). */
  func notifyCallKitDidActivate() {
    DibayCallLog.info("ios_audio_session_callkit_activated")
    gateLock.lock()
    callKitSessionActivated = true
    gateLock.unlock()
    flushPendingOutgoingJoin()
  }

  func noteCallKitDidDeactivate() {
    DibayCallLog.info("ios_audio_session_callkit_deactivated")
  }

  func deactivateAfterNativeVoiceCall() {
    resetOutgoingJoinGate()
    deactivate()
  }

  func deactivate() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setActive(false, options: .notifyOthersOnDeactivation)
    } catch {
      /* best-effort */
    }
  }

  // MARK: - Private

  /// D2-3 — 수락 직후 오디오 준비. iPhone·iPad 는 CallKit `didActivate` 가 `setActive(true)` 를 맡고,
  /// 맥은 CallKit 이 없으므로 여기서 직접 켠다(D3 발신 gate 와 같은 원리).
  private func activateWithoutCallKitIfNeeded(_ session: AVAudioSession, detail: String) {
    guard !DibayCallPlatformCapability.supportsCallKitAudioActivation else { return }
    do {
      try session.setActive(true)
      DibayCallLog.warn("ios_audio_session_activated_without_callkit", detail: "prepare \(detail)")
    } catch {
      DibayCallLog.warn(
        "ios_audio_session_activate_without_callkit_failed",
        detail: "prepare \(detail) err=\(error.localizedDescription)"
      )
    }
  }

  /// Mac 전용(D3) — CallKit 이 하던 `setActive(true)` 를 앱이 한다. category·mode 는 발신 링백 준비
  /// (`prepareOutgoingRingbackRoute`)가 이미 설정했으므로 바꾸지 않는다.
  private func activateSessionWithoutCallKit(sessionId: String) {
    do {
      try AVAudioSession.sharedInstance().setActive(true)
      DibayCallLog.warn("ios_audio_session_activated_without_callkit", sessionId: sessionId)
    } catch {
      DibayCallLog.warn(
        "ios_audio_session_activate_without_callkit_failed",
        sessionId: sessionId,
        detail: "err=\(error.localizedDescription)"
      )
    }
  }

  private func flushPendingOutgoingJoin() {
    gateLock.lock()
    activationTimeoutWorkItem?.cancel()
    activationTimeoutWorkItem = nil
    guard let work = pendingOutgoingJoinWork else {
      gateLock.unlock()
      return
    }
    let sid = pendingOutgoingJoinSessionId ?? ""
    pendingOutgoingJoinWork = nil
    pendingOutgoingJoinSessionId = nil
    pendingOutgoingJoinTimeout = nil
    gateLock.unlock()

    DibayCallLog.info("ios_audio_session_gate_flushed", sessionId: sid)
    work()
  }

  private func startActivationTimeout(sessionId: String) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let workItem = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.gateLock.lock()
      let timedOut = self.pendingOutgoingJoinSessionId == sid && self.pendingOutgoingJoinWork != nil
      let timeout = self.pendingOutgoingJoinTimeout
      self.pendingOutgoingJoinWork = nil
      self.pendingOutgoingJoinSessionId = nil
      self.pendingOutgoingJoinTimeout = nil
      self.activationTimeoutWorkItem = nil
      self.gateLock.unlock()
      guard timedOut else { return }
      DibayCallLog.warn("ios_audio_session_gate_timeout", sessionId: sid)
      timeout?()
    }

    gateLock.lock()
    activationTimeoutWorkItem?.cancel()
    activationTimeoutWorkItem = workItem
    gateLock.unlock()

    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.outgoingActivationTimeoutSeconds,
      execute: workItem
    )
  }

  private func registerInterruptionObserver() {
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { notification in
      guard
        let userInfo = notification.userInfo,
        let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
        let type = AVAudioSession.InterruptionType(rawValue: typeValue)
      else { return }

      switch type {
      case .began:
        DibayCallLog.info("ios_audio_session_interruption_began")
      case .ended:
        let optsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt
        let shouldResume = optsValue.map { AVAudioSession.InterruptionOptions(rawValue: $0).contains(.shouldResume) } ?? false
        DibayCallLog.info(
          "ios_audio_session_interruption_ended",
          detail: "shouldResume=\(shouldResume ? "true" : "false")"
        )
        if shouldResume {
          self.handleInterruptionEnded(shouldResume: true)
        }
      @unknown default:
        break
      }
    }
  }

  func handleInterruptionEnded(shouldResume: Bool) {
    guard shouldResume else { return }
    let video = DibayActiveCallSessionManager.shared.mediaType == "video"
    activateForCall(video: video)
  }
}
