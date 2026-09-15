/**
 * Admin-upload-time First Entry creative optimize (server-only, sharp).
 * Cold runtime must never import or run this — only `/api/admin/startup-config/upload-image`.
 *
 * V2: preserve aspect. Fit inside max 1080×1350 box. No center-crop. No stretch-to-fill.
 */

import sharp from "sharp";
import {
  PRODUCT_INTRO_CANONICAL_HEIGHT_PX,
  PRODUCT_INTRO_CANONICAL_WIDTH_PX,
  PRODUCT_INTRO_MAX_OUTPUT_BYTES,
  PRODUCT_INTRO_MAX_SOURCE_EDGE_PX,
  PRODUCT_INTRO_OUTPUT_QUALITY,
} from "@/lib/startup/product-intro-geometry";

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

/**
 * Decode source → resize to fit inside 1080×1350 preserving aspect → WebP.
 * Does not crop or distort.
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
    const fitted = await sharp(input.buffer, { failOn: "none", limitInputPixels: false })
      .rotate()
      .resize(PRODUCT_INTRO_CANONICAL_WIDTH_PX, PRODUCT_INTRO_CANONICAL_HEIGHT_PX, {
        fit: "inside",
        withoutEnlargement: false,
      })
      .webp({ quality: PRODUCT_INTRO_OUTPUT_QUALITY, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    if (fitted.data.length > PRODUCT_INTRO_MAX_OUTPUT_BYTES) {
      return { ok: false, error: "output_too_large" };
    }

    const width = fitted.info.width ?? 0;
    const height = fitted.info.height ?? 0;
    if (!(width > 0) || !(height > 0)) {
      return { ok: false, error: "optimize_failed" };
    }

    return {
      ok: true,
      buffer: fitted.data,
      width,
      height,
      contentType: "image/webp",
      ext: "webp",
      sourceWidth,
      sourceHeight,
      sourceBytes: input.sourceBytes,
      outputBytes: fitted.data.length,
      hasAlpha,
    };
  } catch {
    return { ok: false, error: "optimize_failed" };
  }
}
