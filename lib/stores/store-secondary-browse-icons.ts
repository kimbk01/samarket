/**
 * `/stores` 탐색 그리드 — 식당 외 1차 업종의 2차 카드 이미지.
 * `public/icons/{folder}/{folder}_0_{n}.png` 규칙 (n=0 전체, 1.. 각 세부 토픽 순서).
 */
export const STORE_SECONDARY_BROWSE_ICON_FOLDER: Record<string, string> = {
  mart: "mart",
  hardware: "hardware",
  pet: "pet",
  cafe: "cafe",
  beauty: "beauty",
  academy: "academy",
  life: "life",
};

export function storeSecondaryBrowseIconPath(primarySlug: string, indexInGrid: number): string | null {
  const slug = primarySlug.trim();
  const folder = STORE_SECONDARY_BROWSE_ICON_FOLDER[slug];
  if (!folder || indexInGrid < 0) return null;
  return `/icons/${folder}/${folder}_0_${indexInGrid}.png`;
}
