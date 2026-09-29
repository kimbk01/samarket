package com.dibay.app.intro;

/**
 * Shared Vertical B element-motion constants — MUST match iOS DibayIntroMotionConstants
 * and lib/intro/contracts/motion.ts.
 */
public final class DibayIntroMotionConstants {
  private DibayIntroMotionConstants() {}

  /** Composition-relative translation (TOP/BOTTOM → height, LEFT/RIGHT → width). */
  public static final float TRANSLATION_DISTANCE_NORM = 0.08f;

  /** SCALE_IN start scale relative to authored geometry (centered). */
  public static final float SCALE_START_FACTOR = 0.85f;

  /** PathInterpolator matching cubic-bezier(0, 0, 0.2, 1). */
  public static final float EASE_X1 = 0f;
  public static final float EASE_Y1 = 0f;
  public static final float EASE_X2 = 0.2f;
  public static final float EASE_Y2 = 1f;
}
