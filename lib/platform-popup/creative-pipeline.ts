/**
 * CUT 5-R — shared center-crop + canonical resize for platform popup creatives.
 * Server-only (sharp). Do not import from client components.
 */

import sharp from "sharp";
import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import {
  centerCropBoxTo3625,
  isPlatformPopupCreativeRatioOk,
  type PlatformPopupCenterCropBox,
} from "@/lib/platform-popup/creative-pipeline-geometry";

export {
  centerCropBoxTo3625,
  isPlatformPopupCreativeRatioOk,
  PLATFORM_POPUP_CREATIVE_RATIO_EPS,
  PLATFORM_POPUP_TARGET_RATIO,
  type PlatformPopupCenterCropBox,
} from "@/lib/platform-popup/creative-pipeline-geometry";

/**
 * Produce final production buffer at DIBAY_CANONICAL_POPUP_CREATIVE_SIZE (webp).
 */
export async function processPlatformPopupCreativeToCanonical(input: {
  buffer: Buffer;
  width: number;
  height: number;
  applyCenterCrop: boolean;
}): Promise<
  | { ok: true; buffer: Buffer; width: number; height: number; cropped: boolean }
  | { ok: false; error: "needs_crop" | "crop_failed"; proposedCrop?: PlatformPopupCenterCropBox }
> {
  const ratioOk = isPlatformPopupCreativeRatioOk(input.width, input.height);
  if (!ratioOk && !input.applyCenterCrop) {
    return {
      ok: false,
      error: "needs_crop",
      proposedCrop: centerCropBoxTo3625(input.width, input.height),
    };
  }

  const targetW = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.width;
  const targetH = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE.height;

  try {
    let pipeline = sharp(input.buffer, { failOn: "none", limitInputPixels: false }).rotate();
    let cropped = false;
    if (!ratioOk && input.applyCenterCrop) {
      const crop = centerCropBoxTo3625(input.width, input.height);
      pipeline = pipeline.extract(crop);
      cropped = true;
    }
    const buffer = await pipeline
      .resize(targetW, targetH, { fit: "fill" })
      .webp({ quality: 88 })
      .toBuffer();
    return { ok: true, buffer, width: targetW, height: targetH, cropped };
  } catch {
    return { ok: false, error: "crop_failed" };
  }
}
