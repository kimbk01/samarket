/**
 * PRODUCT CUT 2 — Canonical Placement Preview SSOT (contracts only).
 * Visual reuse: HOME → StoresHomeTimesaleRowCard · BROWSE → StoreBrowseCategoryRowCard · Banner → DeliveryAdBanner.
 * Preview contexts must never issue exposure tokens / impressions / clicks.
 */

import type { DeliveryAdBannerRenderContext } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import { deliveryAdPlacementI18nKey } from "@/lib/stores/advertising/delivery-ad-placement-language";

export type DeliveryAdPlacementPreviewContext = Extract<
  DeliveryAdBannerRenderContext,
  "owner_preview" | "admin_preview"
>;

export type DeliveryAdPlacementPreviewSurface =
  | "STORES_HOME_FEED"
  | "STORES_CATEGORY_FEED"
  | "STORES_HOME_HERO"
  | "STORES_SEARCH_TOP";

export type DeliveryAdPlacementPreviewInput = {
  productKind: DeliveryAdProductKey;
  inventoryKey: DeliveryAdPlacementPreviewSurface;
  renderContext: DeliveryAdPlacementPreviewContext;
  /** Surface paid-ad gate from CUT 1 helpers / browse policy. */
  surfaceEnabled: boolean;
  /** HOME/BROWSE insertion interval (resolved). Null for banner. */
  intervalEveryN?: number | null;
  /** HOME/BROWSE max insertion (resolved). Null for banner. */
  maxInsertion?: number | null;
  /** BROWSE taxonomy labels (human). */
  taxonomyPrimaryLabel?: string | null;
  taxonomySubLabel?: string | null;
  storeEligibilityWarning?: boolean;
};

export const DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT = {
  cut: "PRODUCT_CUT_2",
  telemetry: {
    owner_preview: {
      exposureToken: false,
      impression: false,
      click: false,
    },
    admin_preview: {
      exposureToken: false,
      impression: false,
      click: false,
    },
    customer: "UNCHANGED",
  },
  visualOwners: {
    STORES_HOME_FEED: "StoresHomeTimesaleRowCard",
    STORES_CATEGORY_FEED: "StoreBrowseCategoryRowCard",
    STORES_HOME_HERO: "DeliveryAdBanner",
    STORES_SEARCH_TOP: "DeliveryAdBanner",
  },
  detailInventoryPreview: "NONE",
  searchDomPosition:
    "DeliverySearchResults: after result-summary row · before organic store section (only when banner payload exists and organic stores.length > 0)",
  fakeStoreData: "FORBIDDEN",
  fakeCreative: "FORBIDDEN",
  navigationInPreview: "DISABLED",
} as const;

export function isPlacementPreviewContext(
  ctx: string
): ctx is DeliveryAdPlacementPreviewContext {
  return ctx === "owner_preview" || ctx === "admin_preview";
}

/** Preview must never carry an exposure token. */
export function assertPlacementPreviewNoExposureToken(
  renderContext: DeliveryAdPlacementPreviewContext,
  exposureToken: string | null | undefined
): { ok: true } | { ok: false; error: "preview_exposure_token_forbidden" } {
  if (!isPlacementPreviewContext(renderContext)) {
    return { ok: false, error: "preview_exposure_token_forbidden" };
  }
  if (String(exposureToken ?? "").trim()) {
    return { ok: false, error: "preview_exposure_token_forbidden" };
  }
  return { ok: true };
}

export function placementPreviewSupportsProduct(
  productKind: DeliveryAdProductKey,
  inventoryKey: string
): boolean {
  if (productKind === "store_sponsored") {
    return inventoryKey === "STORES_HOME_FEED" || inventoryKey === "STORES_CATEGORY_FEED";
  }
  if (productKind === "banner") {
    return inventoryKey === "STORES_HOME_HERO" || inventoryKey === "STORES_SEARCH_TOP";
  }
  return false;
}

export function placementPreviewTitleI18nKey(inventoryKey: string) {
  return deliveryAdPlacementI18nKey(inventoryKey);
}

/** Policy-slot visual markers (not campaign cards). */
export function buildPolicySlotMarkerSequence(input: {
  intervalEveryN: number;
  maxInsertion: number | null;
}): Array<"organic" | "ad_slot"> {
  const every = Math.max(1, Math.floor(input.intervalEveryN) || 1);
  const max =
    input.maxInsertion == null || !Number.isFinite(input.maxInsertion)
      ? 1
      : Math.max(0, Math.floor(input.maxInsertion));
  if (max <= 0) {
    return Array.from({ length: Math.min(every, 8) }, () => "organic" as const);
  }
  const out: Array<"organic" | "ad_slot"> = [];
  let ads = 0;
  for (let i = 0; i < every && out.length < 16; i++) {
    out.push("organic");
  }
  if (ads < max) {
    out.push("ad_slot");
    ads += 1;
  }
  out.push("organic");
  return out;
}

export function isBlockedDetailInventoryPreview(inventoryKey: string): boolean {
  return inventoryKey === "STORE_DETAIL_RECOMMENDATION_BANNER";
}

export type DeliveryAdPlacementPreviewSurfaceKey = DeliveryAdInventoryKey;
