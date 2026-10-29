/**
 * Admin 단일 접근표 (설계 v4 §4-3) — 경로 → 화면을 여는 데 필요한 권한.
 *
 * 이 표는 **현재 서버가 실제로 강제하는 권한**을 그대로 옮긴 것이다 (새 제한을 만들지 않는다):
 * - 화면 요구 권한(`requirement`) = 그 화면이 처음 불러오는 조회 API(GET)의 가드.
 *   조회는 전원·쓰기는 권한 키인 화면은 `any_admin` + `action`(쓰기 가드)로 적는다.
 * - 내부 운영 도구(ops-*·qa-board 등) = super_admin (F0 — API `requireSuperAdmin` + 페이지 `SuperAdminOnlyPageGate`).
 * - 거래 = 활성 관리자 전원(O-2, `requireTradeAdmin`) · 커뮤니티 = 영역별 키(`requireCommunityAdmin(area)`) ·
 *   채팅 = `chats` 키, 단 거래 채팅은 전원(`requireTradeChatAdmin`)·배달 주문 채팅은 `chats|business`.
 * - 정지된 관리자 계정 차단(거래·거래 채팅·커뮤니티 홍보)은 서버 가드와 같은 규칙으로 표에도 반영한다
 *   (`accountSuspended` = `/api/admin/me` · 최고관리자 제외). 최종 판정은 서버 가드.
 *
 * 규칙은 위에서부터 첫 일치가 이긴다(구체적인 경로를 먼저). 접두사 일치는 경로 조각 경계 기준
 * (`/admin/ops-knowledge` 는 `/admin/ops-knowledge-graph` 와 일치하지 않음). `query` 가 있으면 쿼리 값도 같아야 한다.
 * 표에 없는 경로는 `matched: false` + any_admin (사이드바 메뉴 leaf 는 전부 표에 있어야 한다 — 테스트가 강제).
 *
 * 사용처(F2 에서 연결): 사이드바·바로가기 숨김 / `app/admin/layout` 접근 거부 패널 / API 가드 계약 테스트.
 * Client-safe (서버 모듈 import 없음).
 */

import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { isPrivilegedAdminRole, normalizeAdminRole } from "@/lib/auth/admin-policy";
import {
  communityAreaAllowed,
  type CommunityAdminArea,
} from "@/lib/admin/community-admin/community-admin-permissions";

export type AdminChatAccessScope =
  /** 전체·일반·그룹·통화·신고·성능 — `requireChatAdmin` (`chats`) */
  | "chats"
  /** 거래 채팅 — `requireTradeChatAdmin` (활성 관리자 전원, O-2) */
  | "trade"
  /** 배달 주문 채팅 — `chats` 또는 `business` */
  | "store_order";

export type AdminRouteRequirement =
  | { kind: "any_admin" }
  | { kind: "permission"; key: AdminPermissionKey }
  | { kind: "super_admin" }
  | { kind: "deploy_owner" }
  | { kind: "domain"; guard: "trade" }
  | { kind: "domain"; guard: "community"; area: CommunityAdminArea }
  | { kind: "domain"; guard: "chat"; scope: AdminChatAccessScope };

export type AdminRouteAccessRule = {
  /** `/admin/...` (쿼리·해시 없음) */
  path: string;
  /** true 면 경로가 정확히 같을 때만 */
  exact?: boolean;
  /** 지정한 쿼리 값이 모두 같을 때만 */
  query?: Readonly<Record<string, string>>;
  requirement: AdminRouteRequirement;
  /** 화면 안 쓰기 작업의 가드가 화면 요구 권한보다 강할 때 (버튼 노출 판단용) */
  action?: AdminRouteRequirement;
};

export type AdminRouteAccessActor = {
  /** 유효 관리자 역할 (`super_admin`·`master`·`admin` …) */
  role: string | null | undefined;
  permissions: readonly string[];
  /** `DIBAY_DEPLOY_OWNER_IDS` 판정 결과 (서버가 넘김) */
  isDeployOwner?: boolean;
  /** 정지된 운영자 (서버 `/api/admin/me.accountSuspended`) — 거래·거래 채팅·커뮤니티 홍보 불가 (`requireTradeAdmin`·`requireTradeChatAdmin`·`requireCommunityAdmin("promotion")` 과 같은 규칙) */
  accountSuspended?: boolean;
};

