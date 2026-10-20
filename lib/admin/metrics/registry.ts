/**
 * Admin Metric Registry — 통합 대시보드(설계 v4 §3 · 통합 설계 §2.5) 지표·탭·요약 띠 단일 정의.
 *
 * 원칙 (CUT E: 읽기 조합 + 딥링크, 신규 DB 금지):
 * - **지표 값 = 링크로 이동한 화면이 보여 주는 값.** 지표마다 이동 화면이 쓰는 **같은 함수·같은 필터**로 센다
 *   (회원 목록 필터 연산 · 주문 운영 RPC · 광고 워크스페이스 요약 · 수수료 원장 · 재무 오늘 요약 · 처리 대기 레지스트리).
 *   화면에 개수가 없는 지표는 넣지 않는다.
 * - 도메인 지표는 **같은 id** 를 그대로 쓴다 (`community.*`·`trade.*`) → 전체 vs 도메인 값이 같다.
 * - 값 없음 = null (화면 「불러오기 실패」 + 이전 값, 0 표시 금지).
 * - 기간 = 필리핀 시간(PHT). 「선택 기간」 지표는 대시보드 기간(오늘·어제·7일·30일)을 따르고, 링크에 같은 PHT 날짜를 넘긴다.
 * - 권한: 지표 href 를 접근표(`canAccessAdminRoute`)로 열 수 없거나 처리 대기 카테고리가 forbidden 이면 숨긴다.
 *
 * 출처·이동 화면 개수가 없어 **넣지 않은 지표** 는 `ADMIN_DASHBOARD_OMITTED_METRICS` 에 사유와 함께 적는다 (임의 집계 금지).
 *
 * 클라이언트 안전 — 서버 전용 모듈 import 금지.
 */
import { PLATFORM_POPUP_LIVE_STATUS_FILTER } from "@/lib/platform-popup/admin-list-filter";
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  getAdminActionQueueCategoryDef,
  type AdminActionQueueCategory,
  type AdminActionQueuePriority,
} from "@/lib/admin/admin-action-queue-registry";
import { ADS_WORKSPACE_STATUS_URL_PARAM } from "@/lib/admin/advertising-workspace/workspace-url";
import type { AdminDashboardPeriodRange } from "@/lib/admin/metrics/dashboard-period";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

// ── 탭 ──────────────────────────────────────────────────────────────────────

export const ADMIN_DASHBOARD_TAB_IDS = [
  "overview",
  "members",
  "community_trade",
  "delivery",
  "finance",
  "ads_ops",
  "support",
] as const;
export type AdminDashboardTabId = (typeof ADMIN_DASHBOARD_TAB_IDS)[number];

export const ADMIN_DASHBOARD_DEFAULT_TAB: AdminDashboardTabId = "overview";

/** 주소 `?tab=` → 탭 id (모르는 값 = 전체 현황). */
export function parseAdminDashboardTab(raw: string | null | undefined): AdminDashboardTabId {
  const v = String(raw ?? "").trim();
  return (ADMIN_DASHBOARD_TAB_IDS as readonly string[]).includes(v)
    ? (v as AdminDashboardTabId)
    : ADMIN_DASHBOARD_DEFAULT_TAB;
}


// ── 지표 정의 ───────────────────────────────────────────────────────────────

export type AdminMetricDomain =
  | "members"
  | "community"
  | "trade"
  | "delivery"
  | "chat"
  | "finance"
  | "ads"
  | "support"
  | "platform";

/**
 * 값 출처 키 — 서버 로더(`load-admin-dashboard-sources.ts`)가 요청마다 키별 1회만 읽는다.
 * members = 회원 목록 API 와 같은 필터 연산(`admin-member-list-query`) + 탈퇴 요청 COUNT ·
 * queue = 처리 대기 레지스트리 · community/trade = 도메인 지표 로더 ·
 * orders = 주문 목록 RPC `admin_store_order_ops_page`(탭 개수) · stores = 매장 운영 목록 KPI ·
 * community_reports = 커뮤니티 신고 처리함 묶음 수(`listCommunityReportGroupsForAdmin`) ·
 * points = 포인트 충전 상태별 건수(`countPointChargesByStatus`) ·
 * commission = 수수료 원장(「미납 관리」·기간 요약) · finance_today = 재무 오늘 요약 ·
 * ads = 광고 워크스페이스 요약(`computeAdsWorkspaceSummaryCounts`) ·
 * notifications = 알림 발송 캠페인 목록 건수(`listAdminNotificationCampaigns`, 알림 발송 화면과 같은 질의).
 */
export type AdminMetricSourceKey =
  | "members"
  | "queue"
  | "community"
  | "trade"
  | "orders"
  | "stores"
  | "community_reports"
  | "points"
  | "commission"
  | "finance_today"
  | "ads"
  | "notifications";

/**
 * 단위 — 화면 숫자 뒤에 붙인다: count = 건 · people = 명 · stores = 곳 · php_minor = ₱(값 앞).
 * 추세·처리 대기도 같은 단위 표를 쓴다.
 */
export type AdminMetricUnit = "count" | "people" | "stores" | "php_minor";

/**
 * now = 현재 상태 (기간 무관) · selected = 대시보드 선택 기간(오늘·어제·7일·30일) ·
 * today_fixed = 이동 화면이 「오늘」만 보여 주므로 기간과 무관하게 오늘.
 */
export type AdminMetricPeriod = "now" | "selected" | "today_fixed";

export type AdminMetricHrefParams = {
  /** PHT 오늘 "YYYY-MM-DD" */
  todayPht: string;
  /** 대시보드 선택 기간 */
  range: AdminDashboardPeriodRange;
};

