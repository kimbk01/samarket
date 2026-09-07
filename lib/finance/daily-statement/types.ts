/**
 * STEP 4 — Daily statement rows (currency-separated). Drill = filtered ledger by day.
 */
export type DailyStatementRow = {
  date: string;
  currency: "PHP";
  orders: number;
  gross: number;
  feeDue: number;
  feePaid: number;
  outstandingCreated: number;
  outstandingCollected: number;
  coinEarned: number;
  coinConverted: number;
  coinWithdrawn: number;
  cashInMinor: number;
  cashOutMinor: number;
  saleFeeMinor: number;
  adSpendMinor: number;
  partnerSpendMinor: number;
  refundMinor: number;
};