const ANY: AdminRouteRequirement = { kind: "any_admin" };
const SUPER: AdminRouteRequirement = { kind: "super_admin" };
const TRADE: AdminRouteRequirement = { kind: "domain", guard: "trade" };
const perm = (key: AdminPermissionKey): AdminRouteRequirement => ({ kind: "permission", key });
const community = (area: CommunityAdminArea): AdminRouteRequirement => ({ kind: "domain", guard: "community", area });
const chat = (scope: AdminChatAccessScope): AdminRouteRequirement => ({ kind: "domain", guard: "chat", scope });

/** 내부 운영 도구 (F0: API `requireSuperAdmin` · 세그먼트 `layout.tsx` 의 `SuperAdminOnlyPageGate`). */
export const ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS = [
  "/admin/ops-benchmarks",
  "/admin/ops-board",
  "/admin/ops-docs",
  "/admin/ops-knowledge",
  "/admin/ops-knowledge-graph",
  "/admin/ops-learning",
  "/admin/ops-maturity",
  "/admin/ops-routines",
  "/admin/ops-runbooks",
  "/admin/qa-board",
  "/admin/product-backlog",
  "/admin/dev-sprints",
  "/admin/release-notes",
  "/admin/release-archive",
  "/admin/production-migration",
  "/admin/backup",
  "/admin/dr",
  "/admin/automation",
  "/admin/launch-readiness",
  "/admin/launch-week",
  "/admin/security",
  "/admin/performance",
  "/admin/usage",
] as const;

/** 활성 관리자 전원 — 조회 API 가 `requireAdminApiUser`·`isRouteAdmin`·`requireAdminApiActor` 인 화면. */
const ANY_ADMIN_PREFIXES = [
  "/admin/ad-applications",
  "/admin/advertising",
  "/admin/app",
  "/admin/audit-logs",
  "/admin/business",
  "/admin/categories",
  "/admin/customer-platform",
  "/admin/delivery",
  "/admin/delivery-ads",
  "/admin/delivery-alerts",
  "/admin/delivery-auto-actions",
  "/admin/delivery-distance",
  "/admin/delivery-operations",
  "/admin/delivery-riders",
  /** 5-F 배달 화면 구성 허브 — 조회 = 홈 선반·업종 정책·광고 현황 GET (isRouteAdmin·requireAdminApiUser) */
  "/admin/delivery-screens",
  "/admin/docs",
  "/admin/feed-ad-products",
  "/admin/feed-ads",
  "/admin/inbox",
  "/admin/memo",
  "/admin/menus",
  "/admin/messenger",
  "/admin/my",
  "/admin/notifications",
  "/admin/ops-console",
  "/admin/order-notifications",
  "/admin/platform-event-owner-requests",
  "/admin/platform-events",
  "/admin/platform-popup",
  "/admin/platform-promotion",
  "/admin/promoted-items",
  "/admin/ptr-reveal-ads",
  "/admin/recommendation-analytics",
  "/admin/recommendation-automation",
  "/admin/recommendation-deployments",
  "/admin/recommendation-experiments",
  "/admin/recommendation-monitoring",
  "/admin/recommendation-reports",
  "/admin/store-coupon-control",
  "/admin/store-discovery",
  "/admin/store-inquiries",
  "/admin/store-payment-events",
  "/admin/store-products",
  "/admin/store-reports",
  "/admin/store-reviews",
  "/admin/stores",
  "/admin/stores-category-policy",
  "/admin/stores-home-shelves",
  "/admin/support",
] as const;

