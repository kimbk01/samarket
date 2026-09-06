import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { ARO_IA_001_COMMUNITY_SECTION_KEYS } from "@/lib/admin/aro-ia-001-community-common-links";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
  topLevelChildrenByKey,
} from "@/lib/admin/find-admin-menu-item";

describe("find-admin-menu-item", () => {
  it("finds ads workspace leaves by key", () => {
    const ads = findAdminMenuByKey(adminMenu, "ads");
    expect(ads?.children?.length).toBeGreaterThan(0);
    expect(ads?.children?.some((c) => c.key === "delivery-ads-control")).toBe(true);
    expect(ads?.children?.some((c) => c.key === "ads-live")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "ads-live")?.path).toBe("/admin/delivery-ads/manage");
    expect(findAdminMenuByKey(adminMenu, "ads-create")?.path).toBe(
      "/admin/delivery-ads/first-party/new"
    );
    expect(ads?.children?.some((c) => c.key === "ads-delivery-ops")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "ads-applications-hub")?.path).toBe(
      "/admin/ad-applications"
    );
  });

  it("trade no longer owns ads-applications primary; keeps reports", () => {
    const trade = findAdminMenuByKey(adminMenu, "trade");
    expect(trade?.children?.some((c) => c.key === "ads-applications")).toBe(false);
    expect(trade?.children?.some((c) => c.key === "reports-posts")).toBe(true);
    expect(trade?.children?.some((c) => c.key === "trade-post-ads")).toBe(true);
  });

  it("finds manage under platform-ops", () => {
    const system = findAdminMenuByKey(adminMenu, "system");
    expect(system?.children?.some((c) => c.key === "platform-ops")).toBe(true);
    const manage = findAdminMenuByKey(adminMenu, "manage");
    expect(manage?.roles).toEqual(["admin", "master"]);
  });

  it("returns undefined for removed operations workspace key", () => {
    expect(findAdminMenuByKey(adminMenu, "operations")).toBeUndefined();
  });

  it("requireAdminMenuByKey throws for missing key", () => {
    expect(() => requireAdminMenuByKey(adminMenu, "operations")).toThrow(
      /Missing admin menu key: operations/
    );
  });

  it("topLevelChildrenByKey returns community section headers (ARO-IA-001 + W3 frequency)", () => {
    const children = topLevelChildrenByKey(adminMenu, "community");
    // ops → moderation → content → promo → settings (moderation before content)
    expect(children.map((c) => c.key)).toEqual([...ARO_IA_001_COMMUNITY_SECTION_KEYS]);
    // Leaves stay nested under sections — not direct top-level children.
    expect(children.some((c) => c.key === "community-posts")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "community-posts")?.path).toBe("/admin/community/posts");
  });
});

describe("admin-menu-config module load", () => {
  it("loads adapter sections from SSOT without inventing a second tree", async () => {
    const mod = await import("@/lib/admin-menu-config");
    // Legacy section adapter stays 7 ids; nav workspaces live in adminMenu (CUT J = 10).
    expect(mod.ADMIN_MENU_SECTIONS).toHaveLength(7);
    expect(adminMenu).toHaveLength(10);
    expect(mod.OPS_QUICK_LINKS_PRIORITY.length).toBeGreaterThan(0);
    expect(mod.OPS_QUICK_LINKS_PRIORITY.some((l) => l.href === "/admin/operations")).toBe(
      false
    );
    expect(mod.OPS_MENU_GROUPS.length).toBeGreaterThan(0);
    expect(mod.OPS_MENU_GROUPS.map((g) => g.groupLabel)).toEqual([
      "trade",
      "community",
      "delivery",
      "messenger",
    ]);
    const point = mod.ADMIN_MENU_SECTIONS.find((s) => s.id === "point");
    expect((point?.items ?? []).length).toBeGreaterThan(0);
    expect(point?.items?.some((i) => i.href === "/admin/point-charges")).toBe(true);
  });
});
