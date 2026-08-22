/**
 * Dev-only occupancy audit modes — set via Playwright addInitScript:
 * `document.documentElement.setAttribute('data-dibay-occupancy-audit-mode', 'transform-only')`
 *
 * Production: always null (no effect).
 */

export type DeliveryOccupancyAuditMode =
  | "transform-only"
  | "header-only"
  | "tabs-only"
  | null;

export function readDeliveryOccupancyAuditMode(): DeliveryOccupancyAuditMode {
  if (typeof document === "undefined") return null;
  const raw = document.documentElement.getAttribute("data-dibay-occupancy-audit-mode");
  if (raw === "transform-only" || raw === "header-only" || raw === "tabs-only") {
    return raw;
  }
  return null;
}

/** Shell chrome-host activation — suppressed in transform-only isolation. */
export function occupancyAuditSuppressChromeHost(mode: DeliveryOccupancyAuditMode): boolean {
  return mode === "transform-only";
}

/** Header portal target override for A/B isolation. */
export function occupancyAuditHeaderPortalInline(mode: DeliveryOccupancyAuditMode): boolean {
  return mode === "transform-only" || mode === "tabs-only";
}

/** Tabs portal target override for A/B isolation. */
export function occupancyAuditTabsPortalInline(mode: DeliveryOccupancyAuditMode): boolean {
  return mode === "transform-only" || mode === "header-only";
}
