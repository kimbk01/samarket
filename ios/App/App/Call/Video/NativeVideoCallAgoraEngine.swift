import Foundation
import UIKit
import AgoraRtcKit

protocol NativeVideoCallAgoraEngineListener: AnyObject {
  func onConnected()
  func onRemoteVideoReady()
  func onDisconnected(reason: String)
  func onError(reason: String)
}

/**
 * Phase B3 — Agora iOS wrapper for video-only Native Runtime.
 *
 * CONTRACT (Voice LOCK separation):
 * - Separate class from `NativeVoiceCallAgoraEngine` — do not extend or modify Voice engine.
 * - iOS Agora exposes a process-wide `sharedEngine` singleton; Android uses distinct RtcEngine instances.
 * - Video `leave()` calls `AgoraRtcEngineKit.destroy()` ONLY when Voice lane is unoccupied
 *   (`NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() == nil`).
 * - Video `join()` is rejected while Voice lane is occupied to avoid stomping Voice media config.
 *
 * Lane guard: `NativeCallAgoraLaneGuard` (Voice↔Video symmetric join + shared destroy gate).
 */
final class NativeVideoCallAgoraEngine: NSObject {
  static let shared = NativeVideoCallAgoraEngine()

  private let lock = NSLock()
  private var engine: AgoraRtcEngineKit?
  private var activeCallId: String?
  private var generation: UInt64 = 0
  private weak var listener: NativeVideoCallAgoraEngineListener?
  private var callerJoinActive = false
  private var remoteVideoRendered = false
  private var ownsSharedEngineDestroy = false
  private var localPreviewAttached = false
  private var pendingRemoteUids: [UInt] = []

  private override init() {
    super.init()
  }

