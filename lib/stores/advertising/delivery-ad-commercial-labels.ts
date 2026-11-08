
import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * P0-B — Customer-facing commercial placement labels (Admin/Owner presentation).
 * Maps inventory_key → human copy. Does not own exposure max/interval.
 */

/** Launch human labels (Recovery Audit) — never expose inventory keys as primary copy. */
export const DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS = {
  STORES_HOME_FEED: catalogPair("stores_delivery_home_store_ads"),
  STORES_CATEGORY_FEED: catalogPair("stores_category_store_ads"),
  STORES_HOME_HERO: catalogPair("stores_delivery_home_top_banner"),
  STORES_SEARCH_TOP: catalogPair("stores_search_results_top_banner"),
} as const;

export type DeliveryAdCommercialPlacementKey =
  keyof typeof DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS;

export function isDeliveryAdCommercialPlacementKey(
  value: string
): value is DeliveryAdCommercialPlacementKey {
  return Object.prototype.hasOwnProperty.call(DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS, value);
}

export function deliveryAdCommercialPlacementLabel(
  inventoryKey: string,
  lang: "ko" | "en"
): string {
  if (!isDeliveryAdCommercialPlacementKey(inventoryKey)) return inventoryKey;
  return DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS[inventoryKey][lang];
}

/** PHP minor units (centavos) → display string. Integer authority only. */
export function formatDeliveryAdPhpMinor(amountMinor: number | null | undefined): string {
  if (amountMinor == null || !Number.isInteger(amountMinor)) return "—";
  const major = Math.trunc(amountMinor / 100);
  const frac = Math.abs(amountMinor % 100);
  return `₱${major.toLocaleString("en-PH")}.${String(frac).padStart(2, "0")}`;
}

/** Parse Admin major-unit input (e.g. "150.00") → minor. Fail closed. */
export function parseDeliveryAdPhpMajorToMinor(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [a, b = ""] = t.split(".");
  const major = Number(a);
  if (!Number.isInteger(major) || major < 0) return null;
  const frac = b.padEnd(2, "0").slice(0, 2);
  const minor = major * 100 + Number(frac);
  if (!Number.isInteger(minor) || minor < 0) return null;
  return minor;
}
