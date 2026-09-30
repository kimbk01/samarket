import sharp from "sharp";
import { ffprobeVideoDimensions } from "./ffprobe-optional";
import { MediaFailureCategory, MediaPipelineError } from "./failure";
import {
  mp4HasMoovBox,
  parseMp4VideoDimensions,
  sniffIsoBmffMp4,
} from "./mp4-dimensions";

export const IdentifiedFormat = {
  JPEG: "JPEG",
  PNG: "PNG",
  WEBP: "WEBP",
  GIF: "GIF",
  MP4: "MP4",
} as const;
export type IdentifiedFormat =
  (typeof IdentifiedFormat)[keyof typeof IdentifiedFormat];

export type IdentifiedSource = {
  format: IdentifiedFormat;
  mime: string;
  width: number;
  height: number;
  pages: number;
  hasAlpha: boolean;
  animated: boolean;
};

function sniffMagic(bytes: Buffer): IdentifiedFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return IdentifiedFormat.JPEG;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return IdentifiedFormat.PNG;
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return IdentifiedFormat.WEBP;
  }
  if (bytes.length >= 6) {
    const sig = bytes.toString("ascii", 0, 6);
    if (sig === "GIF87a" || sig === "GIF89a") return IdentifiedFormat.GIF;
  }
  if (sniffIsoBmffMp4(bytes)) {
    return IdentifiedFormat.MP4;
  }
  return null;
}

function mimeFor(format: IdentifiedFormat): string {
  switch (format) {
    case IdentifiedFormat.JPEG:
      return "image/jpeg";
    case IdentifiedFormat.PNG:
      return "image/png";
    case IdentifiedFormat.WEBP:
      return "image/webp";
    case IdentifiedFormat.GIF:
      return "image/gif";
    case IdentifiedFormat.MP4:
      return "video/mp4";
  }
}

async function identifyMp4Bytes(bytes: Buffer): Promise<IdentifiedSource> {
  if (!sniffIsoBmffMp4(bytes)) {
    throw new MediaPipelineError(
      MediaFailureCategory.UNSUPPORTED_FORMAT,
      "Not a recognized MP4 container",
    );
  }
  if (!mp4HasMoovBox(bytes)) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "MP4 missing moov metadata (undecodable)",
    );
  }

  const probed = ffprobeVideoDimensions(bytes);
  const parsed = probed ?? parseMp4VideoDimensions(bytes);
  if (!parsed || parsed.width <= 0 || parsed.height <= 0) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "MP4 video dimensions could not be determined (install ffprobe or use a standard MP4)",
    );
  }

  return {
    format: IdentifiedFormat.MP4,
    mime: mimeFor(IdentifiedFormat.MP4),
    width: parsed.width,
    height: parsed.height,
    pages: 1,
    hasAlpha: false,
    animated: false,
  };
}

/**
 * Byte-level identify + decode proof. Does not trust filename or Content-Type alone.
 */
export async function identifySourceBytes(bytes: Buffer): Promise<IdentifiedSource> {
  if (!bytes?.length) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "Empty source bytes",
    );
  }

  const magic = sniffMagic(bytes);
  if (!magic) {
    throw new MediaPipelineError(
      MediaFailureCategory.UNSUPPORTED_FORMAT,
      "Unsupported or unrecognized image format",
    );
  }

  if (magic === IdentifiedFormat.MP4) {
    return identifyMp4Bytes(bytes);
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(bytes, {
      animated: magic === IdentifiedFormat.GIF,
      limitInputPixels: false,
      failOn: "error",
    }).metadata();
  } catch (cause) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "Source image could not be decoded",
      cause,
    );
  }

  const width = meta.width ?? 0;
  const height =
    magic === IdentifiedFormat.GIF
      ? meta.pageHeight || meta.height || 0
      : meta.height || 0;
  if (width <= 0 || height <= 0) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "Source image missing dimensions",
    );
  }

  const pages = meta.pages ?? 1;
  const animated = magic === IdentifiedFormat.GIF && pages > 1;

  // Force a single-page decode to prove pixels are readable.
  try {
    await sharp(bytes, {
      animated: magic === IdentifiedFormat.GIF,
      page: 0,
      limitInputPixels: false,
      failOn: "error",
    })
      .raw()
      .toBuffer();
  } catch (cause) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "Source image decode probe failed",
      cause,
    );
  }

  return {
    format: magic,
    mime: mimeFor(magic),
    width,
    height,
    pages,
    hasAlpha: Boolean(meta.hasAlpha),
    animated,
  };
}

export function mediaKindForFormat(
  format: IdentifiedFormat,
  requested?: "IMAGE" | "LOGO" | "GIF",
): "IMAGE" | "LOGO" | "GIF" | "VIDEO" {
  if (format === IdentifiedFormat.GIF) return "GIF";
  if (format === IdentifiedFormat.MP4) return "VIDEO";
  if (requested === "LOGO") return "LOGO";
  return "IMAGE";
}
