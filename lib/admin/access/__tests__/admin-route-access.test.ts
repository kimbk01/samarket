import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import {
  ADMIN_ROUTE_ACCESS_RULES,
  ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS,
  canAccessAdminRoute,
  canActOnAdminRoute,
  resolveAdminRouteAccess,
  type AdminRouteAccessActor,
  type AdminRouteRequirement,
} from "@/lib/admin/access/admin-route-access";

const ROOT = path.resolve(__dirname, "../../../..");

describe("admin route access — 메뉴 커버리지", () => {
  it("사이드바 메뉴 leaf 는 전부 표의 규칙에 걸린다 (fallthrough 없음)", () => {
    const unmatched = collectAdminMenuPathEntries(adminMenu)
      .filter((e) => !resolveAdminRouteAccess(e.path).matched)
      .map((e) => `${e.key} ${e.path}`);
    expect(unmatched).toEqual([]);
  });

  it("각 규칙은 앞 규칙에 가려지지 않는다 (자기 경로·하위 경로가 자기 규칙으로 해석)", () => {
    const shadowed: string[] = [];
    for (const rule of ADMIN_ROUTE_ACCESS_RULES) {
      const qs = rule.query ? `?${new URLSearchParams(rule.query as Record<string, string>).toString()}` : "";
      const probes = rule.exact ? [rule.path] : [rule.path, `${rule.path}/__probe`];
      if (!probes.some((p) => resolveAdminRouteAccess(`${p}${qs}`).rule === rule)) shadowed.push(rule.path + qs);
    }
    expect(shadowed).toEqual([]);
  });

  it("같은 경로·쿼리 규칙 중복 없음", () => {
    const keys = ADMIN_ROUTE_ACCESS_RULES.map((r) => `${r.path}|${r.exact ? 1 : 0}|${JSON.stringify(r.query ?? {})}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("표에 없는 경로 → matched=false + any_admin, 쿼리·해시·끝 슬래시 정리", () => {
    expect(resolveAdminRouteAccess("/admin/no-such-page")).toMatchObject({ matched: false, requirement: { kind: "any_admin" } });
    expect(resolveAdminRouteAccess("/admin/qa-board/").requirement).toEqual({ kind: "super_admin" });
    expect(resolveAdminRouteAccess("/admin/users?x=1#y").requirement).toEqual({ kind: "permission", key: "users" });
    // 조각 경계 — ops-knowledge 규칙이 ops-knowledge-graph 를 먹지 않는다
    expect(resolveAdminRouteAccess("/admin/ops-knowledge-graph").rule?.path).toBe("/admin/ops-knowledge-graph");
    // 하위 상세 경로는 접두사 규칙
    expect(resolveAdminRouteAccess("/admin/point-charges/abc").requirement).toEqual({ kind: "permission", key: "point" });
  });

  it("F0 super_admin 페이지 게이트(SuperAdminOnlyPageGate) 세그먼트는 표에서 super_admin", () => {
    const adminDir = path.join(ROOT, "app/admin");
    const gated = readdirSync(adminDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((name) => {
        const layout = path.join(adminDir, name, "layout.tsx");
        return existsSync(layout) && readFileSync(layout, "utf8").includes("SuperAdminOnlyPageGate");
      })
      .map((name) => `/admin/${name}`)
      .sort();
    expect(gated.length).toBeGreaterThan(10);
    for (const p of gated) expect(resolveAdminRouteAccess(p).requirement, p).toEqual({ kind: "super_admin" });
    expect([...ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS].sort()).toEqual(gated);
  });
});

/** 요구 권한 → API 가드 호출 문자열 (하나라도 있으면 일치). */
function guardCallsFor(req: AdminRouteRequirement): string[] {
  switch (req.kind) {
    case "any_admin":
      return ["requireAdminApiUser(", "isRouteAdmin(", "requireAdminApiActor("];
    case "super_admin":
      return ["requireSuperAdmin("];
    case "deploy_owner":
      return ["requireDeployOwner("];
    case "permission":
      return [`requireAdminPermission("${req.key}")`];
    case "domain":
      if (req.guard === "trade") return ["requireTradeAdmin("];
      if (req.guard === "community") return [`requireCommunityAdmin("${req.area}")`];
      if (req.scope === "trade") return ["requireTradeChatAdmin("];
      if (req.scope === "store_order") return ['requireAnyAdminPermission(["chats", "business"])'];
      return ["requireChatAdmin("];
  }
}

function handlerSource(routeFile: string, method: string): string {
  const src = readFileSync(path.join(ROOT, "app/api/admin", routeFile), "utf8");
  const start = src.search(new RegExp(`export (async )?function ${method}\\b`));
  if (start < 0) throw new Error(`${routeFile}: no ${method}`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

/**
 * 계약: 대표 메뉴 화면이 처음 부르는 조회 API 의 가드가 표의 요구 권한과 같다.
 * (화면 → API 대응은 각 화면 컴포넌트의 fetch 경로에서 확인한 값)
 */
const VIEW_CONTRACT: { page: string; route: string; method?: string }[] = [
  { page: "/admin/users", route: "users/route.ts" },
  { page: "/admin/point-charges", route: "point-charges/route.ts" },
  { page: "/admin/points/ledger", route: "points/ledger/route.ts" },
  { page: "/admin/settings/auth", route: "auth-settings/route.ts" },
  { page: "/admin/qa-board", route: "qa-board/route.ts" },
  { page: "/admin/system/data-reset", route: "system/data-reset/summary/route.ts" },
  { page: "/admin/system/deploy", route: "deploy/status/route.ts" },
  { page: "/admin/trade/settings", route: "trade/settings/route.ts" },
  { page: "/admin/community/topics", route: "community/topics/route.ts" },
  { page: "/admin/community/members", route: "community/members/route.ts" },
  { page: "/admin/community/reports", route: "community-reports/route.ts" },
  { page: "/admin/chats/calls", route: "community-messenger/calls/route.ts" },
  { page: "/admin/chats?type=trade", route: "chats/trade-legacy/route.ts" },
  { page: "/admin/order-chats", route: "order-chats/route.ts" },
  { page: "/admin/finance/transactions", route: "finance/transactions/route.ts" },
  { page: "/admin/stores", route: "stores/route.ts" },
  { page: "/admin/store-orders", route: "store-orders/route.ts" },
  { page: "/admin/feed-emergency", route: "feed-emergency/route.ts" },
];

/** 쓰기 작업 가드가 더 강한 화면 — `action` 이 실제 쓰기 API 가드와 같다. */
const ACTION_CONTRACT: { page: string; route: string; method: string }[] = [
  { page: "/admin/system/deploy", route: "deploy/promote-web/route.ts", method: "POST" },
  { page: "/admin/feed-emergency", route: "feed-emergency/route.ts", method: "PUT" },
  { page: "/admin/runtime-health", route: "runtime-health/route.ts", method: "PATCH" },
  { page: "/admin/store-fee-policies", route: "store-fee-policies/route.ts", method: "POST" },
  { page: "/admin/app/legal", route: "app-legal-documents/route.ts", method: "POST" },
];

describe("admin route access — API 가드 계약", () => {
  it.each(VIEW_CONTRACT)("$page 조회 = $route GET 가드", ({ page, route, method = "GET" }) => {
    const { requirement, matched } = resolveAdminRouteAccess(page);
    expect(matched).toBe(true);
    const body = handlerSource(route, method);
    const calls = guardCallsFor(requirement);
    expect(calls.some((c) => body.includes(c)), `${route} ${method} should call one of ${calls.join(" | ")}`).toBe(true);
  });

  it.each(ACTION_CONTRACT)("$page 작업 = $route $method 가드", ({ page, route, method }) => {
    const { actionRequirement, requirement } = resolveAdminRouteAccess(page);
    expect(actionRequirement).not.toEqual(requirement);
    const body = handlerSource(route, method);
    const calls = guardCallsFor(actionRequirement);
    expect(calls.some((c) => body.includes(c)), `${route} ${method} should call one of ${calls.join(" | ")}`).toBe(true);
  });

  it("내부 도구 API(app/api/admin/<tool>)는 전부 requireSuperAdmin", () => {
    const apiDirs: Record<string, string> = { performance: "performance-ops", security: "security-ops", usage: "usage-ops" };
    for (const p of ADMIN_SUPER_ADMIN_INTERNAL_TOOL_PATHS) {
      const seg = p.replace("/admin/", "");
      const dir = path.join(ROOT, "app/api/admin", apiDirs[seg] ?? seg);
      const route = path.join(dir, "route.ts");
      if (!existsSync(route)) continue; // 서버 컴포넌트에서만 읽는 도구(release-notes 등)
      const src = readFileSync(route, "utf8");
      expect(src.includes("requireSuperAdmin("), route).toBe(true);
      expect(/requireAdminApiUser\(|isRouteAdmin\(/.test(src), route).toBe(false);
    }
  });
});

describe("canAccessAdminRoute / canActOnAdminRoute", () => {
  const superAdmin: AdminRouteAccessActor = { role: "super_admin", permissions: [] };
  const owner: AdminRouteAccessActor = { role: "master", permissions: [], isDeployOwner: true };
  const operator: AdminRouteAccessActor = {
    role: "admin",
    permissions: ["users", "boards", "reports", "ads", "business", "chats", "products"],
  };
  const bare: AdminRouteAccessActor = { role: "admin", permissions: [] };
  const member: AdminRouteAccessActor = { role: "member", permissions: ["users", "point"] };

  it("관리자가 아니면 전부 거부", () => {
    expect(canAccessAdminRoute("/admin", member)).toBe(false);
    expect(canAccessAdminRoute("/admin/users", member)).toBe(false);
  });

  it("super_admin — 배포 작업만 배포 담당자", () => {
    expect(canAccessAdminRoute("/admin/qa-board", superAdmin)).toBe(true);
    expect(canAccessAdminRoute("/admin/point-charges", superAdmin)).toBe(true);
    expect(canAccessAdminRoute("/admin/system/deploy", superAdmin)).toBe(true);
    expect(canActOnAdminRoute("/admin/system/deploy", superAdmin)).toBe(false);
    expect(canActOnAdminRoute("/admin/system/deploy", owner)).toBe(true);
  });

  it("운영자 — 기본 키 화면은 열리고 point·settings·super 화면은 막힘", () => {
    expect(canAccessAdminRoute("/admin/users", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/finance", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/community/posts", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats/general", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/point-charges", operator)).toBe(false);
    expect(canAccessAdminRoute("/admin/community/point-charges", operator)).toBe(false);
    expect(canAccessAdminRoute("/admin/settings/auth", operator)).toBe(false);
    expect(canAccessAdminRoute("/admin/settings", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/ops-board", operator)).toBe(false);
    expect(canAccessAdminRoute("/admin/ops-console", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/feed-emergency", operator)).toBe(true);
    expect(canActOnAdminRoute("/admin/feed-emergency", operator)).toBe(false);
  });

  it("키 없는 관리자 — 거래(O-2)·거래 채팅은 전원, 커뮤니티·채팅은 키 필요", () => {
    expect(canAccessAdminRoute("/admin/trade/members", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats?type=trade", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats/reported?domain=trade", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats/reported", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/chats", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/community/posts", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/community", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/community/support", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/order-chats", { role: "admin", permissions: ["business"] })).toBe(true);
    expect(canAccessAdminRoute("/admin/chats?type=store_order", { role: "admin", permissions: ["business"] })).toBe(true);
  });

  it("커뮤니티 조회 영역은 boards·reports·ads·point 중 하나", () => {
    expect(canAccessAdminRoute("/admin/community/members", { role: "admin", permissions: ["ads"] })).toBe(true);
    expect(canAccessAdminRoute("/admin/community/reports", { role: "admin", permissions: ["ads"] })).toBe(false);
    expect(canActOnAdminRoute("/admin/community/promotions", { role: "admin", permissions: ["ads"] })).toBe(true);
  });

  it("users 키는 users_edit_membership 을 포함한다 (permissionKeyAllowed 와 동일)", () => {
    const actor: AdminRouteAccessActor = { role: "admin", permissions: ["users"] };
    expect(canAccessAdminRoute("/admin/users", actor)).toBe(true);
  });
});
