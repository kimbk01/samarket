/**
 * REBUILD 14 P3 — ONE System Start renderer (Owner + SYSTEM_BOOTSTRAP).
 *
 * Transforms envelope.systemStart + active-generation media → render model.
 * Does NOT: attach surface, own lifecycle, choose package, handoff, network.
 */

import type { StartupPackageEnvelope } from "@/lib/startup-compositor/envelope";
import { STARTUP_COMPOSITION_ASPECT } from "@/lib/startup-compositor/geometry";
import { computeBrandNormalizedRect } from "@/lib/startup-compositor/system-start/brand-geometry";
import {
  resolveActiveGenerationMedia,
  type MediaAvailabilityEntry,
} from "@/lib/startup-compositor/system-start/media";
import {
  SYSTEM_START_BACKGROUND_IMAGE_FIT,
  type SystemStartRenderModel,
} from "@/lib/startup-compositor/system-start/render-model";

/**
 * When IR.backgroundImageMediaId is set and bytes fail:
 * - authored_color = OPTIONAL image semantics (color from SAME IR)
 * - invalid_generation = REQUIRED image semantics
 *
 * Design (no new IR field in P3): policy is bind-time; default = invalid_generation.
 */
export type BackgroundImageFailurePolicy = "authored_color" | "invalid_generation";

export type BuildSystemStartRenderInput = {
  readonly envelope: StartupPackageEnvelope;
  readonly mediaAvailability:
    | ReadonlyMap<string, MediaAvailabilityEntry>
    | Record<string, MediaAvailabilityEntry>;
  readonly backgroundImageFailurePolicy?: BackgroundImageFailurePolicy;
};

export type BuildSystemStartRenderResult =
  | { readonly ok: true; readonly value: SystemStartRenderModel }
  | { readonly ok: false; readonly reason: string };

/**
 * ONE renderer for OWNER and SYSTEM_BOOTSTRAP.
 * contentClass is recorded only — geometry/render path is identical.
 */
export function buildSystemStartRenderModel(
  input: BuildSystemStartRenderInput,
): BuildSystemStartRenderResult {
  const { envelope } = input;
  const ir = envelope.systemStart;
  const policy = input.backgroundImageFailurePolicy ?? "invalid_generation";

  // Color already fail-closed at IR parse; re-assert no silent navy/cream default.
  if (!ir.backgroundColor || !/^#[0-9A-F]{6}$/.test(ir.backgroundColor)) {
    return { ok: false, reason: "system_start_background_color_invalid" };
  }

  let background: SystemStartRenderModel["background"] = {
    kind: "color",
    colorHex: ir.backgroundColor,
  };

  if (ir.backgroundImageMediaId) {
    const img = resolveActiveGenerationMedia({
      envelope,
      mediaId: ir.backgroundImageMediaId,
      availability: input.mediaAvailability,
    });
    if (!img.ok) {
      if (policy === "authored_color") {
        background = { kind: "color", colorHex: ir.backgroundColor };
      } else {
        return { ok: false, reason: `background_image_${img.reason}` };
      }
    } else {
      background = {
        kind: "color_and_image",
        colorHex: ir.backgroundColor,
        image: img.value,
        fit: SYSTEM_START_BACKGROUND_IMAGE_FIT,
      };
    }
  }

  let brand: SystemStartRenderModel["brand"] = null;
  if (ir.brandAssetEnabled) {
    if (!ir.brandAssetMediaId) {
      return { ok: false, reason: "system_start_brand_media_required" };
    }
    const media = resolveActiveGenerationMedia({
      envelope,
      mediaId: ir.brandAssetMediaId,
      availability: input.mediaAvailability,
    });
    if (!media.ok) {
      return { ok: false, reason: `brand_${media.reason}` };
    }
    const aspect = media.value.intrinsicAspect;
    if (aspect == null || !(aspect > 0)) {
      return { ok: false, reason: "brand_intrinsic_aspect_required" };
    }
    const rect = computeBrandNormalizedRect({
      preset: ir.brandSizePreset,
      centerXNorm: ir.brandXNorm,
      centerYNorm: ir.brandYNorm,
      intrinsicAspect: aspect,
    });
    if (!rect.ok) return { ok: false, reason: rect.reason };
    brand = {
      media: media.value,
      preset: ir.brandSizePreset,
      rect: rect.value,
    };
  }

  return {
    ok: true,
    value: {
      phase: "SYSTEM_START",
      generationId: envelope.generationId,
      contentClass: envelope.contentClass,
      background,
      brand,
      minVisibleMs: ir.minVisibleMs,
      compositionAspect: {
        w: STARTUP_COMPOSITION_ASPECT.w,
        h: STARTUP_COMPOSITION_ASPECT.h,
      },
      ssRenderReady: true,
    },
  };
}

/**
 * Semantic fingerprint of draw instructions excluding contentClass / generation labels.
 * Used to prove OWNER vs BOOTSTRAP share identical render semantics.
 */
export function systemStartRenderSemanticsKey(
  model: SystemStartRenderModel,
): string {
  return JSON.stringify({
    background: model.background,
    brand: model.brand
      ? {
          mediaId: model.brand.media.mediaId,
          integrityHex: model.brand.media.integrityHex,
          preset: model.brand.preset,
          rect: {
            x: model.brand.rect.x,
            y: model.brand.rect.y,
            w: model.brand.rect.w,
            h: model.brand.rect.h,
            sizeNorm: model.brand.rect.sizeNorm,
            intrinsicAspect: model.brand.rect.intrinsicAspect,
          },
        }
      : null,
    minVisibleMs: model.minVisibleMs,
    compositionAspect: model.compositionAspect,
    fit:
      model.background.kind === "color_and_image"
        ? model.background.fit
        : null,
  });
}
