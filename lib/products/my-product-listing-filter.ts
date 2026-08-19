/**
 * /mypage/products listing filter — P3 public ACTIVE/SOLD + hidden owner tool + promotion overlay.
 * DO NOT use on /mypage/trade/sales (chat/flow authority).
 * Promoted is overlay (`promotedOnly`), not a listing status.
 */
import type { Product } from "@/lib/types/product";
import type { MyProductFilterKey } from "@/lib/products/status-utils";
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";

export type MyProductListingFilterKey = MyProductFilterKey;

export function parseMyProductListingFilterKey(
  raw: string | null | undefined
): MyProductListingFilterKey {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "sold") return "sold";
  if (s === "hidden") return "hidden";
  if (s === "active" || s === "reserved") return "active";
  return "all";
}

/** `/mypage/products` promoted-only overlay — URL `?promoted=1`. */
export function parseMyProductPromotedOnly(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/** Listing filter + promoted overlay → canonical href (share/refresh safe). */
export function buildMyProductsListingHref(
  baseFilter: MyProductListingFilterKey,
  promotedOnly = false
): string {
  const params = new URLSearchParams();
  if (baseFilter !== "all") params.set("filter", baseFilter);
  if (promotedOnly) params.set("promoted", "1");
  const q = params.toString();
  return q ? `/mypage/products?${q}` : "/mypage/products";
}

function listingPost(product: Product) {
  return {
    seller_listing_state: product.sellerListingState,
    status: product.status,
  };
}

function isHiddenOwnerStatus(product: Product): boolean {
  const st = String(product.status ?? "").toLowerCase();
  return st === "hidden" || st === "blinded" || st === "deleted";
}

export function isActivePromotionEntitlement(order: {
  targetId?: string | null;
  orderStatus?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  targetType?: string | null;
}): boolean {
  const id = String(order.targetId ?? "").trim();
  if (!id) return false;
  const tt = String(order.targetType ?? "product").toLowerCase();
  if (tt && tt !== "product") return false;
  const st = String(order.orderStatus ?? "").toLowerCase();
  if (st !== "active") return false;
  const now = Date.now();
  const start = Date.parse(String(order.startAt ?? ""));
  const end = Date.parse(String(order.endAt ?? ""));
  if (Number.isFinite(start) && start > now) return false;
  if (Number.isFinite(end) && end < now) return false;
  return true;
}

export function collectActivePromotionTargetIds(
  orders: Array<{
    targetId?: string | null;
    orderStatus?: string | null;
    startAt?: string | null;
    endAt?: string | null;
    targetType?: string | null;
  }>
): Set<string> {
  const ids = new Set<string>();
  for (const order of orders) {
    if (!isActivePromotionEntitlement(order)) continue;
    ids.add(String(order.targetId).trim());
  }
  return ids;
}

function matchesBaseListingFilter(
  product: Product,
  baseFilter: MyProductListingFilterKey
): boolean {
  const hidden = isHiddenOwnerStatus(product);
  if (baseFilter === "all") return !hidden;
  if (baseFilter === "hidden") return hidden;
  const publicStatus = resolveMarketplacePublicListingStatus(listingPost(product));
  if (baseFilter === "sold") return !hidden && publicStatus === "sold";
  return !hidden && publicStatus === "active";
}

export function filterMyProductsByListingAxis(
  products: Product[],
  baseFilter: MyProductListingFilterKey,
  promotedOnly = false,
  promotedTargetIds: ReadonlySet<string> = new Set()
): Product[] {
  return products.filter((product) => {
    if (!matchesBaseListingFilter(product, baseFilter)) return false;
    if (!promotedOnly) return true;
    return promotedTargetIds.has(product.id);
  });
}
