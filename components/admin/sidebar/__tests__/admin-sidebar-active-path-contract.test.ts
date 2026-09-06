import { describe, expect, it } from "vitest";
import { adminMenu, type AdminMenuItem } from "@/components/admin/admin-menu";
import {
  bestMatchingMenuPath,
  collectMenuPathEntries,
  collectMenuPaths,
  isLeafMenuActive,
  menuPathMatchScore,
} from "@/components/admin/sidebar/admin-sidebar-active-path";
import {
  listAdminWorkspaces,
  resolveActiveWorkspace,
} from "@/lib/admin/admin-workspace-routing";

function workspaceEntries(key: string) {
  const ws = adminMenu.find((w) => w.key === key);
  if (!ws) return [];
  return collectMenuPathEntries(ws.children?.length ? ws.children : [ws]);
}

function workspacePaths(key: string): string[] {
  return workspaceEntries(key).map((e) => e.path);
}

/** Mirror AdminSidebarItem leaf active using real menu item metadata. */
function activeLeaves(workspaceKey: string, current: string): string[] {
  const ws = adminMenu.find((w) => w.key === workspaceKey);
  if (!ws?.children?.length) return [];
  const scope = collectMenuPathEntries(ws.children);
  const out: string[] = [];
  function walk(items: AdminMenuItem[]) {
    for (const item of items) {
      if (item.children?.length) {
        walk(item.children);
        continue;
      }
      if (!item.path) continue;
      if (
        isLeafMenuActive(item.path, current, scope, item.matchPaths, {
          exactPath: item.exactPath === true,
          matchPathPrefixes: item.matchPathPrefixes,
        })
      ) {
        out.push(item.path);
      }
    }
  }
  walk(ws.children);
  return out;
}

describe("admin sidebar active path authority", () => {
  const cases: Array<{
    name: string;
    workspaceKey: string;
    path: string;
    expectLeaf: string | null;
    expectCount: number;
  }> = [
    {
      name: "ads control exact (not delivery detail)",
      workspaceKey: "ads",
      path: "/admin/delivery-ads",
      expectLeaf: "/admin/delivery-ads",
      expectCount: 1,
    },
    {
      name: "delivery ads manage hub",
      workspaceKey: "ads",
      path: "/admin/delivery-ads/manage",
      expectLeaf: "/admin/delivery-ads/manage",
      expectCount: 1,
    },
    {
      name: "deep messenger room",
      workspaceKey: "messenger",
      path: "/admin/chats/messenger",
      expectLeaf: "/admin/chats/messenger",
      expectCount: 1,
    },
    {
      name: "trailing slash",
      workspaceKey: "messenger",
      path: "/admin/chats/messenger/",
      expectLeaf: "/admin/chats/messenger",
      expectCount: 1,
    },
    {
      name: "hash ignored",
      workspaceKey: "messenger",
      path: "/admin/chats/messenger#section",
      expectLeaf: "/admin/chats/messenger",
      expectCount: 1,
    },
    {
      name: "support center leaf",
      workspaceKey: "support",
      path: "/admin/support",
      expectLeaf: "/admin/support",
      expectCount: 1,
    },
    {
      name: "support archive sibling",
      workspaceKey: "support",
      path: "/admin/support/archive",
      expectLeaf: "/admin/support/archive",
      expectCount: 1,
    },
    {
      name: "system reports root",
      workspaceKey: "system",
      path: "/admin/reports",
      expectLeaf: "/admin/reports",
      expectCount: 1,
    },
    {
      name: "trade reports product-open query",
      workspaceKey: "trade",
      path: "/admin/reports?domain=trade&target_type=product",
      expectLeaf: "/admin/reports?domain=trade&target_type=product",
      expectCount: 1,
    },
    {
      name: "trade reports domain-only query",
      workspaceKey: "trade",
      path: "/admin/reports?domain=trade",
      expectLeaf: "/admin/reports?domain=trade&target_type=product",
      expectCount: 1,
    },
  ];

  it.each(cases)("$name → leaf=$expectLeaf count=$expectCount", (c) => {
    const scope = workspaceEntries(c.workspaceKey);
    const actives = activeLeaves(c.workspaceKey, c.path);
    expect(actives.length).toBe(c.expectCount);
    if (c.expectLeaf) {
      // bestMatchingMenuPath may return a matchPaths entry; active leaf is the menu item path.
      expect(actives).toEqual([c.expectLeaf]);
      expect(bestMatchingMenuPath(c.path, scope)).not.toBeNull();
    } else {
      expect(actives).toEqual([]);
    }
  });

  it("delivery ad detail activates Delivery ops leaf (not Ads control)", () => {
    const scope = workspaceEntries("ads");
    const detail = "/admin/delivery-ads/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const best = bestMatchingMenuPath(detail, scope);
    expect(best).toBe("/admin/delivery-ads");
    expect(activeLeaves("ads", detail)).toEqual(["/admin/delivery-ads/manage"]);
    expect(
      isLeafMenuActive("/admin/delivery-ads", detail, scope, undefined, { exactPath: true })
    ).toBe(false);
  });

  it("never activates parent when longer descendant wins", () => {
    const scope = workspaceEntries("messenger");
    const current = "/admin/chats/messenger";
    expect(isLeafMenuActive("/admin/chats", current, scope)).toBe(false);
    expect(isLeafMenuActive("/admin/chats/messenger", current, scope)).toBe(true);
  });

  it("distinguishes support center vs archive sibling", () => {
    const scope = workspaceEntries("support");
    expect(isLeafMenuActive("/admin/support", "/admin/support", scope)).toBe(true);
    expect(isLeafMenuActive("/admin/support/archive", "/admin/support", scope)).toBe(false);
    expect(isLeafMenuActive("/admin/support", "/admin/support/archive", scope)).toBe(false);
    expect(isLeafMenuActive("/admin/support/archive", "/admin/support/archive", scope)).toBe(true);
  });

  it("distinguishes CP hash siblings (dashboard vs action-queue vs monitoring)", () => {
    expect(activeLeaves("system", "/admin/customer-platform")).toEqual([
      "/admin/customer-platform",
    ]);
    expect(activeLeaves("system", "/admin/customer-platform#action-queue")).toEqual([
      "/admin/customer-platform#action-queue",
    ]);
    expect(activeLeaves("system", "/admin/customer-platform#monitoring")).toEqual([
      "/admin/customer-platform#monitoring",
    ]);
  });

  it("rejects sibling prefix collisions", () => {
    expect(menuPathMatchScore("/admin/reports", "/admin/report")).toBe(-1);
    expect(menuPathMatchScore("/admin/stores", "/admin/store")).toBe(-1);
    expect(menuPathMatchScore("/admin/chats", "/admin/chat")).toBe(-1);
  });

  it("keeps one active workspace for each sample path", () => {
    for (const path of [
      "/admin",
      "/admin/",
      "/admin/common",
      "/admin/users",
      "/admin/reports",
      "/admin/stores",
      "/admin/chats/messenger",
      "/admin/support",
      "/admin/support/archive",
      "/admin/unknown-route-xyz",
    ]) {
      const ws = resolveActiveWorkspace(path, "master");
      const matches = listAdminWorkspaces("master").filter((w) => w.id === ws.id);
      expect(matches.length).toBe(1);
    }
  });
});
