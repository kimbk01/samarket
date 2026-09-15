/**
 * Admin-upload-time First Entry creative optimize (server-only, sharp).
 * Cold runtime must never import or run this — only `/api/admin/startup-config/upload-image`.
 */

import sharp from "sharp";
import {
  PRODUCT_INTRO_CANONICAL_HEIGHT_PX,
  PRODUCT_INTRO_CANONICAL_WIDTH_PX,
  PRODUCT_INTRO_MAX_OUTPUT_BYTES,
  PRODUCT_INTRO_MAX_SOURCE_EDGE_PX,
  PRODUCT_INTRO_OUTPUT_QUALITY,
} from "@/lib/startup/product-intro-geometry";

const TARGET_RATIO =
  PRODUCT_INTRO_CANONICAL_WIDTH_PX / PRODUCT_INTRO_CANONICAL_HEIGHT_PX;
/** Allow near-4:5 sources without interactive crop (Owner fixture 1122×1402 ≈ 0.8003). */
const ASPECT_EPS = 0.025;

export type ProductIntroOptimizeOk = {
  ok: true;
  buffer: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
  ext: "webp";
  sourceWidth: number;
  sourceHeight: number;
  sourceBytes: number;
  outputBytes: number;
  hasAlpha: boolean;
};

export type ProductIntroOptimizeFail = {
  ok: false;
  error:
    | "image_decode_failed"
    | "invalid_dimensions"
    | "source_dimensions_too_large"
    | "optimize_failed"
    | "output_too_large";
};

export type ProductIntroOptimizeResult = ProductIntroOptimizeOk | ProductIntroOptimizeFail;

function centerCropTo45(width: number, height: number): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const current = width / height;
  if (current > TARGET_RATIO) {
    const cropW = Math.max(1, Math.round(height * TARGET_RATIO));
    const left = Math.max(0, Math.floor((width - cropW) / 2));
    return { left, top: 0, width: cropW, height };
  }
  const cropH = Math.max(1, Math.round(width / TARGET_RATIO));
  const top = Math.max(0, Math.floor((height - cropH) / 2));
  return { left: 0, top, width, height: cropH };
}

/**
 * Decode source → optional center-crop to 4:5 → 1080×1350 WebP @ PRODUCT_INTRO_OUTPUT_QUALITY.
 */
export async function optimizeProductIntroCreativeBuffer(input: {
  buffer: Buffer;
  sourceBytes: number;
}): Promise<ProductIntroOptimizeResult> {
  let sourceWidth = 0;
  let sourceHeight = 0;
  let hasAlpha = false;

  try {
    const meta = await sharp(input.buffer, { failOn: "none", limitInputPixels: false })
      .rotate()
      .metadata();
    sourceWidth = meta.width ?? 0;
    sourceHeight = meta.height ?? 0;
    hasAlpha = Boolean(meta.hasAlpha);
  } catch {
    return { ok: false, error: "image_decode_failed" };
  }

  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { ok: false, error: "invalid_dimensions" };
  }
  if (
    sourceWidth > PRODUCT_INTRO_MAX_SOURCE_EDGE_PX ||
    sourceHeight > PRODUCT_INTRO_MAX_SOURCE_EDGE_PX
  ) {
    return { ok: false, error: "source_dimensions_too_large" };
  }

  try {
    let pipeline = sharp(input.buffer, { failOn: "none", limitInputPixels: false }).rotate();
    const ratio = sourceWidth / sourceHeight;
    if (Math.abs(ratio - TARGET_RATIO) > ASPECT_EPS) {
      const crop = centerCropTo45(sourceWidth, sourceHeight);
      pipeline = pipeline.extract(crop);
    }

    const buffer = await pipeline
      .resize(PRODUCT_INTRO_CANONICAL_WIDTH_PX, PRODUCT_INTRO_CANONICAL_HEIGHT_PX, {
        fit: "fill",
      })
      .webp({ quality: PRODUCT_INTRO_OUTPUT_QUALITY, effort: 4 })
      .toBuffer();

    if (buffer.length > PRODUCT_INTRO_MAX_OUTPUT_BYTES) {
      return { ok: false, error: "output_too_large" };
    }

    return {
      ok: true,
      buffer,
      width: PRODUCT_INTRO_CANONICAL_WIDTH_PX,
      height: PRODUCT_INTRO_CANONICAL_HEIGHT_PX,
      contentType: "image/webp",
      ext: "webp",
      sourceWidth,
      sourceHeight,
      sourceBytes: input.sourceBytes,
      outputBytes: buffer.length,
      hasAlpha,
    };
  } catch {
    return { ok: false, error: "optimize_failed" };
  }
}
