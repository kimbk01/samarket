import { randomUUID } from "crypto";
import {
  buildMessengerImageVariantBuffers,
  type MessengerImageVariantBuffers,
} from "@/lib/community-messenger/messenger-image-variants";
import type { CommunityMessengerImageSendItem } from "@/lib/community-messenger/types";

/**
 * D-3 — 메신저 이미지 업로드 가공 루프 단일 정의.
 * multipart(`images/route` 본문 파일)와 staged(Storage staging 객체 다운로드) 두 경로가 **같은** 함수를 쓴다:
 * SEC-09 sharp 소독(원본 메타데이터 제거) → thumb/preview WebP → 최종 baseDir 업로드.
 * 실패 시 지금까지 올린 경로를 돌려준다(호출자가 IMG-02 purge).
 */

export type MessengerImageStorageBucketLike = {
  upload: (
    path: string,
    body: Buffer,
    opts: { contentType: string; upsert: boolean }
  ) => Promise<{ error: { message?: string } | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
};

export type MessengerImageUploadInput = { buf: Buffer; mimeType: string };

export type MessengerImageUploadProcessResult =
  | { ok: true; items: CommunityMessengerImageSendItem[]; uploadedStoragePaths: string[] }
  | { ok: false; error: string; status: 400 | 500; uploadedStoragePaths: string[] };

/** 매직 바이트로 실제 이미지 형식 판정(staged 경로는 클라이언트 MIME 을 신뢰하지 않는다). */
export function sniffMessengerImageMime(buf: Uint8Array): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
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
  if (buf.length >= 6) {
    const head = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!, buf[4]!, buf[5]!);
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function originalExtForMime(outMime: string): string {
  return outMime === "image/png" ? "png" : outMime === "image/webp" ? "webp" : outMime === "image/gif" ? "gif" : "jpg";
}

export async function processMessengerImageUploads(input: {
  bucket: MessengerImageStorageBucketLike;
  baseDir: string;
  images: MessengerImageUploadInput[];
  buildVariants?: (args: { buf: Buffer; mimeType: string }) => Promise<MessengerImageVariantBuffers>;
  newId?: () => string;
}): Promise<MessengerImageUploadProcessResult> {
  const buildVariants = input.buildVariants ?? buildMessengerImageVariantBuffers;
  const newId = input.newId ?? randomUUID;
  const { bucket, baseDir } = input;
  const items: CommunityMessengerImageSendItem[] = [];
  // IMG-02: 올린 저장소 경로를 모아 두었다가 실패·거절 시 purge 로 고아 정리.
  const uploadedStoragePaths: string[] = [];

  for (const image of input.images) {
    const mimeType = (image.mimeType || "").toLowerCase().trim();
    const variants = await buildVariants({ buf: image.buf, mimeType });
    if (variants.kind === "rejected") {
      // SEC-09: sharp 가 원본을 소독하지 못함 → raw 저장 금지, 거부.
      return { ok: false, error: "unsupported_image", status: 400, uploadedStoragePaths };
    }
    const id = newId();
    // SEC-09: 저장 형식·확장자는 소독된 원본의 정규 content-type 을 따른다.
    const outMime = variants.kind === "triple" ? variants.originalContentType : variants.originalMime;
    const originalPath = `${baseDir}/${id}.${originalExtForMime(outMime)}`;

    const uploadBinary = async (path: string, body: Buffer, contentType: string) => {
      const { error } = await bucket.upload(path, body, { contentType, upsert: false });
      if (error) throw new Error(error.message ?? "upload_failed");
      uploadedStoragePaths.push(path);
    };

    try {
      if (variants.kind === "triple") {
        const thumbPath = `${baseDir}/${id}.thumb.webp`;
        const previewPath = `${baseDir}/${id}.preview.webp`;
        await uploadBinary(originalPath, variants.original, variants.originalContentType);
        await uploadBinary(thumbPath, variants.thumb, "image/webp");
        await uploadBinary(previewPath, variants.preview, "image/webp");
        items.push({
          chatPublicUrl: bucket.getPublicUrl(thumbPath).data.publicUrl,
          previewPublicUrl: bucket.getPublicUrl(previewPath).data.publicUrl,
          originalPublicUrl: bucket.getPublicUrl(originalPath).data.publicUrl,
          originalStoragePath: originalPath,
          originalMimeType: variants.originalContentType,
          width: variants.width ?? null,
          height: variants.height ?? null,
        });
      } else {
        await uploadBinary(originalPath, variants.original, variants.originalMime);
        const publicUrl = bucket.getPublicUrl(originalPath).data.publicUrl;
        items.push({
          chatPublicUrl: publicUrl,
          previewPublicUrl: publicUrl,
          originalPublicUrl: publicUrl,
          originalStoragePath: originalPath,
          originalMimeType: variants.originalMime,
          width: variants.width ?? null,
          height: variants.height ?? null,
        });
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "upload_failed",
        status: 500,
        uploadedStoragePaths,
      };
    }
  }
  return { ok: true, items, uploadedStoragePaths };
}
