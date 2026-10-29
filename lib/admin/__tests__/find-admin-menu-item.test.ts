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
    // 재감사: 광고 7개는 「광고 운영」 섹션 안 — 키로 찾기는 그대로
    expect(findAdminMenuByKey(ads?.children ?? [], "ads-advertising-workspace")?.path).toBe("/admin/advertising");
    expect(findAdminMenuByKey(ads?.children ?? [], "ads-authority-boosts")).toBeTruthy();
    expect(findAdminMenuByKey(ads?.children ?? [], "ads-authority-applications")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "ads-authority-operations")?.path).toBe(
      "/admin/advertising/operations"
    );
    expect(findAdminMenuByKey(adminMenu, "delivery-ads-ops")?.path).toBe(
      "/admin/delivery-ads/manage"
    );
    // legacy flat Delivery ops key must stay absent (dual-stack menu leaf is delivery-ads-ops)
    expect(ads?.children?.some((c) => c.key === "ads-delivery-ops")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "ads-applications")?.path).toBe(
      "/admin/ad-applications?domain=trade"
    );
  });

  it("trade no longer owns ads-applications primary; keeps reports", () => {
    // 거래 Admin 설계 v2 §B-2: trade 메뉴는 10 그룹 — 그룹 아래 leaf 를 중첩 검색한다.
    const tradeChildren = findAdminMenuByKey(adminMenu, "trade")?.children ?? [];
    expect(findAdminMenuByKey(tradeChildren, "ads-applications")).toBeUndefined();
    expect(findAdminMenuByKey(tradeChildren, "reports-posts")).toBeTruthy();
    expect(findAdminMenuByKey(tradeChildren, "trade-promotions")).toBeTruthy();
  });

  it("finds internal tools section under system (J-AMD-5)", () => {
    const system = findAdminMenuByKey(adminMenu, "system");
    expect(system?.children?.some((c) => c.key === "platform-system")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "platform-system")?.roles).toEqual(["master"]);
    expect(findAdminMenuByKey(adminMenu, "platform-ops")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "manage")).toBeUndefined();
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
    // Legacy section adapter stays 7 ids; nav workspaces live in adminMenu
    // (CUT J J-AMD-1 = 12: promotion + members after dashboard).
    expect(mod.ADMIN_MENU_SECTIONS).toHaveLength(7);
    expect(adminMenu).toHaveLength(12);
    expect(adminMenu.some((s) => s.key === "promotion")).toBe(true);
    expect(adminMenu.some((s) => s.key === "members")).toBe(true);
    expect(adminMenu.map((s) => s.key).slice(0, 2)).toEqual(["dashboard", "members"]);
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
