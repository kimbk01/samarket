import Foundation
import AgoraRtcKit

protocol NativeVoiceCallAgoraEngineListener: AnyObject {
  func onLocalJoined()
  func onRemoteJoined()
  func onConnected()
  func onDisconnected(reason: String)
  func onError(reason: String)
}

/**
 * Agora iOS wrapper for voice-only Native Runtime.
 * Contract mirrors Android `NativeVoiceCallAgoraEngine` (callee: local join → connected).
 */
final class NativeVoiceCallAgoraEngine: NSObject {
  static let shared = NativeVoiceCallAgoraEngine()

  private let lock = NSLock()
  private var engine: AgoraRtcEngineKit?
  private var activeCallId: String?
  private var generation: UInt64 = 0
  private weak var listener: NativeVoiceCallAgoraEngineListener?
  private var localJoined = false
  private var connectedEmitted = false
  private var callerJoinActive = false

  private override init() {
    super.init()
  }

  func peekOccupantCallId() -> String? {
    lock.lock()
    defer { lock.unlock() }
    guard let sid = activeCallId, !sid.isEmpty else { return nil }
    return sid
  }

  /// Returns generation for stale-callback checks. Join request accepted when return code == 0.
  @discardableResult
  func join(
    callId: String,
    token: NativeVoiceCallApi.TokenConnection,
    listener nextListener: NativeVoiceCallAgoraEngineListener
  ) -> (ok: Bool, generation: UInt64, error: String?) {
    joinInternal(callId: callId, token: token, listener: nextListener, caller: false)
  }

  /// Outgoing caller join — connected after remote user joins (Android `joinCaller` parity).
  @discardableResult
  func joinCaller(
    callId: String,
    token: NativeVoiceCallApi.TokenConnection,
    listener nextListener: NativeVoiceCallAgoraEngineListener
  ) -> (ok: Bool, generation: UInt64, error: String?) {
    joinInternal(callId: callId, token: token, listener: nextListener, caller: true)
  }

