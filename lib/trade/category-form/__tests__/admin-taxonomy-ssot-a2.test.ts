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
    // 거래 Admin 설계 v2 §E: 허브 = TradeDashboardPage (AdminTradeHub 삭제)
    const hub = read("components/admin/trade/dashboard/TradeDashboardPage.tsx");
    expect(hub).not.toContain("/admin/trade/feed-topics");

    // 설계 v2 §B-2: trade 메뉴는 10 그룹 — 그룹 아래 leaf 까지 펼친다.
    const trade = adminMenu.find((s) => s.key === "trade");
    const children: NonNullable<typeof trade>[] = [];
    const walk = (items: NonNullable<typeof trade>[]) => {
      for (const c of items) {
        children.push(c);
        if (c.children?.length) walk(c.children);
      }
    };
    walk(trade?.children ?? []);
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
    // 거래 Admin 설계 v2 §B-3 (D-37): /admin/categories 는 /admin/menus/trade 로 리다이렉트 (AdminCategoriesPage 삭제).
    const page = read("app/admin/categories/page.tsx");
    expect(page).toContain('redirect("/admin/menus/trade")');
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
