/**
 * Supabase profiles.region_* → RegionContext 의 UserRegion (mock 동네 목록과 동일 형태).
 * 매장 피드·탭바 동네는 프로필을 우선하도록 RegionProvider 에서 사용합니다.
 */

import {
  decodeProfileAppLocationPair,
  isProfileLocationComplete,
  resolveProfileLocationDisplayLine,
} from "@/lib/profile/profile-location";
import type { UserRegion } from "@/lib/regions/types";
import { getCurrentUserId } from "@/lib/regions/mock-user-regions";

const PROFILE_LOCATION_ID = "profile-location";

export function userRegionFromProfileSlice(p: {
  region_code?: string | null;
  region_name?: string | null;
  address_detail?: string | null;
}): UserRegion | null {
  if (!isProfileLocationComplete(p)) return null;
  const { regionId, cityId } = decodeProfileAppLocationPair(p.region_code, p.region_name);
  if (!regionId || !cityId) return null;
  const barangay = (p.address_detail ?? "").trim();
  const label = resolveProfileLocationDisplayLine(p).trim() || barangay;
  return {
    id: PROFILE_LOCATION_ID,
    userId: getCurrentUserId(),
    regionId,
    cityId,
    barangay,
    label: label || barangay,
    isPrimary: true,
    createdAt: new Date().toISOString(),
  };
}
