/**
 * CONTRACT (Phase 4) — cold `/stores` home-feed query suffix SSOT.
 *
 * Causes of cold blank / key fan-out (Phase 0):
 * 1. Fetching `""` before any region is known, then remounting on region hydrate
 * 2. `?region=Manila` vs `?region=Manila&district=…` cache-key split (district only
 *    affects server sort — see `app/api/stores/home-feed/route.ts`)
 *
 * Rules:
 * - Prefer boot profile region when ready; else live `primaryRegion`
 * - Do not start home-feed until a region source exists (or boot is anonymous)
 * - Client cache key is **region-only** (no district) so address_detail hydrate
 *   does not abort/repaint the first fold
 *
 * CUT-B — Public root feed may open from profile-lite **evidence** while boot is still
 * hydrating. This does **not** mutate app-boot auth SSOT / terminal anonymous.
 */
import {
  getAppBootSnapshot,
  isAppBootReady,
  peekAppBootProfile,
} from "@/lib/app-boot/app-boot-store";
import { peekAppBootProfileFetchCached, isAppBootProfileFetchGuestSkipCached } from "@/lib/app-boot/fetch-app-boot-profile";
import { isRecoverableGuestAuthEstablished } from "@/lib/auth/guest-auth-state";
import { getRegionName } from "@/lib/regions/region-utils";
import { userRegionFromProfileSlice } from "@/lib/regions/profile-to-user-region";
import type { UserRegion } from "@/lib/regions/types";
import type { ProfileRow } from "@/lib/profile/types";

export type StoresHomeFeedQueryGate = {
  /** When false, hub must show pending blank and must not call home-feed. */
  ready: boolean;
  /** Stable suffix once ready (`""` = root / no region filter). */
  querySuffix: string;
};

/** Region-only home-feed key — shared by hub mount, prewarm, BN3. */
export function storeHomeFeedRegionOnlySuffix(primaryRegion: UserRegion | null): string {
  const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
  if (!r) return "";
  const q = new URLSearchParams();
  q.set("region", r);
  return `?${q.toString()}`;
}

function regionFromProfileRow(boot: ProfileRow | Record<string, unknown>): UserRegion | null {
  return userRegionFromProfileSlice({
    region_code: typeof boot.region_code === "string" ? boot.region_code : null,
    region_name: typeof boot.region_name === "string" ? boot.region_name : null,
    address_detail: typeof boot.address_detail === "string" ? boot.address_detail : null,
    full_address: typeof boot.full_address === "string" ? boot.full_address : null,
  });
}

function regionFromBootProfile(): UserRegion | null {
  const boot = peekAppBootProfile();
  if (!boot) return null;
  return regionFromProfileRow(boot);
}

/**
 * CUT-B1 — open public root feed only on **network** lite unauth evidence.
 * Do NOT open on:
 * - guest-gate synthetic 401 (recoverable INITIAL_SESSION skip)
 * - recoverable guest phase (session may still restore → region feed)
 * Never calls setAppBootAnonymous / never weakens auth SSOT.
 */
export function canOpenPublicRootFeedBeforeBootReady(): boolean {
  if (isRecoverableGuestAuthEstablished()) return false;
  if (isAppBootProfileFetchGuestSkipCached()) return false;
  const cached = peekAppBootProfileFetchCached();
  if (!cached) return false;
  if (cached.status !== 401 && cached.status !== 403) return false;
  const json = cached.json as { authenticated?: boolean; ok?: boolean } | null;
  if (json && json.authenticated === true) return false;
  return true;
}

/**
 * Prefer boot profile when ready; allow sync `primaryRegion` before boot so cold
 * does not sit on blank while region is already known from local/mock.
 *
 * Delivery feed readiness ≠ delivery address readiness / auth boot completion:
 * - Boot ready + no region → root feed (`""`)
 * - Boot hydrating + profile-lite unauth evidence → root feed (CUT-B public path)
 * - Boot hydrating + profile-lite region → region feed (no wait for full boot)
 */
export function resolveStoresHomeFeedQueryGate(primaryRegion: UserRegion | null): StoresHomeFeedQueryGate {
  if (isAppBootReady()) {
    const snap = getAppBootSnapshot();
    if (snap.status === "anonymous") {
      return { ready: true, querySuffix: "" };
    }
    const fromBoot = regionFromBootProfile();
    if (fromBoot) {
      return { ready: true, querySuffix: storeHomeFeedRegionOnlySuffix(fromBoot) };
    }
    if (primaryRegion) {
      return { ready: true, querySuffix: storeHomeFeedRegionOnlySuffix(primaryRegion) };
    }
    /** Authenticated, no location anywhere — root feed once (address CTA separate). */
    return { ready: true, querySuffix: "" };
  }

  if (primaryRegion) {
    return { ready: true, querySuffix: storeHomeFeedRegionOnlySuffix(primaryRegion) };
  }

  const lite = peekAppBootProfileFetchCached();
  if (lite?.status === 200) {
    const data = lite.json as { ok?: boolean; profile?: ProfileRow } | null;
    if (data?.ok && data.profile) {
      const fromLite = regionFromProfileRow(data.profile);
      if (fromLite) {
        return { ready: true, querySuffix: storeHomeFeedRegionOnlySuffix(fromLite) };
      }
    }
  }

  if (canOpenPublicRootFeedBeforeBootReady()) {
    return { ready: true, querySuffix: "" };
  }

  return { ready: false, querySuffix: "" };
}
