import UIKit

final class DibayIntroSceneSurface: UIView {
  var onCta: ((String, String?) -> Void)?
  private var scene: DibayIntroPackModel.Scene?
  private var compositionW: CGFloat = 9
  private var compositionH: CGFloat = 16
  private var mediaFiles: [String: URL] = [:]
  private(set) var painted = false

  func setMediaFiles(_ files: [String: URL]) {
    mediaFiles = files
  }

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
    if let mediaId = scene.backgroundMediaId, !mediaId.isEmpty,
       let url = mediaFiles[mediaId],
       let data = try? Data(contentsOf: url),
       let image = UIImage(data: data)
    {
      let bgIv = UIImageView(frame: bounds)
      bgIv.image = image
      bgIv.contentMode = scene.backgroundFit == "CONTAIN" ? .scaleAspectFit : .scaleAspectFill
      bgIv.clipsToBounds = true
      bgIv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      addSubview(bgIv)
    }
    let region = DibayIntroFitGeometry.fitContentRegion(
      viewportW: bounds.width,
      viewportH: bounds.height,
      aspectW: compositionW,
      aspectH: compositionH
    )
    for el in scene.elements where el.visible {
      let rect = DibayIntroFitGeometry.mapFrame(
        x: el.frame.x, y: el.frame.y, w: el.frame.w, h: el.frame.h, region: region)
      let frame = CGRect(
        x: rect.left, y: rect.top, width: max(1, rect.width), height: max(1, rect.height))
      var view: UIView?
      if el.type == "TEXT" {
        let label = UILabel(frame: frame)
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
        view = label
      } else if el.type == "IMAGE" || el.type == "LOGO" {
        guard let mediaId = el.mediaId, let url = mediaFiles[mediaId],
              let data = try? Data(contentsOf: url),
              let image = UIImage(data: data)
        else {
          NSLog("[DibayIntroScene] image_missing mediaId=%@", el.mediaId ?? "")
          continue
        }
        let iv = UIImageView(frame: frame)
        iv.image = image
        iv.contentMode = el.fit == "COVER" ? .scaleAspectFill : .scaleAspectFit
        iv.clipsToBounds = true
        iv.alpha = el.opacity
        view = iv
      } else if el.type == "CTA" {
        let btn = UIButton(frame: frame)
        btn.setTitle(el.ctaLabel, for: .normal)
        btn.setTitleColor(el.ctaText, for: .normal)
        btn.backgroundColor = el.ctaBg
        btn.titleLabel?.font = .boldSystemFont(ofSize: max(12, 0.035 * region.RH))
        btn.alpha = el.opacity
        let actionType = el.ctaActionType ?? ""
        let destination = el.ctaDestination
        btn.addAction(UIAction { [weak self] _ in
          self?.onCta?(actionType, destination)
        }, for: .touchUpInside)
        view = btn
      }
      guard let view else { continue }
      addSubview(view)
      applyMotion(view, el: el, region: region)
    }
    painted = true
  }

  private func applyMotion(_ view: UIView, el: DibayIntroPackModel.Element, region: DibayIntroFitGeometry.ContentRegion) {
    guard el.motionType != "NONE", el.motionDurationMs > 0 else { return }
    let start = Double(max(0, el.motionStartMs)) / 1000.0
    let dur = Double(max(1, el.motionDurationMs)) / 1000.0
    let distX = region.RW * 0.25
    let distY = region.RH * 0.25
    switch el.motionType {
    case "FADE_IN":
      view.alpha = 0
      UIView.animate(withDuration: dur, delay: start, options: [.curveEaseOut]) {
        view.alpha = el.opacity
      }
    case "ENTER_TOP":
      view.transform = CGAffineTransform(translationX: 0, y: -distY)
      UIView.animate(withDuration: dur, delay: start, options: [.curveEaseOut]) {
        view.transform = .identity
      }
    case "ENTER_BOTTOM":
      view.transform = CGAffineTransform(translationX: 0, y: distY)
      UIView.animate(withDuration: dur, delay: start, options: [.curveEaseOut]) {
        view.transform = .identity
      }
    case "ENTER_LEFT":
      view.transform = CGAffineTransform(translationX: -distX, y: 0)
      UIView.animate(withDuration: dur, delay: start, options: [.curveEaseOut]) {
        view.transform = .identity
      }
    case "ENTER_RIGHT":
      view.transform = CGAffineTransform(translationX: distX, y: 0)
      UIView.animate(withDuration: dur, delay: start, options: [.curveEaseOut]) {
        view.transform = .identity
      }
    case "SCALE_IN":
      view.transform = CGAffineTransform(scaleX: 0.7, y: 0.7)
      UIView.animate(withDuration: dur, delay: start, options: [.curveEaseOut]) {
        view.transform = .identity
      }
    default:
      break
    }
  }
}
