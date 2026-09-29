import Foundation
import UIKit
import CommonCrypto

/// Geometry SSOT — identical to lib/intro/geometry/fit.ts
enum DibayIntroFitGeometry {
  struct ContentRegion {
    let OX: CGFloat
    let OY: CGFloat
    let RW: CGFloat
    let RH: CGFloat
  }

  struct DeviceRect {
    let left: CGFloat
    let top: CGFloat
    let width: CGFloat
    let height: CGFloat
  }

  static func fitContentRegion(
    viewportW: CGFloat,
    viewportH: CGFloat,
    aspectW: CGFloat,
    aspectH: CGFloat
  ) -> ContentRegion {
    let VW = max(1, viewportW)
    let VH = max(1, viewportH)
    let target = aspectW / aspectH
    let view = VW / VH
    let RW: CGFloat
    let RH: CGFloat
    if view > target {
      RH = VH
      RW = VH * target
    } else {
      RW = VW
      RH = VW / target
    }
    return ContentRegion(OX: (VW - RW) / 2, OY: (VH - RH) / 2, RW: RW, RH: RH)
  }

  static func mapFrame(
    x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, region: ContentRegion
  ) -> DeviceRect {
    DeviceRect(
      left: region.OX + x * region.RW,
      top: region.OY + y * region.RH,
      width: w * region.RW,
      height: h * region.RH
    )
  }
}
