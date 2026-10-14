/**
 * CUT 5-R / CUT 1 reopen — CARD (36:25 crop) + ARTWORK (alpha contain) pipelines.
 * Server-only (sharp). Do not import from client components.
 */

import sharp from "sharp";
import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import {
  centerCropBoxTo3625,
  isPlatformPopupCreativeRatioOk,
  type PlatformPopupCenterCropBox,
} from "@/lib/platform-popup/creative-pipeline-geometry";
import type { PlatformPopupCreativeMode } from "@/lib/platform-popup/presentation-contract";
import {
  centerCropBoxToPtrBand,
  isPtrBandPixelRatioOk,
  PTR_BAND_SPECS,
  type PtrBandVariant,
} from "@/lib/platform-popup/ptr-reveal-contract";

export {
  centerCropBoxTo3625,
  isPlatformPopupCreativeRatioOk,
  PLATFORM_POPUP_CREATIVE_RATIO_EPS,
  PLATFORM_POPUP_TARGET_RATIO,
  type PlatformPopupCenterCropBox,
} from "@/lib/platform-popup/creative-pipeline-geometry";

/** ARTWORK max edge — preserve aspect; do not flatten alpha onto a fill color. */
const ARTWORK_MAX_EDGE_PX = 1600;

/**
 * Produce final production buffer.
 * CARD → 1440×1000 WebP. ARTWORK → fit-inside WebP with alpha preserved.
 * PTR_BAND → 변형별 표준 띠(휴대폰 1280×320 · 태블릿 2560×320 · 로고 256×256) WebP.
 */
export async function processPlatformPopupCreativeToCanonical(input: {
  buffer: Buffer;
  width: number;
  height: number;
  applyCenterCrop: boolean;
  creativeMode?: PlatformPopupCreativeMode;
  /** creativeMode=ptr_band 전용 — 기본 default(휴대폰 띠) */
  ptrBandVariant?: PtrBandVariant;
}): Promise<
  | {
      ok: true;
      buffer: Buffer;
      width: number;
      height: number;
      cropped: boolean;
      creativeMode: PlatformPopupCreativeMode;
      hasAlpha: boolean;
    }
  | { ok: false; error: "needs_crop" | "crop_failed"; proposedCrop?: PlatformPopupCenterCropBox }
> {
  if (input.creativeMode === "ptr_band") {
    return processPtrBandCreative({ ...input, variant: input.ptrBandVariant ?? "default" });
  }

  const creativeMode = input.creativeMode === "artwork" ? "artwork" : "card";

  if (creativeMode === "artwork") {
    try {
      const meta = await sharp(input.buffer, { failOn: "none", limitInputPixels: false })
        .rotate()
        .metadata();
      const hasAlpha = Boolean(meta.hasAlpha);
      const fitted = await sharp(input.buffer, { failOn: "none", limitInputPixels: false })
        .rotate()
        .resize(ARTWORK_MAX_EDGE_PX, ARTWORK_MAX_EDGE_PX, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90, alphaQuality: 100, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return {
        ok: true,
        buffer: fitted.data,
        width: fitted.info.width ?? input.width,
        height: fitted.info.height ?? input.height,
        cropped: false,
        creativeMode: "artwork",
        hasAlpha,
      };
    } catch {
      return { ok: false, error: "crop_failed" };
    }
  }

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
    return {
      ok: true,
      buffer,
      width: targetW,
      height: targetH,
      cropped,
      creativeMode: "card",
      hasAlpha: false,
    };
  } catch {
    return { ok: false, error: "crop_failed" };
  }
}

/**
 * PTR 띠 — 변형 비율과 다르면 needs_crop(가운데 자르기 제안), 확인 후 가운데 자르기 → 표준 크기 WebP.
 * 로고는 투명 배경 유지(alpha), 띠는 불투명 품질 88.
 */
async function processPtrBandCreative(input: {
  buffer: Buffer;
  width: number;
  height: number;
  applyCenterCrop: boolean;
  variant: PtrBandVariant;
}): Promise<
  | {
      ok: true;
      buffer: Buffer;
      width: number;
      height: number;
      cropped: boolean;
      creativeMode: PlatformPopupCreativeMode;
      hasAlpha: boolean;
    }
  | { ok: false; error: "needs_crop" | "crop_failed"; proposedCrop?: PlatformPopupCenterCropBox }
> {
  const spec = PTR_BAND_SPECS[input.variant];
  const ratioOk = isPtrBandPixelRatioOk(input.width, input.height, input.variant);
  if (!ratioOk && !input.applyCenterCrop) {
    return {
      ok: false,
      error: "needs_crop",
      proposedCrop: centerCropBoxToPtrBand(input.width, input.height, input.variant),
    };
  }
  try {
    let pipeline = sharp(input.buffer, { failOn: "none", limitInputPixels: false }).rotate();
    let cropped = false;
    if (!ratioOk) {
      pipeline = pipeline.extract(centerCropBoxToPtrBand(input.width, input.height, input.variant));
      cropped = true;
    }
    const isLogo = input.variant === "logo";
    const out = await pipeline
      .resize(spec.width, spec.height, { fit: "fill" })
      .webp(isLogo ? { quality: 90, alphaQuality: 100, effort: 4 } : { quality: 88 })
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      buffer: out.data,
      width: spec.width,
      height: spec.height,
      cropped,
      creativeMode: "ptr_band",
      hasAlpha: isLogo && out.info.channels === 4,
    };
  } catch {
    return { ok: false, error: "crop_failed" };
  }
}
