import Foundation

/**
 * Phase B0 — Native video runtime logs.
 * Do not reuse DIBAY_CALL_V4 markers in this package.
 */
enum NativeVideoCallLog {
  private static let prefix = "[DIBAY_NATIVE_VIDEO] "

  static func info(_ marker: String, callId: String) {
    info(marker, callId: callId, details: "")
  }

  static func info(_ marker: String, callId: String, details: String) {
    NSLog("%@%@", prefix, format(marker: marker, callId: callId, details: details))
    if let alias = qaAlias(marker) {
      NSLog("%@%@", prefix, format(marker: alias, callId: callId, details: details))
    }
  }

  static func warn(_ marker: String, callId: String, details: String) {
    NSLog("%@%@", prefix, format(marker: marker, callId: callId, details: details))
  }

  /** CUT1 evidence correlation — no tokens; grep DIBAY_CALL_CORR. */
  static func corr(_ marker: String, callId: String, details: String = "") {
    let wall = Int(Date().timeIntervalSince1970 * 1000)
    let extra =
      "marker=\(marker) wall_ms=\(wall)"
      + (details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        ? ""
        : " \(details.trimmingCharacters(in: .whitespacesAndNewlines))")
    NSLog("%@%@", prefix, format(marker: "DIBAY_CALL_CORR", callId: callId, details: extra))
  }

  private static func format(marker: String, callId: String, details: String) -> String {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    let resolved = sid.isEmpty ? "unknown" : sid
    let extra = details.trimmingCharacters(in: .whitespacesAndNewlines)
    if extra.isEmpty {
      return "\(marker) callId=\(resolved)"
    }
    return "\(marker) callId=\(resolved) \(extra)"
  }

  private static func qaAlias(_ marker: String) -> String? {
    switch marker {
    case "agora_native_join_start":
      return "agora_native_video_join_start"
    case "agora_native_join_success":
      return "agora_native_video_join_success"
    case "local_camera_preview_started":
      return "local_camera_publish_success"
    case "remote_video_render_ready":
      return "remote_video_rendered"
    case "caller_agora_native_join_start":
      return "caller_native_video_join_start"
    case "caller_local_camera_preview_started":
      return "caller_local_camera_publish_success"
    default:
      return nil
    }
  }
}
