/**
 * ARO-OPS-UX-002-B5 — Ads / Exposure Control Plane read-model contract.
 * Composition only — no unified ads SSOT / mutation.
 */

export type AdsControlDomain = "delivery" | "feed" | "popup" | "trade_promote" | "community_promote";

export type AdsBillingCurrency = "CASH" | "POINT" | "UNKNOWN" | "N_A";

export type AdsActionItem = {
  id: string;
  domain: AdsControlDomain;
  /** Ad product kind or promote type — never Partner as AdProduct */
  product: string;
  entity:
    | "application"
    | "creative"
    | "execution"
    | "approval"
    | "refund_context";
  applicantLabel: string;
  storeId: string | null;
  memberId: string | null;
  creativeHint: string | null;
  placementHint: string | null;
  amountLabel: string | null;
  currency: AdsBillingCurrency;
  status: string;
  /** Operator-facing why this row needs Admin now (never raw enum dump). */
  whyActionable: string | null;
  paymentLabel: string | null;
  periodLabel: string | null;
  remainingLabel: string | null;
  exposureLabel: string | null;
  eligibility: string | null;
  ageHours: number | null;
  at: string;
  source: string;
  href: string;
  statementHref: string | null;
  financeHref: string | null;
  memberHref: string | null;
  title?: string | null;
  creativeImageUrl?: string | null;
  ctaLabel?: string | null;
  destinationLabel?: string | null;
  priority?: number | null;
  lifecycleStatusLabel?: string | null;
  runtimeDisplayStatus?:
    | "live_now"
    | "eligible_waiting"
    | "scheduled"
    | "paused"
    | "ended"
    | "pending"
    | "draft"
    | "rejected"
    | "incomplete"
    | null;
  isRuntimeWinner?: boolean | null;
  sourceKind?: "admin_direct" | "owner" | "member" | "unknown" | null;
  previewHref?: string | null;
  /** Operating lifecycle label — never conflate with runtime exposure. */
  operatingStatusLabel?: string | null;
  completenessClass?:
    | "orphan_partial"
    | "incomplete"
    | "draft_ready"
    | "pending_review"
    | "operating"
    | null;
  missingFieldsLabel?: string | null;
  waitingReasonLabel?: string | null;
  winnerOccupantLabel?: string | null;
};

export type AdsExecutionRow = {
  id: string;
  domain: AdsControlDomain;
  product: string;
  label: string;
  placement: string | null;
  status: string;
  /** Separate from status — operator exposure meaning */
  eligibility: string;
  period: string | null;
  remainingLabel: string | null;
  currency: AdsBillingCurrency;
  href: string;
  statementHref: string | null;
  source: string;
  /** Presentation conflict — human label only in UI */
  conflictSeverity: "NONE" | "WARNING" | "BLOCKING";
  conflictLabelKo: string;
  conflictLabelEn: string;
};

export type AdsCollisionCard = {
  id: string;
  severity: "WARNING" | "BLOCKING";
  severityLabelKo: string;
  severityLabelEn: string;
  domain: string;
  product: string;
  storeName: string;
  placementLabel: string;
  periodLabel: string | null;
  peerCount: number;
  reasonKo: string;
  reasonEn: string;
  href: string;
};

export type AdsControlPlaneModel = {
  generatedAt: string;
  actionRequired: AdsActionItem[];
  queues: {
    delivery: { count: number | null; unavailable: boolean; href: string; source: string };
    feed: { count: number | null; unavailable: boolean; href: string; source: string };
    popup: { count: number | null; unavailable: boolean; href: string; source: string };
    tradePromote: { count: number | null; unavailable: boolean; href: string; source: string };
    communityPromote: { count: number | null; unavailable: boolean; href: string; source: string };
    collisionBlocking: { count: number | null; unavailable: boolean; href: string; source: string };
    collisionWarning: { count: number | null; unavailable: boolean; href: string; source: string };
    endingSoon: { count: number | null; unavailable: boolean; href: string; source: string };
    vacantSlots: { count: number | null; unavailable: boolean; href: string; source: string };
  };
  currentExecution: AdsExecutionRow[];
  collisions: AdsCollisionCard[];
  occupancy: Array<{
    placementKey: string;
    displayNameKo: string;
    displayNameEn: string;
    capacity: number;
    liveCount: number;
    reservedCount: number;
    vacant: number;
    nextVacancyAt: string | null;
    vacancyLabelKo: string;
    vacancyLabelEn: string;
    href: string;
    loadState: "ok" | "unavailable";
  }>;
  applications: AdsActionItem[];
  creatives: AdsActionItem[];
  placements: Array<{
    domain: string;
    placementId: string;
    displayNameKo: string;
    displayNameEn: string;
    productKind: string;
    aspectRatio: string;
    href: string;
  }>;
  billingNotes: Array<{
    domain: AdsControlDomain;
    currency: AdsBillingCurrency;
    noteKo: string;
    noteEn: string;
    href: string;
  }>;
  domainEntries: Array<{
    id: string;
    labelKo: string;
    labelEn: string;
    href: string;
    frequency: string;
  }>;
  recent: AdsActionItem[];
  sectionErrors: string[];
};
