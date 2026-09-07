/**
 * Finance UI presentation SSOT — operator labels + amount display.
 * One mapper; pages must not invent status strings.
 */
import { formatCurrencyAmount } from "@/lib/currency/currency-display-contract";
import { formatMoneyPhp } from "@/lib/utils/format";

export type FinanceWallet = "POINT" | "COIN" | "CASH" | "N_A";

export function formatFinanceAmount(input: {
  wallet: FinanceWallet;
  amount: number | null | undefined;
  /** Cash: true = minor units */
  isMinor?: boolean;
  locale?: string;
  ko?: boolean;
}): string {
  if (input.amount == null || !Number.isFinite(Number(input.amount))) return "—";
  if (input.wallet === "N_A") return "—";
  if (input.wallet === "CASH") {
    const major = input.isMinor ? Math.trunc(Number(input.amount)) / 100 : Number(input.amount);
    return formatMoneyPhp(major);
  }
  if (input.wallet === "POINT") {
    return formatCurrencyAmount({
      currency: "point",
      amount: Math.trunc(Number(input.amount)),
      locale: input.locale,
      compactPoint: true,
    });
  }
  return formatCurrencyAmount({
    currency: "coin",
    amount: Math.trunc(Number(input.amount)),
    locale: input.locale,
  });
}

const TYPE_LABELS: Record<string, { ko: string; en: string }> = {
  TOP_UP: { ko: "Cash 충전", en: "Cash top-up" },
  CONVERT_FROM_STORE_POINTS: { ko: "Coin→Cash 전환", en: "Coin→Cash convert" },
  CONVERT_TO_BUSINESS_CASH: { ko: "Coin→Cash 전환", en: "Coin→Cash convert" },
  SALE_FEE: { ko: "판매 수수료", en: "Sale fee" },
  SALE_FEE_SETTLEMENT: { ko: "미납 수수료 회수", en: "Outstanding fee collection" },
  SALE_FEE_REVERSAL: { ko: "수수료 취소", en: "Fee reversal" },
  AD_SPEND: { ko: "광고 지출", en: "Ad spend" },
  AD_REFUND: { ko: "광고 환불", en: "Ad refund" },
  PARTNER_SPEND: { ko: "Partner 지출", en: "Partner spend" },
  PARTNER_REFUND: { ko: "Partner 환불", en: "Partner refund" },
  ADMIN_ADJUST: { ko: "관리자 조정", en: "Admin adjustment" },
  SALE_EARN: { ko: "판매 Coin 적립", en: "Sale Coin earn" },
  GIFT_REDEMPTION_EARN: { ko: "상품권 Coin 적립", en: "Gift Coin earn" },
  REVERSAL: { ko: "취소/반전", en: "Reversal" },
  WITHDRAWAL_REQUEST: { ko: "출금 신청", en: "Withdrawal request" },
  WITHDRAWAL_COMPLETE: { ko: "출금 지급", en: "Withdrawal paid" },
  WITHDRAWAL_RELEASE: { ko: "출금 해제", en: "Withdrawal release" },
  ECONOMIC_INFLOW: { ko: "Coin 유입", en: "Coin inflow" },
  POINT_CHARGE: { ko: "Point 충전", en: "Point charge" },
  POINT_SPEND: { ko: "Point 사용", en: "Point spend" },
  POINT_HOLD: { ko: "Point 보류", en: "Point hold" },
  POINT_CAPTURE: { ko: "Point 확정", en: "Point capture" },
  POINT_RELEASE: { ko: "Point 해제", en: "Point release" },
  POINT_REWARD: { ko: "Point 지급", en: "Point reward" },
  POINT_RECLAIM: { ko: "Point 회수", en: "Point reclaim" },
  POINT_REFUND: { ko: "Point 환불", en: "Point refund" },
};