export type AdminMetricDefinition = {
  id: string;
  labelKo: string;
  labelEn: string;
  /** 1024 폭 요약 띠·좁은 칸용 짧은 라벨 */
  shortKo?: string;
  shortEn?: string;
  domain: AdminMetricDomain;
  source: AdminMetricSourceKey;
  /** 출처 설명 (이동 화면과 같은 함수·필터) — 문서·테스트용 */
  sourceDetail: string;
  /** 처리 대기 합산 지표 — 이 카테고리 ok 값의 합 (권한 밖 카테고리는 빼고, 전부 권한 밖이면 숨김) */
  queueCategories?: readonly AdminActionQueueCategory[];
  periodBasis: "pht";
  period: AdminMetricPeriod;
  unit: AdminMetricUnit;
  /** 처리 화면 + 필터. 접근표로 권한을 판정하는 경로이기도 하다. */
  href: string | ((p: AdminMetricHrefParams) => string);
};

export function resolveAdminMetricHref(def: AdminMetricDefinition, params: AdminMetricHrefParams): string {
  return typeof def.href === "function" ? def.href(params) : def.href;
}

function queueMetric(category: AdminActionQueueCategory, labelKo?: string, labelEn?: string): AdminMetricDefinition {
  const q = getAdminActionQueueCategoryDef(category);
  return {
    id: `queue.${category}`,
    labelKo: labelKo ?? q.titleKo,
    labelEn: labelEn ?? q.titleEn,
    domain: "platform",
    source: "queue",
    sourceDetail: `admin_action_queue.${category} (${q.sources.join(", ")})`,
    queueCategories: [category],
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: q.listHref ?? "/admin",
  };
}

/** 주문 목록 링크 — 선택 기간을 PHT 날짜(custom)로 넘긴다. 탭 없음 = 전체. */
export function adminDashboardOrdersHref(range: AdminDashboardPeriodRange, tab?: string): string {
  const p = new URLSearchParams();
  if (tab) p.set("tab", tab);
  p.set("period", "custom");
  p.set("from", range.fromDay);
  p.set("to", range.toDay);
  return `/admin/stores/orders?${p.toString()}`;
}

function adsWorkspaceHref(tab: string): string {
  return `/admin/advertising?${ADS_WORKSPACE_STATUS_URL_PARAM}=${tab}`;
}

/** 처리 대기 합계·P0 = 전체 현황 탭 오른쪽 「처리 대기」 목록(관리자 처리 카테고리 전부)의 합. */
export const ADMIN_DASHBOARD_ADMIN_QUEUE_CATEGORIES: readonly AdminActionQueueCategory[] = ADMIN_ACTION_QUEUE_REGISTRY.filter(
  (d) => d.lifecycle === "active" && d.nextActor === "admin"
).map((d) => d.key);

const P0_CATEGORIES = ADMIN_ACTION_QUEUE_REGISTRY.filter(
  (d) => d.priority === "P0_CRITICAL" && d.lifecycle === "active" && d.nextActor === "admin"
).map((d) => d.key);

