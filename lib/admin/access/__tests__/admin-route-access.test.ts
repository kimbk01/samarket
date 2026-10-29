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
  // IA-06: /admin/feed-emergency 는 화면 = 최고관리자(메뉴 노출과 일치), 조회 API 는 전원 — 화면이 더 강하므로 이 표에서 뺐다.
  // RS-04: 고객지원 = support 키 · 매장 신고 목록 = reports 키
  { page: "/admin/support", route: "support/cases/route.ts" },
  { page: "/admin/support/abc", route: "support/cases/[caseId]/route.ts" },
  { page: "/admin/community/support", route: "support/cases/route.ts" },
  { page: "/admin/trade/support", route: "support/cases/route.ts" },
  { page: "/admin/store-reports", route: "store-reports/route.ts" },
  // F3 공통 화면
  { page: "/admin/staff", route: "staff/memberships/route.ts" },
  { page: "/admin/reports/log", route: "reports/sanction-ledger/route.ts" },
  { page: "/admin/users/phone-verification", route: "users/phone-verification/ops/route.ts" },
  { page: "/admin/audit-logs", route: "audit-logs/route.ts" },
];

/** 쓰기 작업 가드가 더 강한 화면 — `action` 이 실제 쓰기 API 가드와 같다. */
const ACTION_CONTRACT: { page: string; route: string; method: string }[] = [
  { page: "/admin/system/deploy", route: "deploy/promote-web/route.ts", method: "POST" },
  { page: "/admin/store-fee-policies", route: "store-fee-policies/route.ts", method: "POST" },
  { page: "/admin/app/legal", route: "app-legal-documents/route.ts", method: "POST" },
  // R9 — 쓰기 권한이 따로인 나머지 화면 (화면은 useAdminRouteAction 으로 쓰기 버튼 비활성)
  { page: "/admin/commerce-settings", route: "commerce-settings/route.ts", method: "PUT" },
  { page: "/admin/community/restrictions", route: "community/restrictions/route.ts", method: "POST" },
  { page: "/admin/community/promotions", route: "community-promotion-orders/[id]/route.ts", method: "PATCH" },
  { page: "/admin/community/points", route: "points/adjust/route.ts", method: "POST" },
  { page: "/admin/philife/meeting-reports", route: "philife/meeting-reports/[reportId]/route.ts", method: "PATCH" },
  // R2 정렬 (Owner 승인 2026-10-30) — IA-06 의 feed-emergency·runtime-health·delivery-release-gate 는 화면 자체가 최고관리자라 action 없음
  { page: "/admin/notifications", route: "notification-campaigns/[campaignId]/send/route.ts", method: "POST" },
  { page: "/admin/trade/points", route: "trade/points/adjust/route.ts", method: "POST" },
  { page: "/admin/home-feed", route: "home-feed-policies/route.ts", method: "PUT" },
  { page: "/admin/personalized-feed", route: "personalized-feed-policies/route.ts", method: "PUT" },
  { page: "/admin/exposure-policies", route: "exposure-policies/[id]/route.ts", method: "PATCH" },
  { page: "/admin/boards", route: "boards/route.ts", method: "POST" },
  { page: "/admin/stores", route: "stores/[id]/route.ts", method: "PATCH" },
  { page: "/admin/business", route: "stores/[id]/route.ts", method: "PATCH" },
  { page: "/admin/delivery-ads", route: "delivery-ads/[campaignId]/actions/route.ts", method: "POST" },
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

  it("쓰기 권한(action)이 따로인 규칙은 전부 작업 계약 표에 있다", () => {
    const withAction = ADMIN_ROUTE_ACCESS_RULES.filter((r) => r.action).map((r) => r.path).sort();
    expect([...new Set(ACTION_CONTRACT.map((c) => c.page))].sort()).toEqual(withAction);
  });

  it("쓰기 권한이 따로인 화면은 useAdminRouteAction 으로 쓰기 버튼을 막는다 (화면 폐포 안에 호출)", () => {
    /** 하위 page.tsx 전부 (허브 page 가 redirect 만 하는 경우 — 예: /admin/delivery-ads → 상세·관리 화면) */
    const descendantPages = (dir: string): string[] => {
      const out: string[] = [];
      if (!existsSync(dir)) return out;
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, d.name);
        if (d.isDirectory()) out.push(...descendantPages(f));
        else if (d.name === "page.tsx") out.push(f);
      }
      return out;
    };
    for (const rule of ADMIN_ROUTE_ACCESS_RULES.filter((r) => r.action)) {
      const page = path.join(ROOT, "app", rule.path, "page.tsx");
      const redirectOnly = existsSync(page) && /\bredirect\(/.test(readFileSync(page, "utf8"));
      const seen = new Set<string>();
      const stack = redirectOnly ? descendantPages(path.join(ROOT, "app", rule.path)) : [page];
      let found = false;
      while (stack.length && !found) {
        const f = stack.pop()!;
        if (seen.has(f) || !existsSync(f)) continue;
        seen.add(f);
        const src = readFileSync(f, "utf8");
        if (new RegExp(`useAdminRouteAction\\(\\s*"${rule.path}"`).test(src)) found = true;
        for (const m of src.matchAll(/from\s+"(@\/components\/admin\/[^"]+|@\/app\/admin\/[^"]+|\.{1,2}\/[^"]+)"/g)) {
          const spec = m[1];
          const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : path.join(path.dirname(f), spec);
          for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) if (existsSync(base + ext)) stack.push(base + ext);
        }
      }
      expect(found, rule.path).toBe(true);
    }
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

  it("F3 관리자 계정·권한 = 최고관리자 전용, 제재 기록 = 회원 키(users) · 휴대폰 인증 = settings 키", () => {
    expect(resolveAdminRouteAccess("/admin/staff").requirement).toEqual({ kind: "super_admin" });
    expect(canAccessAdminRoute("/admin/staff", superAdmin)).toBe(true);
    expect(canAccessAdminRoute("/admin/staff", operator)).toBe(false);
    expect(canAccessAdminRoute("/admin/staff", bare)).toBe(false);
    expect(resolveAdminRouteAccess("/admin/reports/log").requirement).toEqual({ kind: "permission", key: "users" });
    expect(canAccessAdminRoute("/admin/reports/log", operator)).toBe(true);
    expect(canAccessAdminRoute("/admin/reports/log", { role: "admin", permissions: ["reports"] })).toBe(false);
    expect(canAccessAdminRoute("/admin/reports/log", bare)).toBe(false);
    expect(resolveAdminRouteAccess("/admin/users/phone-verification").requirement).toEqual({ kind: "permission", key: "settings" });
    expect(canAccessAdminRoute("/admin/users/phone-verification", { role: "admin", permissions: ["users"] })).toBe(false);
    expect(canAccessAdminRoute("/admin/users/phone-verification", { role: "admin", permissions: ["settings"] })).toBe(true);
  });

  it("정지된 운영자 — 서버 가드와 같이 거래·거래 채팅·커뮤니티 홍보 조치 불가 (열람 키 화면은 그대로) · 최고관리자 예외", () => {
    const suspended: AdminRouteAccessActor = { role: "admin", permissions: ["ads", "boards"], accountSuspended: true };
    expect(canAccessAdminRoute("/admin/trade/posts", suspended)).toBe(false);
    expect(canAccessAdminRoute("/admin/chats?type=trade", suspended)).toBe(false);
    expect(canAccessAdminRoute("/admin/community/promotions", suspended)).toBe(true);
    expect(canActOnAdminRoute("/admin/community/promotions", suspended)).toBe(false);
    expect(canActOnAdminRoute("/admin/community/promotions", { ...suspended, accountSuspended: false })).toBe(true);
    expect(canAccessAdminRoute("/admin/community/posts", suspended)).toBe(true);
    const superSuspendedFlag: AdminRouteAccessActor = { role: "super_admin", permissions: [], accountSuspended: true };
    expect(canActOnAdminRoute("/admin/community/promotions", superSuspendedFlag)).toBe(true);
    // 서버 가드도 같은 규칙을 가진다
    for (const f of [
      "lib/admin/trade-admin/trade-admin-guards.ts",
      "lib/admin/chat-admin/chat-admin-guards.ts",
      "lib/admin/community-admin/community-admin-guards.ts",
    ]) {
      expect(readFileSync(path.join(ROOT, f), "utf8"), f).toContain("isSuspendedMemberAccount(");
    }
  });

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
    // IA-06 (Owner 승인 2026-10-30): 최고관리자 전용 메뉴 화면은 화면 자체를 최고관리자로 (예전: 열람 전원·작업만 최고관리자)
    expect(canAccessAdminRoute("/admin/feed-emergency", operator)).toBe(false);
    expect(canAccessAdminRoute("/admin/feed-emergency", superAdmin)).toBe(true);
  });

  it("키 없는 관리자 — 거래(O-2)·거래 채팅은 전원, 커뮤니티·채팅은 키 필요", () => {
    expect(canAccessAdminRoute("/admin/trade/members", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats?type=trade", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats/reported?domain=trade", bare)).toBe(true);
    expect(canAccessAdminRoute("/admin/chats/reported", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/chats", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/community/posts", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/community", bare)).toBe(true);
    // RS-04 (Owner 승인 2026-10-30): 문의 화면 = support 키 (예전: 전원). 역할 기본 권한에 support 가 들어 있어 기존 운영자는 그대로.
    expect(canAccessAdminRoute("/admin/community/support", bare)).toBe(false);
    expect(canAccessAdminRoute("/admin/community/support", { role: "admin", permissions: ["support"] })).toBe(true);
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
