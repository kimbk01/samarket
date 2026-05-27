/**
 * @deprecated static `/public/icons/*` taxonomy 폴백 금지.
 * 업종 아이콘은 admin taxonomy `image_url`만 사용한다.
 */
export function storeSecondaryBrowseIconPath(_primarySlug: string, _indexInGrid: number): string | null {
  return null;
}