export const ADMIN_METRIC_DEFINITIONS: readonly AdminMetricDefinition[] = [
  // ── 회원 (/admin/users 목록과 같은 필터 연산) ──
  {
    id: "members.total",
    labelKo: "전체 회원",
    labelEn: "All members",
    shortKo: "회원",
    shortEn: "Members",
    domain: "members",
    source: "members",
    sourceDetail: "profiles COUNT, 필터 없음 = /api/admin/users summary.totalRows",
    periodBasis: "pht",
    period: "now",
    unit: "people",
    href: "/admin/users",
  },
  {
    id: "members.active",
    labelKo: "활성 회원",
    labelEn: "Active members",
    shortKo: "활성",
    shortEn: "Active",
    domain: "members",
    source: "members",
    sourceDetail: "profiles + adminMemberStatusFilterOps(\"active\") = 회원 목록 status=active",
    periodBasis: "pht",
    period: "now",
    unit: "people",
    href: "/admin/users?status=active",
  },
  {
    id: "members.new",
    labelKo: "신규 가입",
    labelEn: "New signups",
    shortKo: "신규",
    shortEn: "New",
    domain: "members",
    source: "members",
    sourceDetail: "profiles.created_at ∈ 선택 기간 (adminMemberJoinedRangeOps, PHT) = 회원 목록 joinedFrom·joinedTo",
    periodBasis: "pht",
    period: "selected",
    unit: "people",
    href: (p) => `/admin/users?joinedFrom=${p.range.fromDay}&joinedTo=${p.range.toDay}`,
  },
  {
    id: "members.suspended",
    labelKo: "정지 회원",
    labelEn: "Suspended members",
    domain: "members",
    source: "members",
    sourceDetail: "profiles + adminMemberStatusFilterOps(\"suspended\") = 회원 목록 status=suspended",
    periodBasis: "pht",
    period: "now",
    unit: "people",
    href: "/admin/users?status=suspended",
  },
  {
    id: "members.blocked",
    labelKo: "차단 회원",
    labelEn: "Blocked members",
    domain: "members",
    source: "members",
    sourceDetail: "profiles + adminMemberStatusFilterOps(\"blocked\") = 회원 목록 status=blocked",
    periodBasis: "pht",
    period: "now",
    unit: "people",
    href: "/admin/users?status=blocked",
  },
  {
    id: "members.deletion_requests",
    labelKo: "탈퇴 요청",
    labelEn: "Deletion requests",
    domain: "members",
    source: "members",
    sourceDetail: "applyAccountDeletionRequestStatusFilter(open) = /api/admin/account-deletion-requests total",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/users/deletion-requests",
  },

  // ── 처리 대기 (레지스트리) ──
  {
    id: "queue.total",
    labelKo: "처리 대기 합계",
    labelEn: "Pending work",
    shortKo: "대기",
    shortEn: "Pending",
    domain: "platform",
    source: "queue",
    sourceDetail: "admin_action_queue Σ (active · nextActor=admin, 권한 범위) = 전체 현황 「처리 대기」 목록 합계",
    queueCategories: ADMIN_DASHBOARD_ADMIN_QUEUE_CATEGORIES,
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin#action-center",
  },
  {
    id: "queue.p0",
    labelKo: "긴급(P0) 대기",
    labelEn: "Critical (P0)",
    shortKo: "긴급",
    shortEn: "P0",
    domain: "platform",
    source: "queue",
    sourceDetail: `admin_action_queue priority=P0_CRITICAL (${P0_CATEGORIES.join(", ")})`,
    queueCategories: P0_CATEGORIES,
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin#action-center",
  },
  // 이동 화면 개수와 같은 것만 (감사 2026-10-20: 입점·수수료 검토·고객지원·모임 신고·주문 운영 예외)
  // 대시보드는 이동 화면 함수로 센 값을 처리 대기 항목에도 쓴다 (load-admin-dashboard-sources `alignQueueWithDestinations`).
  {
    ...queueMetric("store_applications", "입점 심사 대기", "Store applications"),
    sourceDetail: "applyStoreApprovalStatusFilter(actionable) = /api/admin/stores?status=actionable total",
  },
  {
    ...queueMetric("settlements_actionable", "수수료 검토 대기", "Commission reviews"),
    sourceDetail: "loadStoreCommissionLedgerPage(state=review_required, 기간 전체).total = 수수료 원장 「검토 필요」",
  },
  {
    ...queueMetric("support_actionable", "고객지원 미처리", "Open support cases"),
    sourceDetail: "applySupportCaseTabFilter(ACTIONABLE) = /api/admin/support/cases?tab=ACTIONABLE total",
  },
  {
    ...queueMetric("meeting_reports", "모임 신고 대기", "Meeting reports"),
    sourceDetail: "applyMeetingReportTabFilter(pending) = 모임 신고 화면 「처리 대기」 total",
  },
  {
    ...queueMetric("orders_attention", "주문 운영 예외", "Order exceptions"),
    sourceDetail: "loadAdminOrderOpsPage(exceptions, 링크 기간).total = 처리 필요 주문 화면 total",
  },

  // ── 커뮤니티 (community-metrics.ts 같은 id) ──
  {
    id: "community.posts_active.member",
    labelKo: "커뮤니티 공개 게시글",
    labelEn: "Community posts (public)",
    domain: "community",
    source: "community",
    sourceDetail: "applyCommunityPostStatusOriginFilter(active, member) = /api/admin/community/engine/posts total",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/community/posts?tab=active&origin=member",
  },
  {
    id: "community.report_targets_pending",
    labelKo: "커뮤니티 신고 대기 (대상)",
    labelEn: "Community reports open (targets)",
    shortKo: "커뮤니티 신고",
    shortEn: "Comm. reports",
    domain: "community",
    source: "community_reports",
    sourceDetail:
      "listCommunityReportGroupsForAdmin(tab=pending).counts.pending = 신고 처리함 「대기」 — 단위: 신고 대상 묶음(같은 대상 = 1건). 처리 대기 목록 「커뮤니티 신고」도 같은 값",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/community/reports?status=pending",
  },

  // ── 거래 (trade-domain-metrics.ts 같은 id) ──
  {
    id: "trade.posts.selling",
    labelKo: "판매중 거래글",
    labelEn: "Selling",
    shortKo: "판매중",
    shortEn: "Selling",
    domain: "trade",
    source: "trade",
    sourceDetail: "countTradePosts(selling, parseTradePostsFilter(링크)) = /api/admin/trade/posts tabCounts.selling",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/posts-management?tab=selling",
  },
  {
    id: "trade.posts.sold",
    labelKo: "거래완료 거래글",
    labelEn: "Sold",
    shortKo: "완료",
    shortEn: "Sold",
    domain: "trade",
    source: "trade",
    sourceDetail: "countTradePosts(sold, parseTradePostsFilter(링크)) = /api/admin/trade/posts tabCounts.sold",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/posts-management?tab=sold",
  },
  {
    id: "trade.posts.admin_hidden",
    labelKo: "관리자 숨김 거래글",
    labelEn: "Trade posts hidden by admin",
    domain: "trade",
    source: "trade",
    sourceDetail: "countTradePosts(admin_hidden, parseTradePostsFilter(링크)) = /api/admin/trade/posts tabCounts.admin_hidden",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/posts-management?tab=admin_hidden",
  },
  {
    id: "trade.reports_open",
    labelKo: "거래 신고 대기",
    labelEn: "Trade reports open",
    domain: "trade",
    source: "trade",
    sourceDetail: "applyTradeReportTabFilter(open) = /api/admin/trade/reports?tab=open total",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/trade/reports?tab=open",
  },

  // ── 배달·매장 주문 (주문 목록 RPC admin_store_order_ops_page 탭 개수, 선택 기간) ──
  {
    id: "orders.all",
    labelKo: "주문",
    labelEn: "Orders",
    shortKo: "주문",
    shortEn: "Orders",
    domain: "delivery",
    source: "orders",
    sourceDetail: "admin_store_order_ops_page(list, 선택 기간 custom PHT).tab_counts.all = 주문 목록 「전체」",
    periodBasis: "pht",
    period: "selected",
    unit: "count",
    href: (p) => adminDashboardOrdersHref(p.range),
  },
  {
    id: "orders.in_progress",
    labelKo: "진행 중 주문",
    labelEn: "Orders in progress",
    shortKo: "진행",
    shortEn: "Live",
    domain: "delivery",
    source: "orders",
    sourceDetail: "admin_store_order_ops_page(list, 선택 기간).tab_counts.in_progress = 주문 목록 「진행 중」",
    periodBasis: "pht",
    period: "selected",
    unit: "count",
    href: (p) => adminDashboardOrdersHref(p.range, "in_progress"),
  },
  {
    id: "orders.completed",
    labelKo: "완료 주문",
    labelEn: "Completed orders",
    domain: "delivery",
    source: "orders",
    sourceDetail: "admin_store_order_ops_page(list, 선택 기간).tab_counts.completed = 주문 목록 「완료」",
    periodBasis: "pht",
    period: "selected",
    unit: "count",
    href: (p) => adminDashboardOrdersHref(p.range, "completed"),
  },
  {
    id: "orders.cancel",
    labelKo: "취소 주문 (요청 포함)",
    labelEn: "Cancelled orders (incl. requests)",
    domain: "delivery",
    source: "orders",
    sourceDetail: "admin_store_order_ops_page(list, 선택 기간).tab_counts.cancel = 주문 목록 「취소」",
    periodBasis: "pht",
    period: "selected",
    unit: "count",
    href: (p) => adminDashboardOrdersHref(p.range, "cancel"),
  },
  {
    id: "stores.open_now",
    labelKo: "영업 중 매장",
    labelEn: "Stores open now",
    domain: "delivery",
    source: "stores",
    sourceDetail: "loadAdminBusinessListOps(parseAdminBusinessListOpsFilters(링크)).kpi.openNow = 매장 운영 목록 KPI",
    periodBasis: "pht",
    period: "now",
    unit: "stores",
    href: "/admin/business?open=open",
  },

  // ── 결제·정산 ──
  {
    id: "points.waiting_confirm",
    labelKo: "포인트 충전 · 입금확인대기",
    labelEn: "Point top-ups · awaiting deposit",
    domain: "finance",
    source: "points",
    sourceDetail: "countPointChargesByStatus.waiting_confirm = 포인트 충전 화면 「입금확인대기」 카드 · status 필터 total",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/point-charges?status=waiting_confirm",
  },
  {
    id: "points.pending",
    labelKo: "포인트 충전 · 대기중",
    labelEn: "Point top-ups · pending",
    domain: "finance",
    source: "points",
    sourceDetail: "countPointChargesByStatus.pending = 포인트 충전 화면 「대기중」 카드 · status 필터 total",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/point-charges?status=pending",
  },
  {
    id: "finance.cash_in_today",
    labelKo: "오늘 Cash 유입",
    labelEn: "Cash in today",
    domain: "finance",
    source: "finance_today",
    sourceDetail: "loadFinanceTodaySummary.cashInMinor = 재무 현황 「오늘 Cash 유입」 (화면이 오늘만 보여 준다)",
    periodBasis: "pht",
    period: "today_fixed",
    unit: "php_minor",
    href: "/admin/finance",
  },
  {
    id: "finance.commission_outstanding",
    labelKo: "미납 수수료",
    labelEn: "Unpaid commission",
    shortKo: "미납",
    shortEn: "Unpaid",
    domain: "finance",
    source: "commission",
    sourceDetail: "sumStoreCashOutstandingMinor(loadStoreCashOverview(loadAdminStoreCashOverviewIds)) = 수수료 원장 「미납 관리」",
    periodBasis: "pht",
    period: "now",
    unit: "php_minor",
    href: "/admin/store-settlements?tab=cash",
  },
  {
    id: "finance.commission_net",
    labelKo: "순 수수료",
    labelEn: "Net commission",
    shortKo: "수수료",
    shortEn: "Comm.",
    domain: "finance",
    source: "commission",
    sourceDetail: "store_commission_ledger_page(선택 기간 custom PHT, state=all).summary.netCommissionMinor = 원장 「순 수수료」",
    periodBasis: "pht",
    period: "selected",
    unit: "php_minor",
    href: (p) => `/admin/store-settlements?tab=ledger&period=custom&from=${p.range.fromDay}&to=${p.range.toDay}`,
  },

  // ── 광고 (광고 워크스페이스 요약 카드 = 상태 탭 개수) ──
  {
    id: "ads.live",
    labelKo: "노출 중 광고",
    labelEn: "Ads live",
    shortKo: "노출",
    shortEn: "Live",
    domain: "ads",
    source: "ads",
    sourceDetail: "computeAdsWorkspaceSummaryCounts(all).live = 광고 운영 「노출 중」",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: adsWorkspaceHref("live"),
  },
  {
    id: "ads.pending",
    labelKo: "광고 승인 대기",
    labelEn: "Ads pending approval",
    shortKo: "승인 대기",
    shortEn: "Pending",
    domain: "ads",
    source: "ads",
    sourceDetail: "computeAdsWorkspaceSummaryCounts(all).pending = 광고 운영 「승인 대기」",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: adsWorkspaceHref("pending"),
  },
  {
    id: "ads.scheduled",
    labelKo: "예약 광고",
    labelEn: "Ads scheduled",
    domain: "ads",
    source: "ads",
    sourceDetail: "computeAdsWorkspaceSummaryCounts(all).scheduled = 광고 운영 「예약」",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: adsWorkspaceHref("scheduled"),
  },
  {
    id: "ads.waiting",
    labelKo: "노출 대기 광고",
    labelEn: "Ads waiting",
    domain: "ads",
    source: "ads",
    sourceDetail: "computeAdsWorkspaceSummaryCounts(all).waiting = 광고 운영 「노출 대기」",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: adsWorkspaceHref("waiting"),
  },

  {
    id: "ads.hero_used",
    labelKo: "홈 배너 사용 칸",
    labelEn: "Home hero slots used",
    domain: "ads",
    source: "ads",
    sourceDetail: "computeAdsWorkspaceHeroOccupancy.used = 광고 운영 「홈 배너 사용/정원」",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/advertising",
  },
  {
    id: "ads.popup_live",
    labelKo: "집행 중 팝업",
    labelEn: "Popups live",
    domain: "ads",
    source: "ads",
    sourceDetail:
      "countPlatformPopupAdminCampaigns(scope=popup, status=live) = 팝업 목록 「지금 노출 중」 필터 total (같은 함수·같은 필터)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: `/admin/platform-popup?status=${PLATFORM_POPUP_LIVE_STATUS_FILTER}`,
  },

  // ── 알림 발송 (알림 발송 화면 = 캠페인 목록, 같은 질의의 total) ──
  {
    id: "notifications.campaigns_failed",
    labelKo: "알림 발송 실패",
    labelEn: "Notification sends failed",
    shortKo: "발송 실패",
    shortEn: "Failed",
    domain: "support",
    source: "notifications",
    sourceDetail:
      "listAdminNotificationCampaigns(parseCampaignListQuery(tab=completed&status=failed)).total = 알림 발송 「완료 · 실패」 (QA·보관 제외)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/notifications?tab=completed&status=failed",
  },
  {
    id: "notifications.campaigns_partially_failed",
    labelKo: "알림 일부 실패",
    labelEn: "Notification sends partly failed",
    domain: "support",
    source: "notifications",
    sourceDetail:
      "listAdminNotificationCampaigns(parseCampaignListQuery(tab=completed&status=partially_failed)).total = 알림 발송 「완료 · 일부 실패」",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/notifications?tab=completed&status=partially_failed",
  },
  {
    id: "notifications.campaigns_in_progress",
    labelKo: "알림 예약·발송 중",
    labelEn: "Notifications scheduled · sending",
    domain: "support",
    source: "notifications",
    sourceDetail:
      "listAdminNotificationCampaigns(parseCampaignListQuery(tab=in_progress)).total = 알림 발송 「진행 중」 (예약·발송 중·반복·일시정지)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/notifications?tab=in_progress",
  },
];

