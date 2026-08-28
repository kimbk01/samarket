/**
 * Customer Commerce Hub — URL SSOT, legacy query translation, return chain.
 */

export const COMMERCE_HUB_TABS = ["orders", "coupons", "gifts"] as const;
export type CommerceHubTab = (typeof COMMERCE_HUB_TABS)[number];

export const GIFT_SUB_TABS = ["owned", "received", "sent", "used"] as const;
export type GiftSubTab = (typeof GIFT_SUB_TABS)[number];

export const COUPON_SUB_TABS = ["held", "used"] as const;
export type CouponSubTab = (typeof COUPON_SUB_TABS)[number];

const LEGACY_GIFT_TAB_MAP: Record<string, GiftSubTab> = {
  pending: "received",
  received: "received",
  sent: "sent",
  owned: "owned",
  available: "owned",
  redeemed: "used",
  used: "used",
};

export function isCommerceHubTab(v: string | null | undefined): v is CommerceHubTab {
  const x = String(v ?? "").trim().toLowerCase();
  return (COMMERCE_HUB_TABS as readonly string[]).includes(x);
}

export function normalizeCommerceHubTab(v: string | null | undefined): CommerceHubTab {
  return isCommerceHubTab(v) ? v : "orders";
}

export function normalizeGiftSubTab(v: string | null | undefined): GiftSubTab {
  const x = String(v ?? "").trim().toLowerCase();
  if ((GIFT_SUB_TABS as readonly string[]).includes(x)) return x as GiftSubTab;
  return LEGACY_GIFT_TAB_MAP[x] ?? "owned";
}

export function normalizeCouponSubTab(v: string | null | undefined): CouponSubTab {
  const x = String(v ?? "").trim().toLowerCase();
  if (x === "used" || x === "redeemed") return "used";
  return "held";
}

export type CommerceHubSearchParams = {
  tab?: string | null;
  giftTab?: string | null;
  couponTab?: string | null;
  expand?: string | null;
  orderFilter?: string | null;
  from?: string | null;
  refresh?: string | null;
};

export function hubOverviewHref(opts?: { from?: string | null }): string {
  const p = new URLSearchParams();
  if (opts?.from?.trim()) p.set("from", opts.from.trim());
  const qs = p.toString();
  return qs ? `/orders/activity?${qs}` : "/orders/activity";
}

export function canonicalHubHref(
  tab: CommerceHubTab,
  opts?: {
    giftTab?: GiftSubTab;
    couponTab?: CouponSubTab;
    expand?: string | null;
    orderFilter?: string | null;
    from?: string | null;
    refresh?: boolean;
  }
): string {
  const p = new URLSearchParams();
  p.set("tab", tab);
  if (tab === "gifts" && opts?.giftTab) p.set("giftTab", opts.giftTab);
  if (tab === "coupons" && opts?.couponTab) p.set("couponTab", opts.couponTab);
  if (opts?.expand?.trim()) p.set("expand", opts.expand.trim());
  if (opts?.orderFilter?.trim()) p.set("orderFilter", opts.orderFilter.trim());
  if (opts?.from?.trim()) p.set("from", opts.from.trim());
  if (opts?.refresh) p.set("refresh", "1");
  const qs = p.toString();
  return qs ? `/orders/activity?${qs}` : "/orders/activity?tab=orders";
}

export function deliveryDiscoveryHref(): string {
  return "/stores/browse";
}

export function giftMallHref(origin?: { from?: string | null }): string {
  const from = origin?.from?.trim();
  if (from === "delivery-activity") return "/stores/gift-mall?from=delivery-activity";
  return "/stores/gift-mall";
}

