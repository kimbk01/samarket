import sharp from "sharp";
import {
  OWNER_PRODUCT_IMAGE_ALLOWED_MIMES,
  OWNER_PRODUCT_IMAGE_MAX_BYTES,
  OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
  validateOwnerProductImagePixelDimensions,
} from "@/lib/stores/owner-product-images";

export type ProcessOwnerProductImageResult = {
  buf: Buffer;
  contentType: string;
  ext: string;
  width: number;
  height: number;
};

async function encodeWebpWithCap(
  pipeline: sharp.Sharp,
  maxBytes: number
): Promise<{ buf: Buffer; width: number; height: number }> {
  const qualities = [86, 78, 70, 62, 54];
  let last: Buffer | null = null;
  let lastW = 0;
  let lastH = 0;
  for (const q of qualities) {
    const buf = await pipeline.clone().webp({ quality: q, effort: 4 }).toBuffer();
    const meta = await sharp(buf, { failOn: "none" }).metadata();
    last = buf;
    lastW = meta.width ?? 0;
    lastH = meta.height ?? 0;
    if (buf.length <= maxBytes) {
      return { buf, width: lastW, height: lastH };
    }
  }
  if (!last || lastW < 1 || lastH < 1) {
    throw new Error("upload_failed");
  }
  return { buf: last, width: lastW, height: lastH };
}

/**
 * 오너 상품 이미지 업로드용 버퍼 처리 (API route 전용).
 * - 512×512 이상·이하 모두 허용. 긴 변이 STORE_MAX(4096) 초과일 때만 축소(withoutEnlargement).
 * - JPEG/PNG → WebP, 기존 WebP 재인코딩.
 */
export async function processOwnerProductImageBuffer(
  input: Buffer,
  mime: string
): Promise<ProcessOwnerProductImageResult> {
  const normalizedMime = (mime || "").toLowerCase();
  if (!OWNER_PRODUCT_IMAGE_ALLOWED_MIMES.has(normalizedMime)) {
    throw new Error("invalid_type");
  }

  const base = sharp(input, { failOn: "none", limitInputPixels: false }).rotate();
  const meta = await base.metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW >= 1 && srcH >= 1) {
    const dimCheck = validateOwnerProductImagePixelDimensions(srcW, srcH);
    if (!dimCheck.ok) {
      throw new Error(dimCheck.error);
    }
  }

  const resized = base.clone().resize({
    width: OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
    height: OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
    fit: "inside",
    withoutEnlargement: true,
  });

  try {
    const encoded = await encodeWebpWithCap(resized, OWNER_PRODUCT_IMAGE_MAX_BYTES);
    const dimCheck = validateOwnerProductImagePixelDimensions(encoded.width, encoded.height);
    if (!dimCheck.ok) {
      throw new Error(dimCheck.error);
    }
    return {
      buf: encoded.buf,
      contentType: "image/webp",
      ext: "webp",
      width: encoded.width,
      height: encoded.height,
    };
  } catch (e) {
    console.error("[processOwnerProductImageBuffer] webp", e);
    if (normalizedMime === "image/webp") {
      const dimCheck = validateOwnerProductImagePixelDimensions(srcW, srcH);
      if (srcW >= 1 && srcH >= 1 && !dimCheck.ok) {
        throw new Error(dimCheck.error);
      }
      if (input.length <= OWNER_PRODUCT_IMAGE_MAX_BYTES && srcW >= 1 && srcH >= 1) {
        return {
          buf: input,
          contentType: "image/webp",
          ext: "webp",
          width: srcW,
          height: srcH,
        };
      }
    }
    const fallbackBuf = await resized.clone().jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    const fbMeta = await sharp(fallbackBuf, { failOn: "none" }).metadata();
    const fw = fbMeta.width ?? srcW;
    const fh = fbMeta.height ?? srcH;
    const dimCheck = validateOwnerProductImagePixelDimensions(fw, fh);
    if (!dimCheck.ok) {
      throw new Error(dimCheck.error);
    }
    return {
      buf: fallbackBuf,
      contentType: "image/jpeg",
      ext: "jpg",
      width: fw,
      height: fh,
    };
  }
}
