/**
 * Admin Boost workspace URL identity — `/admin/advertising/boosts?orderId=<uuid>`.
 * Pointer only: selects existing workspace row / detail panel. No new Admin page.
 */

import { parseWorkspaceEntityId } from "@/lib/admin/advertising-workspace/resolve-drawer-actions";
import type { AdsActionItem } from "@/lib/admin/ads-control-plane/types";

/** Canonical query param — matches store-order / charge `*Id` convention. */
export const ADS_BOOST_ORDER_URL_PARAM = "orderId" as const;

export const ADS_BOOST_ORDER_DEEP_LINK_BASE = "/admin/advertising/boosts" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAdsBoostOrderIdParam(value: string | null | undefined): boolean {
  return UUID_RE.test(String(value ?? "").trim());
}

export function adsBoostOrderDeepLinkHref(orderId: string): string {
  const id = orderId.trim();
  return `${ADS_BOOST_ORDER_DEEP_LINK_BASE}?${ADS_BOOST_ORDER_URL_PARAM}=${encodeURIComponent(id)}`;
}

export type AdsBoostOrderFocusState =
  | "none"
  | "invalid"
  | "not_found"
  | "matched";

/** Match control-plane Boost rows (`community_promo:` / `trade_promo:` + uuid). */
export function findBoostActionItemByOrderId(
  items: readonly AdsActionItem[],
  orderId: string | null | undefined
): AdsActionItem | null {
  const id = String(orderId ?? "").trim();
  if (!isAdsBoostOrderIdParam(id)) return null;
  for (const item of items) {
    const domain = String(item.domain ?? "");
    if (domain !== "community_promote" && domain !== "trade_promote") continue;
    if (parseWorkspaceEntityId(item.id) === id) return item;
  }
  return null;
}

export function resolveAdsBoostOrderFocusState(input: {
  orderIdRaw: string | null | undefined;
  matched: AdsActionItem | null;
}): AdsBoostOrderFocusState {
  const raw = String(input.orderIdRaw ?? "").trim();
  if (!raw) return "none";
  if (!isAdsBoostOrderIdParam(raw)) return "invalid";
  if (!input.matched) return "not_found";
  return "matched";
}
