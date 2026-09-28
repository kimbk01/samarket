import UIKit

protocol OpeningPlayerHost: AnyObject {
  var openingHostView: UIView { get }
  func openingPlayerDidStart()
  func openingPlayerDidEnd()
}

enum OpeningRuntimeCoordinator {
  @discardableResult
  static func presentIfReady(host: OpeningPlayerHost) -> Bool {
    if OpeningPlayerSurface.isShowing { return true }
    guard OpeningPackStore.isReady(),
          let manifest = try? OpeningPackStore.readManifest()
    else { return false }
    host.openingPlayerDidStart()
    OpeningPlayerSurface.present(on: host.openingHostView, manifest: manifest) {
      host.openingPlayerDidEnd()
    }
    return true
  }
}