export const ADMIN_METRIC_BY_ID: ReadonlyMap<string, AdminMetricDefinition> = new Map(
  ADMIN_METRIC_DEFINITIONS.map((d) => [d.id, d])
);

export function getAdminMetricDefinition(id: string): AdminMetricDefinition {
  const d = ADMIN_METRIC_BY_ID.get(id);
  if (!d) throw new Error(`unknown_admin_metric:${id}`);
  return d;
}

/** 출처가 없거나 이동 화면에 같은 개수가 없어 넣지 않은 지표 — 임의 집계로 채우지 않는다. */
export const ADMIN_DASHBOARD_OMITTED_METRICS: readonly { tab: AdminDashboardTabId; labelKo: string; reason: string }[] = [
  { tab: "ads_ops", labelKo: "광고 환불 실패", reason: "환불 실패가 저장되는 상태·테이블이 없음 (요청 응답 오류로만 존재)" },
  { tab: "ads_ops", labelKo: "진행 중 이벤트", reason: "운영 중 이벤트 집계 출처 없음" },
  { tab: "ads_ops", labelKo: "광고 충돌 (차단)", reason: "이동할 충돌 목록 화면 없음 (배달 광고 화면에 충돌 구역 없음) · 원본이 40건에서 잘림" },
  { tab: "support", labelKo: "SLA 초과", reason: "support_cases 에 SLA 기한 열이 없음" },
  {
    tab: "support",
    labelKo: "알림 기기별 발송 실패",
    reason: "notification_deliveries 목록 화면 없음 — 캠페인 단위 실패·일부 실패는 「알림 발송 실패」 지표로 표시",
  },
  { tab: "support", labelKo: "통화 연결 실패", reason: "통화 기록 화면에 개수 표시 없음 · 24시간 상한 없는 이동 창" },
  { tab: "support", labelKo: "채팅 신고 (메신저·거래 채팅방)", reason: "채팅 신고 목록이 커서 목록이라 총 건수 표시 없음" },
  { tab: "support", labelKo: "매장 신고 · 매장 문의", reason: "목록이 모든 상태를 섞어 보여 주고 건수 표시 없음" },
  { tab: "delivery", labelKo: "배달 경고", reason: "경고 화면에 전체 건수 카드 없음 (담당자별 카드만) · 목록에 음소거 포함" },
  { tab: "finance", labelKo: "캐시 충전·코인 출금·포인트 충전 합계", reason: "캐시 충전 목록에 건수 없음 · 코인 출금 건수는 40건에서 잘림 · 포인트 화면에 대기 합계(보류 포함) 없음" },
  { tab: "ads_ops", labelKo: "제휴 가입 심사", reason: "제휴 화면에 건수 없음 · 기본 목록이 심사 외 상태 포함" },
];

