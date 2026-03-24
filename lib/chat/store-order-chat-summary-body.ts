import { formatMoneyPhp } from "@/lib/utils/format";
import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";

export type StoreOrderSummaryLine = {
  title: string;
  unitPhp: number;
  qty: number;
  optionsLine?: string | null;
};

export type StoreOrderSummaryInput = {
  orderNo: string;
  storeName: string;
  buyerNickname: string;
  fulfillmentLabel: string;
  buyerPhoneDisplay: string | null;
  addressSummary: string | null;
  addressDetail: string | null;
  deliveryCourierLabel: string | null;
  lines: StoreOrderSummaryLine[];
  itemsSubtotalPhp: number;
  deliveryFeePhp: number;
  discountPhp: number;
  totalPhp: number;
  buyerNote: string | null;
  bankLine: string | null;
  /** 결제 상태 한 줄 (미입력 시 요약 본문에서 기본 문구) */
  paymentStatusLabel?: string;
  /** 고객이 주문 시 선택한 결제 수단 (표시문) */
  selectedPaymentLabel?: string | null;
  /** 결제·정산 안내 한 줄 (선택) */
  paymentMethodNote?: string | null;
};

function optionsLineFromSnapshot(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v === 1 && typeof r.summary === "string") {
    const s = r.summary.trim();
    return s || null;
  }
  return null;
}

export function optionsLineFromItemSnapshotJson(raw: unknown): string | null {
  return optionsLineFromSnapshot(raw);
}

/** 주문 채팅방 첫 시스템 메시지 (배달앱형 주문 카드) */
export function buildStoreOrderSummaryBody(input: StoreOrderSummaryInput): string {
  const parts: string[] = [];
  parts.push(`📦 주문이 접수되었습니다.`);
  parts.push(`주문번호 ${input.orderNo}`);
  parts.push(`매장: ${input.storeName}`);
  parts.push(`주문자: ${input.buyerNickname.trim() || "고객"}`);
  if (input.buyerPhoneDisplay) {
    parts.push(`연락처: ${input.buyerPhoneDisplay}`);
  }
  parts.push("");
  parts.push(`수령: ${input.fulfillmentLabel}`);
  parts.push(`결제 상태: ${input.paymentStatusLabel ?? "안내 참고"}`);
  const paySel = (input.selectedPaymentLabel ?? "").trim();
  if (paySel) parts.push(`고객 선택 결제: ${paySel}`);
  const payNote = (input.paymentMethodNote ?? "").trim();
  if (payNote) parts.push(payNote);
  if (input.deliveryCourierLabel?.trim()) {
    parts.push(`배달 안내: ${input.deliveryCourierLabel.trim()}`);
  }
  parts.push("");
  parts.push("── 주문 품목 ──");
  for (const line of input.lines) {
    const opt = line.optionsLine?.trim();
    parts.push(
      `• ${line.title} × ${line.qty}  ${formatMoneyPhp(line.unitPhp * line.qty)} (단가 ${formatMoneyPhp(line.unitPhp)})`
    );
    if (opt) parts.push(`  └ 옵션: ${opt}`);
  }
  parts.push("");
  parts.push(`상품 합계  ${formatMoneyPhp(input.itemsSubtotalPhp)}`);
  parts.push(`배달비    ${formatMoneyPhp(input.deliveryFeePhp)}`);
  if (input.discountPhp > 0) {
    parts.push(`할인      -${formatMoneyPhp(input.discountPhp)}`);
  }
  parts.push(`───────────────`);
  parts.push(`총 금액   ${formatMoneyPhp(input.totalPhp)}`);
  parts.push("");

  const addrSum = input.addressSummary?.trim();
  const addrDet = input.addressDetail?.trim();
  if (addrSum || addrDet) {
    parts.push("📍 배달·수령 주소");
    if (addrSum) parts.push(`  ${addrSum}`);
    if (addrDet) parts.push(`  ${addrDet}`);
    parts.push("");
  }

  const note = input.buyerNote?.trim();
  if (note) {
    parts.push(`고객 요청 사항: ${note}`);
    parts.push("");
  }

  const bank = input.bankLine?.trim();
  if (bank) {
    parts.push("💳 무통장·직접 입금 안내");
    parts.push(bank);
  }

  return parts.join("\n").trimEnd();
}

export function fulfillmentLabelKo(ft: string | null | undefined): string {
  const s = String(ft ?? "").trim();
  if (s === "local_delivery" || s === "shipping") return "배달";
  return "포장 픽업";
}

export function formatBuyerPhoneForSummary(stored09: string | null | undefined): string | null {
  const t = (stored09 ?? "").replace(/\D/g, "");
  if (t.length !== 11 || !t.startsWith("09")) return null;
  return formatPhMobileDisplay(t);
}
