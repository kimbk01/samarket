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

export function ownerGiftRedemptionMatchesFilter(
  row: Pick<OwnerGiftRedemptionRow, "reversed" | "recognized">,
  filter: OwnerGiftRedemptionFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "refund") return row.reversed;
  if (filter === "recognized") return !row.reversed && row.recognized;
  return !row.reversed && !row.recognized;
}

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

/** 고른 기간 **모든** 사용 행의 합계·건수 (현재 쪽이 아니라 기간 전체). */
export function summarizeOwnerGiftRedemptionPeriod(
  rows: ReadonlyArray<OwnerGiftRedemptionStatusRow>
): OwnerGiftRedemptionPeriodSummary {
  const kpis = aggregateOwnerRedemptionKpis(rows);
  const counts: Record<OwnerGiftRedemptionFilter, number> = { all: 0, pending: 0, recognized: 0, refund: 0 };
  for (const row of rows) {
    counts.all += 1;
    if (row.reversed) counts.refund += 1;
    else if (row.recognized) counts.recognized += 1;
    else counts.pending += 1;
  }
  return { ...kpis, counts };
}

/** 거르기 → 쪽 자르기. `total` = 거른 뒤 전체 건수. */
export function pageOwnerGiftRedemptions<T extends Pick<OwnerGiftRedemptionRow, "reversed" | "recognized">>(
  rows: ReadonlyArray<T>,
  args: { filter: OwnerGiftRedemptionFilter; offset: number; limit: number }
): { rows: T[]; total: number } {
  const filtered = rows.filter((r) => ownerGiftRedemptionMatchesFilter(r, args.filter));
  return { rows: filtered.slice(args.offset, args.offset + args.limit), total: filtered.length };
}
