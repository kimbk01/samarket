/**
 * `/stores` 대분류 탭(1) · 세부 그리드/칩(2) — taxonomy 썸네일 단일 규격.
 * 40×40px 고정, 업로드 이미지는 `object-cover` 로 프레임을 꽉 채움.
 */
export const STORE_TAXONOMY_THUMB_PX = 40;

/** 고정 클립 영역만 — 배경·테두리 없음(카드 안 이중 테두리 방지) */
export const STORE_TAXONOMY_THUMB_FRAME =
  "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden";

export function storeTaxonomyThumbImgClass(isUploaded: boolean): string {
  return isUploaded
    ? "block h-full w-full max-h-10 max-w-10 border-0 object-cover"
    : "block h-full w-full max-h-10 max-w-10 border-0 object-contain";
}