  func peekOccupantCallId() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let sid = activeCallId, !sid.isEmpty else { return nil }
    return sid
  }

  @discardableResult
  func join(
    callId: String,
    token: NativeVideoCallApi.TokenConnection,
    listener nextListener: NativeVideoCallAgoraEngineListener
  ) -> (ok: Bool, generation: UInt64, error: String?) {
    joinInternal(callId: callId, token: token, listener: nextListener, caller: false)
  }

  @discardableResult
  func joinCaller(
    callId: String,
    token: NativeVideoCallApi.TokenConnection,
    listener nextListener: NativeVideoCallAgoraEngineListener
  ) -> (ok: Bool, generation: UInt64, error: String?) {
    joinInternal(callId: callId, token: token, listener: nextListener, caller: true)
  }

  func leave(reason: String, notifyListener: Bool = true) {
    let currentListener: NativeVideoCallAgoraEngineListener?
    let sid: String?
    let rtc: AgoraRtcEngineKit?
    let shouldDestroySharedEngine: Bool

    lock.lock()
    currentListener = notifyListener ? listener : nil
    sid = activeCallId
    listener = nil
    activeCallId = nil
    callerJoinActive = false
    remoteVideoRendered = false
    localPreviewAttached = false
    pendingRemoteUids.removeAll()
    generation &+= 1
    rtc = engine
    shouldDestroySharedEngine = ownsSharedEngineDestroy
    engine = nil
    ownsSharedEngineDestroy = false
    lock.unlock()

    if let rtc {
      NativeVideoCallUiHost.clearVideoSurfaces(callId: sid ?? "")
      rtc.stopPreview()
      rtc.leaveChannel(nil)
      tearDownSharedEngineIfAllowed(rtc: rtc, shouldDestroySharedEngine: shouldDestroySharedEngine, callId: sid)
    }

    if let sid, !sid.isEmpty {
      NativeVideoCallLog.info(
        "agora_native_leave",
        callId: sid,
        details: "reason=\(reason.isEmpty ? "leave" : reason)"
      )
    }
    if let currentListener, sid != nil {
      currentListener.onDisconnected(reason: reason.isEmpty ? "leave" : reason)
    }
  }

  func matches(callId: String, generation expected: UInt64) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return activeCallId == callId.trimmingCharacters(in: .whitespacesAndNewlines) && generation == expected
  }

  func setCameraEnabled(_ enabled: Bool) {
    lock.lock()
    let sid = activeCallId
    let rtc = engine
    lock.unlock()
    guard let rtc, let sid, !sid.isEmpty else { return }
    rtc.muteLocalVideoStream(!enabled)
    NativeVideoCallLog.info("camera_toggle", callId: sid, details: "enabled=\(enabled)")
  }

  func switchCameraFacing() {
    lock.lock()
    let sid = activeCallId
    let rtc = engine
    lock.unlock()
    guard let rtc, let sid, !sid.isEmpty else { return }
    let result = rtc.switchCamera()
    NativeVideoCallLog.info("camera_facing_switch", callId: sid, details: "result=\(result)")
  }

  func attachLocalPreviewIfUiReady(callId: String) {
    DispatchQueue.main.async { [weak self] in
      self?.attachLocalPreviewOnMain(callId: callId)
    }
  }

  func onRemoteRenderSurfaceReady(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    lock.lock()
    guard activeCallId == sid else {
      lock.unlock()
      return
    }
    let uids = pendingRemoteUids
    pendingRemoteUids.removeAll()
    lock.unlock()
    for uid in uids where uid != 0 {
      scheduleRemoteVideoSetup(uid: uid, callId: sid)
    }
  }

  // MARK: - Private

  private func joinInternal(
    callId: String,
    token: NativeVideoCallApi.TokenConnection,
    listener nextListener: NativeVideoCallAgoraEngineListener,
    caller: Bool
  ) -> (ok: Bool, generation: UInt64, error: String?) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return (false, 0, "invalid_call_id") }

    switch NativeCallAgoraLaneGuard.prepareJoin(callId: sid, lane: .video) {
    case .busy:
      return (false, 0, "voice_lane_occupied")
    case .idempotentSkip:
      lock.lock()
      let gen = generation
      lock.unlock()
      return (true, gen, nil)
    case .proceed:
      break
    }

    lock.lock()
    if let existing = activeCallId, !existing.isEmpty, existing != sid {
      lock.unlock()
      return (false, 0, "video_lane_occupied")
    }
    listener = nextListener
    activeCallId = sid
    generation &+= 1
    let gen = generation
    callerJoinActive = caller
    remoteVideoRendered = false
    lock.unlock()

    if caller {
      NativeVideoCallLog.info("caller_agora_native_join_start", callId: sid, details: "channel=\(token.channelName)")
    } else {
      NativeVideoCallLog.info("agora_native_join_start", callId: sid, details: "channel=\(token.channelName)")
    }

    do {
      let rtc = try ensureEngine(appId: token.appId)
      rtc.enableAudio()
      rtc.enableVideo()
      rtc.setDefaultAudioRouteToSpeakerphone(true)
      NativeVideoCallLog.info("audio_route_applied", callId: sid, details: "speaker=true")

      let previewReady = DispatchSemaphore(value: 0)
      let previewWork = { [weak self] in
        defer { previewReady.signal() }
        guard let self else { return }
        if NativeVideoCallUiHost.isShowing(callId: sid) {
          self.attachLocalPreviewOnMain(callId: sid, rtc: rtc, callerJoin: caller)
        } else if !NativeVideoCallUiHost.canPresentVideoSurfaces() {
          NativeVideoCallLog.info("local_camera_preview_deferred_locked", callId: sid)
        } else if caller {
          NativeVideoCallLog.info("no_ui_preview_skipped", callId: sid)
          rtc.startPreview()
        } else {
          rtc.startPreview()
        }
      }
      if Thread.isMainThread {
        previewWork()
      } else {
        DispatchQueue.main.async(execute: previewWork)
        previewReady.wait()
      }

      let options = AgoraRtcChannelMediaOptions()
      options.channelProfile = .communication
      options.clientRoleType = .broadcaster
      options.autoSubscribeAudio = true
      options.autoSubscribeVideo = true
      options.publishMicrophoneTrack = true
      options.publishCameraTrack = true

      let result = rtc.joinChannel(
        byToken: token.token,
        channelId: token.channelName,
        userAccount: token.uid,
        mediaOptions: options,
        joinSuccess: nil
      )
      if result != 0 {
        fail(callId: sid, generation: gen, reason: "join_return=\(result)")
        return (false, gen, "join_return=\(result)")
      }
      return (true, gen, nil)
    } catch {
      fail(callId: sid, generation: gen, reason: String(describing: type(of: error)))
      return (false, gen, String(describing: type(of: error)))
    }
  }

  private func ensureEngine(appId: String) throws -> AgoraRtcEngineKit {
    lock.lock()
    defer { lock.unlock() }
    if let engine { return engine }
    let rtc = AgoraRtcEngineKit.sharedEngine(withAppId: appId, delegate: self)
    rtc.setChannelProfile(.communication)
    engine = rtc
    ownsSharedEngineDestroy = true
    return rtc
  }

  private func tearDownSharedEngineIfAllowed(
    rtc: AgoraRtcEngineKit,
    shouldDestroySharedEngine: Bool,
    callId: String?
  ) {
    guard shouldDestroySharedEngine else { return }
    guard NativeCallAgoraLaneGuard.shouldDestroySharedEngine(leavingLane: .video, leavingCallId: callId) else {
      return
    }
    _ = rtc
    AgoraRtcEngineKit.destroy()
  }

  private func fail(callId: String, generation expected: UInt64, reason: String) {
    let currentListener: NativeVideoCallAgoraEngineListener?
    lock.lock()
    guard activeCallId == callId, generation == expected else {
      lock.unlock()
      return
    }
    currentListener = listener
    lock.unlock()
    NativeVideoCallLog.warn("error_terminal", callId: callId, details: "reason=\(reason)")
    currentListener?.onError(reason: reason)
  }

  private func markRemoteVideoRendered(uid: UInt, callId: String, generation expected: UInt64, details: String) {
    let currentListener: NativeVideoCallAgoraEngineListener?
    lock.lock()
    guard activeCallId == callId, generation == expected, !remoteVideoRendered else {
      lock.unlock()
      return
    }
    remoteVideoRendered = true
    currentListener = listener
    lock.unlock()
    NativeVideoCallLog.info("remote_video_render_ready", callId: callId, details: "uid=\(uid)\(details)")
    currentListener?.onRemoteVideoReady()
  }

  private func attachLocalPreviewOnMain(callId: String, rtc: AgoraRtcEngineKit? = nil, callerJoin: Bool = false) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    lock.lock()
    let engineRtc = rtc ?? engine
    let isCaller = callerJoin || callerJoinActive
    let alreadyAttached = localPreviewAttached
    lock.unlock()
    guard let engineRtc else { return }
    if alreadyAttached { return }
    guard NativeVideoCallUiHost.canPresentVideoSurfaces() else { return }
    guard NativeVideoCallUiHost.isShowing(callId: sid) else { return }

    let localView = UIView(frame: .zero)
    localView.backgroundColor = .black
    let canvas = AgoraRtcVideoCanvas()
    canvas.view = localView
    canvas.renderMode = .hidden
    canvas.uid = 0
    engineRtc.setupLocalVideo(canvas)
    NativeVideoCallUiHost.attachLocalView(callId: sid, view: localView)
    engineRtc.startPreview()
    lock.lock()
    localPreviewAttached = true
    lock.unlock()
    if isCaller {
      NativeVideoCallLog.info("caller_local_camera_preview_started", callId: sid)
    } else {
      NativeVideoCallLog.info("local_camera_preview_started", callId: sid)
    }
    NativeVideoCallLog.info("local_camera_publish_success", callId: sid)
  }

  private func scheduleRemoteVideoSetup(uid: UInt, callId: String) {
    DispatchQueue.main.async { [weak self] in
      self?.setupRemoteVideo(uid: uid, callId: callId)
    }
  }

  private func setupRemoteVideo(uid: UInt, callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    guard activeCallId == sid, let rtc = engine else {
      lock.unlock()
      return
    }
    lock.unlock()
    guard uid != 0 else { return }
    guard NativeVideoCallUiHost.ensureVideoRootForRemoteRender(callId: sid) else {
      lock.lock()
      if activeCallId == sid, !pendingRemoteUids.contains(uid) {
        pendingRemoteUids.append(uid)
      }
      lock.unlock()
      return
    }
    let remoteView = UIView(frame: .zero)
    remoteView.backgroundColor = .black
    let canvas = AgoraRtcVideoCanvas()
    canvas.view = remoteView
    canvas.renderMode = .hidden
    canvas.uid = uid
    rtc.setupRemoteVideo(canvas)
    NativeVideoCallUiHost.attachRemoteView(callId: sid, view: remoteView)
  }
}

