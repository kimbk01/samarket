/**
 * REBUILD 14 P3 — platform-neutral System Start render model.
 * No Android dp / UIKit points / CSS px as composition authority.
 */

import type { StartupContentClass } from "@/lib/startup-compositor/content-class";
import type { BrandSizePreset } from "@/lib/startup-compositor/system-start-ir";
import type { NormalizedBrandRect } from "@/lib/startup-compositor/system-start/brand-geometry";
import type { ResolvedMediaRef } from "@/lib/startup-compositor/system-start/media";

/** Owner contract: full-bleed background image uses COVER (preserve existing SSOT). */
export const SYSTEM_START_BACKGROUND_IMAGE_FIT = "COVER" as const;
export type SystemStartBackgroundImageFit =
  typeof SYSTEM_START_BACKGROUND_IMAGE_FIT;

export type SystemStartBackgroundDraw =
  | {
      readonly kind: "color";
      readonly colorHex: string;
    }
  | {
      readonly kind: "color_and_image";
      readonly colorHex: string;
      readonly image: ResolvedMediaRef;
      readonly fit: SystemStartBackgroundImageFit;
    };

export type SystemStartBrandDraw = {
  readonly media: ResolvedMediaRef;
  readonly preset: BrandSizePreset;
  readonly rect: NormalizedBrandRect;
};

/**
 * Platform-neutral draw description for PHASE = SYSTEM_START.
 * Does not attach/detach surfaces or own presentation lifetime.
 */
export type SystemStartRenderModel = {
  readonly phase: "SYSTEM_START";
  readonly generationId: string;
  /** Recorded for audit; MUST NOT alter geometry/render semantics. */
  readonly contentClass: StartupContentClass;
  readonly background: SystemStartBackgroundDraw;
  readonly brand: SystemStartBrandDraw | null;
  readonly minVisibleMs: number;
  readonly compositionAspect: { readonly w: 9; readonly h: 16 };
  /**
   * Semantic readiness produced by shared renderer (not Owner-visible).
   * Distinct from COMPOSITOR frame commit / OWNER_VISIBLE.
   */
  readonly ssRenderReady: true;
};
