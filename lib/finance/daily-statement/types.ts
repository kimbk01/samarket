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
  /** P0-2 — 순출금 (신청 − 반려 환원). */
  coinWithdrawn: number;
  /** P0-2 — 환불 역분개(REVERSAL) Coin, 양수 = 차감됨. */
  coinReversed: number;
  /** P0-2 — 관리자 조정 등 (부호 그대로). */
  coinAdjusted: number;
  cashInMinor: number;
  cashOutMinor: number;
  saleFeeMinor: number;
  adSpendMinor: number;
  partnerSpendMinor: number;
  refundMinor: number;
};
