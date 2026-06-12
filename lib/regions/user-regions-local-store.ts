/**
 * 사용자 저장 동네 — 클라이언트 in-memory (프로필 region 우선, RegionProvider 참조).
 * DB `user_regions` 연동 전까지 세션 내 CRUD만 유지합니다.
 */

import type { UserRegion } from "@/lib/regions/types";
import { getLocationLabel } from "@/lib/products/form-options";

export { getViewerUserId as getCurrentUserId } from "@/lib/auth/viewer-user-id";

const USER_REGIONS: UserRegion[] = [];

export function getUserRegions(userId: string): UserRegion[] {
  if (!userId || userId === "guest") return [];
  return USER_REGIONS.filter((r) => r.userId === userId);
}

export function getPrimaryRegion(userId: string): UserRegion | null {
  const list = getUserRegions(userId);
  return list.find((r) => r.isPrimary) ?? list[0] ?? null;
}

export function addUserRegion(
  userId: string,
  regionId: string,
  cityId: string,
  barangay: string,
  setAsPrimary: boolean
): UserRegion {
  const label = getLocationLabel(regionId, cityId) + (barangay ? ` ${barangay}` : "");
  const existing = USER_REGIONS.find(
    (r) =>
      r.userId === userId &&
      r.regionId === regionId &&
      r.cityId === cityId &&
      r.barangay === barangay
  );
  if (existing) return existing;

  if (setAsPrimary) {
    USER_REGIONS.forEach((r) => {
      if (r.userId === userId) r.isPrimary = false;
    });
  }
  const newRegion: UserRegion = {
    id: `ur-${Date.now()}`,
    userId,
    regionId,
    cityId,
    barangay,
    label,
    isPrimary: setAsPrimary || USER_REGIONS.filter((r) => r.userId === userId).length === 0,
    createdAt: new Date().toISOString(),
  };
  USER_REGIONS.push(newRegion);
  return newRegion;
}

export function removeUserRegion(userId: string, id: string): boolean {
  const list = getUserRegions(userId);
  if (list.length <= 1) return false;
  const idx = USER_REGIONS.findIndex((r) => r.id === id && r.userId === userId);
  if (idx === -1) return false;
  const wasPrimary = USER_REGIONS[idx].isPrimary;
  USER_REGIONS.splice(idx, 1);
  if (wasPrimary) {
    const next = USER_REGIONS.find((r) => r.userId === userId);
    if (next) next.isPrimary = true;
  }
  return true;
}

export function setPrimaryUserRegion(userId: string, id: string): boolean {
  const target = USER_REGIONS.find((r) => r.id === id && r.userId === userId);
  if (!target) return false;
  USER_REGIONS.forEach((r) => {
    if (r.userId === userId) r.isPrimary = r.id === id;
  });
  return true;
}
