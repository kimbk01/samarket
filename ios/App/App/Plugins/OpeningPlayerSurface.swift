import UIKit

final class OpeningPlayerSurface {
  static private(set) var isShowing = false
  private static var overlay: UIView?

  static func present(on host: UIView, manifest: [String: Any], onEnd: @escaping () -> Void) {
    if isShowing { return }
    isShowing = true
    let overlay = UIView(frame: host.bounds)
    overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    overlay.isUserInteractionEnabled = true
    overlay.backgroundColor = UIColor(red: 11 / 255, green: 66 / 255, blue: 26 / 255, alpha: 1)
    overlay.tag = 0x6F706E31
    host.addSubview(overlay)
    Self.overlay = overlay
    overlay.layoutIfNeeded()
    bindScene(overlay: overlay, manifest: manifest, onEnd: onEnd)
  }

  private static func bindScene(overlay: UIView, manifest: [String: Any], onEnd: @escaping () -> Void) {
    let scenes = (manifest["scenes"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? []
    guard let scene = scenes.first else {
      finish(onEnd: onEnd)
      return
    }
    if let bg = (scene["background"] as? [String: Any])?["color"] as? String {
      overlay.backgroundColor = color(from: bg)
    }
    let width = overlay.bounds.width
    let height = overlay.bounds.height
    guard width >= 1, height >= 1 else {
      finish(onEnd: onEnd)
      return
    }
    let layers = ((scene["layers"] as? [Any])?.compactMap { $0 as? [String: Any] } ?? [])
      .filter { ($0["visible"] as? Bool) ?? true }
      .sorted { (intValue($0["zIndex"]) ?? 0) < (intValue($1["zIndex"]) ?? 0) }
    for layer in layers {
      guard let mediaId = layer["mediaId"] as? String,
            let frame = layer["frame"] as? [String: Any],
            let x = doubleValue(frame["x"]),
            let y = doubleValue(frame["y"]),
            let w = doubleValue(frame["w"]),
            let h = doubleValue(frame["h"]),
            let file = try? OpeningPackStore.mediaFile(mediaId: mediaId),
            let image = UIImage(contentsOfFile: file.path)
      else { continue }
      let iv = UIImageView(image: image)
      iv.clipsToBounds = true
      let cover = (layer["fit"] as? String) == "cover"
      iv.contentMode = cover ? .scaleAspectFill : .scaleAspectFit
      iv.frame = CGRect(
        x: CGFloat(x) * width,
        y: CGFloat(y) * height,
        width: max(1, CGFloat(w) * width),
        height: max(1, CGFloat(h) * height)
      )
      overlay.addSubview(iv)
    }
    let duration = intValue(manifest["sceneDurationMs"]) ?? 2400
    DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(max(400, duration))) {
      finish(onEnd: onEnd)
    }
  }

  private static func finish(onEnd: @escaping () -> Void) {
    overlay?.removeFromSuperview()
    overlay = nil
    isShowing = false
    onEnd()
  }

  private static func color(from raw: String) -> UIColor {
    var hex = raw.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if hex.hasPrefix("#") { hex.removeFirst() }
    guard hex.count == 6, let value = UInt32(hex, radix: 16) else {
      return UIColor(red: 11 / 255, green: 66 / 255, blue: 26 / 255, alpha: 1)
    }
    return UIColor(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: 1
    )
  }

  private static func intValue(_ value: Any?) -> Int? {
    if let i = value as? Int { return i }
    if let n = value as? NSNumber { return n.intValue }
    if let d = value as? Double { return Int(d) }
    return nil
  }

  private static func doubleValue(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let n = value as? NSNumber { return n.doubleValue }
    if let i = value as? Int { return Double(i) }
    return nil
  }
}
