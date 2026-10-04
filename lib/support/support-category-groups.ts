/**
 * Admin console category-group filter SSOT (분야). Every registry category id belongs to exactly
 * one group (contract-tested), so a filtered queue never silently drops a category.
 * Replaces the regex buckets of the old control-plane sections (재무/광고/주문 문의).
 */
export const SUPPORT_CATEGORY_GROUPS = [
  {
    id: "FINANCE",
    labelKo: "재무",
    labelEn: "Finance",
    categories: ["PAYMENT_RECHARGE", "RECHARGE", "CASH_COIN", "SETTLEMENT", "BANK_ACCOUNT"],
  },
  {
    id: "ORDER",
    labelKo: "주문·배달",
    labelEn: "Orders",
    categories: ["ORDER", "DELIVERY", "REFUND", "ORDER_DELIVERY"],
  },
  { id: "AD", labelKo: "광고", labelEn: "Ads", categories: ["AD", "DELIVERY_AD", "CAMPAIGN"] },
  { id: "ACCOUNT", labelKo: "계정", labelEn: "Account", categories: ["ACCOUNT"] },
  {
    id: "STORE",
    labelKo: "매장 운영",
    labelEn: "Store ops",
    categories: ["STORE", "STORE_APPROVAL", "PRODUCT_MENU"],
  },
  {
    id: "BENEFIT",
    labelKo: "상품권·쿠폰",
    labelEn: "Gift & coupons",
    categories: ["GIFT_CERTIFICATE", "COUPON"],
  },
  {
    id: "ETC",
    labelKo: "신고·기술·기타",
    labelEn: "Report / tech / other",
    categories: ["REPORT", "TECHNICAL", "OTHER"],
  },
] as const;

export type SupportCategoryGroupId = (typeof SUPPORT_CATEGORY_GROUPS)[number]["id"];

export function getSupportCategoryGroup(id: string | null | undefined) {
  const key = String(id ?? "").trim().toUpperCase();
  return SUPPORT_CATEGORY_GROUPS.find((g) => g.id === key) ?? null;
}
