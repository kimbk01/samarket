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
  /** 동시 처리 보호 — 화면 로드 시점 행 버전 (delivery: updated_at / lifecycle). */
  expectedUpdatedAt?: string | null;
  expectedLifecycle?: string | null;
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

/** R7 — 광고 작업 화면 서버 페이지 조건·전체 건수 (`admin_ads_workspace_page`). */
export type AdsWorkspacePageMeta = {
  mode: "all" | "applications" | "operations" | "history" | "boosts";
  /** "all" = 상태 탭 전체 */
  status: string;
  /** "all" = 종류 전체 */
  family: string;
  total: number;
  limit: number;
  offset: number;
};

/** R7 — 팝업 위치별 점유 (팝업 캠페인 전체 기준 · 위치 문자열 = 연결된 surface 목록). */
export type AdsWorkspacePopupSurfaceGroup = {
  /** `COMMUNITY,TRADE` · 연결 없음 = `GLOBAL` (행 placementHint 와 같은 값) */
  surfaces: string;
  live: AdsActionItem[];
  waiting: AdsActionItem[];
  incomplete: number;
  scheduled: number;
};

export type AdsControlPlaneModel = {
  generatedAt: string;
  /** R7 서버 페이지 — `applications` 가 이 조건의 한 페이지다. */
  page?: AdsWorkspacePageMeta;
  /**
   * R7 — 화면 모드별 상태 탭 개수 (DB 전체 기준, 매장 범위 반영). 요약 카드·대시보드 광고 지표가 이 값을 쓴다
   * (`computeAdsWorkspaceSummaryCounts`).
   */
  summaryCounts?: Partial<Record<string, Partial<Record<string, number>>>>;
  /** R7 — 팝업 위치별 점유 패널 원본. */
  popupSurfaces?: AdsWorkspacePopupSurfaceGroup[];
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
