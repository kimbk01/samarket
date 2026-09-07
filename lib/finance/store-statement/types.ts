/**
 * STEP 3 — StoreStatement shared aggregates (currency-separated; no Point ads in Cash).
 * Composes existing ledgers — no parallel balance.
 */
export type StoreStatement = {
  storeId: string;
  storeName: string;
  ownerId: string | null;
  currency: "PHP";
  fromIso: string;
  toIso: string;
  sales: {
    orders: number;
    gross: number;
    settlementFee: number;
    outstanding: number;
  };
  coin: {
    opening: number;
    earned: number;
    converted: number;
    withdrawn: number;
    adjustment: number;
    closing: number;
  };
  cash: {
    openingMinor: number;
    topupMinor: number;
    fromConversionMinor: number;
    refundMinor: number;
    saleFeeMinor: number;
    adSpendMinor: number;
    partnerSpendMinor: number;
    outstandingCollectionMinor: number;
    adjustmentCreditMinor: number;
    adjustmentDebitMinor: number;
    closingMinor: number;
  };
  /** Discrepancy flags from reconciliation — never hide. */
  discrepancies: string[];
};
