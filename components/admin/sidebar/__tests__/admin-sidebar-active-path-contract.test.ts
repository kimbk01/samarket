import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  bestMatchingMenuPath,
  collectMenuPaths,
  isLeafMenuActive,
  menuPathMatchScore,
} from "@/components/admin/sidebar/admin-sidebar-active-path";
import {
  listAdminWorkspaces,
  resolveActiveWorkspace,
} from "@/lib/admin/admin-workspace-routing";

function workspacePaths(key: string): string[] {
  const ws = adminMenu.find((w) => w.key === key);
  if (!ws) return [];
  return collectMenuPaths(ws.children?.length ? ws.children : [ws]);
}

function activeLeaves(scope: string[], current: string): string[] {
  return scope.filter((p) => isLeafMenuActive(p, current, scope));
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
      name: "workspace root messenger",
      workspaceKey: "messenger",
      path: "/admin/chats",
      expectLeaf: "/admin/chats",
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
      name: "inquiry query",
      workspaceKey: "system",
      path: "/admin/member-notes?kind=inquiry",
      expectLeaf: "/admin/member-notes?kind=inquiry",
      expectCount: 1,
    },
    {
      name: "inbox query sibling",
      workspaceKey: "system",
      path: "/admin/member-notes?kind=inbox",
      expectLeaf: "/admin/member-notes?kind=inbox",
      expectCount: 1,
    },
    {
      name: "common reports root",
      workspaceKey: "common",
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
      expectLeaf: "/admin/reports?domain=trade",
      expectCount: 1,
    },
  ];

  it.each(cases)("$name → leaf=$expectLeaf count=$expectCount", (c) => {
    const scope = workspacePaths(c.workspaceKey);
    const actives = activeLeaves(scope, c.path);
    expect(actives.length).toBe(c.expectCount);
    if (c.expectLeaf) {
      expect(bestMatchingMenuPath(c.path, scope)).toBe(c.expectLeaf);
      expect(actives).toEqual([c.expectLeaf]);
    } else {
      expect(actives).toEqual([]);
    }
  });

  it("never activates parent when longer descendant wins", () => {
    const scope = workspacePaths("messenger");
    const current = "/admin/chats/messenger";
    expect(isLeafMenuActive("/admin/chats", current, scope)).toBe(false);
    expect(isLeafMenuActive("/admin/chats/messenger", current, scope)).toBe(true);
  });

  it("distinguishes inquiry vs inbox", () => {
    const scope = workspacePaths("system");
    expect(isLeafMenuActive("/admin/member-notes?kind=inquiry", "/admin/member-notes?kind=inquiry", scope)).toBe(
      true
    );
    expect(isLeafMenuActive("/admin/member-notes?kind=inbox", "/admin/member-notes?kind=inquiry", scope)).toBe(
      false
    );
  });

  it("distinguishes CP hash siblings (dashboard vs action-queue vs monitoring)", () => {
    const scope = workspacePaths("system");
    expect(activeLeaves(scope, "/admin/customer-platform")).toEqual(["/admin/customer-platform"]);
    expect(activeLeaves(scope, "/admin/customer-platform#action-queue")).toEqual([
      "/admin/customer-platform#action-queue",
    ]);
    expect(activeLeaves(scope, "/admin/customer-platform#monitoring")).toEqual([
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
      "/admin/member-notes?kind=inquiry",
      "/admin/unknown-route-xyz",
    ]) {
      const ws = resolveActiveWorkspace(path, "master");
      const matches = listAdminWorkspaces("master").filter((w) => w.id === ws.id);
      expect(matches.length).toBe(1);
    }
  });
});