// ── 요약 띠 8칸 ─────────────────────────────────────────────────────────────

export type AdminDashboardBandTileDef = {
  id: string;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  primaryMetricId: string;
  secondaryMetricId?: string;
  /** 누르면 이 탭으로 전환 (없으면 primary href 로 이동) */
  tab?: AdminDashboardTabId;
};

export const ADMIN_DASHBOARD_BAND: readonly AdminDashboardBandTileDef[] = [
  { id: "members", labelKo: "전체 회원", labelEn: "Members", shortKo: "회원", shortEn: "Members", primaryMetricId: "members.total", tab: "members" },
  {
    id: "activity",
    labelKo: "활성·신규",
    labelEn: "Active · New",
    shortKo: "활성",
    shortEn: "Active",
    primaryMetricId: "members.active",
    secondaryMetricId: "members.new",
    tab: "members",
  },
  {
    id: "pending",
    labelKo: "처리 대기",
    labelEn: "Pending",
    shortKo: "대기",
    shortEn: "Pending",
    primaryMetricId: "queue.total",
    secondaryMetricId: "queue.p0",
    tab: "overview",
  },
  {
    id: "trade",
    labelKo: "거래",
    labelEn: "Trade",
    shortKo: "거래",
    shortEn: "Trade",
    primaryMetricId: "trade.posts.selling",
    secondaryMetricId: "trade.posts.sold",
    tab: "community_trade",
  },
  {
    id: "delivery",
    labelKo: "배달 주문",
    labelEn: "Delivery",
    shortKo: "배달",
    shortEn: "Delivery",
    primaryMetricId: "orders.all",
    secondaryMetricId: "orders.in_progress",
    tab: "delivery",
  },
  {
    id: "finance",
    labelKo: "결제·정산",
    labelEn: "Payments",
    shortKo: "결제",
    shortEn: "Pay",
    primaryMetricId: "finance.commission_outstanding",
    secondaryMetricId: "finance.commission_net",
    tab: "finance",
  },
  {
    id: "ads",
    labelKo: "광고",
    labelEn: "Ads",
    shortKo: "광고",
    shortEn: "Ads",
    primaryMetricId: "ads.live",
    secondaryMetricId: "ads.pending",
    tab: "ads_ops",
  },
  {
    id: "support",
    labelKo: "고객지원·알림",
    labelEn: "Support · Notifications",
    shortKo: "지원",
    shortEn: "Support",
    primaryMetricId: "queue.support_actionable",
    secondaryMetricId: "notifications.campaigns_failed",
    tab: "support",
  },
];

