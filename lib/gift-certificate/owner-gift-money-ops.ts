/**
 * Owner Gift money-ops pure helpers (U5).
 * Presentation only — financial authority remains server/RPC.
 */

export type OwnerGiftRedemptionRow = {
  id: string;
  orderId: string;
  orderNo: string | null;
  orderStatus: string | null;
  customerLabel?: string;
  instanceId: string;
  publicGiftNumber?: string;
  giftScope?: "STORE" | "PLATFORM";
  giftTitle: string;
  redeemedAmount: number;
  platformFeeAmount: number;
  merchantNetAmount: number;
  recognized: boolean;
  reversed: boolean;
  createdAt: string;
};

export type OwnerGiftConversionRow = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
};

export type OwnerGiftMoneyKpis = {
  redeemedGross: number;
  platformFeeTotal: number;
  merchantNetTotal: number;
  pendingMerchantNet: number;
  recognizedMerchantNet: number;
  outstandingBalance: number;
  availableRevenue: number;
  storeCashBalance: number;
  conversionPendingAmount: number;
  openRecoveryAmount: number;
};

import {
  aggregateGiftRevenuePendingRecognized,
  ownerRedemptionRecognitionLabelKey,
  resolveGiftRedemptionRecognitionState,
} from "@/lib/gift-certificate/gift-revenue-recognition";

export function aggregateOwnerRedemptionKpis(
  rows: ReadonlyArray<OwnerGiftRedemptionStatusRow>
): Pick<
  OwnerGiftMoneyKpis,
  "redeemedGross" | "platformFeeTotal" | "merchantNetTotal" | "pendingMerchantNet" | "recognizedMerchantNet"
> {
  let redeemedGross = 0;
  let platformFeeTotal = 0;
  let merchantNetTotal = 0;
  for (const r of rows) {
    if (r.reversed) continue;
    redeemedGross += Math.max(0, Math.trunc(r.redeemedAmount));
    platformFeeTotal += Math.max(0, Math.trunc(r.platformFeeAmount));
    merchantNetTotal += Math.max(0, Math.trunc(r.merchantNetAmount));
  }
  const split = aggregateGiftRevenuePendingRecognized(
    rows.map((r) => ({
      reversed: r.reversed,
      recognized: r.recognized,
      redeemedAmount: r.redeemedAmount,
      platformFeeAmount: r.platformFeeAmount,
      merchantNetAmount: r.merchantNetAmount,
    }))
  );
  return {
    redeemedGross,
    platformFeeTotal,
    merchantNetTotal,
    pendingMerchantNet: split.pendingMerchantNet,
    recognizedMerchantNet: split.recognizedMerchantNet,
  };
}

export function conversionPendingAmount(rows: OwnerGiftConversionRow[]): number {
  return rows
    .filter((r) => String(r.status).toUpperCase() === "REQUESTED")
    .reduce((s, r) => s + Math.max(0, Math.trunc(r.amount)), 0);
}

export function canRequestGiftCashConversion(args: {
  availableRevenue: number;
  openRecoveryAmount: number;
}): { ok: true } | { ok: false; reason: "no_available" | "recovery_blocked" } {
  const avail = Math.max(0, Math.trunc(args.availableRevenue));
  const recovery = Math.max(0, Math.trunc(args.openRecoveryAmount));
  if (recovery > 0) return { ok: false, reason: "recovery_blocked" };
  if (avail <= 0) return { ok: false, reason: "no_available" };
  return { ok: true };
}

export function validateGiftConversionAmount(args: {
  amount: number;
  availableRevenue: number;
}): { ok: true; amount: number } | { ok: false; error: "invalid_amount" | "exceeds_available" } {
  const amount = Math.trunc(Number(args.amount));
  const avail = Math.max(0, Math.trunc(args.availableRevenue));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid_amount" };
  if (amount > avail) return { ok: false, error: "exceeds_available" };
  return { ok: true, amount };
}

/** Sale face value is never Owner gift revenue. */
export function saleAmountIsNotOwnerRevenue(): true {
  return true;
}

export function businessCreditIsNotGiftRevenue(): true {
  return true;
}

export function storeCashIsNotGiftRevenue(): true {
  return true;
}

export function ownerConversionRequestStatusLabelKey(status: string): string {
  switch (String(status).toUpperCase()) {
    case "REQUESTED":
      return "gift_u5_conv_status_requested";
    case "APPROVED":
      return "gift_u5_conv_status_approved";
    case "REJECTED":
      return "gift_u5_conv_status_rejected";
    case "CANCELLED":
      return "gift_u5_conv_status_cancelled";
    default:
      return "gift_u5_conv_status_other";
  }
}

