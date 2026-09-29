import UIKit
import CoreText

/**
 * Native declarative scene surface — Pack layers → UIView hierarchy.
 * Gate B FIT for positioned content. Local sealed media only.
 */
final class DibayIntroSceneSurface: UIView {
  private let fontsRoot: URL
  private var mediaPaths: [String: URL] = [:]
  private var scene: DibayIntroPackModel.Scene?
  private var compositionW: CGFloat = 9
  private var compositionH: CGFloat = 16
  private(set) var painted = false
  private var lastBuiltSize: CGSize = .zero
  private var lastBuiltSceneId: String = ""
  private var rebuildScheduled = false

  init(fontsRoot: URL) {
    self.fontsRoot = fontsRoot
    super.init(frame: .zero)
    isUserInteractionEnabled = true
    backgroundColor = .black
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

  func setMediaPaths(_ paths: [String: URL]) {
    mediaPaths = paths
  }

  func bindScene(_ scene: DibayIntroPackModel.Scene, compositionW: CGFloat, compositionH: CGFloat) {
    self.scene = scene
    self.compositionW = compositionW
    self.compositionH = compositionH
    painted = false
    lastBuiltSize = .zero
    lastBuiltSceneId = ""
    subviews.forEach { $0.removeFromSuperview() }
    backgroundColor = scene.backgroundColor
    NSLog(
      "[DibayIntroScene] bindScene sceneId=%@ layers=%d w=%.0f h=%.0f",
      scene.sceneId, scene.layers.count, bounds.width, bounds.height
    )
    scheduleRebuild()
  }

  func hasPaintedAuthoredPixels() -> Bool { painted }

  override func layoutSubviews() {
    super.layoutSubviews()
    if bounds.width > 0, bounds.height > 0, scene != nil {
      if bounds.size != lastBuiltSize || (scene?.sceneId ?? "") != lastBuiltSceneId {
        scheduleRebuild()
      }
    }
    if !subviews.isEmpty && !painted && scene != nil {
      painted = true
    }
  }

  private func scheduleRebuild() {
    if rebuildScheduled { return }
    rebuildScheduled = true
    DispatchQueue.main.async { [weak self] in
      self?.rebuildScheduled = false
      self?.rebuildFromCurrentSize()
    }
  }

  private func rebuildFromCurrentSize() {
    let VW = bounds.width
    let VH = bounds.height
    guard VW > 0, VH > 0, let scene = scene else { return }
    if lastBuiltSize == bounds.size && lastBuiltSceneId == scene.sceneId && !subviews.isEmpty {
      return
    }
    subviews.forEach { $0.removeFromSuperview() }
    painted = false
    backgroundColor = scene.backgroundColor
    lastBuiltSize = bounds.size
    lastBuiltSceneId = scene.sceneId
    let region = DibayIntroFitGeometry.fitContentRegion(
      VW: VW, VH: VH, CaW: compositionW, CaH: compositionH
    )
    var added = 0
    for layer in scene.layers {
      guard layer.visible else { continue }
      guard let child = buildLayerView(layer, region: region) else {
        NSLog("[DibayIntroScene] layer_skip_null type=%@ id=%@", layer.type, layer.layerId)
        continue
      }
      let rect = DibayIntroFitGeometry.mapFrame(
        x: layer.frame.x, y: layer.frame.y, w: layer.frame.w, h: layer.frame.h, region: region
      )
      let childW = max(1, rect.vw)
      let childH = max(1, rect.vh)
      child.frame = CGRect(x: rect.vx, y: rect.vy, width: childW, height: childH)
      child.alpha = max(0, min(1, layer.opacity))
      addSubview(child)
      applyElementMotion(child, layer: layer, region: region)
      added += 1
      NSLog(
        "[DibayIntroScene] layer_added type=%@ motion=%@ start=%d dur=%d text=%@ frame=%.0f,%.0f,%.0fx%.0f",
        layer.type,
        layer.motionType,
        layer.motionStartMs,
        layer.motionDurationMs,
        layer.textContent ?? layer.ctaLabel ?? "",
        child.frame.origin.x, child.frame.origin.y, childW, childH
      )
    }
    NSLog(
      "[DibayIntroScene] rebuild_done VW=%.0f VH=%.0f children=%d added=%d",
      VW, VH, subviews.count, added
    )
    if scene.layers.isEmpty {
      painted = true
    }
  }

  private func applyElementMotion(
    _ child: UIView,
    layer: DibayIntroPackModel.Layer,
    region: DibayIntroFitGeometry.ContentRegion
  ) {
    let type = layer.motionType
    guard type != "NONE", layer.motionDurationMs > 0 else { return }
    let authoredAlpha = max(0, min(1, layer.opacity))
    var startTransform = CGAffineTransform.identity
    switch type {
    case "FADE_IN":
      child.alpha = 0
    case "TOP_IN":
      let dy = -DibayIntroMotionConstants.translationDistanceNorm * region.RH
      startTransform = CGAffineTransform(translationX: 0, y: dy)
      child.alpha = 0
    case "BOTTOM_IN":
      let dy = DibayIntroMotionConstants.translationDistanceNorm * region.RH
      startTransform = CGAffineTransform(translationX: 0, y: dy)
      child.alpha = 0
    case "LEFT_IN":
      let dx = -DibayIntroMotionConstants.translationDistanceNorm * region.RW
      startTransform = CGAffineTransform(translationX: dx, y: 0)
      child.alpha = 0
    case "RIGHT_IN":
      let dx = DibayIntroMotionConstants.translationDistanceNorm * region.RW
      startTransform = CGAffineTransform(translationX: dx, y: 0)
      child.alpha = 0
    case "SCALE_IN":
      let s = DibayIntroMotionConstants.scaleStartFactor
      startTransform = CGAffineTransform(scaleX: s, y: s)
      child.alpha = 0
    default:
      return
    }
    child.transform = startTransform
    let duration = TimeInterval(max(1, layer.motionDurationMs)) / 1000.0
    let delay = TimeInterval(max(0, layer.motionStartMs)) / 1000.0
    UIView.animate(
      withDuration: duration,
      delay: delay,
      options: [.curveEaseOut, .allowUserInteraction],
      animations: {
        child.alpha = authoredAlpha
        child.transform = .identity
      },
      completion: nil
    )
  }

  private func buildLayerView(
    _ layer: DibayIntroPackModel.Layer,
    region: DibayIntroFitGeometry.ContentRegion
  ) -> UIView? {
    switch layer.type {
    case "IMAGE", "LOGO":
      return buildImage(layer)
    case "TEXT":
      return buildText(layer, region: region)
    case "CTA":
      return buildCta(layer, region: region)
    default:
      return nil
    }
  }

  private func buildImage(_ layer: DibayIntroPackModel.Layer) -> UIView {
    let iv = UIImageView()
    iv.contentMode = layer.fit == "COVER" ? .scaleAspectFill : .scaleAspectFit
    iv.clipsToBounds = true
    if let ref = layer.mediaRefId, let url = mediaPaths[ref],
       let data = try? Data(contentsOf: url),
       let img = UIImage(data: data) {
      iv.image = img
    }
    return iv
  }

  private func buildText(
    _ layer: DibayIntroPackModel.Layer,
    region: DibayIntroFitGeometry.ContentRegion
  ) -> UIView {
    let label = UILabel()
    label.text = layer.textContent ?? ""
    label.textColor = layer.color
    label.numberOfLines = max(1, layer.maxLines)
    label.lineBreakMode = .byClipping
    label.textAlignment = alignFor(layer.align)
    let px = layer.fontSize * region.RH
    if let font = loadUIFont(assetId: layer.fontAssetId, size: px) {
      label.font = font
    } else {
      label.font = UIFont.systemFont(ofSize: px, weight: .bold)
    }
    if layer.lineHeight > 0, let font = label.font {
      let paragraph = NSMutableParagraphStyle()
      paragraph.lineHeightMultiple = layer.lineHeight
      paragraph.alignment = label.textAlignment
      label.attributedText = NSAttributedString(
        string: layer.textContent ?? "",
        attributes: [
          .font: font,
          .foregroundColor: layer.color,
          .paragraphStyle: paragraph,
        ]
      )
    }
    return label
  }

  private func buildCta(
    _ layer: DibayIntroPackModel.Layer,
    region: DibayIntroFitGeometry.ContentRegion
  ) -> UIView {
    let wrap = UIView()
    wrap.backgroundColor = layer.ctaBgColor
    wrap.isUserInteractionEnabled = false
    let label = UILabel()
    label.text = layer.ctaLabel ?? ""
    label.textColor = layer.color
    label.textAlignment = .center
    label.numberOfLines = 1
    let px = layer.fontSize * region.RH
    if let font = loadUIFont(assetId: layer.fontAssetId, size: px) {
      label.font = font
    } else {
      label.font = UIFont.systemFont(ofSize: px, weight: .semibold)
    }
    wrap.addSubview(label)
    label.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: wrap.leadingAnchor),
      label.trailingAnchor.constraint(equalTo: wrap.trailingAnchor),
      label.topAnchor.constraint(equalTo: wrap.topAnchor),
      label.bottomAnchor.constraint(equalTo: wrap.bottomAnchor),
    ])
    let radius = layer.ctaCornerRadius * region.RW
    wrap.layer.cornerRadius = radius
    wrap.clipsToBounds = true
    return wrap
  }

  private func alignFor(_ align: String) -> NSTextAlignment {
    switch align {
    case "LEFT": return .left
    case "RIGHT": return .right
    default: return .center
    }
  }

  private func loadUIFont(assetId: String?, size: CGFloat) -> UIFont? {
    guard let assetId = assetId, !assetId.isEmpty else { return nil }
    let url = fontsRoot.appendingPathComponent(assetId)
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    var error: Unmanaged<CFError>?
    if let provider = CGDataProvider(url: url as CFURL),
       let cgFont = CGFont(provider) {
      CTFontManagerRegisterGraphicsFont(cgFont, &error)
      let name = cgFont.postScriptName as String? ?? assetId
      return UIFont(name: name, size: size) ?? UIFont(name: "Pretendard-Bold", size: size)
    }
    return nil
  }
}
