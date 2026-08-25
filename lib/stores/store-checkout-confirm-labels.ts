import type { StoreCommerceCartLine } from "@/lib/stores/store-commerce-cart-types";
import type { CheckoutPaymentBreakdownLine } from "@/lib/stores/store-coupon-product-view";
import { formatMoneyPhp } from "@/lib/utils/format";

/** 주문 확인 모달 — 주문상품 InfoCard 본문 */
export function buildStoreCheckoutOrderSummaryLabel(
  lines: Pick<StoreCommerceCartLine, "title" | "qty">[],
  displayGrandPhp: number
): string {
  if (lines.length === 0) return "(없음)";
  const firstTitle = lines[0]?.title.trim() || "상품";
  const extraCount = lines.length - 1;
  const nameLine = extraCount > 0 ? `${firstTitle} 외 ${extraCount}개` : firstTitle;
  const totalQty = lines.reduce((sum, line) => sum + Math.max(0, line.qty), 0);
  return `${nameLine}\n총 ${totalQty}개 · ${formatMoneyPhp(displayGrandPhp)}`;
}

/** 주문 확인 모달 — 요청사항 InfoCard 본문 */
export function buildStoreCheckoutRequestLabel(buyerNote: string): string {
  const trimmed = buyerNote.trim();
  return trimmed.length > 0 ? trimmed : "없음";
}

/** 주문 확인 모달 — 결제 금액 breakdown (label은 i18n key, detail은 이미 번역된 문장) */
export function formatStoreCheckoutPaymentBreakdownLine(
  line: CheckoutPaymentBreakdownLine,
  label: string
): string {
  const amount = formatMoneyPhp(Math.abs(line.amountPhp));
  const signed = line.amountPhp < 0 ? `-${amount}` : amount;
  if (line.detail) return `${label}: ${signed} (${line.detail})`;
  return `${label}: ${signed}`;
}
