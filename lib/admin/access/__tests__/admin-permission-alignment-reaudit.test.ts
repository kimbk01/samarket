/**
 * 재감사 2026-10-30 §3·§4 권한 정렬 (Owner 승인 — G-01 · IA-04(K-2) · G-02 · G-03 · E-7 · G-15 · G-18).
 *
 * 원칙: 같은 업무 = 모든 진입점에서 같은 서버 권한 키. 작업마다 actor
 *   {운영자 기본 · 운영자+settings · 최고관리자}
 * 에 대해 메뉴 노출(filterAdminMenuByAccess) · 화면 작업(canActOnAdminRoute / resolveAdminRouteActionState) ·
 * API 가드(정적 소스)가 같은 키로 맞는지 확인한다.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, type AdminMenuItem } from "@/components/admin/admin-menu";
import { DEFAULT_PERMISSIONS_BY_ROLE } from "@/lib/admin-users/admin-permissions";
import {
  actorMeetsAdminRouteRequirement,
  advertisingWorkspaceFamilyActionRequirement,
  canAccessAdminRoute,
  canActOnAdminRoute,
  type AdminRouteAccessActor,
} from "@/lib/admin/access/admin-route-access";
import { filterAdminMenuByAccess, resolveAdminRouteActionState } from "@/lib/admin/access/admin-access-ui";

const ROOT = path.resolve(__dirname, "../../../..");

const OPERATOR: AdminRouteAccessActor = { role: "admin", permissions: [...DEFAULT_PERMISSIONS_BY_ROLE.operator] };
const OPERATOR_SETTINGS: AdminRouteAccessActor = {
  role: "admin",
  permissions: [...DEFAULT_PERMISSIONS_BY_ROLE.operator, "settings"],
};
const SUPER: AdminRouteAccessActor = { role: "super_admin", permissions: [...DEFAULT_PERMISSIONS_BY_ROLE.master] };
const BARE: AdminRouteAccessActor = { role: "admin", permissions: [] };

type Expect3 = readonly [operator: boolean, operatorSettings: boolean, superAdmin: boolean];
const ACTORS = [OPERATOR, OPERATOR_SETTINGS, SUPER] as const;

function expectMatrix(fn: (a: AdminRouteAccessActor) => boolean, expected: Expect3, label: string) {
  expect(ACTORS.map(fn), label).toEqual([...expected]);
}

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
const ALL_MENU_PATHS = menuPaths(adminMenu);

/** 메뉴에 있는 화면이면 노출 = 열람 판정과 같아야 한다 (메뉴에 없으면 검사 생략). */
function expectMenuAgreesWithView(page: string) {
  if (!ALL_MENU_PATHS.has(page)) return;
  for (const a of [...ACTORS, BARE]) {
    expect(menuPaths(filterAdminMenuByAccess(adminMenu, a)).has(page), `menu ${page} ${a.role}`).toBe(
      canAccessAdminRoute(page, a)
    );
  }
}

function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function source(route: string): string {
  return stripComments(readFileSync(path.join(ROOT, "app/api/admin", route), "utf8"));
}

