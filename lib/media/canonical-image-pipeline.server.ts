import sharp from "sharp";
import {
  CANONICAL_DERIVATIVE_SPEC,
  type CanonicalImageSurface,
} from "@/lib/media/canonical-image-contract";

export type CanonicalDerivativeBuffer = {
  surface: CanonicalImageSurface;
  buf: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
};

/**
 * Build upload-time derivative buffers from a source image.
 * GIF → skip derivatives (original-only, messenger pattern).
 */
export async function buildCanonicalDerivativeBuffers(input: {
  buf: Buffer;
  mimeType: string;
  surfaces: CanonicalImageSurface[];
}): Promise<CanonicalDerivativeBuffer[]> {
  const mime = (input.mimeType || "").toLowerCase().trim();
  if (mime === "image/gif") return [];

  const base = sharp(input.buf, { failOn: "none", limitInputPixels: false }).rotate();
  const out: CanonicalDerivativeBuffer[] = [];

  for (const surface of input.surfaces) {
    try {
      let pipeline = base.clone();
      if (surface === "hero") {
        const spec = CANONICAL_DERIVATIVE_SPEC.hero;
        pipeline = pipeline.resize({
          width: spec.width,
          height: spec.height,
          fit: spec.fit,
          withoutEnlargement: true,
        });
      } else if (surface === "detail") {
        const spec = CANONICAL_DERIVATIVE_SPEC.detail;
        pipeline = pipeline.resize({
          width: spec.maxEdge,
          height: spec.maxEdge,
          fit: spec.fit,
          withoutEnlargement: true,
        });
      } else {
        const spec = CANONICAL_DERIVATIVE_SPEC[surface];
        pipeline = pipeline.resize({
          width: spec.maxEdge,
          height: spec.maxEdge,
          fit: spec.fit,
          withoutEnlargement: true,
        });
      }

      const quality =
        surface === "hero" || surface === "detail"
          ? CANONICAL_DERIVATIVE_SPEC[surface].quality
          : CANONICAL_DERIVATIVE_SPEC[surface].quality;
      const buf = await pipeline.webp({ quality, effort: 4 }).toBuffer();
      const meta = await sharp(buf, { failOn: "none" }).metadata();
      out.push({
        surface,
        buf,
        contentType: "image/webp",
        width: meta.width ?? 0,
        height: meta.height ?? 0,
      });
    } catch (e) {
      console.error("[buildCanonicalDerivativeBuffers]", surface, e);
    }
  }

  return out;
}

/** Optimize original for post-images upload (WebP, max edge cap). */
export async function optimizePostImageOriginalBuffer(input: {
  buf: Buffer;
  mimeType: string;
  maxEdge?: number;
}): Promise<{ buf: Buffer; contentType: string; ext: string }> {
  const mime = (input.mimeType || "").toLowerCase().trim();
  const maxEdge = input.maxEdge ?? 2560;

  if (mime === "image/gif") {
    return { buf: input.buf, contentType: "image/gif", ext: "gif" };
  }

  const base = sharp(input.buf, { failOn: "none", limitInputPixels: false }).rotate();
  const buf = await base
    .clone()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  return { buf, contentType: "image/webp", ext: "webp" };
}
