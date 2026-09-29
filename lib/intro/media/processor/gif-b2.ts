/**
 * C-R1 Model B2 — sharp animated page decode/composite → omggif.GifWriter.
 * sharp+cgif encode is FORBIDDEN.
 */

import sharp from "sharp";
import { GifWriter } from "omggif";

import { GifRuntimeFormat } from "@/lib/intro/contracts/gif";
import { MediaFailureCategory, MediaPipelineError } from "../failure";
import { PROCESS_RECIPE } from "../paths";
import { sha256Hex } from "../integrity";

export type GifAnimationMetadata = {
  animated: true;
  format: typeof GifRuntimeFormat.CANONICAL_ANIMATED_GIF;
  processRecipeVersion: typeof PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1;
  frameCount: number;
  delaysMs: number[];
  loop: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  pageHashPrefixes: string[];
  disposalSemantics: "RESOLVED_FULL_CANVAS_COMPOSITE";
  encoder: "omggif.GifWriter";
  forbiddenEncoder: "cgif";
};

export type GifProcessResult = {
  bytes: Buffer;
  mime: "image/gif";
  format: typeof GifRuntimeFormat.CANONICAL_ANIMATED_GIF;
  width: number;
  height: number;
  byteLength: number;
  animationMetadata: GifAnimationMetadata;
  processRecipeVersion: typeof PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1;
};

type DecodedFrame = {
  rgba: Buffer;
  width: number;
  height: number;
};

type DecodedGif = {
  width: number;
  height: number;
  pages: number;
  loop: number;
  delays: number[];
  frames: DecodedFrame[];
  hasAlpha: boolean;
};

async function decodeCompositedPages(srcBuf: Buffer): Promise<DecodedGif> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(srcBuf, {
      animated: true,
      limitInputPixels: false,
      failOn: "error",
    }).metadata();
  } catch (cause) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "GIF metadata probe failed",
      cause,
    );
  }

  const pages = meta.pages ?? 1;
  if (pages < 2) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "Animated GIF requires more than one frame for READY playback",
    );
  }

  const width = meta.width ?? 0;
  const height = meta.pageHeight || meta.height || 0;
  if (width <= 0 || height <= 0) {
    throw new MediaPipelineError(
      MediaFailureCategory.MALFORMED_SOURCE,
      "GIF missing dimensions",
    );
  }

  const delays = Array.isArray(meta.delay)
    ? meta.delay.map((d) => (typeof d === "number" && d > 0 ? d : 100))
    : Array(pages).fill(typeof meta.delay === "number" ? meta.delay : 100);

  const frames: DecodedFrame[] = [];
  let hasAlpha = false;
  for (let i = 0; i < pages; i++) {
    try {
      const { data, info } = await sharp(srcBuf, {
        animated: true,
        page: i,
        limitInputPixels: false,
        failOn: "error",
      })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const rgba = Buffer.from(data);
      for (let p = 3; p < rgba.length; p += 4) {
        if (rgba[p]! < 255) {
          hasAlpha = true;
          break;
        }
      }
      frames.push({ rgba, width: info.width, height: info.height });
    } catch (cause) {
      throw new MediaPipelineError(
        MediaFailureCategory.PROCESSOR_FAILED,
        `GIF page ${i} decode/composite failed`,
        cause,
      );
    }
  }

  return {
    width,
    height,
    pages,
    loop: meta.loop ?? 0,
    delays,
    frames,
    hasAlpha,
  };
}

function encodeOmggif(decoded: DecodedGif): Buffer {
  const { width: w, height: h, frames, delays, loop } = decoded;
  const buf = Buffer.alloc(w * h * frames.length * 6 + 4096);
  const enc = new GifWriter(buf, w, h, { loop: loop ?? 0 });

  for (let i = 0; i < frames.length; i++) {
    const data = frames[i]!.rgba;
    const map = new Map<number, number>();
    const palette: number[] = [];
    let trans: number | null = null;
    const indexed = new Uint8Array(w * h);

    for (let p = 0, j = 0; j < w * h; j++, p += 4) {
      const a = data[p + 3]!;
      if (a < 128) {
        if (trans == null) {
          trans = palette.length;
          palette.push(0);
        }
        indexed[j] = trans;
        continue;
      }
      const key = (data[p]! << 16) | (data[p + 1]! << 8) | data[p + 2]!;
      let idx = map.get(key);
      if (idx == null) {
        if (palette.length >= 255) idx = 0;
        else {
          idx = palette.length;
          map.set(key, idx);
          palette.push(key);
        }
      }
      indexed[j] = idx;
    }

    while (palette.length < 2) palette.push(0);
    let n = 2;
    while (n < palette.length) n *= 2;
    while (palette.length < n) palette.push(0);

    const delayCs = Math.max(1, Math.round((delays[i] ?? 100) / 10));
    enc.addFrame(0, 0, w, h, indexed, {
      palette,
      delay: delayCs,
      transparent: trans ?? undefined,
      disposal: 2,
    });
  }

  return buf.subarray(0, enc.end());
}

