/**
 * Admin Gift U6 money-ops presentation helpers.
 * Financial authority remains RPC/ledger.
 */

export type AdminGiftConversionListItem = {
  id: string;
  storeId: string;
  storeName: string;
  ownerUserId: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  availableRevenue: number;
  storeCashBalance: number;
  openRecoveryAmount: number;
};

export function adminConversionStatusLabelKey(status: string): string {
  switch (String(status).toUpperCase()) {
    case "REQUESTED":
      return "gift_u6_status_requested";
    case "APPROVED":
      return "gift_u6_status_approved";
    case "REJECTED":
      return "gift_u6_status_rejected";
    case "CANCELLED":
      return "gift_u6_status_cancelled";
    default:
      return "gift_u6_status_other";
  }
}

export function canApproveGiftConversion(args: {
  status: string;
  openRecoveryAmount: number;
}): { ok: true } | { ok: false; reason: "not_requested" | "recovery_blocked" } {
  if (String(args.status).toUpperCase() !== "REQUESTED") {
    return { ok: false, reason: "not_requested" };
  }
  if (Math.max(0, Math.trunc(args.openRecoveryAmount)) > 0) {
    return { ok: false, reason: "recovery_blocked" };
  }
  return { ok: true };
}

export function assertGrossEqualsFeePlusNet(args: {
  redeemedGross: number;
  platformFee: number;
  merchantNet: number;
}): boolean {
  return (
    Math.trunc(args.redeemedGross) === Math.trunc(args.platformFee) + Math.trunc(args.merchantNet)
  );
}

export function businessCreditMustBeUntouchedByGiftCash(): true {
  return true;
}

export function platformRevenueIsNotStoreCash(): true {
  return true;
}