  @discardableResult
  private func joinInternal(
    callId: String,
    token: NativeVoiceCallApi.TokenConnection,
    listener nextListener: NativeVoiceCallAgoraEngineListener,
    caller: Bool
  ) -> (ok: Bool, generation: UInt64, error: String?) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return (false, 0, "invalid_call_id") }

    switch NativeCallAgoraLaneGuard.prepareJoin(callId: sid, lane: .voice) {
    case .busy(let reason):
      return (false, 0, reason)
    case .idempotentSkip:
      lock.lock()
      let gen = generation
      lock.unlock()
      return (true, gen, nil)
    case .proceed:
      break
    }

    lock.lock()
    listener = nextListener
    activeCallId = sid
    generation &+= 1
    let gen = generation
    localJoined = false
    connectedEmitted = false
    callerJoinActive = caller
    lock.unlock()

    if caller {
      DibayCallLog.infoCall("ios_native_voice_caller_agora_join_start", callId: sid, detail: "channel=\(token.channelName)")
    }

    do {
      let rtc = try ensureEngine(appId: token.appId)
      rtc.enableAudio()
      rtc.disableVideo()
      rtc.setDefaultAudioRouteToSpeakerphone(false)

      let options = AgoraRtcChannelMediaOptions()
      options.channelProfile = .communication
      options.clientRoleType = .broadcaster
      options.autoSubscribeAudio = true
      options.autoSubscribeVideo = false
      options.publishMicrophoneTrack = true
      options.publishCameraTrack = false

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

  func leave(reason: String, notifyListener: Bool = true) {
    let currentListener: NativeVoiceCallAgoraEngineListener?
    let sid: String?
    lock.lock()
    currentListener = notifyListener ? listener : nil
    sid = activeCallId
    listener = nil
    activeCallId = nil
    localJoined = false
    connectedEmitted = false
    callerJoinActive = false
    generation &+= 1
    if let rtc = engine {
      rtc.leaveChannel(nil)
      if NativeCallAgoraLaneGuard.shouldDestroySharedEngine(leavingLane: .voice, leavingCallId: sid) {
        AgoraRtcEngineKit.destroy()
      }
      engine = nil
    }
    lock.unlock()
    if let sid, !sid.isEmpty {
      DibayCallLog.info(
        "ios_native_voice_agora_leave",
        sessionId: sid,
        detail: "reason=\(reason.isEmpty ? "leave" : reason)"
      )
    }
    if let currentListener, sid != nil {
      currentListener.onDisconnected(reason: reason.isEmpty ? "leave" : reason)
    }
  }

  func matches(callId: String, generation expected: UInt64) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return activeCallId == callId && generation == expected
  }

  // MARK: - Private

  private func ensureEngine(appId: String) throws -> AgoraRtcEngineKit {
    lock.lock()
    defer { lock.unlock() }
    if let engine { return engine }
    let rtc = AgoraRtcEngineKit.sharedEngine(withAppId: appId, delegate: self)
    rtc.setChannelProfile(.communication)
    engine = rtc
    return rtc
  }

  private func fail(callId: String, generation expected: UInt64, reason: String) {
    let currentListener: NativeVoiceCallAgoraEngineListener?
    lock.lock()
    guard activeCallId == callId, generation == expected else {
      lock.unlock()
      return
    }
    currentListener = listener
    lock.unlock()
    currentListener?.onError(reason: reason)
  }

  private func emitConnectedIfNeeded(callId: String, generation expected: UInt64, callerJoin: Bool) {
    let currentListener: NativeVoiceCallAgoraEngineListener?
    lock.lock()
    guard activeCallId == callId, generation == expected, !connectedEmitted else {
      lock.unlock()
      return
    }
    if callerJoin {
      lock.unlock()
      return
    }
    connectedEmitted = true
    currentListener = listener
    lock.unlock()
    currentListener?.onConnected()
  }

  private func emitCallerConnectedIfNeeded(callId: String, generation expected: UInt64) {
    let currentListener: NativeVoiceCallAgoraEngineListener?
    lock.lock()
    guard activeCallId == callId, generation == expected, callerJoinActive, !connectedEmitted else {
      lock.unlock()
      return
    }
    connectedEmitted = true
    currentListener = listener
    lock.unlock()
    currentListener?.onConnected()
  }
}

extension NativeVoiceCallAgoraEngine: AgoraRtcEngineDelegate {
  func rtcEngine(_ engine: AgoraRtcEngineKit, didJoinChannel channel: String, withUid uid: UInt, elapsed: Int) {
    let sid: String?
    let gen: UInt64
    let currentListener: NativeVoiceCallAgoraEngineListener?
    let callerJoin: Bool
    lock.lock()
    sid = activeCallId
    gen = generation
    currentListener = listener
    localJoined = true
    callerJoin = callerJoinActive
    lock.unlock()
    guard let sid else { return }
    currentListener?.onLocalJoined()
    if callerJoin {
      DibayCallLog.infoCall("ios_native_voice_caller_agora_local_join_success", callId: sid, detail: "awaiting_remote_user")
      return
    }
    // Incoming callee contract (Android): local join success → connected.
    emitConnectedIfNeeded(callId: sid, generation: gen, callerJoin: false)
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didJoinedOfUid uid: UInt, elapsed: Int) {
    let sid: String?
    let gen: UInt64
    let currentListener: NativeVoiceCallAgoraEngineListener?
    let callerJoin: Bool
    lock.lock()
    sid = activeCallId
    gen = generation
    currentListener = listener
    callerJoin = callerJoinActive
    lock.unlock()
    guard let sid, uid != 0 else { return }
    currentListener?.onRemoteJoined()
    if callerJoin {
      DibayCallLog.infoCall("ios_native_voice_remote_user_joined", callId: sid, detail: "uid=\(uid)")
      emitCallerConnectedIfNeeded(callId: sid, generation: gen)
      return
    }
    emitConnectedIfNeeded(callId: sid, generation: gen, callerJoin: false)
  }

  func rtcEngine(_ engine: AgoraRtcEngineKit, didOfflineOfUid uid: UInt, reason: AgoraUserOfflineReason) {
    let sid: String?
    let currentListener: NativeVoiceCallAgoraEngineListener?
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
