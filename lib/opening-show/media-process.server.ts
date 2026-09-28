import sharp from "sharp";
import { SHARP_DEFAULT_LIMIT_INPUT_PIXELS } from "@/lib/opening-show/transport-limits";
import { validateOpeningImageBytes, type OpeningImageMime } from "@/lib/opening-show/media-validate";

export type OpeningProcessedMedia = {
  mime: OpeningImageMime;
  width: number;
  height: number;
  display: { buf: Buffer; width: number; height: number };
  thumb: { buf: Buffer; width: number; height: number };
};

async function encodeWebp(
  pipeline: sharp.Sharp,
  maxEdge: number,
  quality: number
): Promise<{ buf: Buffer; width: number; height: number }> {
  const buf = await pipeline
    .clone()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
    .toBuffer();
  const meta = await sharp(buf, {
    failOn: "none",
    limitInputPixels: SHARP_DEFAULT_LIMIT_INPUT_PIXELS,
  }).metadata();
  return { buf, width: meta.width ?? 0, height: meta.height ?? 0 };
}

export async function processOpeningImageBuffer(
  bytes: Uint8Array,
  mimeHint: string
): Promise<{ ok: true; result: OpeningProcessedMedia } | { ok: false; error: string }> {
  const validated = validateOpeningImageBytes({ mimeHint, bytes });
  if (!validated.ok) return { ok: false, error: validated.error };

  try {
    const base = sharp(bytes, {
      failOn: "none",
      limitInputPixels: SHARP_DEFAULT_LIMIT_INPUT_PIXELS,
    }).rotate();
    const meta = await base.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 1 || height < 1) return { ok: false, error: "undecodable" };

    const display = await encodeWebp(base, 1920, 82);
    const thumb = await encodeWebp(base, 480, 72);
    if (display.width < 1 || display.height < 1 || thumb.width < 1 || thumb.height < 1) {
      return { ok: false, error: "derivative_failed" };
    }

    return {
      ok: true,
      result: {
        mime: validated.mime,
        width,
        height,
        display,
        thumb,
      },
    };
  } catch {
    return { ok: false, error: "process_failed" };
  }
}
