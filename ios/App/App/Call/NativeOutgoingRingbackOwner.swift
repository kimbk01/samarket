import AVFoundation
import Foundation
import WebKit

/**
 * iOS outgoing ringback owner — SSOT custom/default/silent.
 * Parity with Android NativeOutgoingRingbackOwner.
 * Does not permanently own AVAudioSession (Call audio stays DibayCallAudioSessionController).
 */
final class NativeOutgoingRingbackOwner {
  static let shared = NativeOutgoingRingbackOwner()

  private let lock = NSLock()
  private var activeCallId: String?
  private var generation: UInt64 = 0
  private var engine: AVAudioEngine?
  private var playerNode: AVAudioPlayerNode?
  private var remotePlayer: AVAudioPlayer?

  private init() {}

  func start(callId: String, mediaType: String) {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return }
    let media = mediaType.lowercased().contains("video") ? "video" : "voice"

    lock.lock()
    if activeCallId == sid {
      lock.unlock()
      DibayCallLog.info("native_outgoing_ringback_start", sessionId: sid, detail: "mediaType=\(media) deduped=true")
      return
    }
    releaseLocked(reason: "replace")
    activeCallId = sid
    generation &+= 1
    let gen = generation
    lock.unlock()

    NativeMessengerCallSoundConfigFetcher.shared.fetchOutgoing(mediaType: media, callId: sid) { [weak self] policy in
      guard let self else { return }
      guard self.isStillActive(callId: sid, generation: gen) else { return }

      if !policy.enabled || policy.mode == "silent" {
        DibayCallLog.info(
          "native_outgoing_ringback_silent",
          sessionId: sid,
          detail: "mediaType=\(media) reason=admin_disabled"
        )
        return
      }

      if policy.mode == "custom", let urlString = policy.url, let url = URL(string: urlString) {
        self.startRemoteOrFallback(url: url, callId: sid, mediaType: media, generation: gen)
        return
      }

      self.startDefaultSynthetic(callId: sid, mediaType: media, generation: gen)
    }
  }

  func stop(callId: String?, reason: String) {
    let sid = (callId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    lock.lock()
    if !sid.isEmpty, let active = activeCallId, active != sid {
      lock.unlock()
      return
    }
    let stopped = activeCallId ?? sid
    releaseLocked(reason: reason)
    lock.unlock()
    if !stopped.isEmpty {
      DibayCallLog.info("native_outgoing_ringback_stop", sessionId: stopped, detail: "reason=\(reason)")
    }
  }

  // MARK: - Private

  private func isStillActive(callId: String, generation: UInt64) -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return generation == self.generation && activeCallId == callId
  }

  private func releaseLocked(reason: String) {
    generation &+= 1
    remotePlayer?.stop()
    remotePlayer = nil
    playerNode?.stop()
    playerNode = nil
    if let engine, engine.isRunning {
      engine.stop()
    }
    engine = nil
    activeCallId = nil
    _ = reason
  }

  private func startRemoteOrFallback(url: URL, callId: String, mediaType: String, generation: UInt64) {
    // Do not block call start on download — try async; on failure use default synthetic.
    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      do {
        let data = try Data(contentsOf: url, options: [.mappedIfSafe])
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("dibay-ringback-\(callId).audio")
        try data.write(to: tmp, options: .atomic)
        guard self.isStillActive(callId: callId, generation: generation) else { return }
        DispatchQueue.main.async {
          guard self.isStillActive(callId: callId, generation: generation) else { return }
          do {
            let player = try AVAudioPlayer(contentsOf: tmp)
            player.numberOfLoops = -1
            player.volume = 0.35
            player.prepareToPlay()
            guard player.play() else {
              self.startDefaultSynthetic(callId: callId, mediaType: mediaType, generation: generation)
              return
            }
            self.lock.lock()
            self.remotePlayer = player
            self.lock.unlock()
            DibayCallLog.info(
              "native_outgoing_ringback_start",
              sessionId: callId,
              detail: "mediaType=\(mediaType) source=custom_url deduped=false"
            )
          } catch {
            self.startDefaultSynthetic(callId: callId, mediaType: mediaType, generation: generation)
          }
        }
      } catch {
        guard self.isStillActive(callId: callId, generation: generation) else { return }
        self.startDefaultSynthetic(callId: callId, mediaType: mediaType, generation: generation)
      }
    }
  }

  /** WebAudio parity — dual sine pulse; not OS ringtone file. */
  private func startDefaultSynthetic(callId: String, mediaType: String, generation: UInt64) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { return }
      guard self.isStillActive(callId: callId, generation: generation) else { return }
      do {
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        let sampleRate: Double = 44100
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        engine.connect(player, to: engine.mainMixerNode, format: format)
        try engine.start()

        let freq: Double = mediaType == "video" ? 480 : 440
        let durationSec = 2.0
        let frameCount = AVAudioFrameCount(sampleRate * durationSec)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
          DibayCallLog.info(
            "native_outgoing_ringback_config_fetch_fail",
            sessionId: callId,
            detail: "reason=DEFAULT_RINGBACK_ASSET_BLOCKED mediaType=\(mediaType)"
          )
          return
        }
        buffer.frameLength = frameCount
        if let channel = buffer.floatChannelData?[0] {
          for i in 0..<Int(frameCount) {
            let t = Double(i) / sampleRate
            let envelope = min(1.0, t * 20.0) * max(0.0, 1.0 - max(0.0, t - (durationSec - 0.05)) * 20.0)
            channel[i] = Float(sin(2.0 * Double.pi * freq * t) * 0.18 * envelope)
          }
        }

        self.lock.lock()
        self.engine = engine
        self.playerNode = player
        self.lock.unlock()

        player.scheduleBuffer(buffer, at: nil, options: [.loops], completionHandler: nil)
        player.play()
        DibayCallLog.info(
          "native_outgoing_ringback_start",
          sessionId: callId,
          detail: "mediaType=\(mediaType) source=default_synthetic deduped=false"
        )
      } catch {
        DibayCallLog.info(
          "native_outgoing_ringback_config_fetch_fail",
          sessionId: callId,
          detail: "reason=DEFAULT_RINGBACK_ASSET_BLOCKED mediaType=\(mediaType)"
        )
      }
    }
  }
}