export function giftProductHref(productId: string, origin?: { from?: string | null; storeId?: string | null }): string {
  const base = `/stores/gift-mall/${encodeURIComponent(productId)}`;
  const p = new URLSearchParams();
  if (origin?.storeId?.trim()) p.set("storeId", origin.storeId.trim());
  if (origin?.from?.trim()) p.set("from", origin.from.trim());
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

export function ownedGiftInstanceHref(
  instanceId: string,
  origin?: { from?: string | null; giftTab?: GiftSubTab }
): string {
  const base = `/mypage/gift-certificates/${encodeURIComponent(instanceId)}`;
  const p = new URLSearchParams();
  if (origin?.from?.trim()) p.set("from", origin.from.trim());
  if (origin?.giftTab) p.set("giftTab", origin.giftTab);
  const qs = p.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Legacy `/orders` query → hub canonical params (does not handle tab=chat|purchases — page handles those). */
export function translateLegacyOrdersSearchParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  out.set("tab", "orders");
  const expand = sp.get("expand")?.trim();
  if (expand) out.set("expand", expand);
  const orderFilter = sp.get("orderFilter")?.trim();
  if (orderFilter) out.set("orderFilter", orderFilter);
  const from = sp.get("from")?.trim();
  if (from) out.set("from", from);
  return out;
}

export function translateLegacyCouponsSearchParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  out.set("tab", "coupons");
  out.set("couponTab", normalizeCouponSubTab(sp.get("couponTab") ?? sp.get("tab")));
  const from = sp.get("from")?.trim();
  if (from) out.set("from", from);
  return out;
}

export function translateLegacyGiftWalletSearchParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  out.set("tab", "gifts");
  const legacyTab = sp.get("giftTab") ?? sp.get("tab");
  out.set("giftTab", normalizeGiftSubTab(legacyTab));
  const from = sp.get("from")?.trim();
  if (from) out.set("from", from);
  return out;
}

export function parseCommerceHubTabParam(
  sp: URLSearchParams | null | undefined
): CommerceHubTab | null {
  const raw = sp?.get("tab");
  if (raw == null || !String(raw).trim()) return null;
  return isCommerceHubTab(raw) ? raw : null;
}

export function parseCommerceHubState(sp: URLSearchParams | null | undefined): {
  /** null = bare `/orders/activity` overview landing */
  tab: CommerceHubTab | null;
  giftTab: GiftSubTab;
  couponTab: CouponSubTab;
  expand: string | null;
  orderFilter: string | null;
  from: string | null;
  isOverview: boolean;
} {
  const params = sp ?? new URLSearchParams();
  const tab = parseCommerceHubTabParam(params);
  return {
    tab,
    giftTab: normalizeGiftSubTab(params.get("giftTab")),
    couponTab: normalizeCouponSubTab(params.get("couponTab")),
    expand: params.get("expand")?.trim() || null,
    orderFilter: params.get("orderFilter")?.trim() || null,
    from: params.get("from")?.trim() || null,
    isOverview: tab == null,
  };
}

/** Hub root + legacy alias list surfaces (not instance detail). */
export function isCustomerCommerceHubPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  if (p === "/orders/activity") return true;
  if (p === "/orders") return true;
  if (p === "/mypage/coupons") return true;
  if (p === "/mypage/gift-certificates") return true;
  return false;
}

/** Gift mall + owned instance detail — canonical AppStickyHeader + safe-top SSOT. */
export function isCustomerGiftCommercePath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  if (p === "/stores/gift-mall" || p.startsWith("/stores/gift-mall/")) return true;
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) return true;
  return isCustomerCommerceHubPath(p);
}

export function resolveCommerceHubBackHref(pathname: string, from: string | null): string {
  const p = pathname.split("?")[0]?.trim() || "/";
  if (isCustomerCommerceHubPath(p)) {
    return from === "delivery-activity" ? "/orders/activity" : "/stores";
  }
  if (p.startsWith("/stores/gift-mall")) {
    return from === "delivery-activity" ? canonicalHubHref("gifts", { from }) : "/stores";
  }
  if (/^\/mypage\/gift-certificates\/[^/]+$/.test(p)) {
    return canonicalHubHref("gifts", {
      giftTab: normalizeGiftSubTab(new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("giftTab")),
      from,
    });
  }
  return "/stores";
}
