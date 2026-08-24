/**
 * CUT 0 — Canonical customer surfaces / placements.
 *
 * Runtime paid-ad DB still uses StorePaidAdPlacement = stores_home | stores_browse
 * (lib/stores/store-paid-ad-campaign-authority.ts). Do not change that in CUT 0.
 *
 * Composition contract uses surface "home" | "browse" — also unchanged.
 * This module is the TARGET naming owner for later CUTs.
 */

export const STORES_DISCOVERY_SURFACES = [
  "stores_home",
  "stores_home_rest",
  "stores_browse",
  "stores_home_hero",
  "store_detail",
  "checkout",
] as const;

export type StoresDiscoverySurface = (typeof STORES_DISCOVERY_SURFACES)[number];

export function isStoresDiscoverySurface(value: unknown): value is StoresDiscoverySurface {
  return (
    typeof value === "string" &&
    (STORES_DISCOVERY_SURFACES as readonly string[]).includes(value)
  );
}

/**
 * Current runtime identifiers → TARGET surface (mapping only; no cutover).
 *
 * | Current | Layer | Target |
 * | stores_home (paid placement) | paid-ad DB | stores_home_rest (intent) |
 * | stores_browse (paid placement) | paid-ad DB | stores_browse |
 * | home (composition) | composition | stores_home |
 * | browse (composition) | composition | stores_browse |
 */
export const STORES_DISCOVERY_SURFACE_CURRENT_ALIASES = {
  paid_ad_placement_stores_home: "stores_home_rest",
  paid_ad_placement_stores_browse: "stores_browse",
  composition_surface_home: "stores_home",
  composition_surface_browse: "stores_browse",
} as const satisfies Record<string, StoresDiscoverySurface>;

/** Surfaces that may host STORE_PAID_AD insertion (TARGET OPEN #6). */
export const STORES_DISCOVERY_PAID_AD_ALLOWED_SURFACES = [
  "stores_home_rest",
  "stores_browse",
] as const satisfies readonly StoresDiscoverySurface[];

/** Surfaces that may host BANNER_AD (TARGET: hero only in v1). */
export const STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES = [
  "stores_home_hero",
] as const satisfies readonly StoresDiscoverySurface[];
