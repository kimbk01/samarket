import { describe, expect, it } from "vitest";
import { adminMenu, collectAdminMenuPathEntries, filterMenuByRole } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { listAdminWorkspaces } from "@/lib/admin/admin-workspace-routing";
import {
  adminAccessActorFromMe,
  decideAdminPageGate,
  filterAdminMenuByAccess,
  resolveAdminRouteActionState,
} from "@/lib/admin/access/admin-access-ui";
import { canAccessAdminRoute, type AdminRouteAccessActor } from "@/lib/admin/access/admin-route-access";
import { listDashboardQuickLinks, projectDashboardQuickLinks } from "@/lib/admin/dashboard-quick-links";

const SUPER: AdminRouteAccessActor = { role: "super_admin", permissions: [], isDeployOwner: false };
const DEPLOY_OWNER: AdminRouteAccessActor = { role: "super_admin", permissions: [], isDeployOwner: true };
/** 운영자 — point · settings 키 없음 */
const OPERATOR: AdminRouteAccessActor = {
  role: "admin",
  permissions: ["users", "reports", "chats", "business", "boards", "ads"],
  isDeployOwner: false,
};

const POINT_LEAF_KEYS = [
  "points-charge",
  "points-ledger",
  "points-plans",
  "points-policy",
  "points-execute",
  "points-expire",
  "community-point-charges",
  "community-point-policies",
];

function leafPaths(menu: ReturnType<typeof filterAdminMenuByAccess>): string[] {
  return collectAdminMenuPathEntries(menu).map((e) => e.path);
}

describe("filterAdminMenuByAccess — 메뉴 노출 = 서버 권한", () => {
  it("point 키 없는 운영자: 포인트 leaf 가 사라지고 빈 섹션도 빠진다", () => {
    const menu = filterAdminMenuByAccess(filterMenuByRole(adminMenu, "operator"), OPERATOR);
    for (const key of POINT_LEAF_KEYS) expect(findAdminMenuByKey(menu, key), key).toBeUndefined();
    expect(findAdminMenuByKey(menu, "finance-member-point")).toBeUndefined();
    expect(findAdminMenuByKey(menu, "settings-auth")).toBeUndefined();
    // 조회가 전원인 화면은 남는다 (권한 축소 없음)
    expect(findAdminMenuByKey(menu, "store-finance-admin")).toBeTruthy();
    expect(findAdminMenuByKey(menu, "users")).toBeTruthy();
    // 남은 leaf 는 전부 열 수 있다
    for (const p of leafPaths(menu)) expect(canAccessAdminRoute(p, OPERATOR), p).toBe(true);
    // 섹션(자식 있던 노드)이 빈 채로 남지 않는다
    const walk = (nodes: typeof menu): void => {
      for (const n of nodes) {
        if (n.children) {
          expect(n.children.length, n.key).toBeGreaterThan(0);
          walk(n.children);
        }
      }
    };
    walk(menu);
  });

  it("point 키가 있으면 포인트 leaf 가 보인다", () => {
    const menu = filterAdminMenuByAccess(adminMenu, { ...OPERATOR, permissions: [...OPERATOR.permissions, "point"] });
    for (const key of POINT_LEAF_KEYS) expect(findAdminMenuByKey(menu, key), key).toBeTruthy();
  });

  it("super_admin 은 역할 필터 결과를 그대로 유지", () => {
    const roleFiltered = filterMenuByRole(adminMenu, "master");
    const menu = filterAdminMenuByAccess(roleFiltered, SUPER);
    expect(leafPaths(menu)).toEqual(leafPaths(roleFiltered));
    expect(listAdminWorkspaces("master", menu).map((w) => w.key)).toEqual(
      listAdminWorkspaces("master").map((w) => w.key)
    );
  });

  it("배포 담당자 여부는 메뉴 노출을 바꾸지 않고 배포 작업 버튼만 가른다", () => {
    const a = filterAdminMenuByAccess(adminMenu, SUPER);
    const b = filterAdminMenuByAccess(adminMenu, DEPLOY_OWNER);
    expect(leafPaths(a)).toEqual(leafPaths(b));
    expect(findAdminMenuByKey(a, "system-deploy")).toBeTruthy();

    const notOwner = resolveAdminRouteActionState({ href: "/admin/system/deploy", actor: SUPER, actorLoading: false });
    expect(notOwner.allowed).toBe(false);
    expect(notOwner.reason).toContain("배포 담당자");
    expect(
      resolveAdminRouteActionState({ href: "/admin/system/deploy", actor: DEPLOY_OWNER, actorLoading: false })
    ).toEqual({ allowed: true, reason: null, loading: false });
    expect(
      resolveAdminRouteActionState({ href: "/admin/system/deploy", actor: null, actorLoading: true })
    ).toEqual({ allowed: false, reason: null, loading: true });
  });

  it("운영자에게는 플랫폼 시스템 내부 도구·배포가 보이지 않는다", () => {
    const menu = filterAdminMenuByAccess(adminMenu, OPERATOR);
    expect(findAdminMenuByKey(menu, "system-qa")).toBeUndefined();
    expect(findAdminMenuByKey(menu, "system-deploy")).toBeUndefined();
  });
});

