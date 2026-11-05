/**
 * Finance UI presentation SSOT — operator labels + amount display.
 * One mapper; pages must not invent status strings.
 */
import { formatCashPhp2, formatCurrencyAmount } from "@/lib/currency/currency-display-contract";

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
    return formatCashPhp2(major);
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

/** Cash·Coin 원장 종류 이름 — 관리자·사장님 공용 1벌 (사장님 화면도 이 표를 쓴다 · 금융 SSOT) */
const TYPE_LABELS: Record<string, { ko: string; en: string }> = {
  TOP_UP: { ko: "Cash 충전", en: "Cash top-up" },
  // 같은 전환의 두 원장 행 — 필터·목록에서 구분되게 (실기 2026-11-03: 같은 이름 2개)
  CONVERT_FROM_STORE_POINTS: { ko: "Coin→Cash 전환 (Cash 입금)", en: "Coin→Cash convert (Cash in)" },
  CONVERT_TO_BUSINESS_CASH: { ko: "Coin→Cash 전환 (Coin 차감)", en: "Coin→Cash convert (Coin out)" },
  SALE_FEE: { ko: "판매 수수료", en: "Sale fee" },
  SALE_FEE_SETTLEMENT: { ko: "미납 수수료 정산", en: "Unpaid fee settlement" },
  SALE_FEE_REVERSAL: { ko: "수수료 환급", en: "Fee refund" },
  AD_SPEND: { ko: "광고 사용", en: "Ad spend" },
  AD_REFUND: { ko: "광고 환불", en: "Ad refund" },
  PARTNER_SPEND: { ko: "Partner 사용", en: "Partner spend" },
  PARTNER_REFUND: { ko: "Partner 환불", en: "Partner refund" },
  ADMIN_ADJUST: { ko: "잔액 조정", en: "Balance adjustment" },
  SYSTEM: { ko: "시스템", en: "System" },
  SALE_EARN: { ko: "판매 Coin 적립", en: "Sale Coin earn" },
  GIFT_REDEMPTION_EARN: { ko: "상품권 Coin 적립", en: "Gift Coin earn" },
  REVERSAL: { ko: "적립 취소", en: "Earn reversal" },
  WITHDRAWAL_REQUEST: { ko: "출금 신청 (Coin 보류)", en: "Withdrawal requested (Coin held)" },
  WITHDRAWAL_COMPLETE: { ko: "출금 완료", en: "Withdrawal paid" },
  WITHDRAWAL_RELEASE: { ko: "출금 반려 (Coin 환원)", en: "Withdrawal rejected (Coin returned)" },
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

/** 구 종류 코드 — 이름만 같고 필터 항목은 따로 두지 않는다 */
const TYPE_LABEL_ALIASES: Record<string, string> = {
  WITHDRAWAL_REJECT: "WITHDRAWAL_RELEASE",
};

function typeLabelHit(type: string | null | undefined): { ko: string; en: string } | undefined {
  const key = String(type ?? "").trim();
  return TYPE_LABELS[TYPE_LABEL_ALIASES[key] ?? key];
}

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

/** 표에 있는 종류만 이름을 준다 — 없으면 null (사장님 화면은 기본 문구로 대체) */
export function financeTypeLabelOrNull(type: string, ko: boolean): string | null {
  const hit = typeLabelHit(type);
  return hit ? (ko ? hit.ko : hit.en) : null;
}

export function financeTypeLabel(type: string, ko: boolean): string {
  const hit = typeLabelHit(type);
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

/** 원천 거래 종류(related_type) 이름 — 원시 테이블명 노출 금지 (실기 FAIL 2026-11-03). */
const RELATED_TYPE_LABELS: Record<string, { ko: string; en: string }> = {
  store_order: { ko: "주문", en: "Order" },
  store_sale_fee_obligation: { ko: "수수료 미납", en: "Fee obligation" },
  store_commission_adjustment: { ko: "수수료 환급 결정", en: "Fee refund decision" },
  business_cash_charge_request: { ko: "충전 신청", en: "Top-up request" },
  business_cash_conversion: { ko: "Coin→Cash 전환", en: "Coin→Cash conversion" },
  store_economic_point_ledger: { ko: "Coin→Cash 전환", en: "Coin→Cash conversion" },
  coin_withdrawal: { ko: "Coin 출금", en: "Coin withdrawal" },
  coin_withdrawal_request: { ko: "Coin 출금", en: "Coin withdrawal" },
  gift_certificate: { ko: "상품권", en: "Gift certificate" },
  admin_adjustment: { ko: "관리자 조정", en: "Admin adjustment" },
  delivery_ad_canonical_bc_fundings: { ko: "광고 결제", en: "Ad funding" },
  store_sponsored: { ko: "추천 매장 광고", en: "Sponsored store ad" },
  platform_popup: { ko: "팝업 광고", en: "Popup ad" },
  banner: { ko: "배너 광고", en: "Banner ad" },
  partner: { ko: "Partner", en: "Partner" },
  gift_redemption: { ko: "상품권 사용", en: "Gift redemption" },
  store_settlement: { ko: "정산", en: "Settlement" },
};

export function financeRelatedTypeLabel(relatedType: string | null | undefined, ko: boolean): string | null {
  const l = RELATED_TYPE_LABELS[String(relatedType ?? "").trim()];
  return l ? (ko ? l.ko : l.en) : null;
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
    const prefix = financeRelatedTypeLabel(family, ko) ?? (ko ? "광고" : "Ad");
    return `${prefix} · ${row.adId.slice(0, 8)}…`;
  }
  if (row.relatedId) {
    const kind = String(row.relatedType || row.entryKind || "").trim();
    const label =
      financeRelatedTypeLabel(row.relatedType, ko) ?? (kind ? financeTypeLabel(kind, ko) : ko ? "연결" : "Related");
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
