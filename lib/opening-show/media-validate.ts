export const OPENING_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type OpeningImageMime = (typeof OPENING_IMAGE_MIMES)[number];

const MIME_BY_EXT: Record<string, OpeningImageMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extForOpeningMime(mime: OpeningImageMime): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function sniffOpeningImageMime(bytes: Uint8Array): OpeningImageMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  return null;
}

export function normalizeOpeningMimeHint(raw: string): OpeningImageMime | null {
  const mime = raw.trim().toLowerCase();
  if (mime === "image/jpg" || mime === "image/jpeg") return "image/jpeg";
  if (mime === "image/png" || mime === "image/webp") return mime;
  return null;
}

export function openingMimeFromFileName(name: string): OpeningImageMime | null {
  const ext = name.trim().toLowerCase().split(".").pop() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

export function validateOpeningImageBytes(input: {
  mimeHint: string;
  bytes: Uint8Array;
}): { ok: true; mime: OpeningImageMime } | { ok: false; error: "empty" | "unsupported_type" | "magic_mismatch" } {
  if (input.bytes.byteLength < 1) return { ok: false, error: "empty" };
  const sniffed = sniffOpeningImageMime(input.bytes);
  if (!sniffed) return { ok: false, error: "unsupported_type" };
  const hinted = normalizeOpeningMimeHint(input.mimeHint);
  if (hinted && hinted !== sniffed) return { ok: false, error: "magic_mismatch" };
  return { ok: true, mime: sniffed };
}
