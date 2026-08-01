import Foundation

/**
 * VoIP / CallKit incoming caller identity — single resolver.
 * CONTRACT: displayName must never be a call-kind label (`영상 통화` / `음성 통화` / …).
 * DO NOT bind `title` alone as CallKit localizedCallerName.
 */
struct IncomingCallCallerIdentity {
  let displayName: String
  let remoteHandle: String
  let hasVideo: Bool

  private static let fallbackDisplayName = "수신 통화"

  static func resolve(from data: [AnyHashable: Any]) -> IncomingCallCallerIdentity {
    let display = resolveDisplayName(from: data)
    let handle = resolveRemoteHandle(from: data, displayName: display)
    let video = resolveHasVideo(from: data)
    return IncomingCallCallerIdentity(displayName: display, remoteHandle: handle, hasVideo: video)
  }

  // MARK: - Display name

  static func resolveDisplayName(from data: [AnyHashable: Any]) -> String {
    let priorityKeys = ["callerName", "caller_name", "displayName", "display_name"]
    for key in priorityKeys {
      if let raw = stringValue(data[key]), !isCallKindLabel(raw) {
        return raw
      }
    }
    if let fromBody = extractCallerNameFromBody(stringValue(data["body"])), !isCallKindLabel(fromBody) {
      return fromBody
    }
    if let title = stringValue(data["title"]), !isCallKindLabel(title) {
      return title
    }
    return fallbackDisplayName
  }

  // MARK: - Remote handle

  static func resolveRemoteHandle(from data: [AnyHashable: Any], displayName: String) -> String {
    let idKeys = [
      "callerId",
      "caller_id",
      "callerUserId",
      "caller_user_id",
      "userId",
      "user_id",
    ]
    for key in idKeys {
      if let id = stringValue(data[key]), !isCallKindLabel(id) {
        return id
      }
    }
    return displayName
  }

  // MARK: - Media

  /// Existing SSOT: `kind == "video"` → hasVideo.
  static func resolveHasVideo(from data: [AnyHashable: Any]) -> Bool {
    let kind = stringValue(data["kind"]) ?? stringValue(data["call_kind"]) ?? stringValue(data["callKind"]) ?? ""
    return kind.lowercased() == "video"
  }

  // MARK: - Kind labels

  static func isCallKindLabel(_ value: String) -> Bool {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return false }
    let spaced = collapseWhitespace(trimmed).lowercased()
    let compact = spaced.replacingOccurrences(of: " ", with: "")
    if spaced == "video call" || spaced == "voice call" { return true }
    if compact == "영상통화" || compact == "음성통화" { return true }
    if spaced == "영상 통화" || spaced == "음성 통화" { return true }
    return false
  }

  /// Body forms: `홍길동님의 전화` / `홍길동 님의 전화`
  static func extractCallerNameFromBody(_ body: String?) -> String? {
    guard let body else { return nil }
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    let suffix = "님의 전화"
    guard trimmed.hasSuffix(suffix) else { return nil }
    let name = String(trimmed.dropLast(suffix.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    if name.isEmpty { return nil }
    return name
  }

  private static func stringValue(_ raw: Any?) -> String? {
    guard let s = raw as? String else { return nil }
    let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private static func collapseWhitespace(_ value: String) -> String {
    value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
  }
}
