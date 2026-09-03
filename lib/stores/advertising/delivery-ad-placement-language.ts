/**
 * PRODUCT CUT 1 — Human placement language for Owner/Admin UI.
 * Inventory keys stay internal; primary UI uses i18n keys from this map.
 */

import {
  DELIVERY_AD_INVENTORY_KEYS,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";

export type DeliveryAdPlacementI18nKey =
  | "owner_ads_inventory_home"
  | "owner_ads_inventory_category"
  | "owner_ads_inventory_home_hero"
  | "owner_ads_inventory_search_top"
  | "owner_ads_inventory_unknown";

/** Operational (human) label key for a canonical inventory key. */
export function deliveryAdPlacementI18nKey(
  key: string
): DeliveryAdPlacementI18nKey {
  switch (key) {
    case "STORES_HOME_FEED":
      return "owner_ads_inventory_home";
    case "STORES_CATEGORY_FEED":
      return "owner_ads_inventory_category";
    case "STORES_HOME_HERO":
      return "owner_ads_inventory_home_hero";
    case "STORES_SEARCH_TOP":
      return "owner_ads_inventory_search_top";
    default:
      return "owner_ads_inventory_unknown";
  }
}

export function deliveryAdPlacementI18nKeys(
  keys: readonly string[]
): DeliveryAdPlacementI18nKey[] {
  const out: DeliveryAdPlacementI18nKey[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const label = deliveryAdPlacementI18nKey(k);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Policy screen route for reverse-link from campaign detail. */
export function deliveryAdPolicyScreenHref(
  inventoryKey: string,
  opts?: { primarySlug?: string | null; subSlug?: string | null }
): string | null {
  if (inventoryKey === "STORES_HOME_FEED" || inventoryKey === "STORES_HOME_INLINE_1") {
    return "/admin/stores-home-shelves";
  }
  if (
    inventoryKey === "STORES_CATEGORY_FEED" ||
    inventoryKey === "STORES_CATEGORY_TOP"
  ) {
    const qs = new URLSearchParams();
    const primary = opts?.primarySlug?.trim();
    const sub = opts?.subSlug?.trim();
    if (primary) qs.set("primary", primary);
    if (sub) qs.set("sub", sub);
    const q = qs.toString();
    return q ? `/admin/stores-category-policy?${q}` : "/admin/stores-category-policy";
  }
  // Banner hero: nearest composition config (CROSS_LINK_ONLY — Ads must not write composition).
  if (inventoryKey === "STORES_HOME_HERO") {
    return "/admin/stores-home-shelves";
  }
  // SEARCH_TOP: no composition editor; commercial/inventory ops surface (read/config, not Ads write of shelves).
  if (inventoryKey === "STORES_SEARCH_TOP") {
    return "/admin/delivery-ads/inventory";
  }
  return null;
}

export function isKnownDeliveryAdPlacementKey(
  key: string
): key is DeliveryAdInventoryKey {
  return (DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(key);
}

/** Hub filter query builder (campaign authority). */
export function deliveryAdsAdminHubHref(filters: {
  inventory?: string | null;
  primarySlug?: string | null;
  subSlug?: string | null;
}): string {
  const qs = new URLSearchParams();
  if (filters.inventory?.trim()) qs.set("inventory", filters.inventory.trim());
  if (filters.primarySlug?.trim()) qs.set("primarySlug", filters.primarySlug.trim());
  if (filters.subSlug?.trim()) qs.set("subSlug", filters.subSlug.trim());
  const q = qs.toString();
  return q ? `/admin/delivery-ads?${q}` : "/admin/delivery-ads";
}