describe("decideAdminPageGate — 셸 본문 게이트 (순수)", () => {
  it("actor 있음: 충족 → allow, 미충족 → deny", () => {
    expect(decideAdminPageGate({ href: "/admin/point-charges", actor: OPERATOR, actorLoading: false })).toBe("deny");
    expect(decideAdminPageGate({ href: "/admin/point-charges/abc", actor: OPERATOR, actorLoading: false })).toBe("deny");
    expect(decideAdminPageGate({ href: "/admin/settings/auth", actor: OPERATOR, actorLoading: false })).toBe("deny");
    expect(decideAdminPageGate({ href: "/admin/qa-board", actor: OPERATOR, actorLoading: false })).toBe("deny");
    expect(decideAdminPageGate({ href: "/admin/users", actor: OPERATOR, actorLoading: false })).toBe("allow");
    expect(decideAdminPageGate({ href: "/admin/point-charges", actor: SUPER, actorLoading: false })).toBe("allow");
    // 배포 화면 열람은 super_admin (작업만 담당자)
    expect(decideAdminPageGate({ href: "/admin/system/deploy", actor: SUPER, actorLoading: false })).toBe("allow");
  });

  it("쿼리 일치 규칙: 거래 채팅은 전원, 일반 채팅은 chats 키", () => {
    const noChats: AdminRouteAccessActor = { role: "admin", permissions: [] };
    expect(decideAdminPageGate({ href: "/admin/chats?type=trade", actor: noChats, actorLoading: false })).toBe("allow");
    expect(decideAdminPageGate({ href: "/admin/chats", actor: noChats, actorLoading: false })).toBe("deny");
  });

  it("actor 로딩 중: any_admin 화면만 바로 렌더, 나머지는 loading", () => {
    expect(decideAdminPageGate({ href: "/admin", actor: null, actorLoading: true })).toBe("allow");
    expect(decideAdminPageGate({ href: "/admin/stores", actor: null, actorLoading: true })).toBe("allow");
    expect(decideAdminPageGate({ href: "/admin/point-charges", actor: null, actorLoading: true })).toBe("loading");
  });

  it("actor 없음(로딩 끝): 서버 가드에 맡긴다 — 기존 동작", () => {
    expect(decideAdminPageGate({ href: "/admin/point-charges", actor: null, actorLoading: false })).toBe("allow");
  });
});

describe("adminAccessActorFromMe", () => {
  it("/me 스냅샷 → actor (구버전 응답은 isDeployOwner=false)", () => {
    expect(adminAccessActorFromMe(null)).toBeNull();
    expect(adminAccessActorFromMe({ role: "admin", permissions: ["users"] })).toEqual({
      role: "admin",
      permissions: ["users"],
      isDeployOwner: false,
    });
    expect(adminAccessActorFromMe({ role: "super_admin", permissions: [], isDeployOwner: true })?.isDeployOwner).toBe(
      true
    );
  });
});

describe("대시보드 바로가기 — 같은 접근표 필터", () => {
  it("actor 없으면 기존 역할 필터 결과와 같다", () => {
    expect(listDashboardQuickLinks("master", null)).toEqual(listDashboardQuickLinks("master"));
  });

  it("운영자 바로가기는 전부 열 수 있는 화면을 가리킨다", () => {
    const links = listDashboardQuickLinks("operator", OPERATOR);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(canAccessAdminRoute(l.href, OPERATOR), `${l.menuKey} ${l.href}`).toBe(true);
  });

  it("users 키 없는 운영자: 회원 바로가기는 열 수 있는 첫 화면으로 간다", () => {
    const actor: AdminRouteAccessActor = { role: "admin", permissions: ["reports"] };
    const users = projectDashboardQuickLinks("operator", actor).ops.find((l) => l.menuKey === "users");
    if (users) expect(canAccessAdminRoute(users.href, actor)).toBe(true);
    expect(projectDashboardQuickLinks("operator", { role: "admin", permissions: [] }).ops.every((l) =>
      canAccessAdminRoute(l.href, { role: "admin", permissions: [] })
    )).toBe(true);
  });

  it("super_admin 은 역할 필터 결과 그대로", () => {
    expect(listDashboardQuickLinks("master", SUPER)).toEqual(listDashboardQuickLinks("master"));
  });
});
