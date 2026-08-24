/**
 * CUT 0 — DIBAY Stores Discovery canonical domain model.
 *
 * Contract foundation only. No runtime consumer wiring in CUT 0.
 * TARGET DESIGN is source of truth — do not invent parallel domain names.
 */

export const STORES_DISCOVERY_DOMAINS = [
  "TAXONOMY",
  "HOME_COMPOSITION",
  "BROWSE_DISCOVERY",
  "STORE_CARD",
  "STORE_PAID_AD",
  "BANNER_AD",
  "COUPON",
  "EDITORIAL_PROMOTION",
  "ADMIN_CONTROL_PLANE",
] as const;

export type StoresDiscoveryDomain = (typeof STORES_DISCOVERY_DOMAINS)[number];

export function isStoresDiscoveryDomain(value: unknown): value is StoresDiscoveryDomain {
  return (
    typeof value === "string" &&
    (STORES_DISCOVERY_DOMAINS as readonly string[]).includes(value)
  );
}
