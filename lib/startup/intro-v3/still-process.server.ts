/**
 * Intro V3 still pipeline — server only.
 * Decode → EXIF rotate → aspect preserve → fit inside 1920 long-edge → WebP.
 * Do NOT call optimizeProductIntroCreativeBuffer (1080×1350 poster).
 */

import sharp from "sharp";
import {
  INTRO_V3_ACCEPT_SOURCE_MIMES,
  INTRO_V3_DERIVATIVE_MAX_BYTES,
  INTRO_V3_SOURCE_MAX_BYTES,
  INTRO_V3_SOURCE_MAX_EDGE_PX,
  INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX,
  INTRO_V3_STILL_RUNTIME_WEBP_QUALITY,
  type IntroV3ProcessErrorCode,
} from "@/lib/startup/intro-v3/media-policy";

export type IntroV3StillProcessOk = {
  ok: true;
  buffer: Buffer;
  width: number;
  height: number;
  aspect: number;
  bytes: number;
  contentType: "image/webp";
  hasAlpha: boolean;
  sourceWidth: number;
  sourceHeight: number;
  sourceFormat: string;
  orientationDeg: number;
};

export type IntroV3StillProcessFail = {
  ok: false;
  error: IntroV3ProcessErrorCode;
};

export type IntroV3StillProcessResult = IntroV3StillProcessOk | IntroV3StillProcessFail;

const ACCEPT = new Set<string>(INTRO_V3_ACCEPT_SOURCE_MIMES);

export function sniffIntroV3StillMime(input: { name?: string | null; type?: string | null }): string | null {
  const type = String(input.type ?? "").toLowerCase().trim();
  if (type === "image/jpg") return "image/jpeg";
  if (ACCEPT.has(type)) return type;
  const name = String(input.name ?? "").toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return null;
}

export function rejectIntroV3SourceByNameOrType(input: {
  name?: string | null;
  type?: string | null;
}): IntroV3ProcessErrorCode | null {
  const type = String(input.type ?? "").toLowerCase();
  const name = String(input.name ?? "").toLowerCase();
  if (
    type.includes("heic") ||
    type.includes("heif") ||
    name.endsWith(".heic") ||
    name.endsWith(".heif") ||
    type.includes("gif") ||
    name.endsWith(".gif") ||
    type.includes("mp4") ||
    name.endsWith(".mp4") ||
    type.includes("quicktime")
  ) {
    return "unsupported_format";
  }
  if (!sniffIntroV3StillMime(input)) return "unsupported_format";
  return null;
}

function orientationDegFromExif(orientation: number | undefined): number {
  switch (orientation) {
    case 3:
    case 4:
      return 180;
    case 5:
    case 6:
      return 90;
    case 7:
    case 8:
      return 270;
    default:
      return 0;
  }
}

export async function processIntroV3StillBuffer(input: {
  buffer: Buffer;
  sourceBytes: number;
  filename?: string | null;
  mime?: string | null;
}): Promise<IntroV3StillProcessResult> {
  const rejected = rejectIntroV3SourceByNameOrType({ name: input.filename, type: input.mime });
  if (rejected) return { ok: false, error: rejected };
  if (input.sourceBytes > INTRO_V3_SOURCE_MAX_BYTES || input.buffer.length > INTRO_V3_SOURCE_MAX_BYTES) {
    return { ok: false, error: "source_too_large" };
  }

  let sourceWidth = 0;
  let sourceHeight = 0;
  let hasAlpha = false;
  let sourceFormat = "unknown";
  let orientationDeg = 0;

  try {
    const meta = await sharp(input.buffer, { failOn: "none", animated: true, limitInputPixels: false }).metadata();
    if ((meta.pages ?? 1) > 1 || (typeof meta.delay === "object" && Array.isArray(meta.delay) && meta.delay.length > 1)) {
      return { ok: false, error: "unsupported_format" };
    }
    sourceFormat = String(meta.format ?? "unknown");
    if (sourceFormat === "gif" || sourceFormat === "heif" || sourceFormat === "avif" || sourceFormat === "svg") {
      return { ok: false, error: "unsupported_format" };
    }
    if (sourceFormat !== "jpeg" && sourceFormat !== "png" && sourceFormat !== "webp") {
      return { ok: false, error: "unsupported_format" };
    }
    sourceWidth = meta.width ?? 0;
    sourceHeight = meta.height ?? 0;
    hasAlpha = Boolean(meta.hasAlpha);
    orientationDeg = orientationDegFromExif(meta.orientation);
  } catch {
    return { ok: false, error: "decode_failed" };
  }

  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    return { ok: false, error: "decode_failed" };
  }
  if (sourceWidth > INTRO_V3_SOURCE_MAX_EDGE_PX || sourceHeight > INTRO_V3_SOURCE_MAX_EDGE_PX) {
    return { ok: false, error: "source_pixels_too_large" };
  }

  try {
    const oriented = await sharp(input.buffer, { failOn: "none", limitInputPixels: false })
      .rotate()
      .toBuffer({ resolveWithObject: true });
    const rw = oriented.info.width;
    const rh = oriented.info.height;
    if (!(rw > 0) || !(rh > 0)) return { ok: false, error: "decode_failed" };
    sourceWidth = rw;
    sourceHeight = rh;
    const fitted = await sharp(oriented.data, { failOn: "none", limitInputPixels: false })
      .resize(INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX, INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: INTRO_V3_STILL_RUNTIME_WEBP_QUALITY, alphaQuality: 90, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    const width = fitted.info.width;
    const height = fitted.info.height;
    if (!(width > 0) || !(height > 0)) return { ok: false, error: "processing_failed" };
    if (fitted.data.length > INTRO_V3_DERIVATIVE_MAX_BYTES) {
      return { ok: false, error: "derivative_failed" };
    }
    const longEdge = Math.max(width, height);
    if (longEdge > INTRO_V3_STILL_RUNTIME_LONG_EDGE_PX) {
      return { ok: false, error: "processing_failed" };
    }

    return {
      ok: true,
      buffer: fitted.data,
      width,
      height,
      aspect: width / height,
      bytes: fitted.data.length,
      contentType: "image/webp",
      hasAlpha: hasAlpha || (fitted.info.channels ?? 0) >= 4,
      sourceWidth: rw,
      sourceHeight: rh,
      sourceFormat,
      orientationDeg,
    };
  } catch {
    return { ok: false, error: "processing_failed" };
  }
}
