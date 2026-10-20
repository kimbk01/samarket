/**
 * Supabase profiles.region_* → RegionContext 의 UserRegion (mock 동네 목록과 동일 형태).
 *
 * ADDR-SSOT-002: 권위는 회원 대표 주소(`master-address-to-user-region`). 이 파생은 대표 주소
 * 수신 전 첫 페인트·prewarm 폴백 전용이며 대표 주소와 같은 City 단위 형태를 쓴다 —
 * `barangay` 는 항상 `""` (profiles.address_detail 상세주소 미사용), `label` 은 City 라벨.
 */

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  decodeProfileAppLocationPair,
  isProfileLocationComplete,
} from "@/lib/profile/profile-location";
import {
  PROFILE_LOCATION_REGION_ID,
  cityUserRegionFromAppLocation,
} from "@/lib/regions/master-address-to-user-region";
import type { UserRegion } from "@/lib/regions/types";

export function userRegionFromProfileSlice(p: {
  region_code?: string | null;
  region_name?: string | null;
  full_address?: string | null;
}): UserRegion | null {
  if (!isProfileLocationComplete(p)) return null;
  const { regionId, cityId } = decodeProfileAppLocationPair(p.region_code, p.region_name);
  if (!regionId || !cityId) return null;
  return cityUserRegionFromAppLocation(
    { regionId, cityId },
    { id: PROFILE_LOCATION_REGION_ID, userId: getCurrentUser()?.id ?? "guest" }
  );
}
