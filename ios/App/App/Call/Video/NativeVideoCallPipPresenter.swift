import AVKit
import UIKit

/** iOS PiP presentation adapter for Native Video UI. No Runtime ownership. */
enum NativeVideoCallPipPresenter {
  static func isSupported() -> Bool {
    if #available(iOS 15.0, *) {
      return AVPictureInPictureController.isPictureInPictureSupported()
    }
    return false
  }

  static func requestEnter(callId: String, source: String) -> Bool {
    let sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !sid.isEmpty else { return false }
    guard isSupported() else { return false }
    guard NativeVideoCallUiHost.isShowing(callId: sid) else { return false }
    return NativeVideoCallUiHost.requestPip(callId: sid, source: source)
  }

  static func requestExit(callId: String) -> Bool {
    var sid = callId.trimmingCharacters(in: .whitespacesAndNewlines)
    if sid.isEmpty {
      sid = NativeVideoCallRuntime.shared.snapshot().session?.sessionId
        .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }
    guard !sid.isEmpty else { return false }
    return NativeVideoCallUiHost.requestExitPip(callId: sid)
  }
}
