import { getLocationLabel, getLocationLabelIfValid } from "@/lib/products/form-options";

/** 물품 글 `posts.region`·`posts.city`(앱 지역 ID) → 목록·상세와 동일 한 줄 라벨 */
export function formatPostListingLocationLine(
  region: string | null | undefined,
  city: string | null | undefined
): string | null {
  const r = (region ?? "").trim();
  const c = (city ?? "").trim();
  if (!r && !c) return null;
  if (r && c) {
    const v = getLocationLabelIfValid(r, c);
    if (v) return v;
    const loose = getLocationLabel(r, c).trim();
    if (loose) return loose;
  }
  if (r) {
    const one = getLocationLabel(r, c).trim();
    return one || r;
  }
  return null;
}