export const ADMIN_ROUTE_ACCESS_RULES: readonly AdminRouteAccessRule[] = [
  { path: "/admin", exact: true, requirement: ANY },

  // ── 플랫폼 시스템 · 내부 도구
  ...ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS.map((path): AdminRouteAccessRule => ({ path, requirement: SUPER })),
  { path: "/admin/system/data-reset", requirement: SUPER },
  // 조회(`deploy/status`)는 super_admin, 배포 작업은 배포 담당자만 (설계 §4-2 #3).
  { path: "/admin/system/deploy", requirement: SUPER, action: { kind: "deploy_owner" } },
  { path: "/admin/system", requirement: ANY },
  { path: "/admin/feed-emergency", requirement: ANY, action: SUPER },
  { path: "/admin/runtime-health", requirement: ANY, action: SUPER },
  { path: "/admin/delivery-release-gate", requirement: ANY, action: SUPER },
  { path: "/admin/store-fee-policies", requirement: ANY, action: SUPER },

  // ── 회원 · 신고 · 설정
  // 휴대폰 인증 운영 — 조회·갱신 API `users/phone-verification/ops*` = requireAdminPermission("settings")
  { path: "/admin/users/phone-verification", requirement: perm("settings") },
  { path: "/admin/users", requirement: perm("users") },
  { path: "/admin/push-devices", requirement: perm("users") },
  // 관리자 계정·권한 (F3) — 조회 `staff/memberships` · 변경 `staff`·`users/[id]/privilege` 모두 requireSuperAdmin
  { path: "/admin/staff", requirement: SUPER },
  // 제재 기록 — 회원·권한 워크스페이스 화면 = 회원 키 `users` (설계 v4 §4 권한 표). 조회 API 도 같은 키.
  { path: "/admin/reports/log", requirement: perm("users") },
  { path: "/admin/reports", requirement: perm("reports") },
  { path: "/admin/settings/auth", requirement: perm("settings") },
  { path: "/admin/settings", requirement: ANY },
  { path: "/admin/app/legal", requirement: ANY, action: perm("settings") },
  { path: "/admin/commerce-settings", requirement: ANY, action: perm("business") },

  // ── 포인트 (point 키)
  { path: "/admin/point-charges", requirement: perm("point") },
  { path: "/admin/point-executions", requirement: perm("point") },
  { path: "/admin/point-plans", requirement: perm("point") },
  { path: "/admin/point-policies", requirement: perm("point") },
  { path: "/admin/points", requirement: perm("point") },

  // ── 정산·재무 (business 키)
  { path: "/admin/finance", requirement: perm("business") },
  { path: "/admin/gift-certificates", requirement: perm("business") },
  { path: "/admin/store-settlements", requirement: perm("business") },
  // v4 W1 API-07 — 배달 주문 관리(목록·상세·이력·내보내기 = 구매자 연락처·주소 PII) 조회 API = business 키.
  { path: "/admin/store-orders", requirement: perm("business") },
  { path: "/admin/stores/orders", requirement: perm("business") },

  // ── 거래 (O-2: 활성 관리자 전원)
  { path: "/admin/trade/support", requirement: ANY },
  // 거래 포인트 충전 = 커뮤니티와 같은 화면·같은 조회 API(`/api/admin/point-charges` = point 키) — 거래 전원이 아니다
  { path: "/admin/trade/point-charges", requirement: perm("point") },
  { path: "/admin/trade", requirement: TRADE },
  { path: "/admin/trade-ad-policies", requirement: TRADE },
  { path: "/admin/trade-flow", requirement: TRADE },
  { path: "/admin/posts-management", requirement: TRADE },
  { path: "/admin/reviews", requirement: TRADE },

  // ── 커뮤니티 (영역별 키)
  { path: "/admin/community", exact: true, requirement: ANY },
  { path: "/admin/community/support", requirement: ANY },
  { path: "/admin/community/point-charges", requirement: perm("point") },
  { path: "/admin/community/point-policies", requirement: perm("point") },
  { path: "/admin/community/reports", requirement: community("moderation") },
  { path: "/admin/community/audit", requirement: community("read") },
  { path: "/admin/community/members", requirement: community("read") },
  { path: "/admin/community/restrictions", requirement: community("read"), action: community("moderation") },
  { path: "/admin/community/stats", requirement: community("read") },
  { path: "/admin/community/promotions", requirement: community("read"), action: community("promotion") },
  { path: "/admin/community/points", requirement: community("read"), action: perm("point") },
  { path: "/admin/community", requirement: community("content") },
  { path: "/admin/philife/meeting-reports", requirement: ANY, action: community("moderation") },
  { path: "/admin/philife", requirement: ANY },

  // ── 채팅
  { path: "/admin/chats", exact: true, query: { type: "trade" }, requirement: chat("trade") },
  { path: "/admin/chats", exact: true, query: { type: "store_order" }, requirement: chat("store_order") },
  { path: "/admin/chats/reported", query: { domain: "trade" }, requirement: chat("trade") },
  { path: "/admin/chats/trade", requirement: chat("trade") },
  { path: "/admin/chats/trade-legacy", requirement: chat("trade") },
  // 거래 흐름 완료 패널로 이동만 하는 화면
  { path: "/admin/chats/trade-complete", requirement: TRADE },
  { path: "/admin/chats/business", requirement: chat("store_order") },
  { path: "/admin/chats", requirement: chat("chats") },
  { path: "/admin/order-chats", requirement: chat("store_order") },

  // ── 그 밖의 활성 관리자 전원 화면
  ...ANY_ADMIN_PREFIXES.map((path): AdminRouteAccessRule => ({ path, requirement: ANY })),
];

