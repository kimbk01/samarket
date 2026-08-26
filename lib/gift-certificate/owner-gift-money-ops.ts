/**
 * Owner Gift money-ops pure helpers (U5).
 * Presentation only — financial authority remains server/RPC.
 */

export type OwnerGiftRedemptionRow = {
  id: string;
  orderId: string;
  orderNo: string | null;
  orderStatus: string | null;
  instanceId: string;
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
  rows: OwnerGiftRedemptionRow[]
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