extension NativeVideoCallAgoraEngine: AgoraRtcEngineDelegate {
  func rtcEngine(_ engine: AgoraRtcEngineKit, didJoinChannel channel: String, withUid uid: UInt, elapsed: Int) {
    let sid: String?
    let gen: UInt64
    let callerJoin: Bool
    let currentListener: NativeVideoCallAgoraEngineListener?
    lock.lock()
    sid = activeCallId
    gen = generation
    callerJoin = callerJoinActive
    currentListener = listener
    lock.unlock()
    guard let sid else { return }

    NativeVideoCallLog.info(
      "agora_native_join_success",
      callId: sid,
      details: "channel=\(channel) uid=\(uid)"
    )

    if callerJoin {
      NativeVideoCallLog.info("caller_agora_local_join_success", callId: sid, details: "awaiting_remote_user")
      return
    }
    currentListener?.onConnected()
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didJoinedOfUid uid: UInt, elapsed: Int) {
    let sid: String?
    let gen: UInt64
    let callerJoin: Bool
    let currentListener: NativeVideoCallAgoraEngineListener?
    lock.lock()
    sid = activeCallId
    gen = generation
    callerJoin = callerJoinActive
    currentListener = listener
    lock.unlock()
    guard let sid, uid != 0 else { return }

    NativeVideoCallLog.info("remote_user_joined", callId: sid, details: "uid=\(uid)")
    if callerJoin {
      currentListener?.onConnected()
    }
    scheduleRemoteVideoSetup(uid: uid, callId: sid)
    markRemoteVideoRendered(uid: uid, callId: sid, generation: gen, details: " source=user_joined")
  }

