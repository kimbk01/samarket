/**
 * R2 권한 정렬 행렬 (Owner 승인 2026-10-30 · 감사 §C / 보충 §2 §4 §9).
 *
 * 원칙: 같은 업무 = 모든 진입점(중앙·도메인 화면)에서 같은 서버 권한 키.
 * 작업마다 actor {운영자 기본 · 운영자+point · 최고관리자} 에 대해
 *   메뉴 노출(filterAdminMenuByAccess) · 화면 작업(canActOnAdminRoute / resolveAdminRouteActionState) · API 가드(정적 소스)
 * 가 같은 키로 맞는지 확인한다.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, type AdminMenuItem } from "@/components/admin/admin-menu";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import { getPermissionLabel } from "@/lib/admin-users/admin-permissions-label-i18n";
import { ADMIN_PERMISSION_KEYS } from "@/lib/types/admin-staff";
import { adminPermissionsLabelsMessages } from "@/lib/i18n/catalog/admin-permissions-labels";
import {
  ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS,
  canAccessAdminRoute,
  canActOnAdminRoute,
  type AdminRouteAccessActor,
} from "@/lib/admin/access/admin-route-access";
import { filterAdminMenuByAccess, resolveAdminRouteActionState } from "@/lib/admin/access/admin-access-ui";
import {
  isCampaignCreateSendCausing,
  isCampaignEditSendAffecting,
  isCampaignSendCausingAction,
} from "@/lib/admin/notification-campaigns/campaign-send-permission";

const ROOT = path.resolve(__dirname, "../../../..");

const OPERATOR: AdminRouteAccessActor = { role: "admin", permissions: [...DEFAULT_PERMISSIONS_BY_ROLE.operator] };
const OPERATOR_POINT: AdminRouteAccessActor = {
  role: "admin",
  permissions: [...DEFAULT_PERMISSIONS_BY_ROLE.operator, "point"],
};
const SUPER: AdminRouteAccessActor = { role: "super_admin", permissions: [...DEFAULT_PERMISSIONS_BY_ROLE.master] };
const BARE: AdminRouteAccessActor = { role: "admin", permissions: [] };

type Expect3 = readonly [operator: boolean, operatorPoint: boolean, superAdmin: boolean];
const ACTORS = [OPERATOR, OPERATOR_POINT, SUPER] as const;

function menuPaths(items: readonly AdminMenuItem[]): Set<string> {
  const out = new Set<string>();
  const walk = (xs: readonly AdminMenuItem[]) => {
    for (const x of xs) {
      if (x.path) out.add(x.path);
      if (x.children?.length) walk(x.children);
    }
  };
  walk(items);
  return out;
}

function menuVisible(p: string, actor: AdminRouteAccessActor): boolean {
  return menuPaths(filterAdminMenuByAccess(adminMenu, actor)).has(p);
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** `app/api/admin/<route>` 의 export 핸들러 본문 (주석 제거). */
function handler(route: string, method: string): string {
  const src = stripComments(readFileSync(path.join(ROOT, "app/api/admin", route), "utf8"));
  const start = src.search(new RegExp(`export (async )?function ${method}\\b`));
  if (start < 0) throw new Error(`${route}: no ${method}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

const permCall = (key: string) => `requireAdminPermission("${key}")`;

function expectMatrix(fn: (a: AdminRouteAccessActor) => boolean, expected: Expect3, label: string) {
  expect(ACTORS.map(fn), label).toEqual([...expected]);
}

describe("R2 · 권한 키 정의 (RS-04 support)", () => {
  it("support 키 = 타입·키 목록·라벨·전 역할 기본값", () => {
    expect(ADMIN_PERMISSION_KEYS).toContain("support");
    expect(adminPermissionsLabelsMessages.ko.admin_perm_support).toBe("고객지원");
    expect(adminPermissionsLabelsMessages.en.admin_perm_support).toBe("Customer support");
    expect(getPermissionLabel("support")).not.toBe("support");
    for (const role of ["operator", "manager", "master"] as const) {
      expect(DEFAULT_PERMISSIONS_BY_ROLE[role], role).toContain("support");
    }
  });
});

describe("R2 · MB-01 거래 회원 계정 정지 = users", () => {
  it("화면 작업(중앙 /admin/users 기준) · API 같은 키", () => {
    expectMatrix((a) => canActOnAdminRoute("/admin/users", a), [true, true, true], "action");
    expect(canActOnAdminRoute("/admin/users", BARE)).toBe(false);
    expect(handler("trade/members/[id]/moderation/route.ts", "POST")).toContain(permCall("users"));
    expect(handler("users/[id]/moderation/route.ts", "POST")).toContain(permCall("users"));
    // 같은 공용 처리
    expect(handler("trade/members/[id]/moderation/route.ts", "POST")).toContain("handleAdminMemberModerationPost(");
    expect(readFileSync(path.join(ROOT, "components/admin/trade/members/TradeMemberDetailPage.tsx"), "utf8")).toContain(
      'useAdminRouteAction("/admin/users")'
    );
  });
});

describe("R2 · FN-01 거래 포인트 쓰기 = point", () => {
  it("메뉴 · 화면 작업 · API 같은 키 (조회 GET 은 거래 가드 유지)", () => {
    expectMatrix((a) => menuVisible("/admin/trade/point-charges", a), [false, true, true], "menu point-charges");
    expectMatrix((a) => menuVisible("/admin/trade/points", a), [true, true, true], "menu trade points (조회)");
    expectMatrix((a) => canActOnAdminRoute("/admin/trade/points", a), [false, true, true], "action adjust");
    expect(resolveAdminRouteActionState({ href: "/admin/trade/points", actor: OPERATOR, actorLoading: false }).reason).toContain(
      "point"
    );
    expect(handler("trade/point-charges/[id]/route.ts", "PATCH")).toContain(permCall("point"));
    expect(handler("point-charges/[id]/route.ts", "PATCH")).toContain(permCall("point"));
    expect(handler("trade/points/adjust/route.ts", "POST")).toContain(permCall("point"));
    expect(handler("points/adjust/route.ts", "POST")).toContain(permCall("point"));
    expect(handler("trade/points/adjust/route.ts", "GET")).toContain("requireTradeAdmin(");
    expect(handler("trade/point-charges/[id]/route.ts", "GET")).toContain("requireTradeAdmin(");
  });
});

describe("R2 · IA-01 푸시 캠페인 실제 발송 = manage", () => {
  it("메뉴는 전원 · 발송 CTA · API 같은 키 · 초안/본인 테스트 발송은 기존 가드", () => {
    expectMatrix((a) => menuVisible("/admin/notifications", a), [true, true, true], "menu");
    expectMatrix((a) => canActOnAdminRoute("/admin/notifications", a), [false, false, true], "send action");
    expect(
      resolveAdminRouteActionState({ href: "/admin/notifications/abc", actor: OPERATOR_POINT, actorLoading: false }).reason
    ).toContain("manage");
    expect(handler("notification-campaigns/[campaignId]/send/route.ts", "POST")).toContain(permCall("manage"));
    const actions = handler("notification-campaigns/[campaignId]/actions/route.ts", "POST");
    expect(actions).toContain("isCampaignSendCausingAction(action)");
    expect(actions).toContain(permCall("manage"));
    const patch = handler("notification-campaigns/[campaignId]/route.ts", "PATCH");
    expect(patch).toContain("isCampaignSendCausingAction(statusAction)");
    expect(patch).toContain(permCall("manage"));
    const create = handler("notification-campaigns/route.ts", "POST");
    expect(create).toContain("isCampaignCreateSendCausing(");
    expect(create).toContain(permCall("manage"));
    const testSend = handler("notification-campaigns/[campaignId]/test-send/route.ts", "POST");
    expect(testSend).toContain("requireAdminApiUser(");
    expect(testSend).not.toContain(permCall("manage"));
  });

  it("발송을 일으키는 작업 판정", () => {
    expect(isCampaignSendCausingAction("schedule")).toBe(true);
    expect(isCampaignSendCausingAction("resume")).toBe(true);
    for (const a of ["cancel", "stop_sending", "pause", "stop_recurring", "archive", "unarchive", "duplicate", null]) {
      expect(isCampaignSendCausingAction(a), String(a)).toBe(false);
    }
    expect(isCampaignCreateSendCausing({ saveAsDraft: true, sendMode: "scheduled" })).toBe(false);
    expect(isCampaignCreateSendCausing({ saveAsDraft: false, sendMode: "immediate" })).toBe(false);
    expect(isCampaignCreateSendCausing({ saveAsDraft: false, sendMode: "scheduled" })).toBe(true);
    expect(isCampaignCreateSendCausing({ saveAsDraft: false, sendMode: "recurring" })).toBe(true);
    expect(isCampaignEditSendAffecting("draft")).toBe(false);
    expect(isCampaignEditSendAffecting("scheduled")).toBe(true);
    expect(isCampaignEditSendAffecting("paused")).toBe(true);
  });
});

describe("R2 · RS-04 고객지원 = support · 매장 신고 목록 = reports", () => {
  it("중앙·거래·커뮤니티 문의 화면 = 같은 키 (역할 기본값으로 기존 운영자 유지)", () => {
    for (const p of ["/admin/support", "/admin/trade/support", "/admin/community/support"]) {
      expectMatrix((a) => menuVisible(p, a), [true, true, true], `menu ${p}`);
      expectMatrix((a) => canAccessAdminRoute(p, a), [true, true, true], `view ${p}`);
      expect(canAccessAdminRoute(p, BARE), p).toBe(false);
      expect(canAccessAdminRoute(p, { role: "admin", permissions: ["support"] }), p).toBe(true);
    }
    expect(handler("support/cases/route.ts", "GET")).toContain(permCall("support"));
    expect(handler("support/cases/[caseId]/route.ts", "GET")).toContain(permCall("support"));
    expect(handler("support/cases/[caseId]/route.ts", "PATCH")).toContain(permCall("support"));
    expectMatrix((a) => canAccessAdminRoute("/admin/store-reports", a), [true, true, true], "store-reports");
    expect(canAccessAdminRoute("/admin/store-reports", { role: "admin", permissions: ["business"] })).toBe(false);
    expect(handler("store-reports/route.ts", "GET")).toContain(permCall("reports"));
  });
});

describe("R2 · IA-02 / J-6 / FN-03 정책 화면", () => {
  it("회원 혜택 = users (화면·쓰기 API)", () => {
    expectMatrix((a) => menuVisible("/admin/member-benefits", a), [true, true, true], "menu");
    expectMatrix((a) => canActOnAdminRoute("/admin/member-benefits", a), [true, true, true], "action");
    expect(canAccessAdminRoute("/admin/member-benefits", BARE)).toBe(false);
    expect(handler("member-benefits/route.ts", "POST")).toContain(permCall("users"));
    expect(handler("member-benefits/[id]/route.ts", "PATCH")).toContain(permCall("users"));
  });

  it.each([
    ["/admin/home-feed", "home-feed-policies/route.ts", "PUT", "home-feed-policies/route.ts"],
    ["/admin/personalized-feed", "personalized-feed-policies/route.ts", "PUT", "personalized-feed-policies/route.ts"],
    ["/admin/exposure-policies", "exposure-policies/[id]/route.ts", "PATCH", "exposure-policies/route.ts"],
    ["/admin/boards", "boards/route.ts", "POST", "boards/route.ts"],
  ])("%s — 조회 전원 · 쓰기 최고관리자 (화면 유지)", (page, route, method, readRoute) => {
    expectMatrix((a) => canAccessAdminRoute(page, a), [true, true, true], `view ${page}`);
    expectMatrix((a) => canActOnAdminRoute(page, a), [false, false, true], `action ${page}`);
    expect(handler(route, method)).toContain("requireSuperAdmin(");
    expect(handler(readRoute, "GET")).not.toContain("requireSuperAdmin(");
    expect(existsSync(path.join(ROOT, "app", page, "page.tsx"))).toBe(true);
  });
});

describe("R2 · IA-06 최고관리자 메뉴 화면 = 화면 게이트도 최고관리자", () => {
  it.each(["/admin/system", "/admin/runtime-health", "/admin/delivery-release-gate", "/admin/feed-emergency", "/admin/memo"])(
    "%s",
    (page) => {
      expectMatrix((a) => canAccessAdminRoute(page, a), [false, false, true], page);
      expectMatrix((a) => menuVisible(page, a), [false, false, true], `menu ${page}`);
    }
  );

  it("/admin/memo 는 내부 도구 목록 + 세그먼트 SuperAdminOnlyPageGate", () => {
    expect(ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS).toContain("/admin/memo");
    expect(readFileSync(path.join(ROOT, "app/admin/memo/layout.tsx"), "utf8")).toContain("SuperAdminOnlyPageGate");
  });
});

describe("R2 · IA-07 / AD-06 매장·광고 쓰기 = business", () => {
  it.each([
    ["/admin/stores", "stores/[id]/route.ts", "PATCH"],
    ["/admin/business", "stores/[id]/route.ts", "PATCH"],
    ["/admin/delivery-ads/abc", "delivery-ads/[campaignId]/actions/route.ts", "POST"],
  ])("%s", (page, route, method) => {
    expectMatrix((a) => canAccessAdminRoute(page, a), [true, true, true], `view ${page}`);
    expectMatrix((a) => canActOnAdminRoute(page, a), [true, true, true], `action ${page}`);
    expect(canAccessAdminRoute(page, BARE)).toBe(true);
    expect(canActOnAdminRoute(page, BARE)).toBe(false);
    expect(resolveAdminRouteActionState({ href: page, actor: BARE, actorLoading: false }).reason).toContain("business");
    expect(handler(route, method)).toContain(permCall("business"));
  });

  it("메뉴(입점 심사·매장 운영)는 전원", () => {
    expectMatrix((a) => menuVisible("/admin/stores", a), [true, true, true], "stores");
    expectMatrix((a) => menuVisible("/admin/business", a), [true, true, true], "business");
  });
});
