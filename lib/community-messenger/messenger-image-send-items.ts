import type { CommunityMessengerImageSendItem } from "@/lib/community-messenger/types";
import { messengerImageBlurDataUrlOrNull } from "@/lib/community-messenger/messenger-image-message-map";

/** 표시 픽셀 크기 — 양의 정수만(상한 100000), 그 외 null. */
export function messengerImagePixelDimension(v: unknown): number | null {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 && n <= 100_000 ? n : null;
}

function trim(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * 업로드 결과 → 메시지 저장 입력 정리 (단일 정의).
 * **업로드 단계가 만든 필드를 여기서 빠뜨리면 저장 직전에 버려진다** — 2026-11-14 storage_bucket 누락,
 * 2026-11-16 흐린 미리보기(blurDataUrl) 누락 둘 다 이 정리 단계에서 났다. 필드를 추가하면 여기와 시험
 * (`messenger-image-send-items.test.ts`)을 함께 고친다.
 */
export function normalizeCommunityMessengerImageSendItems(
  items: ReadonlyArray<CommunityMessengerImageSendItem> | null | undefined
): CommunityMessengerImageSendItem[] {
  return (items ?? [])
    .map((it) => ({
      chatPublicUrl: trim(it.chatPublicUrl),
      previewPublicUrl: trim(it.previewPublicUrl),
      originalPublicUrl: trim(it.originalPublicUrl),
      originalStoragePath: trim(it.originalStoragePath),
      originalMimeType: trim(it.originalMimeType) || "image/jpeg",
      /** C-4 업로드 버킷 — 빠지면 metadata.storage_bucket 이 post-images 로 잘못 저장됐다(2026-11-14). */
      storageBucket: trim(it.storageBucket) || null,
      width: messengerImagePixelDimension(it.width),
      height: messengerImagePixelDimension(it.height),
      /** SSOT M3 흐린 미리보기 — 빠지면 metadata.image_blur 가 저장되지 않았다(2026-11-16 실기 FAIL). */
      blurDataUrl: messengerImageBlurDataUrlOrNull(it.blurDataUrl),
    }))
    .filter((it) => it.chatPublicUrl && it.previewPublicUrl && it.originalPublicUrl && it.originalStoragePath);
}
