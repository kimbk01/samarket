/**
 * Admin Metric Registry — 통합 대시보드(설계 v4 §3 · 통합 설계 §2.5) 지표·탭·요약 띠 단일 정의.
 *
 * 원칙 (CUT E: 읽기 조합 + 딥링크, 신규 DB 금지):
 * - 지표 값은 **이미 있는 출처**만 읽는다 — 대시보드 집계 RPC(`admin_dashboard_aggregate_json`), 처리 대기 레지스트리
 *   (`admin-action-queue-registry`), 도메인 지표(커뮤니티·거래·배달·채팅), 수수료 SQL 조회 함수, 재무 오늘 요약,
 *   광고 관제 모델, 작은 COUNT(인덱스 있는 열).
 * - 도메인 지표는 **같은 id** 를 그대로 쓴다 (`delivery.*`·`chat.*`·`community.*`·`trade.*`) → 전체 vs 도메인 값이 같다.
 * - 값 없음 = null (화면 「불러오기 실패」 + 이전 값, 0 표시 금지).
 * - 기간 기준 = 필리핀 시간(PHT, `manila-period.ts`). 「오늘」 = PHT 00:00.
 * - 권한: 지표 href 를 접근표(`canAccessAdminRoute`)로 열 수 없거나 처리 대기 카테고리가 forbidden 이면 숨긴다.
 *
 * 출처가 없어 **넣지 않은 지표** 는 `ADMIN_DASHBOARD_OMITTED_METRICS` 에 사유와 함께 적는다 (임의 집계 금지).
 *
 * 클라이언트 안전 — 서버 전용 모듈 import 금지.
 */
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  getAdminActionQueueCategoryDef,
  type AdminActionQueueCategory,
  type AdminActionQueuePriority,
} from "@/lib/admin/admin-action-queue-registry";
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
 * 값 출처 키 — 서버 로더(`load-admin-dashboard-sources.ts`)가 키마다 1회만 읽는다 (요청 안 memo).
 * aggregate = admin_dashboard_aggregate_json(PHT 오늘 시작) · members = profiles/account_deletion_requests COUNT ·
 * queue = 처리 대기 레지스트리 · community/trade/delivery/chat = 도메인 지표 로더 · orders_today = store_orders COUNT ·
 * commission = store_commission_breakdown · finance_today = loadFinanceTodaySummary · ads = loadAdsControlPlane ·
 * notifications_today = notification_deliveries COUNT.
 */
export type AdminMetricSourceKey =
  | "aggregate"
  | "members"
  | "queue"
  | "community"
  | "trade"
  | "delivery"
  | "chat"
  | "orders_today"
  | "commission"
  | "finance_today"
  | "ads"
  | "notifications_today";

export type AdminMetricUnit = "count" | "php_minor";

export type AdminMetricPeriod = "now" | "today" | "24h" | "7d" | "all_time";

