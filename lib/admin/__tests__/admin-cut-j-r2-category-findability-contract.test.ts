/**
 * CUT J-R2 — Category nested sidebar findability contract (static).
 * Documents Delivery Category leaf href; no IA redesign.
 */
import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveActiveWorkspace, resolveWorkspaceRootPath } from "@/lib/admin/admin-workspace-routing";

describe("CUT J-R2 category sidebar findability contract", () => {
  it("R2-1 Category leaf target is /admin/stores-category-policy under delivery", () => {
    const leaf = findAdminMenuByKey(adminMenu, "stores-browse-policy");
    expect(leaf?.path).toBe("/admin/stores-category-policy");
    const ops = findAdminMenuByKey(adminMenu, "delivery-section-operations");
    const keys = (ops?.children ?? []).map((c) => c.key);
    expect(keys).toContain("stores-browse-policy");
    expect(keys).toContain("stores-home-shelves");
  });

  it("R2-2 HOME sibling unaffected", () => {
    expect(findAdminMenuByKey(adminMenu, "stores-home-shelves")?.path).toBe(
      "/admin/stores-home-shelves"
    );
  });

  it("R2-3 Delivery root is first leaf (business), not Category", () => {
    const delivery = adminMenu.find((w) => w.key === "delivery")!;
    expect(resolveWorkspaceRootPath(delivery)).toBe("/admin/delivery");
    expect(resolveWorkspaceRootPath(delivery)).not.toBe("/admin/stores-category-policy");
  });

  it("R2-4 workspace route resolver keeps child Category under delivery", () => {
    expect(resolveActiveWorkspace("/admin/stores-category-policy", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/stores-home-shelves", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/business", "master").id).toBe("delivery");
  });

  it("R2-5 Category is a leaf (no children) — not a section that navigates to workspace root", () => {
    const leaf = findAdminMenuByKey(adminMenu, "stores-browse-policy");
    expect(leaf?.children).toBeUndefined();
    expect(leaf?.path).toBeTruthy();
    // Parent section has no path (header-only) — click expands, does not replace child href
    const ops = findAdminMenuByKey(adminMenu, "delivery-section-operations");
    expect(ops?.path).toBeUndefined();
    expect(ops?.children?.length).toBeGreaterThan(0);
  });
});
