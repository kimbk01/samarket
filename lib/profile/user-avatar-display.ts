import { isSamarketDefaultAvatarUrl } from "@/lib/profile/default-avatar";

/** 사용자가 직접 업로드한 프로필 사진인지(기본 SVG·빈 값 제외) */
export function hasCustomUserAvatar(avatarUrl: string | null | undefined): boolean {
  const trimmed = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  return Boolean(trimmed && !isSamarketDefaultAvatarUrl(trimmed));
}

/** `<Image>` / `<SamarketThumbnail>` 에 넣을 커스텀 사진 URL — 없으면 null(기본 얼굴 SVG 사용) */
export function resolveUserAvatarImageSrc(avatarUrl: string | null | undefined): string | null {
  return hasCustomUserAvatar(avatarUrl) ? avatarUrl!.trim() : null;
}