// ── 추세 (PHT 일별 · 선택 기간이 끝나는 날까지 N일: 30일 = 30, 그 밖 = 7) ──────────────────

export type AdminDashboardTrendId =
  | "signups_orders_daily"
  | "signups_daily"
  | "members_activity_daily"
  | "reports_daily"
  | "orders_daily"
  | "commission_daily"
  | "ad_spend_daily"
  | "support_cases_daily";

export type AdminDashboardTrendDef = {
  id: AdminDashboardTrendId;
  labelKo: string;
  labelEn: string;
  unit: AdminMetricUnit;
  series: readonly { key: string; labelKo: string; labelEn: string; sourceDetail: string }[];
  href: string;
  /** 집계 정의 (화면 추세 아래에 그대로 표시) */
  definitionKo?: string;
  definitionEn?: string;
};

/**
 * 7일 활성 회원 정의 (수정 계획 1-1: 「활성 회원」 지표는 회원 목록 status=active 로 옮기고, 7일 활성은 추세로 옮겨 정의를 적는다).
 * profiles.last_login_at 의 PHT 날짜별 회원 수 — 회원마다 마지막 로그인 날 하루에만 센다.
 * 오늘에서 끝나는 7일 막대 합계 = 7일 활성 회원 (last_login_at ≥ PHT 오늘−6일 00:00, 이전 「활성 회원(7일)」과 같은 조건).
 */
export const ADMIN_DASHBOARD_ACTIVE_7D_DEFINITION_KO =
  "7일 활성 = 최근 7일(PHT) 안에 마지막으로 로그인한 회원 수. 막대 = 그날이 마지막 로그인인 회원 수(회원당 하루), 오늘에서 끝나는 7일 막대 합계가 7일 활성 회원입니다.";
export const ADMIN_DASHBOARD_ACTIVE_7D_DEFINITION_EN =
  "7-day active = members whose last sign-in (PHT) is within the last 7 days. Each bar = members whose last sign-in was that day (one day per member); the 7 bars ending today sum to 7-day active members.";

export const ADMIN_DASHBOARD_TRENDS: Readonly<Record<AdminDashboardTrendId, AdminDashboardTrendDef>> = {
  signups_orders_daily: {
    id: "signups_orders_daily",
    labelKo: "가입·주문 추이",
    labelEn: "Signups · orders",
    unit: "count",
    series: [
      { key: "signups", labelKo: "가입", labelEn: "Signups", sourceDetail: "profiles.created_at" },
      { key: "orders", labelKo: "주문", labelEn: "Orders", sourceDetail: "store_orders.created_at" },
    ],
    href: "/admin/users",
  },
  signups_daily: {
    id: "signups_daily",
    labelKo: "가입 추이",
    labelEn: "Signups",
    unit: "people",
    series: [{ key: "signups", labelKo: "가입", labelEn: "Signups", sourceDetail: "profiles.created_at" }],
    href: "/admin/users",
  },
  members_activity_daily: {
    id: "members_activity_daily",
    labelKo: "가입·활성(마지막 로그인) 추이",
    labelEn: "Signups · active (last sign-in)",
    unit: "people",
    series: [
      { key: "signups", labelKo: "가입", labelEn: "Signups", sourceDetail: "profiles.created_at" },
      { key: "active", labelKo: "마지막 로그인", labelEn: "Last sign-in", sourceDetail: "profiles.last_login_at" },
    ],
    href: "/admin/users?status=active",
    definitionKo: ADMIN_DASHBOARD_ACTIVE_7D_DEFINITION_KO,
    definitionEn: ADMIN_DASHBOARD_ACTIVE_7D_DEFINITION_EN,
  },
  reports_daily: {
    id: "reports_daily",
    labelKo: "신고 접수 추이",
    labelEn: "Reports received",
    unit: "count",
    series: [
      { key: "trade", labelKo: "거래", labelEn: "Trade", sourceDetail: "reports.created_at" },
      { key: "community", labelKo: "커뮤니티", labelEn: "Community", sourceDetail: "community_reports.created_at" },
    ],
    href: "/admin/reports",
  },
  orders_daily: {
    id: "orders_daily",
    labelKo: "주문 추이",
    labelEn: "Orders",
    unit: "count",
    series: [{ key: "orders", labelKo: "주문", labelEn: "Orders", sourceDetail: "store_orders.created_at" }],
    href: "/admin/stores/orders",
  },
  commission_daily: {
    id: "commission_daily",
    labelKo: "일별 플랫폼 수수료",
    labelEn: "Daily commission",
    unit: "php_minor",
    series: [
      {
        key: "commission",
        labelKo: "수수료",
        labelEn: "Commission",
        sourceDetail: "store_commission_breakdown(day).net_commission_minor",
      },
    ],
    href: "/admin/store-settlements",
  },
  ad_spend_daily: {
    id: "ad_spend_daily",
    labelKo: "광고 사용 금액 추이",
    labelEn: "Ad spend",
    unit: "php_minor",
    series: [
      { key: "spend", labelKo: "광고 사용", labelEn: "Ad spend", sourceDetail: "business_cash_ledger entry_kind=AD_SPEND" },
    ],
    href: "/admin/advertising",
  },
  support_cases_daily: {
    id: "support_cases_daily",
    labelKo: "고객지원 접수 추이",
    labelEn: "Support cases received",
    unit: "count",
    series: [{ key: "cases", labelKo: "접수", labelEn: "Cases", sourceDetail: "support_cases.created_at" }],
    href: "/admin/support",
  },
};

