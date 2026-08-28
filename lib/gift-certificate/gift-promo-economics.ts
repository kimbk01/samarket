/**
 * Ledger C — Promotion economics pure helpers (Policy C + C1/C2/C3).
 * Reporting/display only unless invoked via service_role RPC writers.
 */

import type { GiftMoneyInt } from "@/lib/gift-certificate/gift-certificate-domain-contract";

export const GIFT_PROMO_PARTIES = ["OWNER", "DIBAY"] as const;
export type GiftPromoParty = (typeof GIFT_PROMO_PARTIES)[number];

export const GIFT_PROMO_LEDGER_ENTRY_TYPES = [
  "PROMO_ACCRUAL",
  "PROMO_RECOGNITION",
  "PROMO_SETTLEMENT",
  "PROMO_REVERSAL",
] as const;
export type GiftPromoLedgerEntryType = (typeof GIFT_PROMO_LEDGER_ENTRY_TYPES)[number];

export type GiftPromoObligationRow = {
  party: GiftPromoParty;
  contractedAmount: GiftMoneyInt;
  recognizedAmount: GiftMoneyInt;
  settledAmount: GiftMoneyInt;
};

export type GiftPromoDisplayFields = {
  contracted: GiftMoneyInt;
  recognized: GiftMoneyInt;
  unrecognized: GiftMoneyInt;
  settled: GiftMoneyInt;
  outstanding: GiftMoneyInt;
};

/** Proportional slice; final slice uses remainder (caller passes isFinalSlice). */
export function computePromoRecognitionSlice(args: {
  contractedAmount: GiftMoneyInt;
  alreadyRecognized: GiftMoneyInt;
  redeemedSlice: GiftMoneyInt;
  faceValue: GiftMoneyInt;
  isFinalSlice: boolean;
}): GiftMoneyInt {
  const contracted = Math.max(0, Math.trunc(args.contractedAmount));
  const recognized = Math.max(0, Math.trunc(args.alreadyRecognized));
  const remaining = Math.max(0, contracted - recognized);
  if (remaining <= 0) return 0;

  if (args.isFinalSlice) return remaining;

  const face = Math.max(1, Math.trunc(args.faceValue));
  const slice = Math.max(0, Math.trunc(args.redeemedSlice));
  const proportional = Math.floor((contracted * slice) / face);
  return Math.min(proportional, remaining);
}

export function aggregatePromoDisplayFields(
  rows: ReadonlyArray<Pick<GiftPromoObligationRow, "contractedAmount" | "recognizedAmount" | "settledAmount">>
): GiftPromoDisplayFields {
  let contracted = 0;
  let recognized = 0;
  let settled = 0;
  for (const row of rows) {
    contracted += Math.max(0, Math.trunc(row.contractedAmount));
    recognized += Math.max(0, Math.trunc(row.recognizedAmount));
    settled += Math.max(0, Math.trunc(row.settledAmount));
  }
  return {
    contracted,
    recognized,
    unrecognized: Math.max(0, contracted - recognized),
    settled,
    outstanding: Math.max(0, recognized - settled),
  };
}

/** Panel 3 — reporting-only economic sum; never mutates REVENUE_AVAILABLE. */
export function computeOwnerEconomicReportingSum(args: {
  recognizedMerchantNet: GiftMoneyInt;
  ownerPromoRecognized: GiftMoneyInt;
}): GiftMoneyInt {
  const merchant = Math.max(0, Math.trunc(args.recognizedMerchantNet));
  const promo = Math.max(0, Math.trunc(args.ownerPromoRecognized));
  return Math.max(0, merchant - promo);
}

export function resolveGiftProductFundingFromGap(args: {
  faceValue: GiftMoneyInt;
  purchasePrice: GiftMoneyInt;
  discountFundingParty: string;
}): {
  gap: GiftMoneyInt;
  ownerUnits: GiftMoneyInt;
  dibayUnits: GiftMoneyInt;
} {
  const face = Math.max(0, Math.trunc(args.faceValue));
  const price = Math.max(0, Math.trunc(args.purchasePrice));
  const gap = Math.max(0, face - price);
  if (gap === 0) {
    return { gap: 0, ownerUnits: 0, dibayUnits: 0 };
  }
  const party = String(args.discountFundingParty || "NONE").toUpperCase();
  if (party === "PLATFORM") return { gap, ownerUnits: 0, dibayUnits: gap };
  if (party === "MERCHANT") return { gap, ownerUnits: gap, dibayUnits: 0 };
  return { gap, ownerUnits: 0, dibayUnits: 0 };
}
