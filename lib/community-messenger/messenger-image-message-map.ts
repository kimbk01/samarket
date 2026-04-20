import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function t(v: unknown): string {
  return String(v ?? "").trim();
}

function isHttpOrBlobUrl(u: string): boolean {
  return /^https?:\/\//i.test(u) || u.startsWith("blob:");
}

function parseMessengerImageUrlArray(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const u = t(raw[i]);
    if (u && isHttpOrBlobUrl(u)) out.push(u);
  }
  return out;
}

/**
 * DB `metadata` + `content` 에서 채팅·라이트박스·복사용 이미지 URL 필드를 채운다.
 * (구 메시지: `image_thumb_urls` 없이 `image_urls` 만 있는 앨범도 지원)
 */
export function messengerImageClientFieldsFromMetadata(
  safeMt: CommunityMessengerMessage["messageType"],
  metadata: Record<string, unknown>,
  content: string
): Partial<
  Pick<
    CommunityMessengerMessage,
    "imageAlbumUrls" | "imageAlbumPreviewUrls" | "imageAlbumOriginalUrls" | "imagePreviewUrl" | "imageOriginalUrl"
  >
> {
  if (safeMt !== "image") return {};

  const thumbs = parseMessengerImageUrlArray(metadata.image_thumb_urls ?? metadata.imageThumbUrls);
  const legacy = parseMessengerImageUrlArray(metadata.image_urls ?? metadata.imageUrls);

  const thumbsAlbum = thumbs.length >= 2;
  const legacyAlbum = legacy.length >= 2;
  const albumDisplay = thumbsAlbum ? thumbs : legacyAlbum ? legacy : [];
  if (thumbsAlbum || legacyAlbum) {
    const previews = parseMessengerImageUrlArray(metadata.image_preview_urls ?? metadata.imagePreviewUrls);
    const albumPreview =
      previews.length >= 2 ? previews : thumbsAlbum ? thumbs : legacyAlbum ? legacy : albumDisplay;
    const originals = legacyAlbum ? legacy : albumDisplay;
    return {
      imageAlbumUrls: albumDisplay,
      imageAlbumPreviewUrls: albumPreview,
      imageAlbumOriginalUrls: originals,
    };
  }

  const c = t(content);
  const pv = t(metadata.image_preview_url ?? metadata.imagePreviewUrl);
  const ov = t(metadata.image_original_url ?? metadata.imageOriginalUrl);
  const out: Partial<
    Pick<CommunityMessengerMessage, "imagePreviewUrl" | "imageOriginalUrl">
  > = {};
  if (pv && isHttpOrBlobUrl(pv)) out.imagePreviewUrl = pv;
  else if (c) out.imagePreviewUrl = c;
  if (ov && isHttpOrBlobUrl(ov)) out.imageOriginalUrl = ov;
  else if (c) out.imageOriginalUrl = c;
  return out;
}
