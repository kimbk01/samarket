import UIKit

final class DibayIntroSceneSurface: UIView {
  private var scene: DibayIntroPackModel.Scene?
  private var compositionW: CGFloat = 9
  private var compositionH: CGFloat = 16
  private(set) var painted = false

  func bindScene(_ scene: DibayIntroPackModel.Scene, compositionW: CGFloat, compositionH: CGFloat) {
    self.scene = scene
    self.compositionW = compositionW
    self.compositionH = compositionH
    painted = false
    subviews.forEach { $0.removeFromSuperview() }
    backgroundColor = scene.backgroundColor
    setNeedsLayout()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    rebuild()
  }

  private func rebuild() {
    guard let scene, bounds.width > 0, bounds.height > 0 else { return }
    subviews.forEach { $0.removeFromSuperview() }
    backgroundColor = scene.backgroundColor
    let region = DibayIntroFitGeometry.fitContentRegion(
      viewportW: bounds.width,
      viewportH: bounds.height,
      aspectW: compositionW,
      aspectH: compositionH
    )
    for el in scene.elements where el.visible && el.type == "TEXT" {
      let rect = DibayIntroFitGeometry.mapFrame(
        x: el.frame.x, y: el.frame.y, w: el.frame.w, h: el.frame.h, region: region)
      let label = UILabel(frame: CGRect(
        x: rect.left, y: rect.top, width: max(1, rect.width), height: max(1, rect.height)))
      label.text = el.text
      label.textColor = el.textColor
      label.numberOfLines = 0
      label.alpha = el.opacity
      let fontPx = max(8, el.fontSizeNorm * region.RH)
      if el.weight == "bold" {
        label.font = .boldSystemFont(ofSize: fontPx)
      } else {
        label.font = .systemFont(ofSize: fontPx, weight: el.weight == "medium" ? .medium : .regular)
      }
      switch el.align {
      case "left": label.textAlignment = .left
      case "right": label.textAlignment = .right
      default: label.textAlignment = .center
      }
      addSubview(label)
    }
    painted = true
  }
}