export type AdminMetricHrefParams = {
  /** PHT 오늘 "YYYY-MM-DD" */
  todayPht: string;
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
  /** 출처 설명 (테이블/RPC/필터) — 문서·테스트용 */
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

const P0_CATEGORIES = ADMIN_ACTION_QUEUE_REGISTRY.filter(
  (d) => d.priority === "P0_CRITICAL" && d.lifecycle === "active" && d.nextActor === "admin"
).map((d) => d.key);

const TOTAL_CATEGORIES = ADMIN_ACTION_QUEUE_REGISTRY.filter(
  (d) => d.lifecycle === "active" && d.nextActor === "admin"
).map((d) => d.key);

export const ADMIN_FINANCE_PENDING_CATEGORIES = [
  "user_charges",
  "cash_charges",
  "coin_withdrawals",
  "settlements_actionable",
] as const satisfies readonly AdminActionQueueCategory[];

export const ADMIN_ADS_PENDING_CATEGORIES = [
  "delivery_ad_ops",
  "feed_ad_requests",
  "trade_promo_pending",
  "platform_popup_pending",
] as const satisfies readonly AdminActionQueueCategory[];

export const ADMIN_METRIC_DEFINITIONS: readonly AdminMetricDefinition[] = [
  // ── 회원 ──
  {
    id: "members.total",
    labelKo: "전체 회원",
    labelEn: "All members",
    shortKo: "회원",
    shortEn: "Members",
    domain: "members",
    source: "aggregate",
    sourceDetail: "admin_dashboard_aggregate_json.totalUsers (profiles)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/users",
  },
  {
    id: "members.active_7d",
    labelKo: "활성 회원 (7일)",
    labelEn: "Active members (7d)",
    shortKo: "활성",
    shortEn: "Active",
    domain: "members",
    source: "members",
    sourceDetail: "profiles.last_login_at ≥ PHT 오늘−6일 00:00",
    periodBasis: "pht",
    period: "7d",
    unit: "count",
    href: "/admin/users?status=active",
  },
  {
    id: "members.new_today",
    labelKo: "오늘 가입",
    labelEn: "Signups today",
    shortKo: "신규",
    shortEn: "New",
    domain: "members",
    source: "aggregate",
    sourceDetail: "admin_dashboard_aggregate_json.newUsersToday (p_today_start = PHT 00:00)",
    periodBasis: "pht",
    period: "today",
    unit: "count",
    href: (p) => `/admin/users?joinedFrom=${p.todayPht}&joinedTo=${p.todayPht}`,
  },
  {
    id: "members.sanctioned",
    labelKo: "제재 중 회원 (정지·영구정지)",
    labelEn: "Sanctioned members",
    domain: "members",
    source: "aggregate",
    sourceDetail: "admin_dashboard_aggregate_json.userSummary.suspended + banned (sanctions 진행 중)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/users?status=suspended",
  },
  {
    id: "members.deletion_requests",
    labelKo: "탈퇴 요청",
    labelEn: "Deletion requests",
    domain: "members",
    source: "members",
    sourceDetail: "account_deletion_requests.status ∈ requested|processing (/api/admin/account-deletion-requests 와 같은 조건)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/users/deletion-requests",
  },
  {
    id: "members.phone_verified",
    labelKo: "휴대폰 인증 회원",
    labelEn: "Phone-verified members",
    domain: "members",
    source: "members",
    sourceDetail: "profiles.phone_verified = true",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/users?verify=verified",
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
    sourceDetail: "admin_action_queue total (active · nextActor=admin, 권한 범위)",
    queueCategories: TOTAL_CATEGORIES,
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin#action-center",
  },
  {
    id: "queue.p0",
    labelKo: "긴급(P0) 대기",
    labelEn: "Critical (P0)",
    domain: "platform",
    source: "queue",
    sourceDetail: `admin_action_queue priority=P0_CRITICAL (${P0_CATEGORIES.join(", ")})`,
    queueCategories: P0_CATEGORIES,
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin#action-center",
  },
  queueMetric("store_applications", "입점 심사 대기", "Store applications"),
  queueMetric("delivery_alerts", "배달 경고", "Delivery alerts"),
  queueMetric("user_charges", "포인트 충전 대기", "Point top-ups pending"),
  queueMetric("cash_charges", "매장 캐시 충전 대기", "Store cash top-ups pending"),
  queueMetric("coin_withdrawals", "코인 출금 대기", "Coin withdrawals pending"),
  queueMetric("settlements_actionable", "수수료 검토 대기", "Commission reviews"),
  queueMetric("partner_pending", "제휴 가입 심사", "Partner reviews"),
  queueMetric("support_actionable", "고객지원 미처리", "Open support cases"),
  {
    id: "finance.pending_total",
    labelKo: "결제·정산 대기",
    labelEn: "Payments pending",
    shortKo: "결제",
    shortEn: "Pay",
    domain: "finance",
    source: "queue",
    sourceDetail: `admin_action_queue Σ ${ADMIN_FINANCE_PENDING_CATEGORIES.join("+")}`,
    queueCategories: ADMIN_FINANCE_PENDING_CATEGORIES,
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/finance#action-required",
  },
  {
    id: "ads.pending_approval",
    labelKo: "광고 승인 대기",
    labelEn: "Ads pending approval",
    domain: "ads",
    source: "queue",
    sourceDetail: `admin_action_queue Σ ${ADMIN_ADS_PENDING_CATEGORIES.join("+")}`,
    queueCategories: ADMIN_ADS_PENDING_CATEGORIES,
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/ad-applications",
  },

  // ── 커뮤니티 (community-metrics.ts 같은 id) ──
  {
    id: "community.posts_active.member",
    labelKo: "커뮤니티 공개 게시글",
    labelEn: "Community posts (public)",
    domain: "community",
    source: "community",
    sourceDetail: "community-metrics community.posts_active.member",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/community/posts?tab=active&origin=member",
  },
  {
    id: "community.posts_hidden",
    labelKo: "커뮤니티 숨김 게시글",
    labelEn: "Community hidden posts",
    domain: "community",
    source: "community",
    sourceDetail: "community-metrics community.posts_hidden",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/community/posts?tab=hidden",
  },
  {
    id: "community.reports_pending",
    labelKo: "커뮤니티 신고 대기",
    labelEn: "Community reports open",
    domain: "community",
    source: "community",
    sourceDetail: "community-metrics community.reports_pending (queue community_reports)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/community/reports?tab=pending",
  },

  // ── 거래 (trade-domain-metrics.ts 같은 id) ──
  {
    id: "trade.posts.selling",
    labelKo: "판매중 거래글",
    labelEn: "Selling",
    domain: "trade",
    source: "trade",
    sourceDetail: "trade-domain-metrics trade.posts.selling (countTradePosts)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/posts-management?tab=selling",
  },
  {
    id: "trade.posts.sold",
    labelKo: "거래완료 거래글",
    labelEn: "Sold",
    domain: "trade",
    source: "trade",
    sourceDetail: "trade-domain-metrics trade.posts.sold (countTradePosts)",
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
    sourceDetail: "trade-domain-metrics trade.posts.admin_hidden (countTradePosts)",
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
    sourceDetail: "trade-domain-metrics trade.reports_open (reports open statuses)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/trade/reports?tab=open",
  },

  // ── 배달 (delivery-metrics.ts 같은 id) ──
  {
    id: "delivery.orders_in_progress",
    labelKo: "진행 중 주문 (7일)",
    labelEn: "Orders in progress (7d)",
    shortKo: "진행",
    shortEn: "Live",
    domain: "delivery",
    source: "delivery",
    sourceDetail: "delivery-metrics delivery.orders_in_progress",
    periodBasis: "pht",
    period: "7d",
    unit: "count",
    href: "/admin/stores/orders?tab=in_progress&period=last_7_days",
  },
  {
    id: "delivery.orders_new_today",
    labelKo: "오늘 주문",
    labelEn: "Orders today",
    shortKo: "오늘",
    shortEn: "Today",
    domain: "delivery",
    source: "delivery",
    sourceDetail: "delivery-metrics delivery.orders_new_today (PHT 오늘)",
    periodBasis: "pht",
    period: "today",
    unit: "count",
    href: "/admin/stores/orders?period=today",
  },
  {
    id: "delivery.orders_completed_today",
    labelKo: "오늘 완료 주문",
    labelEn: "Completed today",
    domain: "delivery",
    source: "orders_today",
    sourceDetail: "store_orders.order_status=completed, created_at ∈ PHT 오늘 (idx created_at)",
    periodBasis: "pht",
    period: "today",
    unit: "count",
    href: "/admin/stores/orders?tab=completed&period=today",
  },
  {
    id: "delivery.orders_cancelled_today",
    labelKo: "오늘 취소 주문",
    labelEn: "Cancelled today",
    domain: "delivery",
    source: "orders_today",
    sourceDetail: "store_orders.order_status ∈ cancel_requested|cancelled, created_at ∈ PHT 오늘",
    periodBasis: "pht",
    period: "today",
    unit: "count",
    href: "/admin/stores/orders?tab=cancel&period=today",
  },
  {
    id: "delivery.stores_by_state.open",
    labelKo: "영업 중 매장",
    labelEn: "Stores open now",
    domain: "delivery",
    source: "delivery",
    sourceDetail: "delivery-metrics delivery.stores_by_state.open (admin business ops KPI)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/business?open=open",
  },

  // ── 채팅·통화 (chat-metrics.ts 같은 id) ──
  {
    id: "chat.rooms.general_direct.active_7d",
    labelKo: "활성 1:1 대화방 (7일)",
    labelEn: "Active 1:1 rooms (7d)",
    domain: "chat",
    source: "chat",
    sourceDetail: "chat-metrics chat.rooms.general_direct.active_7d",
    periodBasis: "pht",
    period: "7d",
    unit: "count",
    href: "/admin/chats/general?domain=general_direct&status=active&activity=7d",
  },
  {
    id: "chat.reports_open.messenger",
    labelKo: "채팅 신고 · 메신저",
    labelEn: "Chat reports · Messenger",
    domain: "chat",
    source: "chat",
    sourceDetail: "chat-metrics chat.reports_open.messenger (queue messenger_actionable)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/chats/reported?status=open&type=messenger",
  },
  {
    id: "chat.reports_open.trade_report",
    labelKo: "채팅 신고 · 거래 채팅방",
    labelEn: "Chat reports · Trade room",
    domain: "chat",
    source: "chat",
    sourceDetail: "chat-metrics chat.reports_open.trade_report",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/chats/reported?status=open&type=trade_report",
  },
  {
    id: "chat.call_failed_24h",
    labelKo: "통화 연결 실패 (24시간)",
    labelEn: "Failed calls (24h)",
    domain: "chat",
    source: "chat",
    sourceDetail: "chat-metrics chat.call_failed_24h",
    periodBasis: "pht",
    period: "24h",
    unit: "count",
    href: "/admin/chats/calls?call_reason=failed&window=24h",
  },

  // ── 결제·정산 ──
  {
    id: "finance.cash_in_today",
    labelKo: "오늘 결제 (캐시 입금)",
    labelEn: "Payments today (cash in)",
    domain: "finance",
    source: "finance_today",
    sourceDetail: "loadFinanceTodaySummary.cashInMinor (business_cash_ledger credit, PHT 오늘)",
    periodBasis: "pht",
    period: "today",
    unit: "php_minor",
    href: "/admin/finance",
  },
  {
    id: "finance.commission_outstanding",
    labelKo: "미납 수수료 잔액",
    labelEn: "Outstanding commission",
    shortKo: "미납",
    shortEn: "Due",
    domain: "finance",
    source: "commission",
    sourceDetail: "store_commission_breakdown(all time, month) Σ fee_outstanding_minor",
    periodBasis: "pht",
    period: "all_time",
    unit: "php_minor",
    href: "/admin/store-settlements",
  },
  {
    id: "finance.commission_7d",
    labelKo: "플랫폼 수수료 (7일)",
    labelEn: "Platform commission (7d)",
    domain: "finance",
    source: "commission",
    sourceDetail: "store_commission_breakdown(PHT 7일, day) Σ net_commission_minor",
    periodBasis: "pht",
    period: "7d",
    unit: "php_minor",
    href: "/admin/store-settlements",
  },

  // ── 광고 ──
  {
    id: "ads.live",
    labelKo: "집행 중 광고",
    labelEn: "Ads running",
    shortKo: "노출",
    shortEn: "Live",
    domain: "ads",
    source: "ads",
    sourceDetail: "loadAdsControlPlane.currentExecution 행 수 (최대 80)",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/advertising",
  },
  {
    id: "ads.popups_active",
    labelKo: "집행 중 팝업",
    labelEn: "Popups running",
    domain: "ads",
    source: "ads",
    sourceDetail: "loadAdsControlPlane.currentExecution domain=popup",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: "/admin/platform-popup",
  },
  {
    id: "ads.collisions_blocking",
    labelKo: "광고 충돌 (차단)",
    labelEn: "Ad collisions (blocking)",
    domain: "ads",
    source: "ads",
    sourceDetail: "loadAdsControlPlane.queues.collisionBlocking",
    periodBasis: "pht",
    period: "now",
    unit: "count",
    href: `${DELIVERY_AD_ADMIN_ROUTES.hub}#action-required`,
  },

  // ── 고객지원·알림 ──
  {
    id: "notifications.sent_today",
    labelKo: "오늘 발송 알림",
    labelEn: "Notifications sent today",
    domain: "support",
    source: "notifications_today",
    sourceDetail: "notification_deliveries.status=sent, created_at ∈ PHT 오늘 (idx status,created_at)",
    periodBasis: "pht",
    period: "today",
    unit: "count",
    href: "/admin/notifications",
  },
  {
    id: "notifications.failed_today",
    labelKo: "오늘 발송 실패",
    labelEn: "Send failures today",
    domain: "support",
    source: "notifications_today",
    sourceDetail: "notification_deliveries.status=failed, created_at ∈ PHT 오늘",
    periodBasis: "pht",
    period: "today",
    unit: "count",
    href: "/admin/notifications",
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

/** 출처가 없어 넣지 않은 지표 (설계 §3 탭 표 대비) — 임의 집계로 채우지 않는다. */
export const ADMIN_DASHBOARD_OMITTED_METRICS: readonly { tab: AdminDashboardTabId; labelKo: string; reason: string }[] = [
  { tab: "ads_ops", labelKo: "광고 환불 실패", reason: "환불 실패가 저장되는 상태·테이블이 없음 (요청 응답 오류로만 존재)" },
  { tab: "ads_ops", labelKo: "진행 중 이벤트", reason: "운영 중 이벤트 집계 출처 없음 — 팝업만 광고 관제 모델에서 읽음" },
  { tab: "support", labelKo: "SLA 초과", reason: "support_cases 에 SLA 기한 열이 없음" },
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
    primaryMetricId: "members.active_7d",
    secondaryMetricId: "members.new_today",
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
    primaryMetricId: "delivery.orders_in_progress",
    secondaryMetricId: "delivery.orders_new_today",
    tab: "delivery",
  },
  {
    id: "finance",
    labelKo: "결제·정산",
    labelEn: "Payments",
    shortKo: "결제",
    shortEn: "Pay",
    primaryMetricId: "finance.pending_total",
    secondaryMetricId: "finance.commission_outstanding",
    tab: "finance",
  },
  {
    id: "ads",
    labelKo: "광고",
    labelEn: "Ads",
    shortKo: "광고",
    shortEn: "Ads",
    primaryMetricId: "ads.live",
    secondaryMetricId: "ads.pending_approval",
    tab: "ads_ops",
  },
  {
    id: "support",
    labelKo: "고객지원",
    labelEn: "Support",
    shortKo: "지원",
    shortEn: "Support",
    primaryMetricId: "queue.support_actionable",
    tab: "support",
  },
];

// ── 추세 ────────────────────────────────────────────────────────────────────

export type AdminDashboardTrendId =
  | "signups_orders_daily"
  | "signups_daily"
  | "reports_daily"
  | "orders_hourly_today"
  | "commission_daily"
  | "ad_spend_daily"
  | "support_cases_daily";

export type AdminDashboardTrendDef = {
  id: AdminDashboardTrendId;
  labelKo: string;
  labelEn: string;
  /** daily = PHT 날짜 버킷, hourly = PHT 오늘 0–23시 */
  bucket: "daily" | "hourly";
  /** 선택 가능한 일수 (첫 값 = 기본) */
  ranges: readonly (7 | 30)[];
  unit: AdminMetricUnit;
  series: readonly { key: string; labelKo: string; labelEn: string; sourceDetail: string }[];
  href: string;
};

export const ADMIN_DASHBOARD_TRENDS: Readonly<Record<AdminDashboardTrendId, AdminDashboardTrendDef>> = {
  signups_orders_daily: {
    id: "signups_orders_daily",
    labelKo: "가입·주문 추이",
    labelEn: "Signups · orders",
    bucket: "daily",
    ranges: [7],
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
    bucket: "daily",
    ranges: [7, 30],
    unit: "count",
    series: [{ key: "signups", labelKo: "가입", labelEn: "Signups", sourceDetail: "profiles.created_at" }],
    href: "/admin/users",
  },
  reports_daily: {
    id: "reports_daily",
    labelKo: "신고 접수 추이",
    labelEn: "Reports received",
    bucket: "daily",
    ranges: [7],
    unit: "count",
    series: [
      { key: "trade", labelKo: "거래", labelEn: "Trade", sourceDetail: "reports.created_at" },
      { key: "community", labelKo: "커뮤니티", labelEn: "Community", sourceDetail: "community_reports.created_at" },
    ],
    href: "/admin/reports",
  },
  orders_hourly_today: {
    id: "orders_hourly_today",
    labelKo: "오늘 시간대별 주문 (PHT)",
    labelEn: "Orders by hour today (PHT)",
    bucket: "hourly",
    ranges: [7],
    unit: "count",
    series: [{ key: "orders", labelKo: "주문", labelEn: "Orders", sourceDetail: "store_orders.created_at ∈ PHT 오늘" }],
    href: "/admin/stores/orders?period=today",
  },
  commission_daily: {
    id: "commission_daily",
    labelKo: "일별 플랫폼 수수료",
    labelEn: "Daily commission",
    bucket: "daily",
    ranges: [7, 30],
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
    bucket: "daily",
    ranges: [7],
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
    bucket: "daily",
    ranges: [7],
    unit: "count",
    series: [{ key: "cases", labelKo: "접수", labelEn: "Cases", sourceDetail: "support_cases.created_at" }],
    href: "/admin/support",
  },
};

// ── 탭 정의 (v3 §6.2) ──────────────────────────────────────────────────────

export type AdminDashboardShortcut = { id: string; labelKo: string; labelEn: string; href: string };

export type AdminDashboardDomainCardDef = {
  domain: "community" | "trade" | "delivery" | "chat";
  labelKo: string;
  labelEn: string;
  href: string;
  kpiMetricIds: readonly [string, string];
};

export type AdminDashboardTabDef = {
  id: AdminDashboardTabId;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
  /** 지표 칸 (최대 6, 3×2) */
  metricIds: readonly string[];
  /** 전체 현황 전용 — 도메인 상태 카드 4 */
  domainCards?: readonly AdminDashboardDomainCardDef[];
  trend: AdminDashboardTrendId;
  shortcuts: readonly AdminDashboardShortcut[];
  /** 오른쪽 처리 대기 — 카테고리 목록, 또는 전체 P0/P1 상위 10 */
  pending: { kind: "categories"; categories: readonly AdminActionQueueCategory[] } | { kind: "top_p0_p1"; limit: number };
};

export const ADMIN_DASHBOARD_DOMAIN_CARDS: readonly AdminDashboardDomainCardDef[] = [
  {
    domain: "community",
    labelKo: "커뮤니티",
    labelEn: "Community",
    href: "/admin/community",
    kpiMetricIds: ["community.posts_active.member", "community.posts_hidden"],
  },
  { domain: "trade", labelKo: "거래", labelEn: "Trade", href: "/admin/trade", kpiMetricIds: ["trade.posts.selling", "trade.posts.sold"] },
  {
    domain: "delivery",
    labelKo: "배달",
    labelEn: "Delivery",
    href: "/admin/delivery",
    kpiMetricIds: ["delivery.orders_in_progress", "delivery.orders_new_today"],
  },
  {
    domain: "chat",
    labelKo: "채팅",
    labelEn: "Chat",
    href: "/admin/messenger",
    kpiMetricIds: ["chat.rooms.general_direct.active_7d", "chat.reports_open.messenger"],
  },
];

export const ADMIN_DASHBOARD_TABS: readonly AdminDashboardTabDef[] = [
  {
    id: "overview",
    labelKo: "전체 현황",
    labelEn: "Overview",
    shortKo: "전체",
    shortEn: "All",
    metricIds: ["members.new_today", "delivery.orders_new_today", "finance.cash_in_today"],
    domainCards: ADMIN_DASHBOARD_DOMAIN_CARDS,
    trend: "signups_orders_daily",
    shortcuts: [
      { id: "community", labelKo: "커뮤니티 현황", labelEn: "Community", href: "/admin/community" },
      { id: "trade", labelKo: "거래 현황", labelEn: "Trade", href: "/admin/trade" },
      { id: "delivery", labelKo: "배달 현황", labelEn: "Delivery", href: "/admin/delivery" },
      { id: "messenger", labelKo: "채팅 현황", labelEn: "Chat", href: "/admin/messenger" },
      { id: "finance", labelKo: "재무 현황", labelEn: "Finance", href: "/admin/finance#action-required" },
      { id: "support", labelKo: "고객지원", labelEn: "Support", href: "/admin/support?filter=ACTIONABLE#action-required" },
    ],
    pending: { kind: "top_p0_p1", limit: 10 },
  },
  {
    id: "members",
    labelKo: "회원·고객",
    labelEn: "Members",
    shortKo: "회원",
    shortEn: "Members",
    metricIds: [
      "members.total",
      "members.active_7d",
      "members.new_today",
      "members.sanctioned",
      "members.deletion_requests",
      "members.phone_verified",
    ],
    trend: "signups_daily",
    shortcuts: [
      { id: "users", labelKo: "회원 목록", labelEn: "Members", href: "/admin/users" },
      { id: "deletion", labelKo: "탈퇴 요청", labelEn: "Deletion requests", href: "/admin/users/deletion-requests" },
      { id: "phone", labelKo: "휴대폰 인증", labelEn: "Phone verification", href: "/admin/users/phone-verification" },
      { id: "sanctions", labelKo: "제재 회원", labelEn: "Sanctioned", href: "/admin/users?status=suspended" },
      { id: "support", labelKo: "고객 문의", labelEn: "Inquiries", href: "/admin/support?filter=ACTIONABLE#action-required" },
    ],
    pending: { kind: "categories", categories: ["support_actionable", "member_inquiry_open"] },
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
      "community.reports_pending",
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
      "delivery.orders_in_progress",
      "delivery.orders_completed_today",
      "delivery.orders_cancelled_today",
      "delivery.stores_by_state.open",
      "queue.store_applications",
      "queue.delivery_alerts",
    ],
    trend: "orders_hourly_today",
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
      "queue.user_charges",
      "queue.cash_charges",
      "queue.coin_withdrawals",
      "finance.commission_outstanding",
      "finance.commission_7d",
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
    metricIds: ["ads.live", "ads.pending_approval", "ads.popups_active", "ads.collisions_blocking", "queue.partner_pending"],
    trend: "ad_spend_daily",
    shortcuts: [
      { id: "workspace", labelKo: "광고 운영", labelEn: "Advertising", href: "/admin/advertising" },
      { id: "applications", labelKo: "광고 신청 심사", labelEn: "Ad applications", href: "/admin/ad-applications" },
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
    labelEn: "Support · Alerts",
    shortKo: "지원·알림",
    shortEn: "Support",
    metricIds: [
      "queue.support_actionable",
      "notifications.sent_today",
      "notifications.failed_today",
      "chat.reports_open.messenger",
      "chat.reports_open.trade_report",
      "chat.call_failed_24h",
    ],
    trend: "support_cases_daily",
    shortcuts: [
      { id: "support", labelKo: "고객지원", labelEn: "Support", href: "/admin/support?filter=ACTIONABLE#action-required" },
      { id: "notifications", labelKo: "알림 발송", labelEn: "Notifications", href: "/admin/notifications" },
      { id: "chat_reports", labelKo: "채팅 신고", labelEn: "Chat reports", href: "/admin/chats/reported?status=open" },
      { id: "calls", labelKo: "통화 기록", labelEn: "Calls", href: "/admin/chats/calls" },
      { id: "push", labelKo: "푸시 기기", labelEn: "Push devices", href: "/admin/push-devices" },
    ],
    pending: {
      kind: "categories",
      categories: ["support_actionable", "member_inquiry_open", "platform_inquiry_open", "messenger_actionable"],
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
