import type { MessageKey } from "@/lib/i18n/messages";
import {
  normalizeSellerListingState,
  type SellerListingState,
} from "@/lib/products/seller-listing-state";
import type { ProductStatus } from "@/lib/types/product";

export const SELLER_LISTING_LABEL_KEYS: Record<SellerListingState, MessageKey> = {
  inquiry: "mypage_comp_listing_inquiry",
  negotiating: "mypage_comp_listing_negotiating",
  reserved: "mypage_comp_listing_reserved",
  completed: "mypage_comp_listing_completed",
};

export function sellerListingLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  state: SellerListingState
): string {
  return t(SELLER_LISTING_LABEL_KEYS[state]);
}

const PRODUCT_STATUS_LABEL_KEYS: Partial<Record<ProductStatus, MessageKey>> = {
  active: "mypage_comp_product_status_active",
  reserved: "mypage_comp_product_status_reserved",
  sold: "mypage_comp_product_status_sold",
  hidden: "mypage_comp_product_status_hidden",
};

export function productStatusLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  status: ProductStatus
): string {
  const key = PRODUCT_STATUS_LABEL_KEYS[status];
  return key ? t(key) : status;
}

/** posts.status 기반 배지(숨김·삭제) — `publicListingBadge` 와 동일 규칙 */
export function postModerationStatusLabel(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  postStatus: string | undefined
): string | null {
  const st = (postStatus ?? "active").toLowerCase();
  if (st === "hidden" || st === "blinded") return t("mypage_comp_product_status_hidden");
  if (st === "deleted") return t("mypage_comp_product_status_deleted");
  if (st === "sold") return t("mypage_comp_listing_completed");
  return null;
}

export function publicListingBadgeI18n(
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
  sellerListingState: SellerListingState | undefined,
  postStatus: string | undefined
): { label: string; tone: "default" | "signature" | "amber" | "muted" } {
  const moderated = postModerationStatusLabel(t, postStatus);
  if (moderated) {
    const st = (postStatus ?? "active").toLowerCase();
    return { label: moderated, tone: st === "sold" ? "muted" : "muted" };
  }
  const ls = sellerListingState ?? normalizeSellerListingState(undefined, postStatus);
  const label = sellerListingLabel(t, ls);
  if (ls === "reserved") return { label, tone: "amber" };
  if (ls === "completed") return { label, tone: "muted" };
  if (ls === "negotiating") return { label, tone: "signature" };
  return { label, tone: "default" };
}