// ── 탭 정의 (설계 v4 §3-3: 탭마다 지표 6칸 · 추세 1 · 바로가기 4–6 · 처리 대기) ──────────

export type AdminDashboardShortcut = { id: string; labelKo: string; labelEn: string; href: string };

export type AdminDashboardTabDef = {
  id: AdminDashboardTabId;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  /** 지표 6칸 (3×2) */
  metricIds: readonly string[];
  trend: AdminDashboardTrendId;
  shortcuts: readonly AdminDashboardShortcut[];
  /** 오른쪽 처리 대기 — 카테고리 목록, 또는 관리자 처리 카테고리 전부(합 = 「처리 대기 합계」) */
  pending: { kind: "categories"; categories: readonly AdminActionQueueCategory[] } | { kind: "all_admin" };
};

export const ADMIN_DASHBOARD_METRICS_PER_TAB = 6;

export const ADMIN_DASHBOARD_TABS: readonly AdminDashboardTabDef[] = [
  {
    id: "overview",
    labelKo: "전체 현황",
    labelEn: "Overview",
    shortKo: "전체",
    shortEn: "All",
    metricIds: [
      "members.new",
      "orders.all",
      "finance.cash_in_today",
      "trade.reports_open",
      "community.report_targets_pending",
      "queue.support_actionable",
    ],
    trend: "signups_orders_daily",
    shortcuts: [
      { id: "community", labelKo: "커뮤니티 현황", labelEn: "Community", href: "/admin/community" },
      { id: "trade", labelKo: "거래 현황", labelEn: "Trade", href: "/admin/trade" },
      { id: "delivery", labelKo: "배달 현황", labelEn: "Delivery", href: "/admin/delivery" },
      { id: "messenger", labelKo: "채팅 현황", labelEn: "Chat", href: "/admin/messenger" },
      { id: "finance", labelKo: "재무 현황", labelEn: "Finance", href: "/admin/finance#action-required" },
      { id: "support", labelKo: "고객지원", labelEn: "Support", href: "/admin/support?filter=ACTIONABLE#action-required" },
    ],
    pending: { kind: "all_admin" },
  },
  {
    id: "members",
    labelKo: "회원·고객",
    labelEn: "Members",
    shortKo: "회원",
    shortEn: "Members",
    metricIds: [
      "members.total",
      "members.active",
      "members.new",
      "members.suspended",
      "members.blocked",
      "members.deletion_requests",
    ],
    trend: "members_activity_daily",
    shortcuts: [
      { id: "users", labelKo: "회원 목록", labelEn: "Members", href: "/admin/users" },
      { id: "deletion", labelKo: "탈퇴 요청", labelEn: "Deletion requests", href: "/admin/users/deletion-requests" },
      { id: "phone", labelKo: "휴대폰 인증", labelEn: "Phone verification", href: "/admin/users/phone-verification" },
      { id: "suspended", labelKo: "정지 회원", labelEn: "Suspended", href: "/admin/users?status=suspended" },
      { id: "support", labelKo: "고객 문의", labelEn: "Inquiries", href: "/admin/support?filter=ACTIONABLE#action-required" },
    ],
    pending: { kind: "categories", categories: ["support_actionable"] },
  },
  {
    id: "community_trade",
    labelKo: "커뮤니티·거래",
    labelEn: "Community · Trade",
    shortKo: "커뮤·거래",
    shortEn: "Comm·Trade",
    metricIds: [
      "community.posts_active.member",
      "trade.posts.selling",
      "trade.posts.sold",
      "trade.posts.admin_hidden",
      "trade.reports_open",
      "community.report_targets_pending",
    ],
    trend: "reports_daily",
    shortcuts: [
      { id: "trade_reports", labelKo: "거래 신고", labelEn: "Trade reports", href: "/admin/trade/reports?tab=open" },
      { id: "community_reports", labelKo: "커뮤니티 신고", labelEn: "Community reports", href: "/admin/community/reports?tab=pending" },
      { id: "meeting_reports", labelKo: "모임 신고", labelEn: "Meeting reports", href: "/admin/philife/meeting-reports" },
      { id: "posts", labelKo: "거래글", labelEn: "Trade posts", href: "/admin/posts-management" },
      { id: "community_posts", labelKo: "커뮤니티 글", labelEn: "Community posts", href: "/admin/community/posts" },
      { id: "promo", labelKo: "거래 홍보 심사", labelEn: "Trade promotions", href: "/admin/trade/promotions?tab=pending_review" },
    ],
    pending: {
      kind: "categories",
      categories: ["reports", "community_reports", "meeting_reports", "trade_promo_pending"],
    },
  },
  {
    id: "delivery",
    labelKo: "배달·매장",
    labelEn: "Delivery · Stores",
    shortKo: "배달",
    shortEn: "Delivery",
    metricIds: [
      "orders.all",
      "orders.in_progress",
      "orders.completed",
      "orders.cancel",
      "stores.open_now",
      "queue.store_applications",
    ],
    trend: "orders_daily",
    shortcuts: [
      { id: "orders", labelKo: "주문 목록", labelEn: "Orders", href: "/admin/stores/orders?period=today" },
      { id: "attention", labelKo: "주문 운영 예외", labelEn: "Order exceptions", href: "/admin/store-orders?queue=admin_attention&period=last_7_days" },
      { id: "alerts", labelKo: "배달 경고", labelEn: "Delivery alerts", href: "/admin/delivery-alerts" },
      { id: "applications", labelKo: "입점 심사", labelEn: "Applications", href: "/admin/stores?status=actionable" },
      { id: "business", labelKo: "매장 운영", labelEn: "Stores", href: "/admin/business" },
      { id: "dashboard", labelKo: "배달 대시보드", labelEn: "Delivery dashboard", href: "/admin/delivery" },
    ],
    pending: {
      kind: "categories",
      categories: ["delivery_alerts", "orders_attention", "store_applications", "store_inquiry_open", "store_reports"],
    },
  },
  {
    id: "finance",
    labelKo: "결제·정산",
    labelEn: "Payments",
    shortKo: "결제",
    shortEn: "Pay",
    metricIds: [
      "points.waiting_confirm",
      "points.pending",
      "finance.cash_in_today",
      "finance.commission_outstanding",
      "finance.commission_net",
      "queue.settlements_actionable",
    ],
    trend: "commission_daily",
    shortcuts: [
      { id: "point", labelKo: "포인트 충전", labelEn: "Point top-ups", href: "/admin/point-charges" },
      { id: "cash", labelKo: "캐시 충전", labelEn: "Cash top-ups", href: DELIVERY_AD_ADMIN_ROUTES.cashCharges },
      { id: "coin", labelKo: "코인 출금", labelEn: "Coin withdrawals", href: "/admin/finance#coin-withdrawals" },
      { id: "commission", labelKo: "수수료 내역", labelEn: "Commission ledger", href: "/admin/store-settlements" },
      { id: "finance", labelKo: "재무 현황", labelEn: "Finance", href: "/admin/finance" },
    ],
    pending: {
      kind: "categories",
      categories: ["user_charges", "cash_charges", "coin_withdrawals", "settlements_actionable"],
    },
  },
  {
    id: "ads_ops",
    labelKo: "광고·운영",
    labelEn: "Ads · Ops",
    shortKo: "광고",
    shortEn: "Ads",
    metricIds: ["ads.live", "ads.pending", "ads.scheduled", "ads.waiting", "ads.popup_live", "ads.hero_used"],
    trend: "ad_spend_daily",
    shortcuts: [
      { id: "workspace", labelKo: "광고 운영", labelEn: "Advertising", href: "/admin/advertising" },
      { id: "applications", labelKo: "광고 신청 심사", labelEn: "Ad applications", href: "/admin/advertising/applications" },
      { id: "delivery_ads", labelKo: "배달 광고", labelEn: "Delivery ads", href: `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable` },
      { id: "popup", labelKo: "팝업", labelEn: "Popups", href: "/admin/platform-popup" },
      { id: "events", labelKo: "이벤트", labelEn: "Events", href: "/admin/platform-events" },
    ],
    pending: {
      kind: "categories",
      categories: ["delivery_ad_ops", "feed_ad_requests", "platform_popup_pending", "partner_pending"],
    },
  },
  {
    id: "support",
    labelKo: "고객지원·알림",
    labelEn: "Support · Notifications",
    shortKo: "지원·알림",
    shortEn: "Support",
    // 신고(거래·커뮤니티)는 「커뮤니티·거래」 탭, 탈퇴 요청은 「회원·고객」 탭 지표에 있다.
    metricIds: [
      "queue.support_actionable",
      "notifications.campaigns_failed",
      "notifications.campaigns_partially_failed",
      "notifications.campaigns_in_progress",
      "queue.meeting_reports",
      "queue.orders_attention",
    ],
    trend: "support_cases_daily",
    shortcuts: [
      { id: "support", labelKo: "고객지원", labelEn: "Support", href: "/admin/support?filter=ACTIONABLE#action-required" },
      { id: "chat_reports", labelKo: "채팅 신고", labelEn: "Chat reports", href: "/admin/chats/reported?status=open" },
      { id: "store_reports", labelKo: "매장 신고", labelEn: "Store reports", href: "/admin/store-reports" },
      { id: "notifications", labelKo: "알림 발송", labelEn: "Notifications", href: "/admin/notifications?tab=completed" },
      { id: "calls", labelKo: "통화 기록", labelEn: "Calls", href: "/admin/chats/calls" },
    ],
    pending: {
      kind: "categories",
      categories: ["support_actionable", "messenger_actionable", "store_reports", "meeting_reports", "store_inquiry_open"],
    },
  },
];

export function getAdminDashboardTab(id: AdminDashboardTabId): AdminDashboardTabDef {
  const t = ADMIN_DASHBOARD_TABS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown_admin_dashboard_tab:${id}`);
  return t;
}

/** 처리 대기 정렬 순위 (P0 → P3). */
export const ADMIN_QUEUE_PRIORITY_RANK: Readonly<Record<AdminActionQueuePriority, number>> = {
  P0_CRITICAL: 0,
  P1_ACTION_REQUIRED: 1,
  P2_INFORMATIONAL: 2,
  P3_SILENT: 3,
};
