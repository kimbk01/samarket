import UIKit

/// Layer B System Start surface — bg color, optional cover bg image, brand at norm center/size.
final class DibaySystemStartSurface: UIView {
  private var config: DibaySystemStartConfig?
  private var verifiedRoot: URL?
  private(set) var painted = false

  func bind(config: DibaySystemStartConfig, verifiedRoot: URL) {
    self.config = config
    self.verifiedRoot = verifiedRoot
    painted = false
    subviews.forEach { $0.removeFromSuperview() }
    backgroundColor = config.backgroundColor
    setNeedsLayout()
  }

  var minVisibleMs: Int { config?.minVisibleMs ?? 500 }

  var continuityBackgroundColor: UIColor {
    config?.backgroundColor
      ?? UIColor(red: 1.0, green: 0.988, blue: 0.988, alpha: 1.0)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    rebuild()
  }

  private func rebuild() {
    guard let config, let verifiedRoot, bounds.width > 0, bounds.height > 0 else { return }
    subviews.forEach { $0.removeFromSuperview() }
    backgroundColor = config.backgroundColor
    if let bgURL = config.resolveBackgroundImage(verifiedRoot: verifiedRoot),
       let data = try? Data(contentsOf: bgURL),
       let image = UIImage(data: data)
    {
      let bgIv = UIImageView(frame: bounds)
      bgIv.image = image
      bgIv.contentMode = .scaleAspectFill
      bgIv.clipsToBounds = true
      bgIv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(bgIv)
    }
    if let brandURL = config.resolveBrandImage(verifiedRoot: verifiedRoot),
       let data = try? Data(contentsOf: brandURL),
       let image = UIImage(data: data)
    {
      let sizeNorm = max(0.05, min(1, config.brandSizeNorm))
      let brandW = max(1, bounds.width * sizeNorm)
      let brandH = max(1, bounds.height * sizeNorm)
      let cx = max(0, min(1, config.brandXNorm)) * bounds.width
      let cy = max(0, min(1, config.brandYNorm)) * bounds.height
      let iv = UIImageView(frame: CGRect(
        x: cx - brandW / 2, y: cy - brandH / 2, width: brandW, height: brandH))
      iv.image = image
      iv.contentMode = .scaleAspectFit
      iv.clipsToBounds = true
      addSubview(iv)
    }
    painted = true
  }
}
