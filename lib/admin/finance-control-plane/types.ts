/**
 * ARO-OPS-UX-002-B4 — Common Finance Control Plane read-model contract.
 * Composition only — no new ledger / mutation / currency merge.
 */

export type FinanceCurrency = "POINT" | "COIN" | "CASH" | "PHP_SETTLEMENT";

export type FinanceActionItem = {
  id: string;
  type:
    | "point_charge"
    | "cash_topup"
    | "coin_withdrawal"
    | "settlement"
    | "fee_obligation"
    | "refund";
  currency: FinanceCurrency;
  actorKind: "member" | "store";
  actorId: string;
  actorLabel: string;
  amount: number | null;
  amountMinor: number | null;
  amountLabel: string;
  status: string;
  at: string;
  ageHours: number | null;
  source: string;
  href: string;
  statementHref: string | null;
  memberHref: string | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceHref: string | null;
};

export type FinanceQueueSummary = {
  count: number | null;
  unavailable: boolean;
  source: string;
  href: string;
};

export type FinanceSectionRow = {
  id: string;
  storeId: string | null;
  memberId: string | null;
  label: string;
  type: string;
  amountLabel: string;
  status: string;
  at: string;
  href: string;
  statementHref: string | null;
  memberHref: string | null;
  meta: string | null;
};

export type FinanceControlPlaneModel = {
  generatedAt: string;
  actionRequired: FinanceActionItem[];
  queues: {
    point: FinanceQueueSummary;
    cash: FinanceQueueSummary;
    coinWithdraw: FinanceQueueSummary;
    settlement: FinanceQueueSummary;
    obligationStores: FinanceQueueSummary;
  };
  currentState: Array<{
    id: string;
    labelKo: string;
    labelEn: string;
    value: number | null;
    href: string;
    source: string;
    currencyNote: string;
  }>;
  point: {
    pendingRows: FinanceSectionRow[];
    unavailable: boolean;
    source: string;
    queueHref: string;
  };
  coin: {
    withdrawRows: FinanceSectionRow[];
    recentCredits: FinanceSectionRow[];
    recentConversions: FinanceSectionRow[];
    unavailable: boolean;
    source: string;
    queueHref: string;
  };
  cash: {
    pendingTopUps: FinanceSectionRow[];
    recentLedger: FinanceSectionRow[];
    unavailable: boolean;
    source: string;
    queueHref: string;
  };
  obligations: {
    rows: FinanceSectionRow[];
    storeCount: number | null;
    outstandingMinor: number | null;
    unavailable: boolean;
    source: string;
  };
  settlements: {
    rows: FinanceSectionRow[];
    pendingCount: number | null;
    unavailable: boolean;
    source: string;
    queueHref: string;
  };
  refunds: {
    rows: FinanceSectionRow[];
    unavailable: boolean;
    source: string;
  };
  recent: FinanceSectionRow[];
  primaryEntries: Array<{
    id: string;
    labelKo: string;
    labelEn: string;
    href: string;
    frequency: "REALTIME_CRITICAL" | "DAILY" | "FREQUENT" | "OCCASIONAL" | "ARCHIVE";
  }>;
  sectionErrors: string[];
};
