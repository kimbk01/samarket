import Foundation
import UIKit
import AgoraRtcKit

protocol NativeVideoCallAgoraEngineListener: AnyObject {
  func onConnected()
  func onRemoteVideoReady()
  func onDisconnected(reason: String)
  func onError(reason: String)
  /// N-4: 발신자 본인 채널 입장 성공(상대 응답 전). 기본 빈 구현 — 수신 쪽은 쓰지 않음.
  func onLocalJoined()
}

extension NativeVideoCallAgoraEngineListener {
  func onLocalJoined() {}
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
  private var remoteUidByCallId: [String: UInt] = [:]
  /// 카메라 끄기 설계 §4-1 (docs/audit/call-camera-off-plan-2026-11-14.md) — 통화 id 단위 단일 보관소.
  /// 화면(VC)은 PiP 복귀·최소화 복귀·잠금 해제 때 새로 만들어지므로 상태를 여기서만 읽는다. 값이 없으면 켜짐.
  private var localCameraOnByCall: [String: Bool] = [:]
  private var remoteCameraOnByCall: [String: Bool] = [:]
  /// 마이크 설계 §12 — 통화별 음소거 상태. 값이 없으면 음소거 아님.
  private var micMutedByCall: [String: Bool] = [:]
  /// 입장 옵션에 넣은 카메라 공개 값 — 입장 성공 시 그사이 바뀐 상태를 맞춘다.
  private var joinPublishedCamera = true
  private var networkQualityHandler: ((_ worst: Int, _ tx: Int, _ rx: Int) -> Void)?

  private override init() {
    super.init()
  }

  func setNetworkQualityHandler(_ handler: ((_ worst: Int, _ tx: Int, _ rx: Int) -> Void)?) {
    lock.lock()
    networkQualityHandler = handler
    lock.unlock()
  }

