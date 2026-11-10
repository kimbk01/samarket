/**
 * COMMUNITY LOCAL FILTER SSOT — 시/군 LGU (주소 SSOT 2단계 · Owner 2026-11-09)
 *
 * 기준: 회원 대표 주소의 시/군 LGU(PSGC, `canonicalLguId`) 하나. 「보는 동네」 = 시/군 이름(거래 공개 도시와 같은 이름).
 * 이전: 앱 동네 목록(143개, 4개 도시권) regionId/cityId — 목록 밖 주소(Caloocan·Bacoor 등)는 동네를 못 읽었고,
 *       Quezon City 주소가 「Diliman」으로 보였다.
 * Seed: 대표 주소 LGU · Active filter: 사용자가 고른 LGU 는 대표 주소가 바뀌어도 유지(source=explicit)
 *
 * DO NOT: user_addresses / 대표 주소 플래그를 바꾸지 않는다.
 * DO NOT: profiles.region_* 나 RegionContext 를 기준으로 쓰지 않는다.
 */

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { resolvePublicCityName } from "@/lib/addresses/address-display-levels";

export type CommunityLocalFilterSource = "seed" | "explicit";

export type CommunityLocalFilterState = {
  source: CommunityLocalFilterSource;
  /** 시/군 PSGC (10자리) */
  lguId: string;
  /** source=seed 일 때 대표 주소 id — 대표 주소가 바뀌면 다시 seed */
  masterAddressId: string | null;
};

/** v2 = LGU 기준. v1(앱 동네 목록) 저장값은 읽지 않는다. */
export const COMMUNITY_LOCAL_FILTER_STORAGE_PREFIX = "samarket:community-local-filter:v2:";

/** 필리핀 PSGC 10자리 또는 한국 `KR:` + 시/군/구 5자리 (한국 주소 지원 2026-11-10) */
const PSGC_RE = /^(\d{10}|KR:\d{5})$/;

export function communityLocalFilterStorageKey(userId: string): string {
  const uid = userId.trim() || "guest";
  return `${COMMUNITY_LOCAL_FILTER_STORAGE_PREFIX}${uid}`;
}

function isUsableLguId(raw: string | null | undefined): raw is string {
  const id = (raw ?? "").trim();
  return PSGC_RE.test(id) && Boolean(resolvePublicCityName({ cityLguId: id, cityText: null }));
}

function isValidState(raw: unknown): raw is CommunityLocalFilterState {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.source !== "seed" && o.source !== "explicit") return false;
  return typeof o.lguId === "string" && isUsableLguId(o.lguId);
}

export function readCommunityLocalFilter(userId: string): CommunityLocalFilterState | null {
  if (typeof window === "undefined") return null;
  const uid = userId.trim();
  if (!uid || uid === "guest") return null;
  try {
    const raw = sessionStorage.getItem(communityLocalFilterStorageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidState(parsed)) return null;
    return {
      source: parsed.source,
      lguId: parsed.lguId.trim(),
      masterAddressId:
        typeof parsed.masterAddressId === "string" && parsed.masterAddressId.trim()
          ? parsed.masterAddressId.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export function writeCommunityLocalFilter(userId: string, state: CommunityLocalFilterState): void {
  if (typeof window === "undefined") return;
  const uid = userId.trim();
  if (!uid || uid === "guest") return;
  if (!isValidState(state)) return;
  try {
    sessionStorage.setItem(communityLocalFilterStorageKey(uid), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearCommunityLocalFilter(userId: string): void {
  if (typeof window === "undefined") return;
  const uid = userId.trim();
  if (!uid) return;
  try {
    sessionStorage.removeItem(communityLocalFilterStorageKey(uid));
  } catch {
    /* ignore */
  }
}

/** 대표 주소 → 시/군 LGU seed */
export function seedCommunityLocalFilterFromMaster(
  master: UserAddressDTO | null | undefined,
): CommunityLocalFilterState | null {
  if (!master?.id) return null;
  const lguId = (master.canonicalLguId ?? "").trim();
  if (!isUsableLguId(lguId)) return null;
  return { source: "seed", lguId, masterAddressId: master.id };
}

export function buildExplicitCommunityLocalFilter(lguId: string): CommunityLocalFilterState | null {
  const id = lguId.trim();
  if (!isUsableLguId(id)) return null;
  return { source: "explicit", lguId: id, masterAddressId: null };
}

/**
 * CASE D: 사용자가 고른 필터는 유지, seed 는 대표 주소가 바뀌면 다시 seed.
 */
export function resolveCommunityLocalFilterAgainstMaster(
  existing: CommunityLocalFilterState | null,
  master: UserAddressDTO | null | undefined,
): CommunityLocalFilterState | null {
  if (existing?.source === "explicit") return existing;
  const seeded = seedCommunityLocalFilterFromMaster(master);
  if (!seeded) return existing?.source === "seed" ? null : existing;
  if (
    existing?.source === "seed" &&
    existing.masterAddressId === seeded.masterAddressId &&
    existing.lguId === seeded.lguId
  ) {
    return existing;
  }
  return seeded;
}

/** 피드·글쓰기 API 키 — `lgu:<PSGC>:` (서버 `lgu-location.server` 가 해석) */
export function communityLocalFilterLocationKey(state: CommunityLocalFilterState | null): string {
  if (!state) return "";
  return `lgu:${state.lguId}:`;
}

export function communityLocalFilterLocationMeta(state: CommunityLocalFilterState | null): {
  country: string;
  city: string;
  district: string;
  name: string;
  label: string;
} | null {
  if (!state) return null;
  const name = formatCommunityLocalFilterLabel(state);
  if (!name) return null;
  return { country: "Philippines", city: name, district: "", name, label: name };
}

/** 「보는 동네」 표시 = 시/군 이름 (① 공개 지역) */
export function formatCommunityLocalFilterLabel(state: CommunityLocalFilterState | null): string {
  if (!state) return "";
  return resolvePublicCityName({ cityLguId: state.lguId, cityText: null }) ?? "";
}
