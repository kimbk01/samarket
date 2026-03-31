/**
 * 9단계: 사용자 저장 동네 mock (Supabase 연동 시 교체)
 */

import type { UserRegion } from "@/lib/regions/types";
import { getLocationLabel } from "@/lib/products/form-options";

const CURRENT_USER_ID = "me";

/** 저장된 동네 목록 (런타임 뮤테이션) */
export const MOCK_USER_REGIONS: UserRegion[] = [];

function seedDefaultRegionsIfEmpty(userId: string): void {
  if (MOCK_USER_REGIONS.some((r) => r.userId === userId)) return;
  const now = new Date().toISOString();
  const templates: Omit<UserRegion, "id" | "userId" | "createdAt">[] = [
    {
      regionId: "quezon",
      cityId: "q1",
      barangay: "",
      label: getLocationLabel("quezon", "q1"),
      isPrimary: true,
    },
    {
      regionId: "quezon",
      cityId: "q3",
      barangay: "",
      label: getLocationLabel("quezon", "q3"),
      isPrimary: false,
    },
  ];
  templates.forEach((t, i) => {
    MOCK_USER_REGIONS.push({
      ...t,
      id: `ur-${userId}-${i + 1}`,
      userId,
      createdAt: now,
    });
  });
}

/** 레거시: 즐겨찾기·검색 등 — 실제 로그인 id 와 분리된 mock 버킷 */
export function getCurrentUserId(): string {
  return CURRENT_USER_ID;
}

export function getUserRegions(userId: string): UserRegion[] {
  seedDefaultRegionsIfEmpty(userId);
  return MOCK_USER_REGIONS.filter((r) => r.userId === userId);
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
  const existing = MOCK_USER_REGIONS.find(
    (r) =>
      r.userId === userId &&
      r.regionId === regionId &&
      r.cityId === cityId &&
      r.barangay === barangay
  );
  if (existing) return existing;

  if (setAsPrimary) {
    MOCK_USER_REGIONS.forEach((r) => {
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
    isPrimary: setAsPrimary || MOCK_USER_REGIONS.filter((r) => r.userId === userId).length === 0,
    createdAt: new Date().toISOString(),
  };
  MOCK_USER_REGIONS.push(newRegion);
  return newRegion;
}

export function removeUserRegion(userId: string, id: string): boolean {
  const list = getUserRegions(userId);
  if (list.length <= 1) return false;
  const idx = MOCK_USER_REGIONS.findIndex((r) => r.id === id && r.userId === userId);
  if (idx === -1) return false;
  const wasPrimary = MOCK_USER_REGIONS[idx].isPrimary;
  MOCK_USER_REGIONS.splice(idx, 1);
  if (wasPrimary) {
    const next = MOCK_USER_REGIONS.find((r) => r.userId === userId);
    if (next) next.isPrimary = true;
  }
  return true;
}

export function setPrimaryUserRegion(userId: string, id: string): boolean {
  const target = MOCK_USER_REGIONS.find((r) => r.id === id && r.userId === userId);
  if (!target) return false;
  MOCK_USER_REGIONS.forEach((r) => {
    if (r.userId === userId) r.isPrimary = r.id === id;
  });
  return true;
}
