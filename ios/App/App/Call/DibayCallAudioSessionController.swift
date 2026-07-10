import AVFoundation
import Foundation

/** AVAudioSession for active voice/video calls */
final class DibayCallAudioSessionController {
  static let shared = DibayCallAudioSessionController()

  private var interruptionObserver: NSObjectProtocol?

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
      try session.setCategory(.playAndRecord, mode: mode, options: [.allowBluetooth, .defaultToSpeaker])
      try session.setActive(true)
      NSLog("[DIBAY_CALL] ios_audio_session_activated video=%@", video ? "true" : "false")
    } catch {
      NSLog("[DIBAY_CALL] ios_audio_session_failed err=%@", error.localizedDescription)
    }
  }

  /** Native Voice V1 — prepare category/mode; CallKit `didActivate` owns setActive(true). */
  func prepareForNativeVoiceCall() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth])
      NSLog("[DIBAY_CALL] ios_audio_session_prepared video=false")
    } catch {
      NSLog("[DIBAY_CALL] ios_audio_session_failed err=%@", error.localizedDescription)
    }
  }

  /** CallKit activated the session — do not re-setActive aggressively. */
  func noteCallKitDidActivate() {
    NSLog("[DIBAY_CALL] ios_audio_session_callkit_activated")
  }

  func noteCallKitDidDeactivate() {
    NSLog("[DIBAY_CALL] ios_audio_session_callkit_deactivated")
  }

  func deactivateAfterNativeVoiceCall() {
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
        NSLog("[DIBAY_CALL] ios_audio_session_interruption_began")
      case .ended:
        let optsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt
        let shouldResume = optsValue.map { AVAudioSession.InterruptionOptions(rawValue: $0).contains(.shouldResume) } ?? false
        NSLog("[DIBAY_CALL] ios_audio_session_interruption_ended shouldResume=%@", shouldResume ? "true" : "false")
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
