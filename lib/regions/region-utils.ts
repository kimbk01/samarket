/**
 * 9단계: 지역 표시·필터용 유틸 (동네 인증 확장 시 활용)
 */

import { REGIONS } from "@/lib/products/form-options";
import { getLocationLabel } from "@/lib/products/form-options";

export { getLocationLabel };

export function getRegionName(regionId: string): string {
  const r = REGIONS.find((x) => x.id === regionId);
  return r?.name ?? regionId;
}

export function getRegionOptions() {
  return REGIONS;
}
