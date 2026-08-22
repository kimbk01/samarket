/**
 * G-B2 — soft ARCH B2 store chrome portal SSOT.
 * Soft store: ONE canonical DeliveryStoreChromeHost (never document.body lifecycle flip).
 * Hard store: existing document.body portal unchanged.
 */

export type StoreChromePortalTarget = "inline" | "body" | HTMLElement;

export function resolveStoreDetailChromePortalTarget(input: {
  /** DeliveryPresentationShell soft-hosted store surface. */
  softHosted: boolean;
  chromeHostEl: HTMLElement | null;
  /** Shell chrome activation — sliding / idle_store / sliding_back. */
  chromeActive: boolean;
  /** Dev-only occupancy audit — force inline (header-only / tabs-only / transform-only). */
  forceInline?: boolean;
}): StoreChromePortalTarget {
  if (!input.softHosted) return "body";
  if (input.forceInline || !input.chromeActive) return "inline";
  return input.chromeHostEl ?? "inline";
}

export function storeChromePortalRoot(target: StoreChromePortalTarget): HTMLElement | null {
  if (target === "inline") return null;
  if (target === "body") {
    return typeof document !== "undefined" ? document.body : null;
  }
  return target;
}

export function isStoreChromeHostPortalTarget(target: StoreChromePortalTarget): target is HTMLElement {
  return target !== "inline" && target !== "body";
}
