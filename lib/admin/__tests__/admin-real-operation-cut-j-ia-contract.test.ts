/**
 * CUT J — Domain / Common Operation IA navigation contract (J1–J34).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  adminMenu,
  collectAdminMenuPathEntries,
  filterMenuByRole,
  filterMenuForPublicSidebar,
  type AdminMenuItem,
} from "@/components/admin/admin-menu";
import {
  collectMenuPathEntries,
  isLeafMenuActive,
} from "@/components/admin/sidebar/admin-sidebar-active-path";
import { ADMIN_MENU_PRE_J_AMD_5_LEAVES } from "@/lib/admin/__tests__/fixtures/admin-menu-pre-j-amd-5-leaves";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveActiveWorkspace } from "@/lib/admin/admin-workspace-routing";
import {
  assertAdminRealOperationCutJIaSeparationHardLock,
  CUT_I_CARRY_INTO_J,
  CUT_J_CONFIG_VS_OPERATION,
  CUT_J_J_AMD_3_ADDED_LEAF,
  CUT_J_J_AMD_3_DELIVERY_TREE,
  CUT_J_J_AMD_3_MOVED_OUT_OF_DELIVERY,
  CUT_J_J_AMD_3_REMOVED_SECTIONS,
  CUT_J_J_AMD_4_MESSENGER_TREE,
  CUT_J_J_AMD_4_MOVED_INTO_MESSENGER,
  CUT_J_J_AMD_4_REDIRECTS,
  CUT_J_J_AMD_4_REMOVED_SECTIONS,
  CUT_J_J_AMD_4_REPOINTED_LEAVES,
  CUT_J_J_AMD_5_HIDDEN_LEAVES,
  CUT_J_J_AMD_5_UNHIDDEN_LEAVES,
  CUT_J_J_AMD_5_INTERNAL_TOOLS,
  CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION,
  CUT_J_J_AMD_5_MASTER_ONLY_SYSTEM_LEAVES,
  CUT_J_J_AMD_5_MEMBERS_LEAVES,
  CUT_J_IA_R1_MEMBERS_TREE,
  CUT_J_J_AMD_5_ADDED_STAFF_LEAF,
  CUT_J_J_AMD_5_MOVED_INTO_PROMOTION,
  CUT_J_J_AMD_5_PROMOTION_TREE,
  CUT_J_J_AMD_5_REMOVED_LEAVES,
  CUT_J_J_AMD_5_REMOVED_SECTIONS,
  CUT_J_J_AMD_5_SYSTEM_TREE,
  CUT_J_J_AMD_5_WORKSPACE_LABELS,
  CUT_J_LEGACY_PRIMARY_FORBIDDEN,
  CUT_J_NAV_SSOT,
  CUT_J_WORKSPACE_ORDER,
} from "@/lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock";

const ROOT = path.resolve(__dirname, "../../..");

function workspaceOf(route: string) {
  return resolveActiveWorkspace(route, "master").id;
}

function liveTree(key: string) {
  return (findAdminMenuByKey(adminMenu, key)?.children ?? []).map((c) => ({
    key: c.key,
    children: (c.children ?? []).map((k) => k.key),
  }));
}

function walkLeaves(items: AdminMenuItem[], out: AdminMenuItem[] = []): AdminMenuItem[] {
  for (const item of items) {
    if (item.children?.length) walkLeaves(item.children, out);
    else out.push(item);
  }
  return out;
}

/** Sidebar-equivalent: some leaf of the resolved workspace is active for `route`. */
function activeLeafKeys(route: string): string[] {
  const ws = resolveActiveWorkspace(route, "master");
  const children = ws.item.children?.length ? ws.item.children : [ws.item];
  const scope = collectMenuPathEntries(children);
  return walkLeaves(children)
    .filter((leaf) =>
      isLeafMenuActive(leaf.path, route, scope, leaf.matchPaths, {
        exactPath: leaf.exactPath === true,
        matchPathPrefixes: leaf.matchPathPrefixes,
      })
    )
    .map((leaf) => leaf.key);
}