async function pageHashPrefixes(gifBytes: Buffer): Promise<string[]> {
  const meta = await sharp(gifBytes, {
    animated: true,
    limitInputPixels: false,
  }).metadata();
  const pages = meta.pages ?? 1;
  const out: string[] = [];
  for (let i = 0; i < pages; i++) {
    const png = await sharp(gifBytes, {
      animated: true,
      page: i,
      limitInputPixels: false,
    })
      .png()
      .toBuffer();
    out.push(sha256Hex(png).slice(0, 12));
  }
  return out;
}

/**
 * Validate READY animated GIF: complete frames, delays, no static collapse.
 */
export async function validateCanonicalAnimatedGifPlayback(
  bytes: Buffer,
  expected?: { frameCount?: number; delaysMs?: number[] },
): Promise<{
  frameCount: number;
  delaysMs: number[];
  loop: number;
  width: number;
  height: number;
  pageHashPrefixes: string[];
}> {
  const meta = await sharp(bytes, {
    animated: true,
    limitInputPixels: false,
    failOn: "error",
  }).metadata();
  const frameCount = meta.pages ?? 1;
  if (frameCount < 2) {
    throw new MediaPipelineError(
      MediaFailureCategory.PROCESSOR_FAILED,
      "GIF READY rejected: first-frame-only / static collapse",
    );
  }
  if (expected?.frameCount != null && frameCount !== expected.frameCount) {
    throw new MediaPipelineError(
      MediaFailureCategory.PROCESSOR_FAILED,
      `GIF READY frame count mismatch: expected ${expected.frameCount}, got ${frameCount}`,
    );
  }
  const delaysMs = Array.isArray(meta.delay)
    ? [...meta.delay]
    : Array(frameCount).fill(meta.delay ?? 100);
  if (expected?.delaysMs) {
    for (let i = 0; i < expected.delaysMs.length; i++) {
      if (delaysMs[i] !== expected.delaysMs[i]) {
        throw new MediaPipelineError(
          MediaFailureCategory.PROCESSOR_FAILED,
          `GIF READY delay mismatch at frame ${i}`,
        );
      }
    }
  }
  const prefixes = await pageHashPrefixes(bytes);
  if (new Set(prefixes).size !== frameCount) {
    throw new MediaPipelineError(
      MediaFailureCategory.PROCESSOR_FAILED,
      "GIF READY rejected: non-distinct visual frames",
    );
  }
  return {
    frameCount,
    delaysMs,
    loop: meta.loop ?? 0,
    width: meta.width ?? 0,
    height: meta.pageHeight || meta.height || 0,
    pageHashPrefixes: prefixes,
  };
}

export async function processGifB2(srcBuf: Buffer): Promise<GifProcessResult> {
  const decoded = await decodeCompositedPages(srcBuf);
  let out: Buffer;
  try {
    out = encodeOmggif(decoded);
  } catch (cause) {
    throw new MediaPipelineError(
      MediaFailureCategory.PROCESSOR_FAILED,
      "omggif.GifWriter encode failed",
      cause,
    );
  }

  const playback = await validateCanonicalAnimatedGifPlayback(out, {
    frameCount: decoded.pages,
    delaysMs: decoded.delays,
  });

  return {
    bytes: out,
    mime: "image/gif",
    format: GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
    width: playback.width,
    height: playback.height,
    byteLength: out.length,
    processRecipeVersion: PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1,
    animationMetadata: {
      animated: true,
      format: GifRuntimeFormat.CANONICAL_ANIMATED_GIF,
      processRecipeVersion: PROCESS_RECIPE.GIF_B2_SHARP_OMGGIF_V1,
      frameCount: playback.frameCount,
      delaysMs: playback.delaysMs,
      loop: playback.loop,
      width: playback.width,
      height: playback.height,
      hasAlpha: decoded.hasAlpha,
      pageHashPrefixes: playback.pageHashPrefixes,
      disposalSemantics: "RESOLVED_FULL_CANVAS_COMPOSITE",
      encoder: "omggif.GifWriter",
      forbiddenEncoder: "cgif",
    },
  };
}
