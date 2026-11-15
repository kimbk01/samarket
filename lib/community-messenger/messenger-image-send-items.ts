import type { CommunityMessengerImageSendItem, CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  MESSENGER_LEGACY_MEDIA_BUCKET,
  MESSENGER_PRIVATE_MEDIA_BUCKET,
} from "@/lib/community-messenger/media/messenger-media-ref";
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

/** C-4: metadata.storage_bucket — 비공개 버킷 업로드만 `messenger-media`, 그 외 레거시 `post-images`. */
function messengerMediaStorageBucketValue(v: unknown): string {
  return trim(v) === MESSENGER_PRIVATE_MEDIA_BUCKET ? MESSENGER_PRIVATE_MEDIA_BUCKET : MESSENGER_LEGACY_MEDIA_BUCKET;
}

/*
 * 아래 두 함수는 service.ts 에서 옮겨 왔다(동작 동일) — 저장 metadata·서버 응답을
 * 업로드 → 정리 → 저장 → 응답 → 실시간 → 화면 시험(`messenger-image-pipeline-e2e.test.tsx`)이 그대로 쓰도록.
 */
export function communityMessengerImageMessageMetadata(items: CommunityMessengerImageSendItem[]): Record<string, unknown> {
  const storageBucket = messengerMediaStorageBucketValue(items[0]?.storageBucket);
  if (items.length === 1) {
    const f = items[0]!;
    const w = messengerImagePixelDimension(f.width);
    const h = messengerImagePixelDimension(f.height);
    return {
      storagePath: f.originalStoragePath,
      storage_bucket: storageBucket,
      storage_path: f.originalStoragePath,
      mimeType: f.originalMimeType,
      image_thumb_url: f.chatPublicUrl,
      image_preview_url: f.previewPublicUrl,
      image_original_url: f.originalPublicUrl,
      // 말풍선 자리를 처음부터 고정(로드 후 커지며 하단이 잘리는 현상 방지) — 둘 다 있을 때만 저장.
      ...(w != null && h != null ? { image_width: w, image_height: h } : {}),
      // SSOT M3: 흐린 미리보기 — 받기 전 즉시 표시(깜빡임 0)
      ...(messengerImageBlurDataUrlOrNull(f.blurDataUrl) ? { image_blur: messengerImageBlurDataUrlOrNull(f.blurDataUrl) } : {}),
    };
  }
  return {
    image_thumb_urls: items.map((i) => i.chatPublicUrl),
    image_preview_urls: items.map((i) => i.previewPublicUrl),
    image_urls: items.map((i) => i.originalPublicUrl),
    storage_paths: items.map((i) => i.originalStoragePath),
    mime_types: items.map((i) => i.originalMimeType),
    image_widths: items.map((i) => messengerImagePixelDimension(i.width)),
    image_heights: items.map((i) => messengerImagePixelDimension(i.height)),
    ...(items.some((i) => messengerImageBlurDataUrlOrNull(i.blurDataUrl))
      ? { image_blurs: items.map((i) => messengerImageBlurDataUrlOrNull(i.blurDataUrl) ?? "") }
      : {}),
    storagePath: items[0]!.originalStoragePath,
    mimeType: items[0]!.originalMimeType,
    storage_bucket: storageBucket,
    storage_path: items[0]!.originalStoragePath,
  };
}

export function communityMessengerBuiltImageClientMessage(
  items: CommunityMessengerImageSendItem[],
  createdAt: string,
  id: string,
  roomId: string,
  userId: string,
  /** 내 이름 표시(서버 언어 기준 「나」) — 부르는 쪽이 넣는다(이 모듈은 서버 i18n 을 import 하지 않음) */
  senderLabel: string
): CommunityMessengerMessage {
  const first = items[0]!;
  const base: CommunityMessengerMessage = {
    id,
    roomId,
    senderId: userId,
    senderLabel,
    messageType: "image",
    content: first.chatPublicUrl,
    createdAt,
    isMine: true,
    callKind: null,
    callStatus: null,
  };
  if (items.length > 1) {
    return {
      ...base,
      imageAlbumUrls: items.map((i) => i.chatPublicUrl),
      imageAlbumPreviewUrls: items.map((i) => i.previewPublicUrl),
      imageAlbumOriginalUrls: items.map((i) => i.originalPublicUrl),
      ...(items.some((i) => messengerImageBlurDataUrlOrNull(i.blurDataUrl))
        ? { imageAlbumBlurDataUrls: items.map((i) => messengerImageBlurDataUrlOrNull(i.blurDataUrl) ?? "") }
        : {}),
    };
  }
  const w = messengerImagePixelDimension(first.width);
  const h = messengerImagePixelDimension(first.height);
  return {
    ...base,
    imagePreviewUrl: first.previewPublicUrl,
    imageOriginalUrl: first.originalPublicUrl,
    ...(w != null && h != null ? { imageWidth: w, imageHeight: h } : {}),
    ...(messengerImageBlurDataUrlOrNull(first.blurDataUrl)
      ? { imageBlurDataUrl: messengerImageBlurDataUrlOrNull(first.blurDataUrl) }
      : {}),
  };
}