describe("CUT J IA separation hard lock", () => {
  it("anchor asserts", () => {
    expect(assertAdminRealOperationCutJIaSeparationHardLock()).toBe(true);
    expect(CUT_J_NAV_SSOT.menuTreeAuthority).toBe("components/admin/admin-menu.ts");
  });

  it("J1 /admin → dashboard (운영 / Action Center)", () => {
    expect(workspaceOf("/admin")).toBe("dashboard");
  });

  it("J2 HOME config → delivery", () => {
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.homeConfigRoute)).toBe("delivery");
  });

  it("J3 Category config → delivery", () => {
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.categoryConfigRoute)).toBe("delivery");
  });

  it("J4 Store/order management → delivery", () => {
    expect(workspaceOf("/admin/stores")).toBe("delivery");
    expect(workspaceOf("/admin/stores/orders")).toBe("delivery");
  });

  it("J5 Trade management → trade", () => {
    expect(workspaceOf("/admin/trade")).toBe("trade");
    expect(workspaceOf("/admin/posts-management")).toBe("trade");
  });

  it("J6 Community management → community", () => {
    expect(workspaceOf("/admin/community/posts")).toBe("community");
  });

  it("J7 Messenger admin surface → messenger", () => {
    expect(workspaceOf("/admin/chats/messenger")).toBe("messenger");
    expect(workspaceOf("/admin/chats/reported")).toBe("messenger");
  });

  it("J8 /admin/finance → finance", () => {
    expect(workspaceOf("/admin/finance")).toBe("finance");
  });

  it("J9 Point / Coin / Cash leaves → finance", () => {
    expect(workspaceOf("/admin/point-charges")).toBe("finance");
    expect(workspaceOf("/admin/store-point-ledger")).toBe("finance");
    expect(findAdminMenuByKey(adminMenu, "finance-member-point")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "finance-store-currency")).toBeTruthy();
  });

  it("J10 /admin/delivery-ads → ads", () => {
    expect(workspaceOf("/admin/delivery-ads")).toBe("ads");
  });

  it("J11 /admin/feed-ads → ads", () => {
    expect(workspaceOf("/admin/feed-ads")).toBe("ads");
  });

  it("J12 /admin/platform-popup → promotion (Platform Promotion IA)", () => {
    expect(workspaceOf("/admin/platform-popup")).toBe("promotion");
  });

  it("J13 Placement Map → ads", () => {
    expect(workspaceOf("/admin/delivery-ads/inventory")).toBe("ads");
    expect(findAdminMenuByKey(adminMenu, "ads-placement-map")?.path).toBe(
      CUT_J_CONFIG_VS_OPERATION.placementMapRoute
    );
  });

  it("J14 /admin/support → support", () => {
    expect(workspaceOf("/admin/support")).toBe("support");
  });

  it("J15 notifications → notifications", () => {
    expect(workspaceOf("/admin/notifications")).toBe("notifications");
  });

  it("J16 /admin/system/data-reset → system (prelaunch redirects)", () => {
    expect(workspaceOf("/admin/system/data-reset")).toBe("system");
    expect(workspaceOf("/admin/prelaunch-reset")).toBe("system");
  });

  it("J17 legacy platform inquiry not primary", () => {
    const paths = collectAdminMenuPathEntries(adminMenu).map((e) => e.path);
    expect(paths).not.toContain(CUT_J_LEGACY_PRIMARY_FORBIDDEN.platformInquiriesPrimary);
  });

  it("J18 AST-002 store points charges not primary nav", () => {
    expect(
      findAdminMenuByKey(adminMenu, CUT_J_LEGACY_PRIMARY_FORBIDDEN.ast002StorePointChargesMenuKey)
    ).toBeUndefined();
  });

  it("J19 no duplicate canonical mutation page (one path = one leaf)", () => {
    const entries = collectAdminMenuPathEntries(adminMenu);
    const counts = new Map<string, string[]>();
    for (const e of entries) {
      const list = counts.get(e.path) ?? [];
      list.push(e.key);
      counts.set(e.path, list);
    }
    const dupes = [...counts.entries()].filter(([, keys]) => keys.length > 1);
    expect(dupes).toEqual([]);
  });

  it("J20 config vs operation boundary preserved", () => {
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.homeConfigRoute)).toBe(
      CUT_J_CONFIG_VS_OPERATION.homeConfigWorkspace
    );
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.deliveryAdsOpsRoute)).toBe(
      CUT_J_CONFIG_VS_OPERATION.deliveryAdsOpsWorkspace
    );
    expect(CUT_J_CONFIG_VS_OPERATION.placementMapIsConfigWriter).toBe(false);
    const deliveryPaths = collectAdminMenuPathEntries(
      findAdminMenuByKey(adminMenu, "delivery")?.children ?? []
    );
    const opsKeys = deliveryPaths.map((e) => e.key);
    expect(opsKeys.length).toBeGreaterThan(0);
    expect(opsKeys).not.toContain("delivery-ads-control");
    expect(opsKeys).not.toContain("store-ads-section");
  });

  it("J-AMD-3 delivery operator-task sections match live menu", () => {
    const delivery = findAdminMenuByKey(adminMenu, "delivery");
    const live = (delivery?.children ?? []).map((c) => ({
      key: c.key,
      children: (c.children ?? []).map((k) => k.key),
    }));
    expect(live).toEqual(
      CUT_J_J_AMD_3_DELIVERY_TREE.map((n) => ({ key: n.key, children: [...n.children] }))
    );
    for (const section of delivery?.children ?? []) {
      if (section.children?.length) expect(section.path).toBeUndefined();
    }
    for (const k of CUT_J_J_AMD_3_REMOVED_SECTIONS) {
      expect(findAdminMenuByKey(adminMenu, k)).toBeUndefined();
    }
    const added = findAdminMenuByKey(adminMenu, CUT_J_J_AMD_3_ADDED_LEAF.key);
    expect(added?.path).toBe(CUT_J_J_AMD_3_ADDED_LEAF.path);
    expect(workspaceOf(CUT_J_J_AMD_3_ADDED_LEAF.path)).toBe("delivery");
    for (const moved of CUT_J_J_AMD_3_MOVED_OUT_OF_DELIVERY) {
      expect(findAdminMenuByKey(adminMenu, moved.key)?.path).toBe(moved.path);
      const parent = findAdminMenuByKey(adminMenu, moved.parent);
      expect((parent?.children ?? []).map((c) => c.key)).toContain(moved.key);
      expect(workspaceOf(moved.path)).toBe(moved.workspace);
    }
  });

  it("J-AMD-4 chat workspace sections match live menu", () => {
    const messenger = findAdminMenuByKey(adminMenu, "messenger");
    const live = (messenger?.children ?? []).map((c) => ({
      key: c.key,
      children: (c.children ?? []).map((k) => k.key),
    }));
    expect(live).toEqual(
      CUT_J_J_AMD_4_MESSENGER_TREE.map((n) => ({ key: n.key, children: [...n.children] }))
    );
    for (const section of messenger?.children ?? []) {
      if (section.children?.length) expect(section.path).toBeUndefined();
    }
    for (const k of CUT_J_J_AMD_4_REMOVED_SECTIONS) {
      expect(findAdminMenuByKey(adminMenu, k)).toBeUndefined();
    }
    for (const leaf of CUT_J_J_AMD_4_REPOINTED_LEAVES) {
      const node = findAdminMenuByKey(adminMenu, leaf.key);
      expect(node?.path).toBe(leaf.path);
      expect(node?.matchPaths ?? []).toContain(leaf.legacyMatchPath);
      expect(workspaceOf(leaf.legacyMatchPath)).toBe("messenger");
      expect(workspaceOf(leaf.path)).toBe("messenger");
    }
    for (const moved of CUT_J_J_AMD_4_MOVED_INTO_MESSENGER) {
      expect(findAdminMenuByKey(adminMenu, moved.key)?.path).toBe(moved.path);
      const parent = findAdminMenuByKey(adminMenu, moved.parent);
      expect((parent?.children ?? []).map((c) => c.key)).toContain(moved.key);
      expect(workspaceOf(moved.path)).toBe(moved.workspace);
    }
    const leafPaths = collectAdminMenuPathEntries(adminMenu).map((e) => e.path);
    expect(leafPaths.some((p) => p.includes("from=messenger"))).toBe(false);
    for (const r of CUT_J_J_AMD_4_REDIRECTS) {
      expect(leafPaths).not.toContain(r.from);
      const page = readFileSync(
        path.join(ROOT, "app", ...r.from.slice(1).split("/"), "page.tsx"),
        "utf8"
      );
      expect(page).toContain(`redirect("${r.to}")`);
    }
  });

  it("J-AMD-5 members · promotion · system trees match live menu", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([...CUT_J_WORKSPACE_ORDER]);
    for (const ws of CUT_J_J_AMD_5_WORKSPACE_LABELS) {
      expect(findAdminMenuByKey(adminMenu, ws.key)?.titleKey).toBe(ws.titleKey);
    }
    // Admin IA R1 (2026-10-30): members 는 섹션 3개 — leaf 순서·경로는 그대로 비교한다.
    expect(
      walkLeaves(findAdminMenuByKey(adminMenu, "members")?.children ?? [])
        .filter((c) => !c.entryAlias) // 재감사: 리뷰 별칭 진입점은 원래 메뉴(배달·거래) leaf
        .map((c) => ({
        key: c.key,
        path: c.path,
      }))
    ).toEqual(CUT_J_J_AMD_5_MEMBERS_LEAVES.map((l) => ({ key: l.key, path: l.path })));
    expect(liveTree("members")).toEqual(
      CUT_J_IA_R1_MEMBERS_TREE.map((n) => ({ key: n.key, children: [...n.children] }))
    );
    expect(findAdminMenuByKey(adminMenu, "staff")).toBeUndefined();
    // F3: 관리자 계정·권한 — members 마지막 leaf, master-only, 경로 1개.
    const staffLeaf = findAdminMenuByKey(adminMenu, CUT_J_J_AMD_5_ADDED_STAFF_LEAF.key);
    expect(staffLeaf?.path).toBe(CUT_J_J_AMD_5_ADDED_STAFF_LEAF.path);
    expect(staffLeaf?.roles).toEqual([...CUT_J_J_AMD_5_ADDED_STAFF_LEAF.roles]);
    expect(CUT_J_J_AMD_5_MEMBERS_LEAVES.at(-1)?.key).toBe(CUT_J_J_AMD_5_ADDED_STAFF_LEAF.key);
    expect(
      collectAdminMenuPathEntries(adminMenu).filter((e) => e.path === "/admin/staff").map((e) => e.key)
    ).toEqual([CUT_J_J_AMD_5_ADDED_STAFF_LEAF.key]);
    expect(workspaceOf("/admin/staff")).toBe("members");

    expect(liveTree("promotion")).toEqual(
      CUT_J_J_AMD_5_PROMOTION_TREE.map((n) => ({ key: n.key, children: [...n.children] }))
    );
    expect(liveTree("system")).toEqual(
      CUT_J_J_AMD_5_SYSTEM_TREE.map((n) => ({ key: n.key, children: [...n.children] }))
    );
    for (const ws of ["promotion", "system"]) {
      for (const section of findAdminMenuByKey(adminMenu, ws)?.children ?? []) {
        if (section.children?.length) expect(section.path).toBeUndefined();
      }
    }
    for (const key of CUT_J_J_AMD_5_MOVED_INTO_PROMOTION) {
      const path = findAdminMenuByKey(adminMenu, key)?.path;
      expect(path, key).toBeTruthy();
      expect(workspaceOf(path!), key).toBe("promotion");
    }
    for (const k of CUT_J_J_AMD_5_REMOVED_SECTIONS) {
      expect(findAdminMenuByKey(adminMenu, k), k).toBeUndefined();
    }
  });

  it("J-AMD-5 internal tools: 24 leaves, master-only; 운영 가이드 visible to every admin", () => {
    const section = findAdminMenuByKey(adminMenu, CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION.key);
    expect(section?.roles).toEqual([...CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION.roles]);
    expect(section?.path).toBeUndefined();
    expect((section?.children ?? []).map((c) => ({ key: c.key, path: c.path }))).toEqual(
      CUT_J_J_AMD_5_INTERNAL_TOOLS.map((t) => ({ key: t.key, path: t.path }))
    );
    for (const role of ["admin", "operator", "viewer"] as const) {
      const filtered = filterMenuByRole(adminMenu, role);
      expect(findAdminMenuByKey(filtered, CUT_J_J_AMD_5_INTERNAL_TOOLS_SECTION.key)).toBeUndefined();
      for (const tool of CUT_J_J_AMD_5_INTERNAL_TOOLS) {
        expect(findAdminMenuByKey(filtered, tool.key), `${role}:${tool.key}`).toBeUndefined();
      }
      for (const key of CUT_J_J_AMD_5_MASTER_ONLY_SYSTEM_LEAVES) {
        expect(findAdminMenuByKey(filtered, key), `${role}:${key}`).toBeUndefined();
      }
      expect(findAdminMenuByKey(filtered, "ops-docs-board")?.path).toBe("/admin/docs/board");
    }
    const master = filterMenuByRole(adminMenu, "master");
    for (const tool of CUT_J_J_AMD_5_INTERNAL_TOOLS) {
      expect(findAdminMenuByKey(master, tool.key)?.path).toBe(tool.path);
    }
    // J-AMD-4 unchanged: chat guide stays in chat.
    expect(workspaceOf("/admin/docs/chat")).toBe("messenger");
    expect(workspaceOf("/admin/docs/board")).toBe("system");
  });

  it("app-meta (앱 버전·업데이트) is shown in the system sidebar (2026-10-30 Owner)", () => {
    const publicMenu = filterMenuForPublicSidebar(adminMenu);
    for (const leaf of CUT_J_J_AMD_5_UNHIDDEN_LEAVES) {
      const node = findAdminMenuByKey(adminMenu, leaf.key);
      expect(node?.path).toBe(leaf.path);
      expect(node?.sidebarPublic).not.toBe(false);
      expect(findAdminMenuByKey(publicMenu, leaf.key)?.path).toBe(leaf.path);
      expect(workspaceOf(leaf.path)).toBe("system");
    }
  });

  it("J-AMD-5 hidden (O-8) and removed duplicate leaves keep URLs reachable", () => {
    const publicMenu = filterMenuForPublicSidebar(adminMenu);
    for (const hidden of CUT_J_J_AMD_5_HIDDEN_LEAVES) {
      const node = findAdminMenuByKey(adminMenu, hidden.key);
      expect(node?.path).toBe(hidden.path);
      expect(node?.sidebarPublic).toBe(false);
      expect(findAdminMenuByKey(publicMenu, hidden.key)).toBeUndefined();
    }
    const leafPaths = collectAdminMenuPathEntries(adminMenu).map((e) => e.path);
    for (const removed of CUT_J_J_AMD_5_REMOVED_LEAVES) {
      expect(findAdminMenuByKey(adminMenu, removed.key)).toBeUndefined();
      expect(leafPaths).not.toContain(removed.path);
      const cover = findAdminMenuByKey(adminMenu, removed.coveredBy);
      expect(cover?.path).toBeTruthy();
      if (removed.via === "matchPaths") expect(cover?.matchPaths ?? []).toContain(removed.path);
      expect(activeLeafKeys(removed.path), removed.path).toEqual([removed.coveredBy]);
    }
    expect(workspaceOf("/admin/platform-promotion/notifications")).toBe("notifications");
    expect(workspaceOf("/admin/categories")).toBe("trade");
  });

  it("J-AMD-5 195 pre-amendment leaves: every old path still resolves to an active menu entry", () => {
    expect(ADMIN_MENU_PRE_J_AMD_5_LEAVES).toHaveLength(195);
    const leaves = walkLeaves(adminMenu);
    const removedByPath = new Map<string, (typeof CUT_J_J_AMD_5_REMOVED_LEAVES)[number]>(
      CUT_J_J_AMD_5_REMOVED_LEAVES.map((r) => [r.path, r])
    );
    for (const old of ADMIN_MENU_PRE_J_AMD_5_LEAVES) {
      if (old.path == null) {
        // Path-less legacy keys (ads-platform-*) stay for redirects / findAdminMenuByKey.
        expect(findAdminMenuByKey(adminMenu, old.key)?.key, old.key).toBe(old.key);
        continue;
      }
      const direct = leaves.find(
        (l) => l.path === old.path || (l.matchPaths ?? []).includes(old.path!)
      );
      const removed = removedByPath.get(old.path);
      expect(direct != null || removed != null, `uncovered ${old.path}`).toBe(true);
      if (!removed) expect(findAdminMenuByKey(adminMenu, old.key)?.key, old.key).toBe(old.key);
      expect(activeLeafKeys(old.path).length, `not highlightable ${old.path}`).toBeGreaterThan(0);
    }
    // J-AMD-5 added the two member sub-screen leaves + F3 「관리자 계정·권한」 (195 − 3 removed + 3 added = 195).
    // + P-7 (2026-10-27, Owner 승인 계획안 v3) 거래 「샘플 상품」 `/admin/trade/showcase` = 196.
    // + 5-G (2026-10-29, Owner 승인 v3 설계) 배달 「배달 화면 구성」 `/admin/delivery-screens` = 197.
    // + Admin IA R1 (2026-10-30, Owner 권장안 승인) 회원 혜택 · 배달 광고 진입 · 배너 현황 · 배너 진입 2 = 202.
    // + 배민 미러링 v6 (2026-10-30, Owner 승인) 배달 「메뉴 관리」 `/admin/delivery-menus` = 203.
    // + 재감사 (2026-10-30 Owner 승인) 별칭 진입점: 광고·배너 11 · 리뷰 2 · 카테고리 3 · 도메인 광고(배달 3 + 거래 4 + 커뮤니티 4) = 230.
    // + 고객지원 「이의신청 (전체)」·「매장 문의 (조회)」 = 232.
    // + 재감사 B 도메인 「이벤트」 별칭 (배달·거래·커뮤니티 `/admin/platform-events?domain=`) = 235.
    // − 알림 발송 v3 (2026-10-30 Owner 승인) 광고·배너 「홍보 발송」 별칭 삭제 (알림 › 푸시·알림 발송 한 곳) = 234.
    expect(leaves).toHaveLength(234);
    // 원래 메뉴 leaf = 203 − (`?from=` 진입점 3개[프로모션·마이페이지 배너, 배달 광고]가 별칭으로 바뀜) + 고객지원 보기 2개 = 202
    expect(leaves.filter((l) => !l.entryAlias)).toHaveLength(202);
  });

  it("J21–J34 operational findability primary paths", () => {
    const findability: Record<string, { workspace: string; route: string }> = {
      J21_cash: { workspace: "finance", route: "/admin/finance" },
      J22_coin: { workspace: "finance", route: "/admin/finance" },
      J23_delivery_ad: { workspace: "ads", route: "/admin/delivery-ads/manage" },
      J24_banner: { workspace: "ads", route: "/admin/delivery-ads/manage" },
      J25_popup: { workspace: "promotion", route: "/admin/platform-popup" },
      J25b_events: { workspace: "promotion", route: "/admin/platform-events" },
      J26_feed: { workspace: "ads", route: "/admin/feed-ads" },
      J27_member_support: { workspace: "support", route: "/admin/support" },
      J28_store_support: { workspace: "support", route: "/admin/support" },
      J29_home: { workspace: "delivery", route: "/admin/stores-home-shelves" },
      J30_category: { workspace: "delivery", route: "/admin/stores-category-policy" },
      J31_store: { workspace: "delivery", route: "/admin/stores" },
      J32_partner: { workspace: "ads", route: "/admin/delivery-ads/commercial-settings" },
      J33_notification: { workspace: "notifications", route: "/admin/notifications" },
      J34_reset: { workspace: "system", route: "/admin/system/data-reset" },
    };
    for (const [id, { workspace, route }] of Object.entries(findability)) {
      expect(workspaceOf(route), id).toBe(workspace);
    }
  });

  it("dissolves growth/common; keeps CUT J workspace order", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([...CUT_J_WORKSPACE_ORDER]);
    expect(findAdminMenuByKey(adminMenu, "growth")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "common")).toBeUndefined();
  });

  it("forbids parallel shell routes and preserves CUT I carry honesty", () => {
    for (const shell of CUT_J_NAV_SSOT.newShellRoutesForbidden) {
      const rel = path.join(ROOT, "app", ...shell.slice(1).split("/"), "page.tsx");
      expect(existsSync(rel), shell).toBe(false);
    }
    expect(CUT_I_CARRY_INTO_J.financeF1F3F4F7).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.coinSaleRecognition).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.adsApplyActiveApp).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.pauseResumeEnd).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.popupRuntime).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.resetStorage).toBe("NOT_IMPLEMENTED");
    expect(CUT_I_CARRY_INTO_J.resetAuth).toBe("NOT_IMPLEMENTED");
  });
});
