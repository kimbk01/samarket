/**
 * Gift revenue recognition — order completion authority (post G1 redemption_only).
 * Financial authority remains DB ledger; these are pure projection helpers.
 */

import {
  GIFT_OWNER_REVENUE_RECOGNITION,
  type GiftMoneyInt,
  toGiftMoneyInt,
} from "@/lib/gift-certificate/gift-certificate-domain-contract";

export const GIFT_REVENUE_RECOGNITION_AUTHORITY = GIFT_OWNER_REVENUE_RECOGNITION;

export type GiftRedemptionRecognitionState = "pending" | "recognized" | "reversed";

export type GiftRedemptionRevenueRow = {
  reversed: boolean;
  recognized: boolean;
  redeemedAmount: GiftMoneyInt;
  platformFeeAmount: GiftMoneyInt;
  merchantNetAmount: GiftMoneyInt;
};

export type GiftRevenuePendingRecognizedTotals = {
  pendingGross: GiftMoneyInt;
  pendingPlatformFee: GiftMoneyInt;
  pendingMerchantNet: GiftMoneyInt;
  recognizedGross: GiftMoneyInt;
  recognizedPlatformFee: GiftMoneyInt;
  recognizedMerchantNet: GiftMoneyInt;
};

export function resolveGiftRedemptionRecognitionState(args: {
  reversed: boolean;
  recognized: boolean;
}): GiftRedemptionRecognitionState {
  if (args.reversed) return "reversed";
  if (args.recognized) return "recognized";
  return "pending";
}

export function ownerRedemptionRecognitionLabelKey(
  state: GiftRedemptionRecognitionState
): string {
  switch (state) {
    case "recognized":
      return "gift_u7_recognition_status_recognized";
    case "pending":
      return "gift_u7_recognition_status_pending";
    case "reversed":
      return "gift_u5_redemption_status_reversed";
    default:
      return "gift_u5_redemption_status_ok";
  }
}

export function aggregateGiftRevenuePendingRecognized(
  rows: GiftRedemptionRevenueRow[]
): GiftRevenuePendingRecognizedTotals {
  const empty = {
    pendingGross: 0,
    pendingPlatformFee: 0,
    pendingMerchantNet: 0,
    recognizedGross: 0,
    recognizedPlatformFee: 0,
    recognizedMerchantNet: 0,
  } satisfies GiftRevenuePendingRecognizedTotals;

  let pendingGross = 0;
  let pendingPlatformFee = 0;
  let pendingMerchantNet = 0;
  let recognizedGross = 0;
  let recognizedPlatformFee = 0;
  let recognizedMerchantNet = 0;

  for (const row of rows) {
    if (row.reversed) continue;
    const gross = Math.max(0, toGiftMoneyInt(row.redeemedAmount) ?? 0);
    const fee = Math.max(0, toGiftMoneyInt(row.platformFeeAmount) ?? 0);
    const net = Math.max(0, toGiftMoneyInt(row.merchantNetAmount) ?? 0);
    const state = resolveGiftRedemptionRecognitionState(row);
    if (state === "recognized") {
      recognizedGross += gross;
      recognizedPlatformFee += fee;
      recognizedMerchantNet += net;
    } else if (state === "pending") {
      pendingGross += gross;
      pendingPlatformFee += fee;
      pendingMerchantNet += net;
    }
  }

  return {
    ...empty,
    pendingGross,
    pendingPlatformFee,
    pendingMerchantNet,
    recognizedGross,
    recognizedPlatformFee,
    recognizedMerchantNet,
  };
}

/** Owner available revenue must only include recognized merchant net (ledger REVENUE_AVAILABLE). */
export function redeemCreatesAvailableRevenue(): false {
  return false;
}

export function platformFeeRecognizedAtRedeem(): false {
  return false;
}

/** Ledger entry types that net into merchant recognition / available pool. */
export const GIFT_REVENUE_RECOGNITION_NET_ENTRY_TYPES = [
  "REVENUE_AVAILABLE",
  "RECOGNITION_CORRECTION",
  "REVERSED",
] as const;

/**
 * Net merchant recognition from ledger rows for one redemption.
 * RECOGNITION_CORRECTION / REVERSED offset REVENUE_AVAILABLE without deleting history.
 */
export function netMerchantRecognitionFromLedger(
  entries: ReadonlyArray<{ entry_type: string; amount: number }>
): number {
  let net = 0;
  for (const e of entries) {
    if (
      e.entry_type === "REVENUE_AVAILABLE" ||
      e.entry_type === "RECOGNITION_CORRECTION" ||
      e.entry_type === "REVERSED"
    ) {
      net += Math.trunc(Number(e.amount) || 0);
    }
  }
  return net;
}

export function isRedemptionRecognizedFromLedger(
  entries: ReadonlyArray<{ entry_type: string; amount: number }>
): boolean {
  return netMerchantRecognitionFromLedger(entries) > 0;
}