/** `app/api/admin/<route>` 의 export 핸들러 본문 (주석 제거). */
function handler(route: string, method: string): string {
  const src = source(route);
  const start = src.search(new RegExp(`export (async )?function ${method}\\b`));
  if (start < 0) throw new Error(`${route}: no ${method}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

const permCall = (key: string) => `requireAdminPermission("${key}")`;
const WEAK_GUARD = /requireAdminApiUser\(|isRouteAdmin\(/;

function expectHandlerKey(route: string, method: string, key: string) {
  const body = handler(route, method);
  expect(body, `${route} ${method}`).toContain(permCall(key));
  expect(WEAK_GUARD.test(body), `${route} ${method} must not keep a weaker guard`).toBe(false);
}

describe("G-01 (P0) · IA-04 — 광고 워크스페이스 조치 = 계열별 키", () => {
  const route = "advertising-workspace/action/route.ts";

  it("배달 광고(보상 연장 포함)·사장님 팝업 신청 = business · 피드 배너·팝업 캠페인 = ads — 모든 조치 앞에서 강제", () => {
    const body = handler(route, "POST");
    const gateIdx = body.indexOf("const familyGate");
    expect(gateIdx).toBeGreaterThan(0);
    // 계열 가드는 내부 메모·보상 연장·각 계열 writer 보다 먼저
    expect(gateIdx).toBeLessThan(body.indexOf('action === "add_internal_memo"'));
    expect(gateIdx).toBeLessThan(body.indexOf("extend_compensation\") {"));
    const gate = body.slice(gateIdx, body.indexOf("if (familyGate && !familyGate.ok) return familyGate.response;"));
    expect(gate).toMatch(
      /family === "delivery_banner" \|\| family === "delivery_sponsored" \|\| family === "platform_popup_request"\s*\?\s*await requireAdminPermission\("business"\)/
    );
    expect(gate).toMatch(/family === "feed_banner" \|\| family === "platform_popup_campaign"\s*\?\s*await requireAdminPermission\("ads"\)/);
    // 배달 광고에 ads 를 겹쳐 요구하지 않는다 (이중 게이트 금지)
    expect(gate).not.toMatch(/delivery_[a-z]+"[^?]*\?\s*await requireAdminPermission\("ads"\)/);
  });

  it("같은 업무의 다른 진입점과 같은 키", () => {
    expect(handler("delivery-ads/[campaignId]/actions/route.ts", "POST")).toContain(permCall("business"));
    expect(handler("delivery-ads/[campaignId]/extend/route.ts", "POST")).toContain(permCall("business"));
    expect(handler("platform-popup-requests/[requestId]/actions/route.ts", "POST")).toContain(permCall("business"));
  });

  it("거래 홍보 = requireTradeAdmin (O-2) · 커뮤니티 홍보 = requireCommunityAdmin(promotion) 유지", () => {
    const body = handler(route, "POST");
    const trade = body.slice(body.indexOf('if (family === "boost_trade")'));
    expect(trade.slice(0, 400)).toContain("requireTradeAdmin()");
    const community = body.slice(body.indexOf('if (family === "boost_community")'));
    expect(community.slice(0, 500)).toContain('requireCommunityAdmin("promotion")');
  });

  it.each([
    ["delivery_banner", "business", [true, true, true]],
    ["delivery_sponsored", "business", [true, true, true]],
    ["platform_popup_request", "business", [true, true, true]],
    ["feed_banner", "ads", [true, true, true]],
    ["platform_popup_campaign", "ads", [true, true, true]],
  ] as const)("드로어 CTA %s = %s", (family, key, expected) => {
    const req = advertisingWorkspaceFamilyActionRequirement(family);
    expect(req).toEqual({ kind: "permission", key });
    expectMatrix((a) => actorMeetsAdminRouteRequirement(req, a), expected, family);
    expect(actorMeetsAdminRouteRequirement(req, BARE)).toBe(false);
    expect(actorMeetsAdminRouteRequirement(req, { role: "admin", permissions: [key] })).toBe(true);
  });

  it("드로어 CTA 거래·커뮤니티 홍보", () => {
    expect(advertisingWorkspaceFamilyActionRequirement("boost_trade")).toEqual({ kind: "domain", guard: "trade" });
    expect(advertisingWorkspaceFamilyActionRequirement("boost_community")).toEqual({
      kind: "domain",
      guard: "community",
      area: "promotion",
    });
  });
});

describe("IA-04 (K-2) · G-18 — 광고·홍보 콘텐츠 쓰기 = ads", () => {
  it.each([
    ["feed-ads/route.ts", "POST"],
    ["feed-ads/[campaignId]/route.ts", "PATCH"],
    ["feed-ads/upload/route.ts", "POST"],
    ["ad-applications/[id]/route.ts", "PATCH"],
    ["platform-popup-campaigns/route.ts", "POST"],
    ["platform-popup-campaigns/[campaignId]/route.ts", "PATCH"],
    ["platform-popup-campaigns/[campaignId]/transition/route.ts", "POST"],
    ["platform-popup-campaigns/[campaignId]/copy/route.ts", "POST"],
    ["platform-popup-campaigns/[campaignId]/creative/route.ts", "POST"],
    ["platform-popup-campaigns/[campaignId]/creative/route.ts", "DELETE"],
    ["platform-popup-campaigns/bulk-delete-draft/route.ts", "POST"],
    ["platform-events/route.ts", "POST"],
    ["platform-events/upload-image/route.ts", "POST"],
    ["platform-events/[eventId]/route.ts", "PATCH"],
    ["platform-events/[eventId]/distribution/route.ts", "PUT"],
    ["banners/route.ts", "POST"],
    ["banners/[id]/route.ts", "PATCH"],
    ["banners/[id]/route.ts", "DELETE"],
  ])("%s %s", (route, method) => {
    expectHandlerKey(route, method, "ads");
  });

  it("조회 GET 은 전원 그대로 (requireAdminApiUser)", () => {
    for (const r of ["feed-ads/route.ts", "platform-popup-campaigns/[campaignId]/route.ts", "platform-events/route.ts", "banners/route.ts"]) {
      expect(handler(r, "GET"), r).toContain("requireAdminApiUser(");
    }
  });

  it.each(["/admin/feed-ads/new", "/admin/feed-ads/abc/edit", "/admin/ad-applications/abc", "/admin/platform-popup", "/admin/platform-popup/abc", "/admin/platform-events/new", "/admin/my/banners", "/admin/my/banners/create"])(
    "화면 %s — 열람 전원 · 작업 ads (운영자 기본에 ads 있음)",
    (page) => {
      expectMatrix((a) => canAccessAdminRoute(page, a), [true, true, true], `view ${page}`);
      expectMatrix((a) => canActOnAdminRoute(page, a), [true, true, true], `action ${page}`);
      expect(canAccessAdminRoute(page, BARE)).toBe(true);
      expect(canActOnAdminRoute(page, BARE)).toBe(false);
      expect(resolveAdminRouteActionState({ href: page, actor: BARE, actorLoading: false }).reason).toContain("ads");
      expectMenuAgreesWithView(page);
    }
  );

  it("사장님 팝업 신청 처리 화면 = business (팝업 캠페인 ads 규칙보다 먼저)", () => {
    expect(canActOnAdminRoute("/admin/platform-popup/requests/abc", { role: "admin", permissions: ["ads"] })).toBe(false);
    expect(canActOnAdminRoute("/admin/platform-popup/requests/abc", { role: "admin", permissions: ["business"] })).toBe(true);
    expect(canActOnAdminRoute("/admin/platform-popup/abc", { role: "admin", permissions: ["business"] })).toBe(false);
  });

  it("이벤트 Push 실제 발송은 이 변경 대상이 아니다 (ads 로 바꾸지 않음)", () => {
    expect(handler("platform-events/[eventId]/distribution/push/send/route.ts", "POST")).not.toContain(permCall("ads"));
  });
});

describe("G-18 — 앱 공통 설정 쓰기 = settings (운영자 기본은 settings 없음 → 작업 불가)", () => {
  it.each([
    ["main-bottom-nav/route.ts", "PUT"],
    ["main-bottom-nav/route.ts", "DELETE"],
    ["app-business-info/route.ts", "POST"],
    ["app-business-info/[id]/route.ts", "PATCH"],
    ["launch-intro/route.ts", "PUT"],
    ["launch-intro/route.ts", "DELETE"],
    ["launch-intro/publish/route.ts", "POST"],
    ["launch-intro/state/route.ts", "POST"],
    ["launch-intro/upload/route.ts", "POST"],
    ["os-launch/route.ts", "PUT"],
    ["os-launch/logo/route.ts", "POST"],
    ["startup-config/route.ts", "PUT"],
    ["startup-config/upload-image/route.ts", "POST"],
  ])("%s %s", (route, method) => {
    expectHandlerKey(route, method, "settings");
  });

  it.each([
    "/admin/menus/main-bottom-nav",
    "/admin/app/business",
    "/admin/app/business/create",
    "/admin/platform-promotion/intro",
    "/admin/platform-promotion/os-start",
    "/admin/settings/startup-config",
  ])("화면 %s — 열람 전원 · 작업 settings", (page) => {
    expectMatrix((a) => canAccessAdminRoute(page, a), [true, true, true], `view ${page}`);
    expectMatrix((a) => canActOnAdminRoute(page, a), [false, true, true], `action ${page}`);
    expect(resolveAdminRouteActionState({ href: page, actor: OPERATOR, actorLoading: false }).reason).toContain("settings");
    expectMenuAgreesWithView(page);
  });
});

describe("G-02 — 배달 주문 운영 조회 = business", () => {
  it.each([
    ["store-orders/ops/route.ts", "GET"],
    ["store-orders/ops/summary/route.ts", "GET"],
    ["store-orders/audit/route.ts", "GET"],
  ])("%s %s", (route, method) => {
    expectHandlerKey(route, method, "business");
  });

  it("화면·메뉴 = business (운영자 기본에 business 있음) · 상단 빠른 조회의 주문 검색도 같은 접근표 판정", () => {
    for (const page of ["/admin/stores/orders", "/admin/stores/orders/logs", "/admin/store-orders"]) {
      expectMatrix((a) => canAccessAdminRoute(page, a), [true, true, true], page);
      expect(canAccessAdminRoute(page, BARE)).toBe(false);
      expectMenuAgreesWithView(page);
    }
    const shell = readFileSync(path.join(ROOT, "components/admin/shell/AdminPlatformShell.tsx"), "utf8");
    expect(shell).toContain('canAccessAdminRoute("/admin/stores/orders", accessActor)');
  });
});

describe("G-03 — 거래 신고 처리 = 진입점과 무관하게 requireTradeAdmin (O-2)", () => {
  it("중앙 신고 센터 처리 · 거래 화면 처리 = 같은 가드 · 같은 처리 함수", () => {
    const central = handler("reports/[reportId]/action/route.ts", "POST");
    const trade = handler("trade/reports/[id]/route.ts", "POST");
    for (const body of [central, trade]) {
      expect(body).toContain("requireTradeAdmin()");
      expect(body).toContain("decideTradeReport(");
    }
  });

  it("중앙 목록·상세 `reports` 보유자는 항상 처리 가능 (reports ⊆ 거래 Admin)", () => {
    for (const a of [...ACTORS]) {
      if (canAccessAdminRoute("/admin/reports", a)) expect(canAccessAdminRoute("/admin/trade/reports", a)).toBe(true);
    }
  });
});

describe("E-7 — 고객지원 = support (GET 과 같은 키)", () => {
  it.each([
    ["support/cases/route.ts", "GET"],
    ["support/cases/route.ts", "POST"],
    ["support/summary/route.ts", "GET"],
  ])("%s %s", (route, method) => {
    expectHandlerKey(route, method, "support");
  });
});

describe("G-15 — 거래 회원 조회 = 중앙 회원과 같은 users", () => {
  it.each([
    ["trade/members/route.ts", "GET"],
    ["trade/members/[id]/trade/route.ts", "GET"],
    ["trade/members/[id]/moderation/route.ts", "GET"],
    ["trade/members/[id]/moderation/route.ts", "POST"],
    ["users/[id]/trade/route.ts", "GET"],
    ["users/[id]/moderation/route.ts", "GET"],
  ])("%s %s", (route, method) => {
    const body = handler(route, method);
    expect(body).toContain(permCall("users"));
    expect(body).not.toContain("requireTradeAdmin(");
  });

  it("화면·메뉴 = users", () => {
    for (const page of ["/admin/trade/members", "/admin/trade/members/abc"]) {
      expectMatrix((a) => canAccessAdminRoute(page, a), [true, true, true], page);
      expect(canAccessAdminRoute(page, BARE)).toBe(false);
      expectMenuAgreesWithView(page);
    }
    // 커뮤니티 회원 조회는 커뮤니티 영역 키(read) 유지 — 도메인 한정 조회
    expect(handler("community/members/route.ts", "GET")).toContain('requireCommunityAdmin("read")');
  });
});
