import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { adminCategoriesMessages } from "@/lib/i18n/catalog/admin-categories";
import { adminMenusMessages } from "@/lib/i18n/catalog/admin-menus";
import { adminTradeMessages } from "@/lib/i18n/catalog/admin-trade";
import { adminMessages } from "@/lib/i18n/catalog/admin";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("CUT A2 admin taxonomy SSOT", () => {
  it("feed-topics route redirects to menus/trade", () => {
    const page = read("app/admin/trade/feed-topics/page.tsx");
    expect(page).toContain('redirect("/admin/menus/trade")');
    expect(page).not.toContain("AdminTradeFeedTopicsPage");
  });

  it("hub and sidebar do not keep a second feed-topics entry", () => {
    const hub = read("components/admin/trade/AdminTradeHub.tsx");
    expect(hub).not.toContain('href: "/admin/trade/feed-topics"');
    expect(hub).toContain('href: "/admin/menus/trade"');

    const trade = adminMenu.find((s) => s.key === "trade");
    const children = trade?.children ?? [];
    expect(children.some((c) => c.key === "trade-feed-topics")).toBe(false);
    expect(children.some((c) => c.path === "/admin/trade/feed-topics")).toBe(false);
    expect(children.some((c) => c.key === "menu-trade" && c.path === "/admin/menus/trade")).toBe(
      true
    );
  });

  it("option editor is gated to trade topic roots", () => {
    const modal = read("components/admin/categories/CategoryFormModal.tsx");
    expect(modal).toContain("isTradeOptionRoot");
    expect(modal).toContain("!category?.parent_id");
    expect(modal).toContain("{isTradeOptionRoot && (");
    expect(modal).toContain("...(isTradeOptionRoot ? { field_composition: fieldComposition } : {})");
  });

  it("categories page points trade 주제/카테고리/옵션 at menus/trade", () => {
    const page = read("components/admin/categories/AdminCategoriesPage.tsx");
    expect(page).toContain('href="/admin/menus/trade"');
    expect(page).toContain("admin_cat_trade_ssot_prefix");
    expect(adminCategoriesMessages.ko.admin_cat_trade_ssot_link).toBe("거래 메뉴 설정");
    expect(adminCategoriesMessages.en.admin_cat_trade_ssot_link).toBe("Trade menu settings");
  });

  it("admin copy uses 주제 / 카테고리 / 옵션 (T0)", () => {
    expect(adminMessages.ko.admin_menu_menu_trade).toBe("주제 (거래)");
    expect(adminMessages.en.admin_menu_menu_trade).toBe("Subjects (trade)");
    expect(adminMenusMessages.ko.admin_menu_trade_mgmt_title).toBe("거래 메뉴 설정");
    expect(adminMenusMessages.en.admin_menu_trade_mgmt_title).toBe("Trade menu settings");
    expect(adminMenusMessages.ko.admin_menu_trade_items_heading).toBe("주제");
    expect(adminMenusMessages.en.admin_menu_trade_items_heading).toBe("Subjects");
    expect(adminMenusMessages.ko.admin_menu_subtopic_manage).toBe("카테고리 관리");
    expect(adminMenusMessages.en.admin_menu_subtopic_manage).toBe("Manage categories");
    expect(adminCategoriesMessages.ko.admin_cat_composition_title).toBe("옵션");
    expect(adminCategoriesMessages.en.admin_cat_composition_title).toBe("Options");
    expect(adminTradeMessages.ko.admin_trade_hub_section_menu_chips).toBe("주제 · 카테고리 · 옵션");
    expect(adminMenusMessages.ko.admin_menu_subtopic_desc).toMatch(/SUV/);
    expect(adminMenusMessages.en.admin_menu_subtopic_desc).toMatch(/SUV/);
  });
});