  func rtcEngine(
    _ engine: AgoraRtcEngineKit,
    firstRemoteVideoFrameOfUid uid: UInt,
    size: CGSize,
    elapsed: Int
  ) {
    let sid: String?
    let gen: UInt64
    lock.lock()
    sid = activeCallId
    gen = generation
    lock.unlock()
    guard let sid, uid != 0 else { return }
    scheduleRemoteVideoSetup(uid: uid, callId: sid)
    markRemoteVideoRendered(
      uid: uid,
      callId: sid,
      generation: gen,
      details: " width=\(Int(size.width)) height=\(Int(size.height))"
    )
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didOfflineOfUid uid: UInt, reason: AgoraUserOfflineReason) {
    let sid: String?
    let currentListener: NativeVideoCallAgoraEngineListener?
    lock.lock()
    sid = activeCallId
    currentListener = listener
    lock.unlock()
    guard sid != nil else { return }
    currentListener?.onDisconnected(reason: "remote_offline=\(reason.rawValue)")
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didOccurError errorCode: AgoraErrorCode) {
    let sid: String?
    let gen: UInt64
    lock.lock()
    sid = activeCallId
    gen = generation
    lock.unlock()
    guard let sid else { return }
    fail(callId: sid, generation: gen, reason: "agora_error=\(errorCode.rawValue)")
  }
}
