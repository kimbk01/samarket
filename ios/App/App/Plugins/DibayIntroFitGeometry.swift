import CoreGraphics

/**
 * Gate B FIT geometry — positioned content only.
 * scale = min(VW/CaW, VH/CaH); no positioned COVER.
 * Safe area is guidance only — not a second geometry authority.
 */
enum DibayIntroFitGeometry {
  static let canonicalW: CGFloat = 9
  static let canonicalH: CGFloat = 16

  struct ContentRegion {
    let RW: CGFloat
    let RH: CGFloat
    let OX: CGFloat
    let OY: CGFloat
  }

  struct DeviceRect {
    let vx: CGFloat
    let vy: CGFloat
    let vw: CGFloat
    let vh: CGFloat
  }

  static func fitContentRegion(VW: CGFloat, VH: CGFloat, CaW: CGFloat, CaH: CGFloat) -> ContentRegion {
    let scale = min(VW / CaW, VH / CaH)
    let RW = CaW * scale
    let RH = CaH * scale
    let OX = (VW - RW) / 2
    let OY = (VH - RH) / 2
    return ContentRegion(RW: RW, RH: RH, OX: OX, OY: OY)
  }

  static func mapFrame(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, region: ContentRegion) -> DeviceRect {
    DeviceRect(
      vx: region.OX + x * region.RW,
      vy: region.OY + y * region.RH,
      vw: w * region.RW,
      vh: h * region.RH
    )
  }
}
