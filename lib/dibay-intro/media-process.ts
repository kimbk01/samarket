export const DIBAY_INTRO_ALLOWED_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type DibayIntroAllowedMime = keyof typeof DIBAY_INTRO_ALLOWED_MIME;

export type ProcessedIntroMedia = {
  mime: DibayIntroAllowedMime;
  bytes: Buffer;
  width: number | null;
  height: number | null;
  animated: boolean;
  runtimeExt: string;
};

function isAllowedMime(value: string): value is DibayIntroAllowedMime {
  return value in DIBAY_INTRO_ALLOWED_MIME;
}

/**
 * Canonical media processor.
 * GIF runtime asset must remain the original animated bytes.
 * Never convert to still WebP.
 */
export async function processIntroMediaBytes(mime: string, buf: Buffer): Promise<ProcessedIntroMedia> {
  if (!isAllowedMime(mime)) throw new Error("unsupported_mime");
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buf, { animated: true, limitInputPixels: false }).metadata();
  const width = meta.width ?? null;
  const height = meta.height ?? null;
  let animated = false;
  if (mime === "image/gif") {
    const gifFrames = countGifFrames(buf);
    animated = Math.max(meta.pages ?? 0, gifFrames) > 1;
    const format = (meta.format ?? "").toLowerCase();
    if (format && format !== "gif") throw new Error("gif_flattened");
    if (isStillWebp(buf)) throw new Error("gif_flattened");
  } else {
    await sharp(buf).rotate().toBuffer();
  }
  return {
    mime,
    bytes: buf,
    width,
    height,
    animated,
    runtimeExt: DIBAY_INTRO_ALLOWED_MIME[mime],
  };
}

export function isStillWebp(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

export function isGifBytes(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 6).toString("ascii");
  return head === "GIF87a" || head === "GIF89a";
}

/** Count Image Descriptor blocks so animation is not inferred from MIME or sharp pages alone. */
export function countGifFrames(bytes: Buffer): number {
  if (!isGifBytes(bytes) || bytes.length < 13) return 0;
  let i = 13;
  const packed = bytes[10] ?? 0;
  if ((packed & 0x80) !== 0) i += 3 * (1 << ((packed & 0x07) + 1));
  let frames = 0;
  while (i < bytes.length) {
    const marker = bytes[i];
    if (marker === 0x3b) break;
    if (marker === 0x2c) {
      frames += 1;
      if (i + 10 >= bytes.length) break;
      const localPacked = bytes[i + 9] ?? 0;
      i += 10;
      if ((localPacked & 0x80) !== 0) i += 3 * (1 << ((localPacked & 0x07) + 1));
      i += 1;
      while (i < bytes.length && bytes[i] !== 0) i += 1 + (bytes[i] ?? 0);
      i += 1;
      continue;
    }
    if (marker === 0x21) {
      i += 2;
      while (i < bytes.length && bytes[i] !== 0) i += 1 + (bytes[i] ?? 0);
      i += 1;
      continue;
    }
    i += 1;
  }
  return frames;
}
