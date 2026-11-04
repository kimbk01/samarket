import type { WalletHistoryRow } from "@/lib/finance/wallet-period-history";

/**
 * Cash 내역 줄 「자세히」 주소 (D-6).
 * - TOP_UP: 원장 related_type=business_cash_charge_request · related_id = 충전 신청 id → 전환 화면 충전 신청 `focus=<id>`.
 * - SALE_FEE·SALE_FEE_SETTLEMENT·SALE_FEE_REVERSAL: 내역 API 가 붙인 주문번호 → 정산 화면 `order_no=<주문번호>`.
 * - CONVERT_FROM_STORE_POINTS: 전환 화면.
 */
export function cashHistoryDetailHref(
  row: Pick<WalletHistoryRow, "entryKind" | "relatedType" | "relatedId" | "orderNo">,
  hrefs: { convertHref: string; settlementsHref: string }
): string | undefined {
  const join = (base: string, key: string, value: string) =>
    `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams({ [key]: value }).toString()}`;
  if (row.entryKind === "TOP_UP") {
    return row.relatedType === "business_cash_charge_request" && row.relatedId
      ? join(hrefs.convertHref, "focus", row.relatedId)
      : hrefs.convertHref;
  }
  if (row.entryKind === "CONVERT_FROM_STORE_POINTS") return hrefs.convertHref;
  if (row.entryKind === "SALE_FEE" || row.entryKind === "SALE_FEE_SETTLEMENT" || row.entryKind === "SALE_FEE_REVERSAL") {
    return row.orderNo ? join(hrefs.settlementsHref, "order_no", row.orderNo) : hrefs.settlementsHref;
  }
  return undefined;
}
