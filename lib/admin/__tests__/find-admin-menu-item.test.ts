import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
  topLevelChildrenByKey,
} from "@/lib/admin/find-admin-menu-item";

describe("find-admin-menu-item", () => {
  it("finds nested growth ads by key", () => {
    const ads = findAdminMenuByKey(adminMenu, "ads");
    expect(ads?.children?.length).toBeGreaterThan(0);
    // Cut B: Marketplace 더 알리기 (ads-applications) lives under TRADE; Feed Banner stays Growth.
    expect(ads?.children?.some((c) => c.key === "ads-feed")).toBe(true);
    expect(ads?.children?.some((c) => c.key === "ads-applications")).toBe(false);
  });

  it("finds Marketplace promo queue under trade", () => {
    const trade = findAdminMenuByKey(adminMenu, "trade");
    expect(trade?.children?.some((c) => c.key === "ads-applications")).toBe(true);
    expect(trade?.children?.some((c) => c.key === "reports-posts")).toBe(true);
  });

  it("finds manage under platform-ops", () => {
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

  it("topLevelChildrenByKey returns community children", () => {
    const children = topLevelChildrenByKey(adminMenu, "community");
    expect(children.some((c) => c.key === "community-posts")).toBe(true);
  });
});

describe("admin-menu-config module load", () => {
  it("loads adapter sections from SSOT without inventing a second tree", async () => {
    const mod = await import("@/lib/admin-menu-config");
    expect(mod.ADMIN_MENU_SECTIONS).toHaveLength(7);
    expect(mod.OPS_QUICK_LINKS_PRIORITY.length).toBeGreaterThan(0);
    expect(mod.OPS_QUICK_LINKS_PRIORITY.some((l) => l.href === "/admin/operations")).toBe(
      false
    );
    expect(mod.OPS_MENU_GROUPS.length).toBeGreaterThan(0);
  });
});
