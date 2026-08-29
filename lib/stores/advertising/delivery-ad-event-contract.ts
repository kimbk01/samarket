/**
 * CUT G — Delivery Ads impression / click / attribution contracts.
 * Billing OUT (CUT H). Analytics UI OUT (CUT I).
 */

export const DELIVERY_AD_IMPRESSION_EVENT_TABLE = "delivery_ad_impression_events" as const;
export const DELIVERY_AD_CLICK_EVENT_TABLE = "delivery_ad_click_events" as const;
export const DELIVERY_AD_ORDER_ATTRIBUTION_TABLE = "delivery_ad_order_attributions" as const;
export const DELIVERY_AD_ATTRIBUTION_POLICY_TABLE = "delivery_ad_attribution_policy" as const;

export const DELIVERY_AD_ATTRIBUTION_MODEL = "LAST_ELIGIBLE_CLICK" as const;

/** Business window not configured — Production attribution fail-closed. */
export const DELIVERY_AD_ATTRIBUTION_POLICY = {
  model: DELIVERY_AD_ATTRIBUTION_MODEL,
  clickWindowSeconds: null as number | null,
  impressionOnlyEnabled: false,
  isActive: false,
  status: "NOT_CONFIGURED" as const,
  note: "No fake 7/14/30-day window. Activate via delivery_ad_attribution_policy when business sets window.",
} as const;

export const DELIVERY_AD_IMPRESSION_VIEWABILITY = {
  requiresDocumentVisible: true,
  requiresIntersection: true,
  /** Telemetry contract thresholds — not business truth / competitor copy. */
  minVisibleRatio: 0.5,
  minDwellMs: 1000,
  sameRenderInstanceMaxImpressions: 1,
  scrollReentrySameRender: "same_impression" as const,
} as const;

export const DELIVERY_AD_EVENT_RETENTION = {
  impressionRaw: "foundation_only_no_delete_cron",
  clickRaw: "foundation_only_no_delete_cron",
  attributionEvidence: "preserve_on_order_cancel",
} as const;

export type DeliveryAdEventProductKind = "store_sponsored" | "banner";
export type DeliveryAdEventDestinationType =
  | "store_detail"
  | "store_menu"
  | "store_promotion";

export type DeliveryAdExposureTokenPayload = {
  v: 1;
  campaignId: string;
  productKind: DeliveryAdEventProductKind;
  creativeId: string | null;
  inventoryId: string | null;
  storeId: string | null;
  surface: string;
  placementIndex: number;
  renderInstanceId: string;
  destinationType: DeliveryAdEventDestinationType;
  destinationId: string;
  preview: boolean;
  exp: number;
};

export function isDeliveryAdAttributionConfigured(policy: {
  isActive: boolean;
  clickWindowSeconds: number | null;
}): boolean {
  return policy.isActive === true && policy.clickWindowSeconds != null && policy.clickWindowSeconds > 0;
}

export function selectLastEligibleClick<T extends { occurredAt: string; id: string }>(
  clicks: readonly T[]
): T | null {
  if (!clicks.length) return null;
  return [...clicks].sort((a, b) => {
    const ta = Date.parse(a.occurredAt);
    const tb = Date.parse(b.occurredAt);
    if (tb !== ta) return tb - ta;
    return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
  })[0] ?? null;
}

export function attributionEligibleForOrder(input: {
  clickStoreId: string;
  orderStoreId: string;
  clickOccurredAt: string;
  orderCommittedAt: string;
  windowSeconds: number | null;
  policyActive: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (!input.policyActive || input.windowSeconds == null || input.windowSeconds <= 0) {
    return { ok: false, reason: "policy_not_configured" };
  }
  if (input.clickStoreId !== input.orderStoreId) {
    return { ok: false, reason: "different_store" };
  }
  const clickMs = Date.parse(input.clickOccurredAt);
  const orderMs = Date.parse(input.orderCommittedAt);
  if (!Number.isFinite(clickMs) || !Number.isFinite(orderMs)) {
    return { ok: false, reason: "invalid_timestamps" };
  }
  if (clickMs >= orderMs) return { ok: false, reason: "click_after_order" };
  if (orderMs - clickMs > input.windowSeconds * 1000) {
    return { ok: false, reason: "outside_window" };
  }
  return { ok: true };
}