// MARK: - Config fetch (same API as Android)

final class NativeMessengerCallSoundConfigFetcher {
  static let shared = NativeMessengerCallSoundConfigFetcher()

  private var cachedAt: Date?
  private var cachedVoice: NativeOutgoingRingbackOwnerTonePolicy?
  private var cachedVideo: NativeOutgoingRingbackOwnerTonePolicy?
  private let cacheTtl: TimeInterval = 60

  private init() {}

  func fetchOutgoing(
    mediaType: String,
    callId: String,
    completion: @escaping (NativeOutgoingRingbackOwnerTonePolicy) -> Void
  ) {
    if let cachedAt,
       Date().timeIntervalSince(cachedAt) < cacheTtl,
       let policy = mediaType == "video" ? cachedVideo : cachedVoice
    {
      completion(policy)
      return
    }

    guard let origin = Self.resolveServerOrigin(),
          let url = URL(string: origin + "/api/app/messenger-call-sound-config")
    else {
      completion(.defaultEnabled)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.timeoutInterval = 4

    Self.resolveCookieHeader(origin: origin) { cookie in
      if let cookie, !cookie.isEmpty {
        request.setValue(cookie, forHTTPHeaderField: "Cookie")
      }
      URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
      guard let self else { return }
      let eventKey = mediaType == "video" ? "call_outgoing_video" : "call_outgoing_voice"
      var policy = NativeOutgoingRingbackOwnerTonePolicy.defaultEnabled
      defer {
        DispatchQueue.main.async { completion(policy) }
      }
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
            let data,
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            json["ok"] as? Bool == true,
            let config = json["config"] as? [String: Any]
      else {
        DibayCallLog.info(
          "native_outgoing_ringback_config_fetch_fail",
          sessionId: callId,
          detail: "reason=status_or_parse"
        )
        return
      }

      if let policies = config["policies"] as? [String: Any],
         let p = policies[eventKey] as? [String: Any]
      {
        let enabled = p["enabled"] as? Bool ?? true
        let mode = (p["mode"] as? String ?? p["ringtone_policy"] as? String ?? "default").lowercased()
        let urlStr = p["url"] as? String
        policy = NativeOutgoingRingbackOwnerTonePolicy(
          enabled: enabled && mode != "silent",
          mode: enabled ? mode : "silent",
          url: urlStr
        )
      } else {
        let enabledKey =
          mediaType == "video" ? "video_outgoing_ringback_enabled" : "voice_outgoing_ringback_enabled"
        let urlKey =
          mediaType == "video" ? "video_outgoing_ringback_url" : "voice_outgoing_ringback_url"
        let modeKey = mediaType == "video" ? "video_outgoing_mode" : "voice_outgoing_mode"
        let enabled = config[enabledKey] as? Bool ?? true
        let mode = (config[modeKey] as? String ?? "default").lowercased()
        let urlStr = config[urlKey] as? String
        policy = NativeOutgoingRingbackOwnerTonePolicy(
          enabled: enabled && mode != "silent",
          mode: !enabled || mode == "silent" ? "silent" : (urlStr?.isEmpty == false ? "custom" : "default"),
          url: urlStr
        )
      }

      self.cachedAt = Date()
      if mediaType == "video" {
        self.cachedVideo = policy
      } else {
        self.cachedVoice = policy
      }
      DibayCallLog.info(
        "native_outgoing_ringback_config_fetch_ok",
        sessionId: callId,
        detail: "mediaType=\(mediaType) mode=\(policy.mode)"
      )
    }.resume()
    }
  }

  private static func resolveServerOrigin() -> String? {
    guard let url = Bundle.main.url(forResource: "capacitor.config", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let server = root["server"] as? [String: Any],
      var origin = (server["url"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
      !origin.isEmpty
    else {
      return nil
    }
    while origin.hasSuffix("/") {
      origin.removeLast()
    }
    return origin
  }

  private static func resolveCookieHeader(origin: String, completion: @escaping (String?) -> Void) {
    DispatchQueue.main.async {
      let store = WKWebsiteDataStore.default().httpCookieStore
      store.getAllCookies { cookies in
        guard let host = URL(string: origin)?.host else {
          completion(nil)
          return
        }
        let matched = cookies.filter { cookie in
          let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
          return host == cookie.domain
            || host.hasSuffix(".\(domain)")
            || host == domain
        }
        if matched.isEmpty {
          completion(nil)
          return
        }
        completion(matched.map { "\($0.name)=\($0.value)" }.joined(separator: "; "))
      }
    }
  }
}

struct NativeOutgoingRingbackOwnerTonePolicy {
  let enabled: Bool
  let mode: String
  let url: String?

  static let defaultEnabled = NativeOutgoingRingbackOwnerTonePolicy(
    enabled: true,
    mode: "default",
    url: nil
  )
}
