/**
 * ARO-OPS-UX-002-B3 — Store Financial Statement read-model contract.
 * Composition only — no new ledger / mutation.
 */

export type StoreFinancialPeriodKey = "today" | "7d" | "30d" | "custom";

export type StoreFinancialMoneyPhp = {
  /** PHP major units when known; null = UNAVAILABLE */
  amount: number | null;
  source: string;
};

export type StoreFinancialMoneyMinor = {
  amountMinor: number | null;
  source: string;
};

export type StoreFinancialStatementEvent = {
  id: string;
  at: string;
  domain: "order" | "coin" | "cash" | "settlement" | "obligation" | "charge";
  type: string;
  direction: "in" | "out" | "info";
  currency: "PHP" | "COIN" | "CASH_MINOR";
  /** Major PHP or Coin units; for CASH_MINOR use amountMinor */
  amount: number | null;
  amountMinor: number | null;
  status: string | null;
  relatedType: string | null;
  relatedId: string | null;
  href: string | null;
  source: string;
};

export type StoreFinancialFeeRow = {
  settlementId: string;
  orderId: string;
  orderNo: string;
  saleAmount: number;
  feeRatePercent: number | null;
  feeAmount: number;
  fixedFeeAmount: number;
  settlementStatus: string;
  orderHref: string;
  settlementHref: string;
  source: string;
};

export type StoreFinancialObligationRow = {
  id: string;
  orderId: string;
  feeDueMinor: number;
  feePaidMinor: number;
  feeOutstandingMinor: number;
  status: string;
  createdAt: string;
  settledAt: string | null;
  orderHref: string;
  source: string;
};

export type StoreFinancialSettlementRow = {
  settlementId: string;
  orderId: string;
  orderNo: string;
  periodAt: string | null;
  gross: number;
  fee: number;
  net: number;
  status: string;
  paidAt: string | null;
  href: string;
  source: string;
};

export type StoreFinancialStatementModel = {
  store: {
    id: string;
    name: string;
    slug: string | null;
    status: string | null;
    region: string | null;
    ownerUserId: string | null;
    ownerLabel: string | null;
  };
  period: {
    key: StoreFinancialPeriodKey;
    fromIso: string;
    toIso: string;
  };
  links: {
    business: string;
    orders: string;
    settlements: string;
    finance: string;
    ads: string;
    support: string;
    cashCharges: string;
  };
  summary: {
    periodSales: StoreFinancialMoneyPhp;
    periodFee: StoreFinancialMoneyPhp;
    coinBalance: { amount: number | null; source: string; pointInTime: true };
    cashBalanceMinor: StoreFinancialMoneyMinor & { pointInTime: true };
    settlementPendingNet: StoreFinancialMoneyPhp;
    unpaidFeeObligationMinor: StoreFinancialMoneyMinor;
  };
  sales: {
    orderCount: number | null;
    completedCount: number | null;
    cancelledCount: number | null;
    gross: number | null;
    refund: number | null;
    source: string;
    unavailable: boolean;
  };
  fees: {
    rows: StoreFinancialFeeRow[];
    unavailable: boolean;
    source: string;
  };
  obligations: {
    rows: StoreFinancialObligationRow[];
    outstandingMinor: number | null;
    unavailable: boolean;
    source: string;
  };
  coin: {
    balance: number | null;
    saleCredits: number | null;
    conversionsOut: number | null;
    ledger: StoreFinancialStatementEvent[];
    unavailable: boolean;
    source: string;
  };
  cash: {
    balanceMinor: number | null;
    topUpInMinor: number | null;
    conversionInMinor: number | null;
    adDebitMinor: number | null;
    partnerDebitMinor: number | null;
    feeDebitMinor: number | null;
    refundInMinor: number | null;
    ledger: StoreFinancialStatementEvent[];
    topUps: Array<{
      id: string;
      amountMinor: number;
      status: string;
      createdAt: string;
      href: string;
    }>;
    unavailable: boolean;
    source: string;
  };
  settlements: {
    rows: StoreFinancialSettlementRow[];
    pendingNet: number | null;
    paidNet: number | null;
    unavailable: boolean;
    source: string;
  };
  flow: Array<{
    id: string;
    labelKo: string;
    labelEn: string;
    amountLabel: string | null;
    unavailable: boolean;
  }>;
  timeline: StoreFinancialStatementEvent[];
  sectionErrors: string[];
};