const STATUS_LABELS: Record<string, { ko: string; en: string }> = {
  open: { ko: "미납", en: "Outstanding" },
  partial: { ko: "부분 회수", en: "Partially collected" },
  settled: { ko: "완납", en: "Settled" },
  cancelled: { ko: "취소", en: "Cancelled" },
  PENDING: { ko: "대기", en: "Pending" },
  APPROVED: { ko: "승인", en: "Approved" },
  REJECTED: { ko: "반려", en: "Rejected" },
  SECURED: { ko: "결제 확보", en: "Secured" },
  REFUNDED: { ko: "환불", en: "Refunded" },
  active: { ko: "활성", en: "Active" },
  expired: { ko: "만료", en: "Expired" },
  pending_review: { ko: "검토 대기", en: "Pending review" },
  captured: { ko: "확정", en: "Captured" },
  released: { ko: "해제", en: "Released" },
  REQUESTED: { ko: "신청", en: "Requested" },
  PAID: { ko: "지급 완료", en: "Paid" },
  scheduled: { ko: "예정", en: "Scheduled" },
  processing: { ko: "처리 중", en: "Processing" },
  held: { ko: "보류", en: "Held" },
  paid: { ko: "지급 완료", en: "Paid" },
};

export function financeTypeLabel(type: string, ko: boolean): string {
  const hit = TYPE_LABELS[String(type ?? "").trim()];
  if (hit) return ko ? hit.ko : hit.en;
  return String(type ?? "—");
}

export function financeStatusLabel(status: string, ko: boolean): string {
  const key = String(status ?? "").trim();
  const hit = STATUS_LABELS[key] ?? STATUS_LABELS[key.toLowerCase()];
  if (hit) return ko ? hit.ko : hit.en;
  return key || "—";
}

export function financeWalletLabel(wallet: FinanceWallet, ko: boolean): string {
  if (wallet === "POINT") return "Point";
  if (wallet === "COIN") return "Coin";
  if (wallet === "CASH") return ko ? "Cash" : "Cash";
  return "N/A";
}

export function financeFundingRailLabel(
  rail: "MEMBER_POINT" | "STORE_CASH" | "ADMIN_DIRECT" | string,
  ko: boolean
): string {
  if (rail === "MEMBER_POINT") return ko ? "Member Point" : "Member Point";
  if (rail === "STORE_CASH") return ko ? "Store Cash" : "Store Cash";
  if (rail === "ADMIN_DIRECT") return "Admin Direct";
  return rail;
}

/** Human-readable linked source for list rows (order / ad / related). */
export function financeRelatedTargetLabel(
  row: {
    orderId?: string | null;
    adId?: string | null;
    relatedType?: string | null;
    relatedId?: string | null;
    entryKind?: string | null;
  },
  ko: boolean
): string {
  if (row.orderId) {
    return ko ? `주문 · ${row.orderId.slice(0, 8)}…` : `Order · ${row.orderId.slice(0, 8)}…`;
  }
  if (row.adId) {
    const family = String(row.relatedType || "").trim();
    const prefix = family
      ? family.replace(/_/g, " ")
      : ko
        ? "광고"
        : "Ad";
    return `${prefix} · ${row.adId.slice(0, 8)}…`;
  }
  if (row.relatedId) {
    const kind = String(row.relatedType || row.entryKind || "").trim();
    const label = kind ? financeTypeLabel(kind, ko) : ko ? "연결" : "Related";
    return `${label} · ${row.relatedId.slice(0, 8)}…`;
  }
  return "—";
}

/** Known entry kinds for filter select (label + value). */
export function financeTypeFilterOptions(ko: boolean): Array<{ value: string; label: string }> {
  return Object.entries(TYPE_LABELS).map(([value, labels]) => ({
    value,
    label: ko ? labels.ko : labels.en,
  }));
}

/** Forbidden generic CTA tokens — contract tests / lint helpers. */
export const FINANCE_FORBIDDEN_CTA_LABELS = [
  "관리",
  "처리",
  "확인",
  "보기",
  "실행",
  "이동",
  "Manage",
  "Process",
  "View",
  "Go",
] as const;
