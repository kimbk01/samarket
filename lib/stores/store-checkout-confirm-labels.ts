import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import type { StoreCheckoutTranslate } from "@/lib/stores/resolve-store-checkout-client-error";
import { formatMoneyPhp } from "@/lib/utils/format";

/** 주문 확인 모달 — 주문상품 InfoCard 본문 (CRT-05·CRT-10: 총액 = 결제 예정액, 문구 i18n) */
export function buildStoreCheckoutOrderSummaryLabel(
  lines: Pick<StoreCommerceCartLine, "title" | "qty">[],
  displayGrandPhp: number,
  t: StoreCheckoutTranslate
): string {
  if (lines.length === 0) return t("store_checkout_summary_none");
  const firstTitle = lines[0]?.title.trim() || t("store_checkout_summary_item_fallback");
  const extraCount = lines.length - 1;
  const nameLine =
    extraCount > 0
      ? t("store_checkout_summary_name_more", { title: firstTitle, count: extraCount })
      : firstTitle;
  const totalQty = lines.reduce((sum, line) => sum + Math.max(0, line.qty), 0);
  return `${nameLine}\n${t("store_checkout_summary_total", {
    count: totalQty,
    amount: formatMoneyPhp(displayGrandPhp),
  })}`;
}

/** 주문 확인 모달 — 요청사항 InfoCard 본문 */
export function buildStoreCheckoutRequestLabel(buyerNote: string, t: StoreCheckoutTranslate): string {
  const trimmed = buyerNote.trim();
  return trimmed.length > 0 ? trimmed : t("store_checkout_request_none");
}