  func peekOccupantCallId() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let sid = activeCallId, !sid.isEmpty else { return nil }
    return sid
  }

  // MARK: - PiP frame tap (additive only — 기존 렌더/delegate/Voice 무수정)

  /// 시스템 PiP 전용 원격 프레임 델리게이트 등록. Voice 레인 점유 시 거부(격리 가드).
  /// 비어있는 frame delegate 슬롯만 사용하며 기존 rendering 설정을 덮어쓰지 않는다.
  @discardableResult
  func startPipFrameTap(_ delegate: AgoraVideoFrameDelegate) -> Bool {
    if NativeVoiceCallAgoraEngine.shared.peekOccupantCallId() != nil { return false }
    lock.lock()
    let rtc = engine
    lock.unlock()
    guard let rtc else { return false }
    _ = rtc.setVideoFrameDelegate(delegate)
    return true
  }

  /// PiP 프레임 델리게이트 해제(nil). idempotent.
  func stopPipFrameTap() {
    lock.lock()
    let rtc = engine
    lock.unlock()
    _ = rtc?.setVideoFrameDelegate(nil)
  }

  /// 현재 통화의 원격 uid(프레임 필터용). 기존 remoteUidByCallId 읽기 전용 접근자.
  func currentRemoteUid(callId: String) -> UInt? {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    defer { lock.unlock() }
    return remoteUidByCallId[sid]
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
    leave(callId: nil, reason: reason, notifyListener: notifyListener)
  }

  /// §2-3 소유권: `callId` 가 현재 점유자와 다르면 이탈하지 않는다. `nil` 은 점유자 무관(기존 동작).
  func leave(callId: String?, reason: String, notifyListener: Bool = true) {
    let currentListener: NativeVideoCallAgoraEngineListener?
    let sid: String?
    let rtc: AgoraRtcEngineKit?
    let shouldDestroySharedEngine: Bool

    lock.lock()
    if let requested = callId?.trimmingCharacters(in: .whitespacesAndNewlines), !requested.isEmpty,
      let occupant = activeCallId, !occupant.isEmpty, occupant != requested
    {
      lock.unlock()
      NativeVideoCallLog.info(
        "agora_leave_skip_foreign_occupant",
        callId: requested,
        details: "occupant=\(occupant) reason=\(reason)"
      )
      return
    }
    currentListener = notifyListener ? listener : nil
    sid = activeCallId
    listener = nil
    activeCallId = nil
    callerJoinActive = false
    remoteVideoRendered = false
    localPreviewAttached = false
    pendingRemoteUids.removeAll()
    if let sid, !sid.isEmpty {
      remoteUidByCallId.removeValue(forKey: sid)
      localCameraOnByCall.removeValue(forKey: sid)
      remoteCameraOnByCall.removeValue(forKey: sid)
      micMutedByCall.removeValue(forKey: sid)
    }
    joinPublishedCamera = true
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

  // MARK: - Camera state (설계 docs/audit/call-camera-off-plan-2026-11-14.md §4)

  func isLocalCameraOn(callId: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    defer { lock.unlock() }
    return localCameraOnByCall[sid] ?? true
  }

  func isRemoteCameraOn(callId: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    defer { lock.unlock() }
    return remoteCameraOnByCall[sid] ?? true
  }

  /// §4-2 카메라 켜기·끄기의 유일한 함수. 입장 전(발신 연결 중)이면 상태만 저장하고 입장 때 반영한다.
  /// - Returns: 적용 후 실제 카메라 상태 (SDK 실패 시 이전 상태로 되돌린 값)
  @discardableResult
  func setCameraEnabled(callId: String, on: Bool) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return true }
    lock.lock()
    let previous = localCameraOnByCall[sid] ?? true
    localCameraOnByCall[sid] = on
    guard let rtc = engine, activeCallId == sid else {
      lock.unlock()
      NativeVideoCallLog.info("camera_toggle", callId: sid, details: "enabled=\(on) applied=deferred_until_join")
      return on
    }
    let ok = on ? applyLocalCameraOnLocked(rtc: rtc, callId: sid) : applyLocalCameraOffLocked(rtc: rtc, callId: sid)
    var result = on
    if !ok {
      localCameraOnByCall[sid] = previous
      if previous {
        _ = applyLocalCameraOnLocked(rtc: rtc, callId: sid)
      } else {
        _ = applyLocalCameraOffLocked(rtc: rtc, callId: sid)
      }
      result = previous
    }
    // 켜기·끄기 모두 미리보기 화면을 새로 붙여야 하므로(끄기 = VC 가 화면 제거) 붙임 표시를 지운다.
    localPreviewAttached = false
    lock.unlock()
    if ok {
      NativeVideoCallLog.info("camera_toggle", callId: sid, details: "enabled=\(on) applied=engine")
    } else {
      NativeVideoCallLog.warn("camera_apply_failed", callId: sid, details: "requested=\(on) restored=\(previous)")
    }
    if result {
      attachLocalPreviewIfUiReady(callId: sid)
    }
    return result
  }

  /// 입장 전(joinChannel 전) — 공개 설정은 입장 옵션이 맡는다.
  private func applyLocalCameraBeforeJoin(rtc: AgoraRtcEngineKit, callId: String, on: Bool) {
    let enable = rtc.enableLocalVideo(on)
    let mute = rtc.muteLocalVideoStream(!on)
    NativeVideoCallLog.info("native_video_camera_join_applied", callId: callId, details: "on=\(on) enable=\(enable) mute=\(mute)")
  }

  /// Agora 공식: 송출 중단 후 캡처 장치 끄기. 호출자는 lock 보유.
  private func applyLocalCameraOffLocked(rtc: AgoraRtcEngineKit, callId: String) -> Bool {
    let mute = rtc.muteLocalVideoStream(true)
    let enable = rtc.enableLocalVideo(false)
    NativeVideoCallLog.info("native_video_camera_off_applied", callId: callId, details: "mute=\(mute) enable=\(enable)")
    return mute == 0 && enable == 0
  }

  /// Agora 공식: enableLocalVideo(true) 뒤 updateChannelMediaOptions 로 카메라 공개를 다시 지정해야 상대에게 나간다.
  /// 호출자는 lock 보유.
  private func applyLocalCameraOnLocked(rtc: AgoraRtcEngineKit, callId: String) -> Bool {
    let enable = rtc.enableLocalVideo(true)
    let preview = rtc.startPreview()
    let options = AgoraRtcChannelMediaOptions()
    options.publishCameraTrack = true
    let publish = rtc.updateChannel(with: options)
    let mute = rtc.muteLocalVideoStream(false)
    NativeVideoCallLog.info(
      "native_video_camera_on_applied",
      callId: callId,
      details: "enable=\(enable) preview=\(preview) publish=\(publish) mute=\(mute)"
    )
    return enable == 0 && publish == 0 && mute == 0
  }

  /// 입장 성공 — 입장 옵션을 정한 뒤 바뀐 카메라 상태를 맞춘다.
  private func reconcileLocalCameraAfterJoin(callId: String) {
    lock.lock()
    guard let rtc = engine, activeCallId == callId else {
      lock.unlock()
      return
    }
    let on = localCameraOnByCall[callId] ?? true
    guard on != joinPublishedCamera else {
      lock.unlock()
      return
    }
    if on {
      _ = applyLocalCameraOnLocked(rtc: rtc, callId: callId)
    } else {
      _ = applyLocalCameraOffLocked(rtc: rtc, callId: callId)
    }
    joinPublishedCamera = on
    localPreviewAttached = false
    lock.unlock()
    NativeVideoCallLog.info("native_video_camera_join_reconcile", callId: callId, details: "on=\(on)")
    if on { attachLocalPreviewIfUiReady(callId: callId) }
    NativeVideoCallUiHost.cameraStateChanged(callId: callId)
  }

  /// Agora onRemoteVideoStateChanged → 상대 카메라 상태 (Android `NativeVideoCameraState` 와 같은 규칙).
  /// true 켜짐 · false 꺼짐 · nil 바꾸지 않음 (FROZEN·FAILED·퇴장·초기 STOPPED 등 — 네트워크 멈춤은 꺼짐 아님).
  static func remoteCameraOn(state: Int, reason: Int) -> Bool? {
    let stopped = 0, starting = 1, decoding = 2
    let remoteMuted = 5, remoteUnmuted = 6
    if state == stopped && reason == remoteMuted { return false }
    if reason == remoteUnmuted { return true }
    if state == starting || state == decoding { return true }
    return nil
  }

  private func updateRemoteCamera(callId: String, uid: UInt, on: Bool, source: String) {
    lock.lock()
    guard activeCallId == callId else {
      lock.unlock()
      return
    }
    let previous = remoteCameraOnByCall[callId] ?? true
    remoteCameraOnByCall[callId] = on
    lock.unlock()
    guard previous != on else { return }
    NativeVideoCallLog.info("remote_camera_changed", callId: callId, details: "uid=\(uid) on=\(on) source=\(source)")
    DispatchQueue.main.async {
      NativeVideoCallUiHost.cameraStateChanged(callId: callId)
    }
  }

  /// 통화 중 마이크·카메라 권한을 새로 허용받은 뒤 — 녹음·카메라 장치를 다시 켠다 (Owner 2026-11-08).
  func restartLocalMediaCapture(callId: String) {
    let requested = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    let sid = activeCallId
    let rtc = engine
    lock.unlock()
    guard let rtc, let sid, !sid.isEmpty, sid == requested else { return }
    let audioOff = rtc.enableLocalAudio(false)
    let audioOn = rtc.enableLocalAudio(true)
    // 카메라 끄기 설계 §4-3: 사용자가 끈 카메라를 권한 재시작이 다시 켜지 않는다.
    guard isLocalCameraOn(callId: sid) else {
      NativeVideoCallLog.info(
        "ios_native_video_local_media_restarted",
        callId: sid,
        details: "audio=\(audioOff)/\(audioOn) video=skipped_camera_off"
      )
      return
    }
    let videoOff = rtc.enableLocalVideo(false)
    lock.lock()
    let ok = applyLocalCameraOnLocked(rtc: rtc, callId: sid)
    localPreviewAttached = false
    lock.unlock()
    NativeVideoCallLog.info(
      "ios_native_video_local_media_restarted",
      callId: sid,
      details: "audio=\(audioOff)/\(audioOn) videoOff=\(videoOff) videoOn=\(ok)"
    )
    attachLocalPreviewNowIfNeeded(callId: sid)
  }

  func isMicMuted(callId: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    defer { lock.unlock() }
    return micMutedByCall[sid] ?? false
  }

  /// 마이크 설계 §12 — 음소거의 유일한 함수. 입장 전(발신 연결 중)이면 상태만 저장하고 입장 때 반영한다.
  /// - Returns: 적용 후 실제 음소거 상태 (SDK 실패 시 이전 상태)
  @discardableResult
  func setMicMuted(callId: String, muted: Bool) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    lock.lock()
    defer { lock.unlock() }
    let previous = micMutedByCall[sid] ?? false
    guard let rtc = engine, activeCallId == sid else {
      micMutedByCall[sid] = muted
      NativeVideoCallLog.info("native_video_mic_mute_applied", callId: sid, details: "muted=\(muted) applied=deferred_until_join")
      return muted
    }
    let result = rtc.muteLocalAudioStream(muted)
    NativeVideoCallLog.info("native_video_mic_mute_applied", callId: sid, details: "muted=\(muted) result=\(result)")
    guard result == 0 else { return previous }
    micMutedByCall[sid] = muted
    return muted
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

  /**
   * CUT-6F — fullscreen VC dismissed for PiP released the UIView, but Agora lane stays joined.
   * Clear the UI-attach latch so restore can setupLocalVideo onto the new VC without leave/join.
   */
  func noteLocalPreviewSurfaceReleased(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    lock.lock()
    if activeCallId == sid {
      localPreviewAttached = false
    }
    lock.unlock()
  }

  /** Main-thread restore path — no extra async hop (CUT-6F restore-ready). */
  func attachLocalPreviewNowIfNeeded(callId: String) {
    guard Thread.isMainThread else {
      attachLocalPreviewIfUiReady(callId: callId)
      return
    }
    attachLocalPreviewOnMain(callId: callId)
  }

  func reattachRemoteVideo(callId: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    lock.lock()
    let uid = remoteUidByCallId[sid]
    lock.unlock()
    guard let uid, uid != 0 else { return }
    scheduleRemoteVideoSetup(uid: uid, callId: sid)
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
      // 마이크 설계 §12: 새 통화는 해제로 시작, 발신 연결 중 누른 음소거는 여기서 반영.
      let micMutedAtJoin = isMicMuted(callId: sid)
      let micResult = rtc.muteLocalAudioStream(micMutedAtJoin)
      NativeVideoCallLog.info("native_video_mic_mute_reset", callId: sid, details: "muted=\(micMutedAtJoin) result=\(micResult)")
      rtc.enableVideo()
      // 카메라 끄기 설계 §4-2: 엔진은 통화 사이에 재사용 — 매 입장 때 카메라 상태를 명시 적용한다.
      // 발신자가 연결 전에 끈 값도 보관소에 있으므로 여기서 반영된다.
      let cameraOnAtJoin = isLocalCameraOn(callId: sid)
      applyLocalCameraBeforeJoin(rtc: rtc, callId: sid, on: cameraOnAtJoin)
      rtc.setDefaultAudioRouteToSpeakerphone(true)
      NativeVideoCallLog.info("audio_route_applied", callId: sid, details: "speaker=true")

      let previewReady = DispatchSemaphore(value: 0)
      let previewWork = { [weak self] in
        defer { previewReady.signal() }
        guard let self else { return }
        if !cameraOnAtJoin {
          NativeVideoCallLog.info("local_preview_skipped", callId: sid, details: "reason=camera_off")
        } else if NativeVideoCallUiHost.isShowing(callId: sid) {
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
      options.publishCameraTrack = cameraOnAtJoin
      lock.lock()
      if activeCallId == sid { joinPublishedCamera = cameraOnAtJoin }
      lock.unlock()

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

  private func markRemoteVideoRendered(
    uid: UInt,
    callId: String,
    generation expected: UInt64,
    width: Int,
    height: Int,
    details: String
  ) {
    let currentListener: NativeVideoCallAgoraEngineListener?
    let callerJoin: Bool
    lock.lock()
    guard activeCallId == callId, generation == expected, !remoteVideoRendered else {
      lock.unlock()
      return
    }
    remoteVideoRendered = true
    currentListener = listener
    callerJoin = callerJoinActive
    lock.unlock()
    NativeVideoCallLog.info("remote_video_render_ready", callId: callId, details: "uid=\(uid)\(details)")
    if callerJoin {
      NativeVideoCallUiHost.outgoingRemoteFirstFrameReady(callId: callId, uid: uid, width: width, height: height)
    }
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
    // 카메라 끄기 설계 §4-3: 꺼진 카메라는 미리보기를 다시 시작하지 않는다 (PiP·최소화 복귀·잠금 해제·연결 모든 경로).
    guard isLocalCameraOn(callId: sid) else {
      NativeVideoCallLog.info("local_preview_skipped", callId: sid, details: "reason=camera_off")
      return
    }
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
    lock.lock()
    remoteUidByCallId[sid] = uid
    lock.unlock()
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
    reconcileLocalCameraAfterJoin(callId: sid)

    if callerJoin {
      NativeVideoCallLog.info("caller_agora_local_join_success", callId: sid, details: "awaiting_remote_user")
      // N-4: 입장 성공 신호만 전달(타이머 교체뿐 — 정리·엔진 조작 없음).
      currentListener?.onLocalJoined()
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
    // Server media evidence (both roles) — additive; UI/runtime connected path below unchanged.
    NativeVideoCallApi.reportMediaConnectedOnce(callId: sid, remoteUid: uid)
    if callerJoin {
      NativeVideoCallUiHost.outgoingRemoteUserJoined(callId: sid, uid: uid)
      currentListener?.onConnected()
    }
    scheduleRemoteVideoSetup(uid: uid, callId: sid)
    if !callerJoin {
      markRemoteVideoRendered(
        uid: uid,
        callId: sid,
        generation: gen,
        width: 0,
        height: 0,
        details: " source=user_joined"
      )
    }
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
      width: Int(size.width),
      height: Int(size.height),
      details: " width=\(Int(size.width)) height=\(Int(size.height))"
    )
  }

  func rtcEngine(
    _ engine: AgoraRtcEngineKit,
    firstLocalVideoFrameWith size: CGSize,
    elapsed: Int,
    sourceType: AgoraVideoSourceType
  ) {
    let sid: String?
    let callerJoin: Bool
    lock.lock()
    sid = activeCallId
    callerJoin = callerJoinActive
    lock.unlock()
    guard let sid, callerJoin else { return }
    NativeVideoCallUiHost.outgoingLocalFirstFrameReady(
      callId: sid,
      width: Int(size.width),
      height: Int(size.height)
    )
  }

  /// 카메라 끄기 설계 §4-5 — 상대 카메라 꺼짐은 STOPPED + REMOTE_MUTED(5) 만 (네트워크 멈춤 FROZEN 은 아님).
  func rtcEngine(
    _ engine: AgoraRtcEngineKit,
    remoteVideoStateChangedOfUid uid: UInt,
    state: AgoraVideoRemoteState,
    reason: AgoraVideoRemoteReason,
    elapsed: Int
  ) {
    lock.lock()
    let sid = activeCallId
    lock.unlock()
    guard let sid, uid != 0 else { return }
    NativeVideoCallLog.info(
      "agora_remote_video_state",
      callId: sid,
      details: "uid=\(uid) state=\(state.rawValue) reason=\(reason.rawValue)"
    )
    guard let on = Self.remoteCameraOn(state: Int(state.rawValue), reason: Int(reason.rawValue)) else { return }
    updateRemoteCamera(callId: sid, uid: uid, on: on, source: "video_state")
  }

  /// 상대가 송출을 멈춤/재개 — 이미 꺼진 상대에 늦게 입장한 경우의 보조 신호.
  func rtcEngine(_ engine: AgoraRtcEngineKit, didVideoMuted muted: Bool, byUid uid: UInt) {
    lock.lock()
    let sid = activeCallId
    lock.unlock()
    guard let sid, uid != 0 else { return }
    NativeVideoCallLog.info("agora_remote_user_mute_video", callId: sid, details: "uid=\(uid) muted=\(muted)")
    updateRemoteCamera(callId: sid, uid: uid, on: !muted, source: "user_mute")
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didOfflineOfUid uid: UInt, reason: AgoraUserOfflineReason) {
    let sid: String?
    let currentListener: NativeVideoCallAgoraEngineListener?
    lock.lock()
    sid = activeCallId
    currentListener = listener
    lock.unlock()
    guard let sid else { return }
    // D-4: 리스너가 정리(leave → destroy)까지 하므로 SDK 콜백 밖에서 실행 — 음성 `709343629`
    // (SDK 콜백 안 destroy 미반환, 실기기 0967abd8·73b8f544)와 같은 규칙. 그사이 다른 통화로 바뀌었으면 건너뜀.
    let reasonText = "remote_offline=\(reason.rawValue)"
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      self.lock.lock()
      let stillActive = self.activeCallId == sid
      self.lock.unlock()
      guard stillActive else {
        NativeVideoCallLog.info("agora_remote_offline_skipped", callId: sid, details: "reason=not_active")
        return
      }
      currentListener?.onDisconnected(reason: reasonText)
    }
  }

  /// D-3 (연결 중 6초 원인 미확정): 연결 상태 변화 시각 기록만 — 동작 무변경. 통화 id·상태·사유 숫자만(토큰·사용자 정보 없음).
  func rtcEngine(
    _ engine: AgoraRtcEngineKit,
    connectionChangedTo state: AgoraConnectionState,
    reason: AgoraConnectionChangedReason
  ) {
    let sid: String?
    lock.lock()
    sid = activeCallId
    let gen = generation
    lock.unlock()
    NativeVideoCallLog.info(
      "agora_connection_state",
      callId: sid ?? "",
      details: "state=\(state.rawValue) reason=\(reason.rawValue)"
    )
    // I3: 연결 실패(SDK 가 재연결을 포기) = 치명. 끊김·재연결 중은 SDK 에 맡긴다.
    guard let sid, CallTerminationPolicy.isAgoraFatalConnectionState(state.rawValue) else { return }
    let reasonText = "agora_connection_failed reason=\(reason.rawValue)"
    DispatchQueue.main.async { [weak self] in
      self?.fail(callId: sid, generation: gen, reason: reasonText)
    }
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didOccurError errorCode: AgoraErrorCode) {
    let sid: String?
    let gen: UInt64
    lock.lock()
    sid = activeCallId
    gen = generation
    lock.unlock()
    guard let sid else { return }
    // I3: 치명 오류만 통화를 끝낸다(MEDIA_FATAL). 그 외 오류 코드는 기록만.
    guard CallTerminationPolicy.isAgoraFatalError(errorCode.rawValue) else {
      NativeVideoCallLog.info("agora_error_nonfatal", callId: sid, details: "agora_error=\(errorCode.rawValue)")
      return
    }
    fail(callId: sid, generation: gen, reason: "agora_error=\(errorCode.rawValue)")
  }

  func rtcEngine(
    _ engine: AgoraRtcEngineKit,
    networkQuality uid: UInt,
    txQuality: AgoraNetworkQuality,
    rxQuality: AgoraNetworkQuality
  ) {
    guard uid == 0 else { return }
    let tx = Int(txQuality.rawValue)
    let rx = Int(rxQuality.rawValue)
    let worst = max(tx, rx)
    lock.lock()
    let handler = networkQualityHandler
    lock.unlock()
    guard let handler else { return }
    DispatchQueue.main.async { handler(worst, tx, rx) }
  }
}