export type AdminRouteAccessResolution = {
  matched: boolean;
  rule: AdminRouteAccessRule | null;
  requirement: AdminRouteRequirement;
  /** 쓰기 작업 가드 (없으면 requirement 와 같음) */
  actionRequirement: AdminRouteRequirement;
};

function splitHref(href: string): { pathname: string; query: URLSearchParams } {
  const noHash = String(href ?? "").split("#")[0];
  const qIdx = noHash.indexOf("?");
  const rawPath = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const query = new URLSearchParams(qIdx >= 0 ? noHash.slice(qIdx + 1) : "");
  let pathname = rawPath.trim() || "/";
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  return { pathname, query };
}

function ruleMatches(rule: AdminRouteAccessRule, pathname: string, query: URLSearchParams): boolean {
  const pathOk = rule.exact
    ? pathname === rule.path
    : pathname === rule.path || pathname.startsWith(`${rule.path}/`);
  if (!pathOk) return false;
  if (rule.query) {
    for (const [k, v] of Object.entries(rule.query)) {
      if (query.get(k) !== v) return false;
    }
  }
  return true;
}

/** 경로(쿼리 포함 가능) → 접근 요구 권한. 표에 없으면 `matched: false` + any_admin. */
export function resolveAdminRouteAccess(href: string): AdminRouteAccessResolution {
  const { pathname, query } = splitHref(href);
  for (const rule of ADMIN_ROUTE_ACCESS_RULES) {
    if (ruleMatches(rule, pathname, query)) {
      return {
        matched: true,
        rule,
        requirement: rule.requirement,
        actionRequirement: rule.action ?? rule.requirement,
      };
    }
  }
  return { matched: false, rule: null, requirement: ANY, actionRequirement: ANY };
}

/** `permissionKeyAllowed`(admin-user-server) 와 같은 규칙 — `users` 가 `users_edit_membership` 을 포함. */
function hasPermission(permissions: readonly string[], key: AdminPermissionKey): boolean {
  if (permissions.includes(key)) return true;
  return key === "users_edit_membership" && permissions.includes("users");
}

export function actorMeetsAdminRouteRequirement(
  requirement: AdminRouteRequirement,
  actor: AdminRouteAccessActor
): boolean {
  if (!isPrivilegedAdminRole(actor.role)) return false;
  const isSuper = normalizeAdminRole(actor.role) === "super_admin";
  const perms = actor.permissions ?? [];
  switch (requirement.kind) {
    case "any_admin":
      return true;
    case "super_admin":
      return isSuper;
    case "deploy_owner":
      return isSuper && actor.isDeployOwner === true;
    case "permission":
      return isSuper || hasPermission(perms, requirement.key);
    case "domain":
      if (isSuper) return true;
      // 정지된 운영자: 거래 Admin·거래 채팅 불가 — 서버 `requireTradeAdmin`·`requireTradeChatAdmin` 과 같은 규칙
      if (requirement.guard === "trade") return actor.accountSuspended !== true;
      if (requirement.guard === "community") {
        // 정지된 운영자는 홍보 조치 불가 — 서버 `requireCommunityAdmin("promotion")` 과 같은 규칙 (최고관리자 제외)
        if (requirement.area === "promotion" && actor.accountSuspended === true) return false;
        return communityAreaAllowed(perms as readonly AdminPermissionKey[], requirement.area, false);
      }
      if (requirement.scope === "trade") return actor.accountSuspended !== true;
      if (requirement.scope === "store_order") return hasPermission(perms, "chats") || hasPermission(perms, "business");
      return hasPermission(perms, "chats");
  }
}

/** 화면 열람 가능 여부. */
export function canAccessAdminRoute(href: string, actor: AdminRouteAccessActor): boolean {
  return actorMeetsAdminRouteRequirement(resolveAdminRouteAccess(href).requirement, actor);
}

/** 화면 안 쓰기 작업 가능 여부 (`action` 이 없으면 열람과 같음). */
export function canActOnAdminRoute(href: string, actor: AdminRouteAccessActor): boolean {
  return actorMeetsAdminRouteRequirement(resolveAdminRouteAccess(href).actionRequirement, actor);
}
