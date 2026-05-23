import { storeTaxonomyThumbImgClass } from "@/lib/stores/store-taxonomy-thumbnail-ui";

/** 어드민 taxonomy 업로드(`image_url`) — 공백만 있으면 미설정 */
export function storeTaxonomyUploadedImageUrl(raw: unknown): string {  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

/** 업로드 URL 우선, 없으면 정적 아이콘 폴백 */
export function resolveStoreTaxonomyImageSrc(
  uploaded: string,
  fallback: string | null | undefined
): string | null {
  if (uploaded) return uploaded;
  const fb = typeof fallback === "string" ? fallback.trim() : "";
  return fb || null;
}

/** @deprecated `StoreTaxonomyThumb` / `storeTaxonomyThumbImgClass` 사용 */
export function storeTaxonomyImageObjectClass(uploaded: boolean): string {
  return storeTaxonomyThumbImgClass(uploaded);
}