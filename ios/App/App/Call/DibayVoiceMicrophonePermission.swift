import AVFoundation
import UserNotifications
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
   * Completion is always on the main queue. 미결정이면 OS 창의 답을 시간 제한 없이 기다린다(텔레그램 방식).
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
      // 텔레그램 방식 (Owner 2026-11-08): 시간 제한 없이 사용자의 답을 기다린다.
      // 예전 앱 20초·잠금 3초 시간초과 → 거절(세션 20f28db1)을 없앤다. 허용 → 진행, 거부 → 호출부가 끊고 설정 안내.
      DibayCallLog.info(
        "ios_native_voice_mic_request_started",
        sessionId: sessionId,
        detail: "context=\(context) timeout_s=none"
      )
      requestSystemRecordPermission { granted in
        DibayCallLog.info(
          granted ? "ios_native_voice_mic_request_granted" : "ios_native_voice_mic_request_failed",
          sessionId: sessionId,
          detail: "context=\(context) reason=\(granted ? "os_granted" : "os_denied")"
        )
        runCompletion(granted)
      }
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

/**
 * 통화 권한 거부 안내 — 텔레그램 방식 (Owner 2026-11-08).
 * 거부(또는 이미 꺼져 있음)로 통화를 걸 수 없거나 받은 통화가 끝났을 때:
 * - 앱이 화면에 있으면 「설정」 버튼이 있는 안내창
 * - 앱이 뒤에 있으면(잠금 화면 CallKit 등) 같은 문구의 로컬 알림
 * 이 안내는 OS 권한 창 이후의 안내다(OS 창 앞에 띄우는 사전 안내가 아님).
 */
enum DibayCallPermissionSettingsPrompt {
  enum Kind {
    case microphone
    case camera
  }

  /// 영상: 마이크가 꺼져 있으면 마이크 안내, 아니면 카메라 안내.
  static func kindForVideoDenial() -> Kind {
    return DibayVoiceMicrophonePermission.currentState() == .granted ? .camera : .microphone
  }

  static func present(kind: Kind, sessionId: String) {
    let title: String
    let body: String
    switch kind {
    case .microphone:
      title = "마이크 권한이 꺼져 있어요"
      body = "음성·영상 통화를 하려면 설정 > DiBaY에서 마이크를 켜 주세요."
    case .camera:
      title = "카메라 권한이 꺼져 있어요"
      body = "영상 통화를 하려면 설정 > DiBaY에서 카메라를 켜 주세요."
    }
    DibayCallLog.info("ios_call_permission_settings_prompt", sessionId: sessionId, detail: "kind=\(kind)")
    DispatchQueue.main.async {
      if UIApplication.shared.applicationState == .active, let top = topViewController() {
        let alert = UIAlertController(title: title, message: body, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "나중에", style: .cancel))
        alert.addAction(UIAlertAction(title: "설정", style: .default) { _ in
          if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
          }
        })
        top.present(alert, animated: true)
        return
      }
      let content = UNMutableNotificationContent()
      content.title = title
      content.body = body
      content.sound = .default
      let request = UNNotificationRequest(
        identifier: "dibay_call_permission_\(kind)_\(sessionId)",
        content: content,
        trigger: nil
      )
      UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
    }
  }

  private static func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow } ?? scenes.first?.windows.first
    var top = window?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}

/**
 * 받기 직후 권한 묻기 — 잠금 화면 받기 대응 (Owner 승인 2026-11-08 · 빌드 27).
 * 잠금 화면에서는 앱이 권한 창을 띄울 수 없어, 받기가 답을 기다리면 CallKit 이 시간 초과로 통화를 끝낸다
 * (빌드 26 세션 9f7ec2d0: 03:18:39 울림 → 03:18:56 거절, 받음 기록 없음).
 * 그래서 「아직 안 정함」이면 먼저 연결하고, 앱이 화면에 올라올 때(잠금 해제·앱 열기) OS 창을 띄운다.
 * 허용 → 통화 중 장치를 다시 켬 · 거부 → 통화 종료 + 「설정」 안내(텔레그램 방식).
 */
