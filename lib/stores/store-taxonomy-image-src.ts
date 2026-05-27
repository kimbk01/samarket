import { storeTaxonomyThumbImgClass } from "@/lib/stores/store-taxonomy-thumbnail-ui";

/** 어드민 taxonomy 업로드(`image_url`) — 공백만 있으면 미설정 */
export function storeTaxonomyUploadedImageUrl(raw: unknown): string {  return typeof raw === "string" && raw.trim() ? raw.trim() : "";
}

/** 업로드 URL only — 정적 `/public/icons` 폴백 금지 */
export function resolveStoreTaxonomyImageSrc(
  uploaded: string,
  _fallback?: string | null | undefined
): string | null {
  return uploaded || null;
}

/** @deprecated `StoreTaxonomyThumb` / `storeTaxonomyThumbImgClass` 사용 */
export function storeTaxonomyImageObjectClass(uploaded: boolean): string {
  return storeTaxonomyThumbImgClass(uploaded);
}