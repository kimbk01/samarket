import sharp from "sharp";

/** 채팅 썸네일: 긴 변 기준 */
export const MESSENGER_IMAGE_CHAT_LONG_EDGE = 960;
/** 확대용: 긴 변 기준 */
export const MESSENGER_IMAGE_PREVIEW_LONG_EDGE = 1600;
export const MESSENGER_IMAGE_CHAT_WEBP_QUALITY = 78;
export const MESSENGER_IMAGE_PREVIEW_WEBP_QUALITY = 86;

export type MessengerImageVariantBuffers =
  | {
      kind: "triple";
      original: Buffer;
      thumb: Buffer;
      preview: Buffer;
    }
  | {
      kind: "original_only";
      original: Buffer;
      originalMime: string;
    };

/**
 * 원본 버퍼에서 채팅용 WebP 썸네일·확대용 WebP 를 만든다.
 * GIF·애니메이션·Sharp 실패 시 원본만 반환(업로드 라우트에서 동일 URL 재사용).
 */
export async function buildMessengerImageVariantBuffers(input: {
  buf: Buffer;
  mimeType: string;
}): Promise<MessengerImageVariantBuffers> {
  const mime = (input.mimeType || "").toLowerCase().trim();
  if (mime === "image/gif") {
    return { kind: "original_only", original: input.buf, originalMime: mime };
  }
  try {
    const base = sharp(input.buf, { failOn: "none" }).rotate();
    const [thumb, preview] = await Promise.all([
      base
        .clone()
        .resize({
          width: MESSENGER_IMAGE_CHAT_LONG_EDGE,
          height: MESSENGER_IMAGE_CHAT_LONG_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: MESSENGER_IMAGE_CHAT_WEBP_QUALITY, effort: 4 })
        .toBuffer(),
      sharp(input.buf, { failOn: "none" })
        .rotate()
        .resize({
          width: MESSENGER_IMAGE_PREVIEW_LONG_EDGE,
          height: MESSENGER_IMAGE_PREVIEW_LONG_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: MESSENGER_IMAGE_PREVIEW_WEBP_QUALITY, effort: 4 })
        .toBuffer(),
    ]);
    return { kind: "triple", original: input.buf, thumb, preview };
  } catch {
    return { kind: "original_only", original: input.buf, originalMime: mime || "application/octet-stream" };
  }
}
