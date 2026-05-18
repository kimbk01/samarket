import { formatPhMobileDisplay } from "@/lib/utils/ph-mobile";
import {
  buildStoreOrderSummaryBodyI18n,
  fulfillmentLabel,
} from "@/lib/chat/store-order-chat-summary-i18n";

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
  paymentStatusLabel?: string;
  selectedPaymentLabel?: string | null;
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
  return buildStoreOrderSummaryBodyI18n(input);
}

export function fulfillmentLabelKo(ft: string | null | undefined): string {
  return fulfillmentLabel(ft);
}

export function formatBuyerPhoneForSummary(stored09: string | null | undefined): string | null {
  const t = (stored09 ?? "").replace(/\D/g, "");
  if (t.length !== 11 || !t.startsWith("09")) return null;
  return formatPhMobileDisplay(t);
}
