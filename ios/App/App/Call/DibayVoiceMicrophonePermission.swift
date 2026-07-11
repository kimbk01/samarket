import AVFoundation
import UIKit

/// OS microphone permission for native voice — no DIBAY UI; system modal only.
enum DibayVoiceMicrophonePermissionState: Equatable {
  case granted
  case denied
  case notDetermined
}

/// Where the user initiated voice audio — drives timeout and request policy.
enum DibayVoiceMicrophoneGateContext: Equatable {
  case outgoing
  case foregroundIncoming
  case callKitBackgroundOrLocked
}

enum DibayVoiceMicrophonePermission {
  private static let foregroundRequestTimeoutSeconds: TimeInterval = 20
  private static let callKitBackgroundRequestTimeoutSeconds: TimeInterval = 3

  static func currentState() -> DibayVoiceMicrophonePermissionState {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        return .granted
      case .denied:
        return .denied
      case .undetermined:
        return .notDetermined
      @unknown default:
        return .denied
      }
    }
    switch AVAudioSession.sharedInstance().recordPermission {
    case .granted:
      return .granted
    case .denied:
      return .denied
    case .undetermined:
      return .notDetermined
    @unknown default:
      return .denied
    }
  }

  /// CallKit answer path — `.active` only when app is foreground; else background/lock tier.
  static func resolveIncomingAnswerContext() -> DibayVoiceMicrophoneGateContext {
    let appState = UIApplication.shared.applicationState
    if appState == .active {
      return .foregroundIncoming
    }
    return .callKitBackgroundOrLocked
  }

  /**
   * Ensures microphone is granted before Agora / accept pipeline.
   * Completion is always on the main queue. Never blocks CallKit indefinitely.
   */
  static func ensureGranted(
    sessionId: String,
    context: DibayVoiceMicrophoneGateContext,
    completion: @escaping (Bool) -> Void
  ) {
    let runCompletion: (Bool) -> Void = { granted in
      if Thread.isMainThread {
        completion(granted)
      } else {
        DispatchQueue.main.async { completion(granted) }
      }
    }

    let state = currentState()
    switch state {
    case .granted:
      DibayCallLog.info(
        "ios_native_voice_mic_granted",
        sessionId: sessionId,
        detail: "context=\(context)"
      )
      runCompletion(true)
      return
    case .denied:
      DibayCallLog.info(
        "ios_native_voice_mic_permission_denied",
        sessionId: sessionId,
        detail: "context=\(context) state=denied"
      )
      runCompletion(false)
      return
    case .notDetermined:
      let timeout: TimeInterval
      switch context {
      case .outgoing, .foregroundIncoming:
        timeout = foregroundRequestTimeoutSeconds
      case .callKitBackgroundOrLocked:
        timeout = callKitBackgroundRequestTimeoutSeconds
      }
      DibayCallLog.info(
        "ios_native_voice_mic_request_started",
        sessionId: sessionId,
        detail: "context=\(context) timeout_s=\(Int(timeout))"
      )
      requestSystemPermissionWithTimeout(sessionId: sessionId, context: context, timeout: timeout, completion: runCompletion)
    }
  }

  private static func requestSystemPermissionWithTimeout(
    sessionId: String,
    context: DibayVoiceMicrophoneGateContext,
    timeout: TimeInterval,
    completion: @escaping (Bool) -> Void
  ) {
    let finishLock = NSLock()
    var finished = false

    func finish(_ granted: Bool, reason: String) {
      finishLock.lock()
      defer { finishLock.unlock() }
      guard !finished else { return }
      finished = true
      DibayCallLog.info(
        granted ? "ios_native_voice_mic_request_granted" : "ios_native_voice_mic_request_failed",
        sessionId: sessionId,
        detail: "context=\(context) reason=\(reason)"
      )
      completion(granted)
    }

    let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.main)
    timer.schedule(deadline: .now() + timeout)
    timer.setEventHandler {
      timer.cancel()
      finish(false, reason: "timeout")
    }
    timer.resume()

    requestSystemRecordPermission { granted in
      timer.cancel()
      finish(granted, reason: granted ? "os_granted" : "os_denied")
    }
  }

  private static func requestSystemRecordPermission(completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { granted in
        completion(granted)
      }
      return
    }
    AVAudioSession.sharedInstance().requestRecordPermission { granted in
      completion(granted)
    }
  }
}
