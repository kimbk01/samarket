/**
 * ARO-OPS-UX-002-B5 — Ads / Exposure Control Plane read-model contract.
 * Composition only — no unified ads SSOT / mutation.
 */

import type { AdsOpsStatus } from "@/lib/admin/ads-exposure/ops-status";

export type AdsControlDomain =
  | "delivery"
  | "feed"
  | "popup"
  | "trade_promote"
  | "community_promote"
  /** 원장 §1-2 — 이벤트 히어로 배너 · 마이 배너 · 인트로 (2026-11-07) */
  | "event_banner"
  | "my_banner"
  | "intro";

/** 원장 종류 13 (설계 §1-2 · 「이벤트(콘텐츠)」는 광고가 아니라 원장에 넣지 않는다). DB `admin_ads_ledger_rows.kind` 와 같은 값. */
export type AdsLedgerKind =
  | "trade_promotion"
  | "community_promotion"
  | "feed_member"
  | "feed_admin"
  | "feed_event"
  | "event_hero"
  | "popup_admin"
  | "popup_owner"
  | "ptr"
  | "delivery_banner"
  | "delivery_sponsored"
  | "my_banner"
  | "intro";

/** 원장 도메인 (도메인 메뉴 `?domain=`) — 거래 · 커뮤니티 · 배달 · 플랫폼 운영 · 내정보 */
export type AdsLedgerDomain = "trade" | "community" | "delivery" | "platform" | "mypage";

/** 원장 한 행의 공통 칸 (설계 §1-3) — DB `admin_ads_ledger_page` rows 그대로. */
export type AdsLedgerFields = {
  kind: AdsLedgerKind;
  /** DB 원장 상태 탭 (pending·scheduled·live·waiting·incomplete·paused·ended·rejected·deleted) */
  statusTab: string;
  ledgerDomain: AdsLedgerDomain;
  locationKey: string | null;
  locationTarget: string | null;
  locationTargetName: string | null;
  advertiserType: "member" | "store" | "operator" | "event" | "unknown";
  advertiserId: string | null;
  advertiserName: string | null;
  payCurrency: "POINT" | "BUSINESS_CASH" | "NONE";
  /** POINT = 포인트 · BUSINESS_CASH = minor(센타보) */
  payAmount: number | null;
  payStatus: "paid" | "held" | "refunded" | "partial_refund" | "unpaid" | "none" | "unknown";
  refundAmount: number | null;
  impressions: number | null;
  clicks: number | null;
  startAt: string | null;
  endAt: string | null;
  pausedBy: string | null;
  /** AA-14 — 기간이 지난 정지 → 'expired' */
  endedReason: "expired" | null;
  deleteKind: string | null;
  deleted: boolean;
  linkedRequestId: string | null;
  linkedCampaignId: string | null;
  storeId: string | null;
};

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
  /**
   * 원천 projector 가 계산한 운영 상태 (schedule 반영). 상태 탭 = 이 값 (`resolveShellStatusTab`) —
   * 표시 문구(status·exposureLabel)를 다시 읽지 않는다. SQL `admin_ads_workspace_rows` 의 ops 와 같은 정의.
   */
  opsStatus?: AdsOpsStatus | null;
  /** Operator-facing why this row needs Admin now (never raw enum dump). */
  whyActionable: string | null;
  paymentLabel: string | null;
  periodLabel: string | null;
  remainingLabel: string | null;
  /** Owner 결정 O-4 — 피드 배너 노출·클릭 수 (`feed_ad_campaigns` 칸) · 다른 계열 null */
  performanceLabel?: string | null;
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
  /**
   * AL-17: 상위노출 주문 정지 주체 (`point_promotion_orders.paused_by`) — `listing_*` 면 글 상태로 멈춘 것이라
   * 관리자 재개를 숨긴다(거래 도메인 화면과 같은 조건). 다른 계열 null.
   */
  pausedBy?: string | null;
  /** 원장 칸 (설계 §1-3) — 원장 함수가 있을 때만 */
  ledger?: AdsLedgerFields | null;
  /** AL-08: 기간 변경 입력칸 초기값 (원래 ISO) — 팝업 캠페인만 */
  periodStartAt?: string | null;
  periodEndAt?: string | null;
};

export type AdsExecutionRow = {
  id: string;
  domain: AdsControlDomain;
  product: string;
  label: string;
  placement: string | null;
  status: string;
  /** 원천 projector 가 계산한 운영 상태 — 상태 탭 원천 (AdsActionItem.opsStatus 와 같음). */
  opsStatus?: AdsOpsStatus | null;
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
  /** Owner 결정 O-6② — 도메인 거름 · null = 전체 (원장: platform · mypage 추가) */
  domain?: AdsLedgerDomain | null;
  /** 원장 — 종류 거름 */
  kind?: AdsLedgerKind | null;
  /** 원장 — 위치 거름 (`KEY` 또는 `KEY|대상`) · 위치 지도 칸 */
  location?: string | null;
  /** 원장 — 광고주 거름 (회원·매장·이벤트 id) */
  advertiser?: string | null;
  /** 원장 함수로 읽었는가 (false = 옛 함수 · 운영 DB 적용 전) */
  ledger?: boolean;
  total: number;
  limit: number;
  offset: number;
};

export type AdsLedgerLocationCount = {
  locationKey: string | null;
  locationTarget: string | null;
  locationTargetName: string | null;
  statusTab: string;
  n: number;
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
  /** 원장 — 종류별 행 수 (거름 반영 · 삭제 제외) */
  kindCounts?: Partial<Record<AdsLedgerKind, number>>;
  /** 원장 — 위치(키·대상)별 상태 수 (위치 지도) */
  locationCounts?: AdsLedgerLocationCount[];
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
