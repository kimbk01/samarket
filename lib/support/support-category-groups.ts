/**
 * Admin console category-group filter SSOT (분야). Every registry category id belongs to exactly
 * one group (contract-tested), so a filtered queue never silently drops a category.
 * Replaces the regex buckets of the old control-plane sections (재무/광고/주문 문의).
 * 이름은 카탈로그 키(`labelKey`)로만 — 화면은 `t(labelKey)` (최종 감사 2026-11-28 U-9).
 */
import type { MessageKey } from "@/lib/i18n/messages";

type SupportCategoryGroup = {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly categories: readonly string[];
};
export const SUPPORT_CATEGORY_GROUPS = [
  {
    id: "FINANCE",
    labelKey: "admin_support_group_finance",
    categories: ["PAYMENT_RECHARGE", "RECHARGE", "CASH_COIN", "SETTLEMENT", "BANK_ACCOUNT"],
  },
  {
    id: "ORDER",
    labelKey: "admin_support_group_order",
    categories: ["ORDER", "DELIVERY", "REFUND", "ORDER_DELIVERY"],
  },
  { id: "AD", labelKey: "admin_support_group_ad", categories: ["AD", "DELIVERY_AD", "CAMPAIGN"] },
  { id: "ACCOUNT", labelKey: "admin_support_group_account", categories: ["ACCOUNT"] },
  { id: "TRADE", labelKey: "admin_support_group_trade", categories: ["TRADE"] },
  {
    id: "STORE",
    labelKey: "admin_support_group_store",
    categories: ["STORE", "STORE_APPROVAL", "STORE_PARTNERSHIP", "PRODUCT_MENU"],
  },
  {
    id: "BENEFIT",
    labelKey: "admin_support_group_benefit",
    categories: ["GIFT_CERTIFICATE", "COUPON"],
  },
  {
    id: "ETC",
    labelKey: "admin_support_group_etc",
    categories: ["REPORT", "TECHNICAL", "OTHER"],
  },
] as const satisfies readonly SupportCategoryGroup[];

export type SupportCategoryGroupId = (typeof SUPPORT_CATEGORY_GROUPS)[number]["id"];

export function getSupportCategoryGroup(id: string | null | undefined) {
  const key = String(id ?? "").trim().toUpperCase();
  return SUPPORT_CATEGORY_GROUPS.find((g) => g.id === key) ?? null;
}