export function ownerRedemptionStatusLabelKey(
  row: Pick<OwnerGiftRedemptionRow, "reversed" | "recognized">
): string {
  return ownerRedemptionRecognitionLabelKey(
    resolveGiftRedemptionRecognitionState({
      reversed: row.reversed,
      recognized: row.recognized,
    })
  );
}

/* ── 사장님 상품권 사용 내역 — 기간 전체 합계 + 서버 쪽 나눔 (Owner 2026-11-03 · C-6) ── */

export const OWNER_GIFT_REDEMPTION_FILTERS = ["all", "pending", "recognized", "refund"] as const;
export type OwnerGiftRedemptionFilter = (typeof OWNER_GIFT_REDEMPTION_FILTERS)[number];

export const OWNER_GIFT_REDEMPTIONS_PAGE_SIZE = 20;
export const OWNER_GIFT_REDEMPTIONS_MAX_LIMIT = 100;

/** 합계·거르기에 필요한 최소 칸 (목록 꾸밈 정보 없이) */
export type OwnerGiftRedemptionStatusRow = Pick<
  OwnerGiftRedemptionRow,
  "reversed" | "recognized" | "redeemedAmount" | "platformFeeAmount" | "merchantNetAmount"
>;

/** 주소 `status`·`offset`·`limit` → 안전한 값 (모르는 값은 전체·0·기본 쪽 크기). */
export function parseOwnerGiftRedemptionPageParams(sp: Pick<URLSearchParams, "get">): {
  filter: OwnerGiftRedemptionFilter;
  offset: number;
  limit: number;
} {
  const raw = String(sp.get("status") ?? "").trim();
  const filter = (OWNER_GIFT_REDEMPTION_FILTERS as readonly string[]).includes(raw)
    ? (raw as OwnerGiftRedemptionFilter)
    : "all";
  const offsetNum = Math.trunc(Number(sp.get("offset")));
  const offset = Number.isFinite(offsetNum) && offsetNum > 0 ? offsetNum : 0;
  const limitRaw = sp.get("limit");
  const limitNum = Math.trunc(Number(limitRaw));
  const limit =
    limitRaw == null || limitRaw === "" || !Number.isFinite(limitNum) || limitNum < 0
      ? OWNER_GIFT_REDEMPTIONS_PAGE_SIZE
      : Math.min(OWNER_GIFT_REDEMPTIONS_MAX_LIMIT, limitNum);
  return { filter, offset, limit };
}

export type OwnerGiftRedemptionPeriodSummary = Pick<
  OwnerGiftMoneyKpis,
  "redeemedGross" | "platformFeeTotal" | "merchantNetTotal" | "pendingMerchantNet" | "recognizedMerchantNet"
> & {
  counts: Record<OwnerGiftRedemptionFilter, number>;
};

/**
 * DB 상태 칸 묶음(`owner_gift_redemption_page.groups` · 재감사 P-9) → 기간 합계 (환불 / 확정 / 대기 칸 · 금액은 aggregateOwnerRedemptionKpis)
 * (줄마다 음수 0 처리는 SQL 이 함 · 묶음 = 같은 상태 줄들의 합).
 */
export function ownerGiftRedemptionSummaryFromGroups(raw: unknown): OwnerGiftRedemptionPeriodSummary {
  const groups = (Array.isArray(raw) ? raw : []) as Array<{
    reversed?: boolean;
    recognized?: boolean;
    count?: number | string;
    redeemed?: number | string;
    fee?: number | string;
    net?: number | string;
  }>;
  const n = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));
  const kpis = aggregateOwnerRedemptionKpis(
    groups.map((g) => ({
      reversed: g.reversed === true,
      recognized: g.recognized === true,
      redeemedAmount: n(g.redeemed),
      platformFeeAmount: n(g.fee),
      merchantNetAmount: n(g.net),
    }))
  );
  const counts: Record<OwnerGiftRedemptionFilter, number> = { all: 0, pending: 0, recognized: 0, refund: 0 };
  for (const g of groups) {
    const c = n(g.count);
    counts.all += c;
    if (g.reversed === true) counts.refund += c;
    else if (g.recognized === true) counts.recognized += c;
    else counts.pending += c;
  }
  return { ...kpis, counts };
}

