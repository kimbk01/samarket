import UIKit

/// Shared Vertical B element-motion constants — MUST match Android DibayIntroMotionConstants
/// and lib/intro/contracts/motion.ts.
enum DibayIntroMotionConstants {
  /// Composition-relative translation (TOP/BOTTOM → height, LEFT/RIGHT → width).
  static let translationDistanceNorm: CGFloat = 0.08
  /// SCALE_IN start scale relative to authored geometry (centered).
  static let scaleStartFactor: CGFloat = 0.85
  /// Cubic ease-out matching cubic-bezier(0, 0, 0.2, 1).
  static let easeControlPoint1 = CGPoint(x: 0, y: 0)
  static let easeControlPoint2 = CGPoint(x: 0.2, y: 1)
}
