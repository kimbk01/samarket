import { REGIONS } from "@/lib/products/form-options";
import { getRegionName } from "@/lib/regions/region-utils";
import type { UserRegion } from "@/lib/regions/types";

export type StoresBrowseClientQueryInput = {
  primary: string;
  sub?: string | null;
  sort?: string | null;
  primaryRegion?: UserRegion | null;
  userLat?: number | null;
  userLng?: number | null;
  /** 거리 정렬용 geo — prewarm·탭 hover 기본 false */
  includeGeo?: boolean;
};

function browseCityLabel(regionId: string, cityId: string): string {
  const reg = REGIONS.find((x) => x.id === regionId);
  const city = reg?.cities.find((c) => c.id === cityId);
  return city?.name?.trim() ?? "";
}

/** `fetchStoresBrowseDeduped` / prewarm coordinator 공통 쿼리 문자열 */
export function buildStoresBrowseClientQueryString(input: StoresBrowseClientQueryInput): string {
  const primary = input.primary.trim().toLowerCase();
  const sub = (input.sub ?? "all").trim().toLowerCase() || "all";
  const q = new URLSearchParams();
  q.set("primary", primary);
  q.set("sub", sub);
  const region = input.primaryRegion;
  const regionName = region?.regionId ? getRegionName(region.regionId).trim() : "";
  if (regionName) q.set("region", regionName);
  if (region?.regionId && region.cityId) {
    const cityLabel = browseCityLabel(region.regionId, region.cityId);
    if (cityLabel) q.set("city", cityLabel);
  }
  const district = region?.barangay?.trim() ?? "";
  if (district) q.set("district", district);
  const sort = input.sort?.trim().toLowerCase();
  if (sort && sort !== "default") q.set("sort", sort);
  if (input.includeGeo) {
    const lat = input.userLat;
    const lng = input.userLng;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      q.set("user_lat", String(lat));
      q.set("user_lng", String(lng));
    }
  }
  return q.toString();
}
