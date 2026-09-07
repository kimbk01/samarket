/**
 * COMMUNITY LOCAL FILTER SSOT (CUT 2)
 *
 * Seed: user_addresses master → mapUserAddressToAppLocation (City taxonomy)
 * Active filter: independent of primary; explicit user choice persists
 * Primary change: reseed only when source === "seed"; preserve "explicit"
 *
 * DO NOT: mutate user_addresses / is_default_master
 * DO NOT: use profiles.region_* or RegionContext as Community Local authority
 */

import type { UserAddressDTO } from "@/lib/addresses/user-address-types";
import { mapUserAddressToAppLocation } from "@/lib/addresses/map-user-address-to-app-location";
import { getLocationLabel, getLocationLabelIfValid } from "@/lib/products/form-options";
import { getRegionCityName, getRegionName } from "@/lib/regions/region-utils";
import type { UserRegion } from "@/lib/regions/types";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
} from "@/lib/neighborhood/location-key";

export type CommunityLocalFilterSource = "seed" | "explicit";

export type CommunityLocalFilterState = {
  source: CommunityLocalFilterSource;
  regionId: string;
  cityId: string;
  /** Optional barangay — seed uses empty (City-level Local). */
  barangay: string;
  /** When source=seed, track master id for reseed on primary change. */
  masterAddressId: string | null;
};

export const COMMUNITY_LOCAL_FILTER_STORAGE_PREFIX = "samarket:community-local-filter:v1:";

export function communityLocalFilterStorageKey(userId: string): string {
  const uid = userId.trim() || "guest";
  return `${COMMUNITY_LOCAL_FILTER_STORAGE_PREFIX}${uid}`;
}

function isValidState(raw: unknown): raw is CommunityLocalFilterState {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  const source = o.source;
  const regionId = typeof o.regionId === "string" ? o.regionId.trim() : "";
  const cityId = typeof o.cityId === "string" ? o.cityId.trim() : "";
  if (source !== "seed" && source !== "explicit") return false;
  if (!regionId || !cityId) return false;
  if (!getLocationLabelIfValid(regionId, cityId)) return false;
  return true;
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
      regionId: parsed.regionId.trim(),
      cityId: parsed.cityId.trim(),
      barangay: typeof parsed.barangay === "string" ? parsed.barangay.trim() : "",
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

/** Master address → City-level Local seed (barangay empty). */
export function seedCommunityLocalFilterFromMaster(
  master: UserAddressDTO | null | undefined,
): CommunityLocalFilterState | null {
  if (!master?.id) return null;
  const loc = mapUserAddressToAppLocation(master);
  if (!loc) return null;
  return {
    source: "seed",
    regionId: loc.regionId,
    cityId: loc.cityId,
    barangay: "",
    masterAddressId: master.id,
  };
}

export function buildExplicitCommunityLocalFilter(
  regionId: string,
  cityId: string,
  barangay = "",
): CommunityLocalFilterState | null {
  const rid = regionId.trim();
  const cid = cityId.trim();
  if (!getLocationLabelIfValid(rid, cid)) return null;
  return {
    source: "explicit",
    regionId: rid,
    cityId: cid,
    barangay: barangay.trim(),
    masterAddressId: null,
  };
}

/**
 * CASE D: explicit filter preserved; seed-only reseeded from new master.
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
    existing.regionId === seeded.regionId &&
    existing.cityId === seeded.cityId
  ) {
    return existing;
  }
  return seeded;
}

export function communityLocalFilterToUserRegion(
  state: CommunityLocalFilterState,
  userId: string,
): UserRegion {
  const label =
    getLocationLabel(state.regionId, state.cityId) +
    (state.barangay ? ` ${state.barangay}` : "");
  return {
    id: `community-local-filter:${state.regionId}:${state.cityId}`,
    userId: userId.trim() || "guest",
    regionId: state.regionId,
    cityId: state.cityId,
    barangay: state.barangay,
    label,
    isPrimary: false,
    createdAt: "",
  };
}

export function communityLocalFilterLocationKey(state: CommunityLocalFilterState | null): string {
  if (!state) return "";
  return neighborhoodLocationKeyFromRegion(communityLocalFilterToUserRegion(state, "local")) ?? "";
}

export function communityLocalFilterLocationMeta(state: CommunityLocalFilterState | null) {
  if (!state) return null;
  return neighborhoodLocationMetaFromRegion(communityLocalFilterToUserRegion(state, "local"));
}

/** UI label for active Local filter (taxonomy area name). */
export function formatCommunityLocalFilterLabel(state: CommunityLocalFilterState | null): string {
  if (!state) return "";
  const city = getRegionCityName(state.regionId, state.cityId).trim();
  if (city) return city;
  return getRegionName(state.regionId).trim();
}
