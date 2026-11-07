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
      // 텔레그램 방식 (Owner 2026-11-08): 시간 제한 없이 사용자의 답을 기다린다(마이크 허용 뒤 카메라).
      NativeVideoCallLog.info(
        "ios_native_video_camera_request_started",
        callId: sessionId,
        details: "context=\(context) timeout_s=none"
      )
      AVCaptureDevice.requestAccess(for: .video) { granted in
        NativeVideoCallLog.info(
          granted ? "ios_native_video_camera_request_granted" : "ios_native_video_camera_request_failed",
          callId: sessionId,
          details: "context=\(context) reason=\(granted ? "os_granted" : "os_denied")"
        )
        runCompletion(granted)
      }
    @unknown default:
      runCompletion(false)
    }
  }

}
