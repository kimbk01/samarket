import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

function t(v: unknown): string {
  return String(v ?? "").trim();
}

function parseMessengerImageUrlArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => t(x)).filter((u) => /^https?:\/\//i.test(u) || u.startsWith("blob:"));
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
  const c = t(content);
  const thumbs = parseMessengerImageUrlArray(metadata.image_thumb_urls ?? metadata.imageThumbUrls);
  const legacy = parseMessengerImageUrlArray(metadata.image_urls ?? metadata.imageUrls);
  const previews = parseMessengerImageUrlArray(metadata.image_preview_urls ?? metadata.imagePreviewUrls);

  const albumDisplay = thumbs.length >= 2 ? thumbs : legacy.length >= 2 ? legacy : [];
  if (albumDisplay.length >= 2) {
    const albumPreview =
      previews.length >= 2 ? previews : thumbs.length >= 2 ? thumbs : legacy.length >= 2 ? legacy : albumDisplay;
    const originals = legacy.length >= 2 ? legacy : albumDisplay;
    return {
      imageAlbumUrls: albumDisplay,
      imageAlbumPreviewUrls: albumPreview.length >= 2 ? albumPreview : albumDisplay,
      imageAlbumOriginalUrls: originals.length >= 2 ? originals : albumDisplay,
    };
  }

  const pv = t(metadata.image_preview_url ?? metadata.imagePreviewUrl);
  const ov = t(metadata.image_original_url ?? metadata.imageOriginalUrl);
  const out: Partial<
    Pick<CommunityMessengerMessage, "imagePreviewUrl" | "imageOriginalUrl">
  > = {};
  if (pv && (/^https?:\/\//i.test(pv) || pv.startsWith("blob:"))) out.imagePreviewUrl = pv;
  else if (c) out.imagePreviewUrl = c;
  if (ov && (/^https?:\/\//i.test(ov) || ov.startsWith("blob:"))) out.imageOriginalUrl = ov;
  else if (c) out.imageOriginalUrl = c;
  return out;
}
