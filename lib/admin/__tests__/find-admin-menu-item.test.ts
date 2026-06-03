import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
  topLevelChildrenByKey,
} from "@/lib/admin/find-admin-menu-item";

describe("find-admin-menu-item", () => {
  it("finds nested ads under common", () => {
    const ads = findAdminMenuByKey(adminMenu, "ads");
    expect(ads?.key).toBe("ads");
    expect(ads?.children?.length).toBeGreaterThan(0);
  });

  it("finds nested manage under settings", () => {
    const manage = findAdminMenuByKey(adminMenu, "manage");
    expect(manage?.key).toBe("manage");
  });

  it("returns undefined for removed top-level operations key", () => {
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
  it("imports without throwing on removed operations key", async () => {
    const mod = await import("@/lib/admin-menu-config");
    expect(mod.ADMIN_MENU_SECTIONS).toHaveLength(7);
    expect(mod.OPS_QUICK_LINKS_PRIORITY.length).toBeGreaterThan(0);
    expect(mod.OPS_MENU_GROUPS.length).toBeGreaterThan(0);
  });
});
