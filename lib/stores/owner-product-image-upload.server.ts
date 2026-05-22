import sharp from "sharp";
import {
  OWNER_PRODUCT_IMAGE_ALLOWED_MIMES,
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

/**
 * 오너 상품 이미지 업로드용 버퍼 처리 (API route 전용).
 * - 512×512 이상(및 그 이하) 모두 허용. 긴 변이 STORE_MAX(4096) 초과일 때만 축소(withoutEnlargement).
 * - JPEG/PNG → WebP(품질 86), 기존 WebP는 재인코딩.
 */
export async function processOwnerProductImageBuffer(
  input: Buffer,
  mime: string
): Promise<ProcessOwnerProductImageResult> {
  const normalizedMime = (mime || "").toLowerCase();
  if (!OWNER_PRODUCT_IMAGE_ALLOWED_MIMES.has(normalizedMime)) {
    throw new Error("invalid_type");
  }

  const base = sharp(input, { failOn: "none" }).rotate();
  const meta = await base.metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  const dimCheck = validateOwnerProductImagePixelDimensions(srcW, srcH);
  if (!dimCheck.ok) {
    throw new Error(dimCheck.error);
  }

  const pipeline = base.clone().resize({
    width: OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
    height: OWNER_PRODUCT_IMAGE_STORE_MAX_EDGE_PX,
    fit: "inside",
    withoutEnlargement: true,
  });

  let buf: Buffer;
  try {
    buf = await pipeline.webp({ quality: 86, effort: 4 }).toBuffer();
  } catch (e) {
    console.error("[processOwnerProductImageBuffer] webp", e);
    if (normalizedMime === "image/webp") {
      buf = input;
    } else {
      buf = await base.clone().toBuffer();
    }
    const outMeta = await sharp(buf, { failOn: "none" }).metadata();
    return {
      buf,
      contentType: normalizedMime === "image/png" ? "image/png" : normalizedMime,
      ext: normalizedMime === "image/png" ? "png" : normalizedMime === "image/webp" ? "webp" : "jpg",
      width: outMeta.width ?? srcW,
      height: outMeta.height ?? srcH,
    };
  }

  const outMeta = await sharp(buf, { failOn: "none" }).metadata();
  return {
    buf,
    contentType: "image/webp",
    ext: "webp",
    width: outMeta.width ?? srcW,
    height: outMeta.height ?? srcH,
  };
}
