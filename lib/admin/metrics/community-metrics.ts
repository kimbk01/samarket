/**
 * 커뮤니티 지표 정의 (설계 §D) — 지표 id 단일 정의. `delivery-metrics.ts` 와 같은 모양.
 *
 * - 커뮤니티 대시보드(`/admin/community`)·운영 통계·Action Center 커뮤니티 카드가 **같은 정의**를 읽는다.
 * - 값을 확인할 수 없으면 `null` → 화면은 「확인 불가」 (0 표시 금지).
 * - 처리 대기(action)·위험(risk)·현재 상태(state)는 기간 무관 현재 시점, 기간 통계(period)는 선택 기간(마닐라).
 * - 모든 지표는 처리 화면(`href` + 그 화면이 읽는 URL 필터 — `COMMUNITY_ADMIN_PAGE_FILTERS`)으로 이동한다.
 *
 * 클라이언트 안전 — 서버 전용 모듈 import 금지.
 */
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import {
  getAdminActionQueueCategoryDef,
  type AdminActionQueueCategory,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import {
  COMMUNITY_ADMIN_AREA_PERMISSIONS,
  communityAreaAllowed,
  type CommunityAdminArea,
} from "@/lib/admin/community-admin/community-admin-permissions";

export type CommunityMetricSection = "action" | "risk" | "state" | "period";

export type CommunityMetricSource =
  /** 처리 대기 레지스트리(Bell 과 같은 집계) */
  | { kind: "queue"; categories: readonly AdminActionQueueCategory[] }
  /** 서버 로더 직접 집계 (head count) */
  | { kind: "direct"; description: string }
  /** 기간 통계 RPC `admin_community_period_stats` 결과의 경로 (예: "posts.total") */
  | { kind: "period_stats"; path: string };

export type CommunityMetricDefinition = {
  id: string;
  /** 화면 i18n 키 (`admin_community_metric.*`) — 라벨 문자열은 아래 Ko/En 이 기본값 */
  labelKey: string;
  labelKo: string;
  labelEn: string;
  section: CommunityMetricSection;
  source: CommunityMetricSource;
  /** 권한 영역 (community-admin-permissions) — 영역 밖이면 숨김 */
  area: CommunityAdminArea;
  /** 처리 화면 + 그 화면이 읽는 URL 필터. period 지표는 로더가 `period/from/to` 를 붙인다. */
  href: string;
  /** 0 이어도 표시할지 (처리 대기 카드는 0 이면 숨김) */
  showWhenZero: boolean;
};

/**
 * 지표 링크 대상 화면이 읽는 URL 필터 (화면 구현 계약). key = 경로, value = 쿼리 키 → 허용 값(null = 자유 값).
 * 화면은 이 키를 읽어 같은 조건으로 목록을 보여야 한다 (테스트로 지표 href ⊂ 이 계약을 고정).
 */
export const COMMUNITY_ADMIN_PAGE_FILTERS: Readonly<Record<string, Readonly<Record<string, readonly string[] | null>>>> = {
  "/admin/community/reports": {
    tab: ["pending", "reviewing", "resolved", "dismissed", "all"],
    stale: ["24h"],
    type: ["post", "comment", "user", "meeting"],
    reportId: null,
    period: null,
    from: null,
    to: null,
  },
  "/admin/philife/meeting-reports": { status: ["pending", "reviewing", "resolved", "dismissed", "all"] },
  "/admin/community/point-charges": { status: ["pending", "approved", "rejected", "all"] },
  "/admin/community/support": { status: ["waiting", "all"], type: ["appeal"] },
  "/admin/community/meetings": { status: ["pending", "open", "closed", "rejected", "all"] },
  "/admin/community/external-import": { tab: ["jobs", "inbox", "sources", "rules"], status: ["failed"] },
  "/admin/community/posts": {
    tab: ["active", "hidden", "deleted", "reported"],
    origin: ["member", "imported"],
    period: null,
    from: null,
    to: null,
  },
  "/admin/community/comments": { tab: ["active", "hidden", "deleted"], commentId: null, period: null, from: null, to: null },
  "/admin/community/restrictions": { tab: ["active", "expired", "revoked"], sanctionId: null },
  "/admin/community/members": { account: ["suspended", "active"], restricted: ["1"], q: null, sort: null },
  "/admin/community/promotions": { tab: ["active", "paused", "ended", "rejected"] },
  "/admin/community/stats": { period: ["today", "7d", "30d", "custom"], from: null, to: null },
  "/admin/community/audit": { period: null, from: null, to: null, targetType: null, actor: null },
  "/admin/community/points": { period: null, from: null, to: null, type: null, userId: null },
};

function queueMetric(
  id: string,
  labelKo: string,
  labelEn: string,
  category: AdminActionQueueCategory,
  area: CommunityAdminArea,
  href: string
): CommunityMetricDefinition {
  // 레지스트리 정의가 있어야 한다 (오타 방지)
  getAdminActionQueueCategoryDef(category);
  return {
    id,
    labelKey: `admin_community_metric.${id.replace(/^community\./, "")}`,
    labelKo,
    labelEn,
    section: "action",
    source: { kind: "queue", categories: [category] },
    area,
    href,
    showWhenZero: false,
  };
}

function direct(
  id: string,
  labelKo: string,
  labelEn: string,
  section: CommunityMetricSection,
  area: CommunityAdminArea,
  href: string,
  description: string,
  showWhenZero = section === "state"
): CommunityMetricDefinition {
  return {
    id,
    labelKey: `admin_community_metric.${id.replace(/^community\./, "")}`,
    labelKo,
    labelEn,
    section,
    source: { kind: "direct", description },
    area,
    href,
    showWhenZero,
  };
}

function period(id: string, labelKo: string, labelEn: string, path: string, href: string): CommunityMetricDefinition {
  return {
    id,
    labelKey: `admin_community_metric.${id.replace(/^community\./, "")}`,
    labelKo,
    labelEn,
    section: "period",
    source: { kind: "period_stats", path },
    area: "read",
    href,
    showWhenZero: true,
  };
}

const STATS = "/admin/community/stats";

export const COMMUNITY_METRIC_DEFINITIONS: readonly CommunityMetricDefinition[] = [
  // ── D-2 처리 대기 (현재 시점) ───────────────────────────────────────────
  queueMetric("community.reports_pending", "신고 처리 대기", "Reports pending", "community_reports", "moderation", "/admin/community/reports?tab=pending"),
  queueMetric(
    "community.meeting_reports_pending",
    "모임 신고 대기",
    "Meeting reports pending",
    "meeting_reports",
    "moderation",
    "/admin/philife/meeting-reports?status=pending"
  ),
  queueMetric(
    "community.point_charges_pending",
    "충전 승인 대기",
    "Point top-ups pending",
    "user_charges",
    "points",
    "/admin/community/point-charges?status=pending"
  ),
  direct(
    "community.support_waiting",
    "커뮤니티 문의 대기",
    "Community inquiries waiting",
    "action",
    "content",
    "/admin/community/support?status=waiting",
    "support_cases OPEN|WAITING_ADMIN ∩ community scope (support-community-filter)"
  ),
  direct(
    "community.appeals_waiting",
    "이의신청 대기",
    "Appeals waiting",
    "action",
    "moderation",
    "/admin/community/support?status=waiting&type=appeal",
    "support_cases OPEN|WAITING_ADMIN ∩ appeal (support-community-filter)"
  ),
  direct(
    "community.meetings_pending_approval",
    "모임 승인 대기",
    "Meetings pending approval",
    "action",
    "content",
    "/admin/community/meetings?status=pending",
    "meetings.platform_approval_status=pending_approval"
  ),
  direct(
    "community.import_failures_7d",
    "외부 수집 실패 (최근 7일)",
    "Import failures (last 7 days)",
    "action",
    "content",
    "/admin/community/external-import?tab=jobs&status=failed",
    "community_import_jobs status=failed or failed_count>0, created ∈ last 7 Manila days"
  ),

  // ── 위험 ────────────────────────────────────────────────────────────────
  direct(
    "community.reports_stale_24h",
    "24시간 넘은 신고",
    "Reports older than 24h",
    "risk",
    "moderation",
    "/admin/community/reports?tab=pending&stale=24h",
    "community_reports open|reviewing, created_at < now-24h"
  ),

  // ── D-3 현재 상태 ───────────────────────────────────────────────────────
  direct(
    "community.posts_active.member",
    "공개 게시글 · 회원 작성",
    "Public posts · members",
    "state",
    "content",
    "/admin/community/posts?tab=active&origin=member",
    "community_posts status=active, origin_kind=member"
  ),
  direct(
    "community.posts_active.imported",
    "공개 게시글 · 외부 수집",
    "Public posts · imported",
    "state",
    "content",
    "/admin/community/posts?tab=active&origin=imported",
    "community_posts status=active, origin_kind=imported"
  ),
  direct("community.posts_hidden", "관리자 숨김 게시글", "Hidden posts", "state", "content", "/admin/community/posts?tab=hidden", "community_posts status=hidden"),
  direct(
    "community.comments_hidden",
    "관리자 숨김 댓글",
    "Hidden comments",
    "state",
    "content",
    "/admin/community/comments?tab=hidden",
    "community_comments status=hidden"
  ),
  direct("community.posts_deleted", "삭제된 게시글", "Deleted posts", "state", "content", "/admin/community/posts?tab=deleted", "community_posts status=deleted"),
  direct(
    "community.comments_deleted",
    "삭제된 댓글",
    "Deleted comments",
    "state",
    "content",
    "/admin/community/comments?tab=deleted",
    "community_comments status=deleted"
  ),
  direct(
    "community.restrictions_active",
    "활동 제한 중 회원",
    "Members under restriction",
    "state",
    "moderation",
    "/admin/community/restrictions?tab=active",
    "sanctions scope=community, community_restriction, not revoked, end_at null or > now"
  ),
  direct(
    "community.suspended_authors",
    "계정 정지 중 작성자",
    "Suspended authors",
    "state",
    "moderation",
    "/admin/community/members?account=suspended",
    "admin_community_members(p_account=suspended).total"
  ),
  direct(
    "community.promotions_running",
    "노출 중 홍보",
    "Running promotions",
    "state",
    "promotion",
    "/admin/community/promotions?tab=active",
    "point_promotion_orders domain=community, order_status=active"
  ),

  // ── D-4 기간 통계 (선택 기간 · 마닐라) ─────────────────────────────────────
  period("community.period.posts_total", "신규 게시글", "New posts", "posts.total", STATS),
  period("community.period.posts_member", "신규 게시글 · 회원", "New posts · members", "posts.member", STATS),
  period("community.period.posts_imported", "신규 게시글 · 외부 수집", "New posts · imported", "posts.imported", STATS),
  period("community.period.posts_active_now", "신규 게시글 중 현재 공개", "New posts still public", "posts.active_now", STATS),
  period("community.period.comments", "신규 댓글", "New comments", "comments.top_level", STATS),
  period("community.period.replies", "신규 답글", "New replies", "comments.replies", STATS),
  period("community.period.active_authors", "활성 작성자", "Active authors", "authors.active", STATS),
  period("community.period.new_authors", "신규 작성자", "New authors", "authors.new", STATS),
  period("community.period.reports_received", "신고 접수", "Reports received", "reports.received", STATS),
  period("community.period.reports_processed", "신고 처리", "Reports processed", "reports.processed", STATS),
  period("community.period.admin_actions", "관리자 조치", "Admin actions", "admin_actions.total", "/admin/community/audit"),
  period("community.period.charges_approved", "충전 승인", "Top-ups approved", "charges.approved_count", STATS),
  period("community.period.charges_rejected", "충전 반려", "Top-ups rejected", "charges.rejected_count", STATS),
  period("community.period.promotions_new", "신규 홍보", "New promotions", "promotions.new_count", STATS),
  period("community.period.promotions_ended", "종료된 홍보", "Promotions ended", "promotions.ended_count", STATS),
];

export type CommunityMetricId = (typeof COMMUNITY_METRIC_DEFINITIONS)[number]["id"];

export const COMMUNITY_METRIC_BY_ID: ReadonlyMap<string, CommunityMetricDefinition> = new Map(
  COMMUNITY_METRIC_DEFINITIONS.map((d) => [d.id, d])
);

export function getCommunityMetricDefinition(id: string): CommunityMetricDefinition {
  const d = COMMUNITY_METRIC_BY_ID.get(id);
  if (!d) throw new Error(`unknown_community_metric:${id}`);
  return d;
}

/** 권한 키 (영역 → 기존 권한 키 중 하나) — 표시용 */
export function communityMetricPermissions(def: CommunityMetricDefinition): readonly AdminPermissionKey[] {
  return COMMUNITY_ADMIN_AREA_PERMISSIONS[def.area];
}

export type CommunityMetricValue = {
  id: string;
  section: CommunityMetricSection;
  labelKey: string;
  labelKo: string;
  labelEn: string;
  /** null = 확인 불가 (0 아님) */
  value: number | null;
  href: string;
  /** 권한 범위 밖 — 표시하지 않는다 */
  forbidden: boolean;
  showWhenZero: boolean;
};

export type CommunityMetricScope = {
  isSuperAdmin: boolean;
  permissions: readonly AdminPermissionKey[];
} | null;

function base(def: CommunityMetricDefinition, value: number | null, href: string, forbidden: boolean): CommunityMetricValue {
  return {
    id: def.id,
    section: def.section,
    labelKey: def.labelKey,
    labelKo: def.labelKo,
    labelEn: def.labelEn,
    value: forbidden ? null : value,
    href,
    forbidden,
    showWhenZero: def.showWhenZero,
  };
}

export function isCommunityMetricForbidden(def: CommunityMetricDefinition, scope: CommunityMetricScope): boolean {
  if (!scope) return false;
  return !communityAreaAllowed(scope.permissions, def.area, scope.isSuperAdmin);
}

/** 처리 대기 레지스트리 결과 → 값. ok 가 아니면 null. */
export function resolveCommunityQueueMetric(
  def: CommunityMetricDefinition,
  categories: readonly AdminActionQueueCategoryResult[] | null | undefined,
  scope: CommunityMetricScope = null
): CommunityMetricValue {
  if (def.source.kind !== "queue") return base(def, null, def.href, false);
  let forbidden = isCommunityMetricForbidden(def, scope);
  const list = categories ?? [];
  let sum = 0;
  let unavailable = list.length === 0;
  for (const key of def.source.categories) {
    const hit = list.find((c) => c.key === key);
    if (!hit) {
      unavailable = true;
      continue;
    }
    if (hit.status === "forbidden") {
      forbidden = true;
      continue;
    }
    if (hit.status !== "ok" || hit.count == null || !Number.isFinite(hit.count)) {
      unavailable = true;
      continue;
    }
    sum += hit.count;
  }
  return base(def, unavailable ? null : sum, def.href, forbidden);
}

/** 직접 집계 값 → 지표 값. 숫자가 아니면 null. */
export function resolveCommunityDirectMetric(
  def: CommunityMetricDefinition,
  raw: number | null | undefined,
  scope: CommunityMetricScope = null
): CommunityMetricValue {
  const ok = typeof raw === "number" && Number.isFinite(raw) && raw >= 0;
  return base(def, ok ? Math.floor(raw as number) : null, def.href, isCommunityMetricForbidden(def, scope));
}

/** 기간 통계 JSON 에서 경로 값 → 숫자 또는 null */
export function readCommunityStatsPath(stats: unknown, path: string): number | null {
  let cur: unknown = stats;
  for (const k of path.split(".")) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[k];
  }
  const n = typeof cur === "string" ? Number(cur) : cur;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** 기간 지표 링크 — 대시보드 선택 기간을 그대로 넘긴다 */
export function communityPeriodMetricHref(
  href: string,
  range: { period: string; from: string | null; to: string | null }
): string {
  const [path, qs] = href.split("?");
  const sp = new URLSearchParams(qs ?? "");
  sp.set("period", range.period);
  if (range.period === "custom") {
    if (range.from) sp.set("from", range.from);
    if (range.to) sp.set("to", range.to);
  }
  return `${path}?${sp.toString()}`;
}

export function resolveCommunityPeriodMetric(
  def: CommunityMetricDefinition,
  stats: unknown,
  range: { period: string; from: string | null; to: string | null },
  scope: CommunityMetricScope = null
): CommunityMetricValue {
  const value = def.source.kind === "period_stats" && stats ? readCommunityStatsPath(stats, def.source.path) : null;
  return base(def, value, communityPeriodMetricHref(def.href, range), isCommunityMetricForbidden(def, scope));
}

/** 전체 관제 Action Center 커뮤니티 카드 구성 지표 */
export const COMMUNITY_ACTION_CENTER_CARD_METRIC_IDS = [
  "community.reports_pending",
  "community.meeting_reports_pending",
  "community.reports_stale_24h",
] as const;

export const COMMUNITY_DASHBOARD_HREF = "/admin/community" as const;
