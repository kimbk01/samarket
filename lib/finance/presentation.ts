/**
 * Finance UI presentation SSOT — operator labels + amount display.
 * One mapper; pages must not invent status strings.
 */
import { formatCashPhp2, formatCurrencyAmount } from "@/lib/currency/currency-display-contract";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translateBy } from "@/lib/i18n/translate-by";

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
  TOP_UP: catalogPair("finance_cash_top_up"),
  // 같은 전환의 두 원장 행 — 필터·목록에서 구분되게 (실기 2026-11-03: 같은 이름 2개)
  CONVERT_FROM_STORE_POINTS: catalogPair("finance_coin_cash_convert_cash_in"),
  CONVERT_TO_BUSINESS_CASH: catalogPair("finance_coin_cash_convert_coin_out"),
  SALE_FEE: catalogPair("finance_sale_fee"),
  SALE_FEE_SETTLEMENT: catalogPair("finance_unpaid_fee_settlement"),
  SALE_FEE_REVERSAL: catalogPair("finance_fee_refund"),
  AD_SPEND: catalogPair("finance_ad_spend"),
  AD_REFUND: catalogPair("finance_ad_refund"),
  PARTNER_SPEND: catalogPair("finance_partner_spend"),
  PARTNER_REFUND: catalogPair("finance_partner_refund"),
  ADMIN_ADJUST: catalogPair("finance_balance_adjustment"),
  SYSTEM: catalogPair("finance_system"),
  SALE_EARN: catalogPair("finance_sale_coin_earn"),
  GIFT_REDEMPTION_EARN: catalogPair("finance_gift_coin_earn"),
  REVERSAL: catalogPair("finance_earn_reversal"),
  WITHDRAWAL_REQUEST: catalogPair("finance_withdrawal_requested_coin_held"),
  WITHDRAWAL_COMPLETE: catalogPair("finance_withdrawal_paid"),
  WITHDRAWAL_RELEASE: catalogPair("finance_withdrawal_rejected_coin_returned"),
  ECONOMIC_INFLOW: catalogPair("finance_coin_inflow"),
  POINT_CHARGE: catalogPair("finance_point_charge"),
  POINT_SPEND: catalogPair("finance_point_spend"),
  POINT_HOLD: catalogPair("finance_point_hold"),
  POINT_CAPTURE: catalogPair("finance_point_capture"),
  POINT_RELEASE: catalogPair("finance_point_release"),
  POINT_REWARD: catalogPair("finance_point_reward"),
  POINT_RECLAIM: catalogPair("finance_point_reclaim"),
  POINT_REFUND: catalogPair("finance_point_refund"),
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
  open: catalogPair("finance_outstanding"),
  partial: catalogPair("finance_partially_collected"),
  settled: catalogPair("finance_settled"),
  cancelled: catalogPair("finance_cancelled"),
  PENDING: catalogPair("finance_pending"),
  APPROVED: catalogPair("finance_approved"),
  REJECTED: catalogPair("finance_rejected"),
  SECURED: catalogPair("finance_secured"),
  REFUNDED: catalogPair("finance_refunded"),
  active: catalogPair("finance_active"),
  expired: catalogPair("finance_expired"),
  pending_review: catalogPair("finance_pending_review"),
  captured: catalogPair("finance_captured"),
  released: catalogPair("finance_released"),
  REQUESTED: catalogPair("finance_requested"),
  PAID: catalogPair("finance_paid"),
  scheduled: catalogPair("finance_scheduled"),
  processing: catalogPair("finance_processing"),
  held: catalogPair("finance_held"),
  paid: catalogPair("finance_paid"),
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

export function financeWalletLabel(wallet: FinanceWallet, _ko: boolean): string {
  if (wallet === "POINT") return "Point";
  if (wallet === "COIN") return "Coin";
  if (wallet === "CASH") return "Cash";
  return "N/A";
}

export function financeFundingRailLabel(
  rail: "MEMBER_POINT" | "STORE_CASH" | "ADMIN_DIRECT" | string,
  _ko: boolean
): string {
  if (rail === "MEMBER_POINT") return "Member Point";
  if (rail === "STORE_CASH") return "Store Cash";
  if (rail === "ADMIN_DIRECT") return "Admin Direct";
  return rail;
}

/** 원천 거래 종류(related_type) 이름 — 원시 테이블명 노출 금지 (실기 FAIL 2026-11-03). */
const RELATED_TYPE_LABELS: Record<string, { ko: string; en: string }> = {
  store_order: catalogPair("finance_order"),
  store_sale_fee_obligation: catalogPair("finance_fee_obligation"),
  store_commission_adjustment: catalogPair("finance_fee_refund_decision"),
  business_cash_charge_request: catalogPair("finance_top_up_request"),
  business_cash_conversion: catalogPair("finance_coin_cash_conversion"),
  store_economic_point_ledger: catalogPair("finance_coin_cash_conversion"),
  coin_withdrawal: catalogPair("finance_coin_withdrawal"),
  coin_withdrawal_request: catalogPair("finance_coin_withdrawal"),
  gift_certificate: catalogPair("finance_gift_certificate"),
  admin_adjustment: catalogPair("finance_admin_adjustment"),
  delivery_ad_canonical_bc_fundings: catalogPair("finance_ad_funding"),
  store_sponsored: catalogPair("finance_sponsored_store_ad"),
  platform_popup: catalogPair("finance_popup_ad"),
  banner: catalogPair("finance_banner_ad"),
  partner: catalogPair("finance_partner"),
  gift_redemption: catalogPair("finance_gift_redemption"),
  store_settlement: catalogPair("finance_settlement"),
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
    return translateBy(ko ? "ko" : "en", "finance_order_ref", { id: row.orderId.slice(0, 8) });
  }
  if (row.adId) {
    const family = String(row.relatedType || "").trim();
    const prefix = financeRelatedTypeLabel(family, ko) ?? translateBy(ko ? "ko" : "en", "finance_ad");
    return `${prefix} · ${row.adId.slice(0, 8)}…`;
  }
  if (row.relatedId) {
    const kind = String(row.relatedType || row.entryKind || "").trim();
    const label =
      financeRelatedTypeLabel(row.relatedType, ko) ?? (kind ? financeTypeLabel(kind, ko) : translateBy(ko ? "ko" : "en", "finance_related"));
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
