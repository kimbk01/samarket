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
      /** SEC-09: 메타데이터(EXIF/GPS) 제거된 원본의 정규 content-type */
      originalContentType: string;
      thumb: Buffer;
      preview: Buffer;
      /** 표시 방향(EXIF 회전 반영) 기준 픽셀 크기 — 말풍선 자리를 미리 잡는 데 쓴다. 못 읽으면 null. */
      width?: number | null;
      height?: number | null;
    }
  | {
      kind: "original_only";
      original: Buffer;
      originalMime: string;
      width?: number | null;
      height?: number | null;
    }
  | {
      /** SEC-09: sharp 가 원본을 처리/소독하지 못하면 업로드 거부(원본 raw 저장 금지) */
      kind: "rejected";
      reason: "image_unprocessable";
    };

/**
 * SEC-09 — 원본에서 EXIF/GPS 등 메타데이터를 제거한다. sharp 재인코딩은 기본적으로
 * 메타데이터를 복사하지 않으므로(withMetadata 미호출) 메타데이터가 제거된다.
 * rotate() 로 EXIF 방향을 픽셀에 굽고 방향 태그 의존성을 없앤다.
 */
async function sanitizeNonGifOriginal(
  buf: Buffer,
  mime: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    const base = sharp(buf, { failOn: "none" }).rotate();
    if (mime === "image/png") {
      return { buf: await base.png({ compressionLevel: 9 }).toBuffer(), contentType: "image/png" };
    }
    if (mime === "image/webp") {
      return { buf: await base.webp({ quality: 92, effort: 4 }).toBuffer(), contentType: "image/webp" };
    }
    // jpeg (and any other sharp-decodable raster) → metadata-free jpeg, 시각적 무손실에 가깝게
    return { buf: await base.jpeg({ quality: 95, mozjpeg: true }).toBuffer(), contentType: "image/jpeg" };
  } catch {
    return null;
  }
}

async function readDisplayDimensions(
  buf: Buffer,
  animated: boolean,
): Promise<{ width: number | null; height: number | null }> {
  try {
    const meta = await sharp(buf, { failOn: "none", animated }).metadata();
    const w = Math.floor(Number(meta.width) || 0);
    // 애니메이션 GIF 는 height 가 전체 프레임 합 — 한 프레임 높이(pageHeight)를 쓴다.
    const h = Math.floor(Number(animated && meta.pageHeight ? meta.pageHeight : meta.height) || 0);
    return w > 0 && h > 0 ? { width: w, height: h } : { width: null, height: null };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * 원본 버퍼에서 채팅용 WebP 썸네일·확대용 WebP 를 만들고, **메타데이터가 제거된 원본**을 돌려준다.
 * - GIF(애니메이션): 메타데이터만 제거한 GIF 원본 반환(썸네일/프리뷰 없음).
 * - 그 외: 소독 원본 + thumb + preview(triple).
 * - sharp 가 처리 실패하면 rejected(업로드 라우트가 거부).
 */
export async function buildMessengerImageVariantBuffers(input: {
  buf: Buffer;
  mimeType: string;
}): Promise<MessengerImageVariantBuffers> {
  const mime = (input.mimeType || "").toLowerCase().trim();

  if (mime === "image/gif") {
    try {
      // 애니메이션 보존 + 메타데이터 제거
      const sanitized = await sharp(input.buf, { animated: true, failOn: "none" }).gif().toBuffer();
      const dims = await readDisplayDimensions(sanitized, true);
      return { kind: "original_only", original: sanitized, originalMime: "image/gif", ...dims };
    } catch {
      return { kind: "rejected", reason: "image_unprocessable" };
    }
  }

  try {
    const sanitizedOriginal = await sanitizeNonGifOriginal(input.buf, mime);
    if (!sanitizedOriginal) {
      return { kind: "rejected", reason: "image_unprocessable" };
    }
    const [thumb, preview] = await Promise.all([
      sharp(input.buf, { failOn: "none" })
        .rotate()
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
    // 소독 원본은 rotate() 로 방향이 픽셀에 구워져 있어 metadata 의 가로·세로가 곧 표시 크기다.
    const dims = await readDisplayDimensions(sanitizedOriginal.buf, false);
    return {
      kind: "triple",
      original: sanitizedOriginal.buf,
      originalContentType: sanitizedOriginal.contentType,
      thumb,
      preview,
      ...dims,
    };
  } catch {
    return { kind: "rejected", reason: "image_unprocessable" };
  }
}
