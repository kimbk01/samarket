import AVFoundation
import UIKit

/** Native video incoming — OS mic + camera permission (Voice mic gate + camera). */
enum DibayVideoMediaPermission {
  static func ensureGranted(
    sessionId: String,
    context: DibayVoiceMicrophoneGateContext,
    completion: @escaping (Bool) -> Void
  ) {
    DibayVoiceMicrophonePermission.ensureGranted(sessionId: sessionId, context: context) { micGranted in
      guard micGranted else {
        completion(false)
        return
      }
      ensureCameraGranted(sessionId: sessionId, context: context, completion: completion)
    }
  }

  static func snapshot() -> (microphone: String, camera: String) {
    let mic: String
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: mic = "granted"
      case .denied: mic = "permanently_denied"
      case .undetermined: mic = "prompt_available"
      @unknown default: mic = "unknown"
      }
    } else {
      switch AVAudioSession.sharedInstance().recordPermission {
      case .granted: mic = "granted"
      case .denied: mic = "permanently_denied"
      case .undetermined: mic = "prompt_available"
      @unknown default: mic = "unknown"
      }
    }

    let cam: String
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: cam = "granted"
    case .denied, .restricted: cam = "permanently_denied"
    case .notDetermined: cam = "prompt_available"
    @unknown default: cam = "unknown"
    }
    return (mic, cam)
  }

  private static func ensureCameraGranted(
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

    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      NativeVideoCallLog.info("ios_native_video_camera_granted", callId: sessionId, details: "context=\(context)")
      runCompletion(true)
    case .denied, .restricted:
      NativeVideoCallLog.info(
        "ios_native_video_camera_permission_denied",
        callId: sessionId,
        details: "context=\(context) state=denied"
      )
      runCompletion(false)
    case .notDetermined:
      let timeout: TimeInterval
      switch context {
      case .outgoing, .foregroundIncoming:
        timeout = 20
      case .callKitBackgroundOrLocked:
        timeout = 3
      }
      NativeVideoCallLog.info(
        "ios_native_video_camera_request_started",
        callId: sessionId,
        details: "context=\(context) timeout_s=\(Int(timeout))"
      )
      requestCameraWithTimeout(sessionId: sessionId, context: context, timeout: timeout, completion: runCompletion)
    @unknown default:
      runCompletion(false)
    }
  }

  private static func requestCameraWithTimeout(
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
      NativeVideoCallLog.info(
        granted ? "ios_native_video_camera_request_granted" : "ios_native_video_camera_request_failed",
        callId: sessionId,
        details: "context=\(context) reason=\(reason)"
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

    AVCaptureDevice.requestAccess(for: .video) { granted in
      timer.cancel()
      finish(granted, reason: granted ? "os_granted" : "os_denied")
    }
  }
}
