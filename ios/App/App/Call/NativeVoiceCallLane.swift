import Foundation

enum NativeVoiceCallLane {
  private static var cachedEnabled: Bool?
  private static var cachedOutgoingEnabled: Bool?

  static func isEnabled() -> Bool {
    if let cached = cachedEnabled { return cached }
    let enabled = readLaneBool(key: "nativeVoiceRuntime")
    cachedEnabled = enabled
    return enabled
  }

  static func isOutgoingEnabled() -> Bool {
    if let cached = cachedOutgoingEnabled { return cached }
    let enabled = readLaneBool(key: "nativeVoiceOutgoingRuntime")
    cachedOutgoingEnabled = enabled
    return enabled
  }

  static func isVoiceMediaType(_ mediaType: String) -> Bool {
    let normalized = mediaType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return normalized == "voice" || normalized == "audio"
  }

  static func isOutgoingVoiceLaneActive(mediaType: String) -> Bool {
    isEnabled() && isOutgoingEnabled() && isVoiceMediaType(mediaType)
  }

  private static func readLaneBool(key: String) -> Bool {
    guard
      let url = Bundle.main.url(forResource: "dibay-call-lane", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return false }
    return json[key] as? Bool ?? false
  }
}
