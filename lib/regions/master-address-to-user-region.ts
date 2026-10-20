/**
 * ADDR-SSOT-002 — 회원 대표 주소(`user_addresses.is_default_master`) → RegionContext `UserRegion`.
 *
 * - 대표 주소가 지역(primaryRegion/currentRegion)의 권위 — profiles.region_* 는 첫 페인트 폴백만.
 * - City 단위만 노출: `barangay` 는 항상 `""` (상세주소·profiles.address_detail 유출 금지),
 *   `label` 은 REGIONS 카탈로그 City 라벨 (`Region · City`).
 * - 매장 피드 게이트·탭 prewarm·`/products/new` 기본 지역이 같은 파생을 쓰도록 단일 정의.
 */

import type { AddressDefaultsSnapshot } from "@/lib/addresses/address-defaults-snapshot";
import { coerceUserAddressDTO } from "@/lib/addresses/coerce-user-address-dto";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { getLocationLabel } from "@/lib/products/form-options";
import type { UserRegion } from "@/lib/regions/types";

/** 대표 주소에서 파생된 primary 행 id */
export const MASTER_ADDRESS_REGION_ID = "master-address";
/** profiles.region_* 폴백 행 id (첫 페인트 전용) */
export const PROFILE_LOCATION_REGION_ID = "profile-location";

/** regionId·cityId → City 단위 UserRegion (barangay 항상 빈 값). */
export function cityUserRegionFromAppLocation(
  loc: { regionId: string; cityId: string } | null | undefined,
  opts: { id: string; userId: string }
): UserRegion | null {
  const regionId = loc?.regionId?.trim() ?? "";
  const cityId = loc?.cityId?.trim() ?? "";
  if (!regionId || !cityId) return null;
  const label = getLocationLabel(regionId, cityId);
  return {
    id: opts.id,
    userId: opts.userId,
    regionId,
    cityId,
    barangay: "",
    label,
    isPrimary: true,
    createdAt: new Date().toISOString(),
  };
}

export function userRegionFromMasterAddress(
  master: UserAddressDTO | null | undefined,
  userId: string
): UserRegion | null {
  if (!master) return null;
  return cityUserRegionFromAppLocation(mapUserAddressToAppLocation(master), {
    id: MASTER_ADDRESS_REGION_ID,
    userId,
  });
}

export type MasterRegionSnapshotResult =
  /** 스냅샷 수신 실패 — 호출자는 이전 값을 유지한다 */
  | { kind: "unavailable" }
  /** 정상 응답 — region null 이면 대표 주소 없음(또는 카탈로그 매칭 불가) */
  | { kind: "resolved"; region: UserRegion | null };

export function userRegionFromAddressDefaultsSnapshot(
  snapshot: AddressDefaultsSnapshot | null | undefined,
  userId: string
): MasterRegionSnapshotResult {
  if (!snapshot || !snapshot.ok || snapshot.status !== 200) return { kind: "unavailable" };
  const master = coerceUserAddressDTO(snapshot.defaults?.master ?? null);
  return { kind: "resolved", region: userRegionFromMasterAddress(master, userId) };
}

export function sameCityUserRegion(a: UserRegion | null, b: UserRegion | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.regionId === b.regionId &&
    a.cityId === b.cityId &&
    a.barangay === b.barangay &&
    a.label === b.label
  );
}