enum DibayDeferredCallMediaPermission {
  enum Lane {
    case voice
    case video
  }

  private static var observers: [String: NSObjectProtocol] = [:]

  /// 받기에서 「아직 안 정함」 권한이 있는지 — 있으면 먼저 연결하고 이 함수로 나중에 묻는다.
  static func hasUndetermined(lane: Lane) -> Bool {
    if DibayVoiceMicrophonePermission.currentState() == .notDetermined { return true }
    if lane == .video, AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined { return true }
    return false
  }

  static func scheduleAfterAccept(sessionId: String, lane: Lane) {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty, hasUndetermined(lane: lane) else { return }
    DispatchQueue.main.async {
      if UIApplication.shared.applicationState == .active {
        DibayCallLog.info("ios_call_deferred_permission_run_now", sessionId: sid, detail: "lane=\(lane)")
        run(sessionId: sid, lane: lane)
        return
      }
      DibayCallLog.info("ios_call_deferred_permission_wait_active", sessionId: sid, detail: "lane=\(lane)")
      if let old = observers.removeValue(forKey: sid) {
        NotificationCenter.default.removeObserver(old)
      }
      observers[sid] = NotificationCenter.default.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { _ in
        if let token = observers.removeValue(forKey: sid) {
          NotificationCenter.default.removeObserver(token)
        }
        guard isCallActive(sessionId: sid, lane: lane) else {
          DibayCallLog.info("ios_call_deferred_permission_call_gone", sessionId: sid, detail: "lane=\(lane)")
          return
        }
        run(sessionId: sid, lane: lane)
      }
    }
  }

  private static func isCallActive(sessionId: String, lane: Lane) -> Bool {
    switch lane {
    case .voice:
      return NativeVoiceCallRuntime.shared.snapshot().session?.sessionId == sessionId
    case .video:
      return NativeVideoCallRuntime.shared.snapshot().session?.sessionId == sessionId
    }
  }

  private static func run(sessionId: String, lane: Lane) {
    requestMicIfNeeded { micGranted in
      guard micGranted else {
        endForDenial(sessionId: sessionId, lane: lane, kind: .microphone)
        return
      }
      guard lane == .video else {
        NativeVoiceCallAgoraEngine.shared.restartLocalAudioCapture(callId: sessionId)
        return
      }
      requestCameraIfNeeded { camGranted in
        guard camGranted else {
          endForDenial(sessionId: sessionId, lane: lane, kind: .camera)
          return
        }
        NativeVideoCallAgoraEngine.shared.restartLocalMediaCapture(callId: sessionId)
      }
    }
  }

  private static func requestMicIfNeeded(completion: @escaping (Bool) -> Void) {
    switch DibayVoiceMicrophonePermission.currentState() {
    case .granted:
      completion(true)
    case .denied:
      completion(false)
    case .notDetermined:
      if #available(iOS 17.0, *) {
        AVAudioApplication.requestRecordPermission { granted in
          DispatchQueue.main.async { completion(granted) }
        }
      } else {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
          DispatchQueue.main.async { completion(granted) }
        }
      }
    }
  }

  private static func requestCameraIfNeeded(completion: @escaping (Bool) -> Void) {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
      completion(true)
    case .notDetermined:
      AVCaptureDevice.requestAccess(for: .video) { granted in
        DispatchQueue.main.async { completion(granted) }
      }
    default:
      completion(false)
    }
  }

  private static func endForDenial(sessionId: String, lane: Lane, kind: DibayCallPermissionSettingsPrompt.Kind) {
    DibayCallLog.info("ios_call_deferred_permission_denied_end", sessionId: sessionId, detail: "lane=\(lane) kind=\(kind)")
    switch lane {
    case .voice:
      NativeVoiceIncomingCallCoordinator.shared.handleRejectOrEnd(sessionId: sessionId) {}
    case .video:
      NativeVideoCallKitBridge.requestEnd(callId: sessionId, kind: "end")
    }
    DibayCallPermissionSettingsPrompt.present(kind: kind, sessionId: sessionId)
  }
}
