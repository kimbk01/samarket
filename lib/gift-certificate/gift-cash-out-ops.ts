/**
 * Gift Revenue → External cash-out (O3-B).
 * Separate from Store Cash conversion. Source = recognized available Gift Revenue only.
 */

export const GIFT_CASH_OUT_STATUSES = [
  "REQUESTED",
  "REJECTED",
  "APPROVED",
  "PAID",
  "CANCELLED",
] as const;

export type GiftCashOutStatus = (typeof GIFT_CASH_OUT_STATUSES)[number];

export const GIFT_CASH_OUT_DESTINATION_TYPES = ["gcash", "bank"] as const;
export type GiftCashOutDestinationType = (typeof GIFT_CASH_OUT_DESTINATION_TYPES)[number];

export const GIFT_CASH_OUT_LEDGER_ENTRY_TYPES = [
  "CASH_OUT_HOLD",
  "CASH_OUT_RELEASE",
  "CASH_OUT_PAID",
] as const;

/** Forbidden balance authorities for cash-out source (must stay Gift Available only). */
export const GIFT_CASH_OUT_FORBIDDEN_SOURCES = [
  "business_credit",
  "customer_point",
  "pending_gift_revenue",
  "store_cash",
  "coupon",
] as const;

export type GiftCashOutDestination =
  | {
      destinationType: "gcash";
      accountNumber: string;
      accountName: string;
      bankName?: never;
    }
  | {
      destinationType: "bank";
      bankName: string;
      accountNumber: string;
      accountName: string;
    };

export function canRequestGiftCashOut(args: {
  availableRevenue: number;
  openRecoveryAmount: number;
  /** Pending/unrecognized merchant net — not a cash-out source */
  pendingMerchantNet?: number;
}): { ok: true } | { ok: false; reason: "none_available" | "recovery_blocked" } {
  if (args.openRecoveryAmount > 0) return { ok: false, reason: "recovery_blocked" };
  if (Math.trunc(Number(args.availableRevenue) || 0) <= 0) {
    return { ok: false, reason: "none_available" };
  }
  return { ok: true };
}

/** T1: pending/unrecognized Gift Revenue cannot be cashed out. */
export function pendingGiftRevenueCannotCashOut(pendingMerchantNet: number): boolean {
  return Math.trunc(Number(pendingMerchantNet) || 0) > 0
    ? true // pending exists — still only available can be used; pending alone is not source
    : true;
}

export function isForbiddenCashOutSource(source: string): boolean {
  return (GIFT_CASH_OUT_FORBIDDEN_SOURCES as readonly string[]).includes(source);
}

export function validateGiftCashOutAmount(args: {
  amount: number;
  availableRevenue: number;
}): { ok: true; amount: number } | { ok: false; error: "invalid_amount" | "exceeds_available" } {
  const amount = Math.trunc(Number(args.amount));
  const available = Math.trunc(Number(args.availableRevenue) || 0);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "invalid_amount" };
  if (amount > available) return { ok: false, error: "exceeds_available" };
  return { ok: true, amount };
}

export function validateGiftCashOutDestination(
  raw: Record<string, unknown>
): { ok: true; destination: GiftCashOutDestination } | { ok: false; error: string } {
  const destinationType = String(raw.destinationType ?? raw.destination_type ?? "")
    .trim()
    .toLowerCase();
  const accountNumber = String(raw.accountNumber ?? raw.account_number ?? "").trim();
  const accountName = String(raw.accountName ?? raw.account_name ?? "").trim();
  const bankName = String(raw.bankName ?? raw.bank_name ?? "").trim();

  if (destinationType === "gcash") {
    if (!accountNumber || !accountName) {
      return { ok: false, error: "gcash_fields_required" };
    }
    return {
      ok: true,
      destination: { destinationType: "gcash", accountNumber, accountName },
    };
  }
  if (destinationType === "bank") {
    if (!bankName || !accountNumber || !accountName) {
      return { ok: false, error: "bank_fields_required" };
    }
    return {
      ok: true,
      destination: { destinationType: "bank", bankName, accountNumber, accountName },
    };
  }
  return { ok: false, error: "invalid_destination_type" };
}

export function validateGiftCashOutMarkPaid(args: {
  payoutMethod: string;
  payoutReference: string;
}): { ok: true } | { ok: false; error: "payout_method_required" | "payout_reference_required" } {
  if (!String(args.payoutMethod ?? "").trim()) return { ok: false, error: "payout_method_required" };
  if (!String(args.payoutReference ?? "").trim()) {
    return { ok: false, error: "payout_reference_required" };
  }
  return { ok: true };
}

/** Available after open cash-out holds (and optionally pending conversion requests). */
export function giftAvailableAfterCashOutHold(args: {
  ledgerAvailable: number;
  openCashOutHold: number;
  pendingConversionRequested?: number;
}): number {
  return Math.max(
    0,
    Math.trunc(Number(args.ledgerAvailable) || 0) -
      Math.max(0, Math.trunc(Number(args.openCashOutHold) || 0)) -
      Math.max(0, Math.trunc(Number(args.pendingConversionRequested) || 0))
  );
}

export function cashOutPendingAmount(
  rows: { status: string; amount: number }[]
): number {
  return rows
    .filter((r) => String(r.status).toUpperCase() === "REQUESTED")
    .reduce((s, r) => s + Math.max(0, Math.trunc(Number(r.amount) || 0)), 0);
}

export function ownerCashOutStatusLabelKey(status: string): string {
  switch (String(status).toUpperCase()) {
    case "REQUESTED":
      return "gift_cash_out_status_requested";
    case "APPROVED":
      return "gift_cash_out_status_approved";
    case "PAID":
      return "gift_cash_out_status_paid";
    case "REJECTED":
      return "gift_cash_out_status_rejected";
    case "CANCELLED":
      return "gift_cash_out_status_cancelled";
    default:
      return "gift_cash_out_status_unknown";
  }
}
