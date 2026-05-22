import { OWNER_PRODUCT_IMAGE_ALLOWED_MIMES } from "@/lib/stores/owner-product-images";

/** 업로드 바이트 시그니처(JPEG/PNG/WebP) */
export function sniffOwnerProductImageMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export function resolveOwnerProductImageMimeForUpload(
  declaredMime: string,
  fileName: string,
  buf: Buffer
): string | null {
  const raw = declaredMime.toLowerCase().trim();
  if (OWNER_PRODUCT_IMAGE_ALLOWED_MIMES.has(raw)) {
    return raw === "image/jpg" ? "image/jpeg" : raw;
  }
  const fromName = fileName.trim().toLowerCase();
  if (/\.jpe?g$/.test(fromName)) return "image/jpeg";
  if (/\.png$/.test(fromName)) return "image/png";
  if (/\.webp$/.test(fromName)) return "image/webp";
  return sniffOwnerProductImageMimeFromBuffer(buf);
}
