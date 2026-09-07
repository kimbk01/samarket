/**
 * STEP 1 — AdFundingTrace shared read model (no parallel ledger).
 */
import type { AdsFundingRail } from "@/lib/finance/product-decision-lock";
import type { FinanceAdFamily } from "@/lib/finance/deep-links";

export type AdFundingWalletType = "POINT" | "CASH" | "N_A";

export type AdFundingTrace = {
  adId: string;
  adProduct: string;
  domain: string;
  applicantType: "member" | "owner" | "admin" | "unknown";
  memberId: string | null;
  ownerId: string | null;
  storeId: string | null;
  fundingRail: AdsFundingRail;
  walletType: AdFundingWalletType;
  /** Major units for POINT; PHP major for display when Cash (derived from minor). Null for ADMIN_DIRECT. */
  price: number | null;
  priceMinor: number | null;
  currency: "POINT" | "PHP" | "N_A";
  fundingTransactionId: string | null;
  holdId: string | null;
  captureTransactionId: string | null;
  refundTransactionId: string | null;
  status: string;
  approvedBy: string | null;
  approvedAt: string | null;
  activeAt: string | null;
  expiredAt: string | null;
  source: string;
  legacy: boolean;
  legacyLabel: string | null;
  adDetailHref: string | null;
  financeHref: string | null;
  family: FinanceAdFamily;
};

export type AdFundingTraceListQuery = {
  storeId?: string | null;
  memberId?: string | null;
  fundingRail?: AdsFundingRail | null;
  limit?: number;
};
