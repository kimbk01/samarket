/**
 * Deterministic static runtime processing for JPEG / PNG / WebP.
 * - Applies EXIF orientation into pixels (renderer-independent)
 * - Preserves alpha where present
 * - Avoids unexplained destructive recompression
 */

import sharp from "sharp";
import { MediaFailureCategory, MediaPipelineError } from "../failure";
import { IdentifiedFormat } from "../identify";
import { PROCESS_RECIPE } from "../paths";

export type StaticProcessResult = {
  bytes: Buffer;
  mime: string;
  format: "JPEG" | "PNG" | "WEBP";
  width: number;
  height: number;
  byteLength: number;
  hasAlpha: boolean;
  orientationApplied: boolean;
  processRecipeVersion: typeof PROCESS_RECIPE.STATIC_ORIENT_ALPHA_V1;
  animationMetadata: {
    animated: false;
    hasAlpha: boolean;
    orientationApplied: true;
  };
};

export async function processStaticImage(
  srcBuf: Buffer,
  format: IdentifiedFormat,
): Promise<StaticProcessResult> {
  if (format === IdentifiedFormat.GIF) {
    throw new MediaPipelineError(
      MediaFailureCategory.INVALID_STATE,
      "GIF must use B2 processor",
    );
  }

  try {
    // rotate() without args applies EXIF orientation and strips orientation tag.
    const pipeline = sharp(srcBuf, {
      limitInputPixels: false,
      failOn: "error",
    }).rotate();

    let out: Buffer;
    let mime: string;
    let outFormat: "JPEG" | "PNG" | "WEBP";

    if (format === IdentifiedFormat.JPEG) {
      out = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      mime = "image/jpeg";
      outFormat = "JPEG";
    } else if (format === IdentifiedFormat.PNG) {
      out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      mime = "image/png";
      outFormat = "PNG";
    } else {
      out = await pipeline.webp({ quality: 92, alphaQuality: 100 }).toBuffer();
      mime = "image/webp";
      outFormat = "WEBP";
    }

    const meta = await sharp(out, { limitInputPixels: false }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new MediaPipelineError(
        MediaFailureCategory.PROCESSOR_FAILED,
        "Static runtime missing dimensions",
      );
    }

    return {
      bytes: out,
      mime,
      format: outFormat,
      width,
      height,
      byteLength: out.length,
      hasAlpha: Boolean(meta.hasAlpha),
      orientationApplied: true,
      processRecipeVersion: PROCESS_RECIPE.STATIC_ORIENT_ALPHA_V1,
      animationMetadata: {
        animated: false,
        hasAlpha: Boolean(meta.hasAlpha),
        orientationApplied: true,
      },
    };
  } catch (cause) {
    if (cause instanceof MediaPipelineError) throw cause;
    throw new MediaPipelineError(
      MediaFailureCategory.PROCESSOR_FAILED,
      "Static image processing failed",
      cause,
    );
  }
}
