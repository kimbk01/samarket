import Foundation
import os.log

/**
 * Unified os_log sink for native call diagnostics.
 * Console.app filter: subsystem `com.dibay.app`, category `call`.
 * NSLog is retained for backward-compatible grep; os_log enables device capture.
 */
enum DibayCallLog {
  private static let osLog = OSLog(subsystem: "com.dibay.app", category: "call")

  static func info(_ marker: String, sessionId: String = "", detail: String = "") {
    emit(level: .info, message: format(marker: marker, sessionId: sessionId, detail: detail))
  }

  static func warn(_ marker: String, sessionId: String = "", detail: String = "") {
    emit(level: .default, message: format(marker: marker, sessionId: sessionId, detail: detail))
  }

  static func infoCall(
    _ marker: String,
    callId: String,
    detail: String = ""
  ) {
    emit(level: .info, message: formatCall(marker: marker, callId: callId, detail: detail))
  }

  private static func emit(level: OSLogType, message: String, prefix: String = "[DIBAY_CALL] ") {
    let line = prefix + message
    os_log("%{public}@", log: osLog, type: level, line)
    NSLog("%@", line)
  }

  private static func format(marker: String, sessionId: String, detail: String) -> String {
    let sid = sessionId.trimmingCharacters(in: .whitespacesAndNewlines)
    let extra = detail.trimmingCharacters(in: .whitespacesAndNewlines)
    if sid.isEmpty {
      return extra.isEmpty ? marker : "\(marker) \(extra)"
    }
    if extra.isEmpty {
      return "\(marker) sessionId=\(mask(sid))"
    }
    return "\(marker) sessionId=\(mask(sid)) \(extra)"
  }

  private static func formatCall(marker: String, callId: String, detail: String) -> String {
    let cid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    let extra = detail.trimmingCharacters(in: .whitespacesAndNewlines)
    if extra.isEmpty {
      return "\(marker) callId=\(mask(cid))"
    }
    return "\(marker) callId=\(mask(cid)) \(extra)"
  }

  static func mask(_ sessionId: String) -> String {
    guard sessionId.count > 8 else { return sessionId }
    return String(sessionId.prefix(4)) + "…" + String(sessionId.suffix(4))
  }
}
