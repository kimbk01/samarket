/**
 * HEIC/HEIF decode for canonical image pipeline (Node/Vercel-safe, no system libheif).
 *
 * Policy: HEIC may arrive from mobile pickers; server always decodes before sharp/WebP.
 */
import convert from "heic-convert";

const HEIC_FTYP_BRANDS = new Set(["heic", "heix", "hevc", "mif1", "msf1", "heim", "heis"]);

/** Sniff ISO BMFF `ftyp` brand for HEIC/HEIF containers. */
export function isHeicOrHeifBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12).toLowerCase();
  return HEIC_FTYP_BRANDS.has(brand);
}

export function isHeicOrHeifMime(mime: string): boolean {
  const m = (mime || "").toLowerCase().trim();
  return m === "image/heic" || m === "image/heif";
}

/** Decode HEIC/HEIF container → JPEG bytes for sharp downstream processing. */
export async function decodeHeicToJpegBuffer(buf: Buffer): Promise<Buffer> {
  const out = await convert({
    buffer: buf,
    format: "JPEG",
    quality: 0.92,
  });
  return Buffer.from(out);
}

export async function normalizeHeicInputBuffer(input: {
  buf: Buffer;
  mimeType: string;
}): Promise<{ buf: Buffer; mimeType: string; decodedFromHeic: boolean }> {
  const mime = (input.mimeType || "").toLowerCase().trim();
  if (mime === "image/gif") {
    return { buf: input.buf, mimeType: mime, decodedFromHeic: false };
  }
  if (!isHeicOrHeifMime(mime) && !isHeicOrHeifBuffer(input.buf)) {
    return { buf: input.buf, mimeType: mime || "image/jpeg", decodedFromHeic: false };
  }
  const jpeg = await decodeHeicToJpegBuffer(input.buf);
  return { buf: jpeg, mimeType: "image/jpeg", decodedFromHeic: true };
}
