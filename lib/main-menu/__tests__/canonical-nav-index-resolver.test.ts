import { describe, expect, it } from "vitest";
import {
  buildCanonicalNavIndexResolver,
  BUILTIN_TAB_PATH_ALIASES,
} from "@/lib/main-menu/canonical-nav-index-resolver";
import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";

const builtin: Record<string, BottomNavItemConfig> = {
  community: { id: "community", href: "/philife", label: "커뮤니티", icon: "community" },
  home: { id: "home", href: "/market", label: "거래", icon: "trade" },
  stores: { id: "stores", href: "/stores", label: "배달", icon: "stores" },
  chat: { id: "chat", href: "/community-messenger?section=chats", label: "메신저", icon: "chat" },
  my: { id: "my", href: "/mypage", label: "내정보", icon: "my" },
};

describe("buildCanonicalNavIndexResolver", () => {
  it("default tab order matches static canonical mapping", () => {
    const resolve = buildCanonicalNavIndexResolver([
      builtin.community!,
      builtin.home!,
      builtin.stores!,
      builtin.chat!,
      builtin.my!,
    ]);
    expect(resolve("/philife")).toBe(0);
    expect(resolve("/market")).toBe(1);
    expect(resolve("/stores")).toBe(2);
    expect(resolve("/community-messenger")).toBe(3);
    expect(resolve("/mypage")).toBe(4);
  });

  it("admin reorders tabs — slide index follows new order", () => {
    /** admin saved order: [stores, community, home, chat, my] */
    const resolve = buildCanonicalNavIndexResolver([
      builtin.stores!,
      builtin.community!,
      builtin.home!,
      builtin.chat!,
      builtin.my!,
    ]);
    expect(resolve("/stores")).toBe(0);
    expect(resolve("/philife")).toBe(1);
    expect(resolve("/market")).toBe(2);
    expect(resolve("/community-messenger")).toBe(3);
    expect(resolve("/mypage")).toBe(4);
  });

  it("builtin sub-route aliases — /post → home tab, /orders → stores tab", () => {
    const resolve = buildCanonicalNavIndexResolver([
      builtin.community!,
      builtin.home!,
      builtin.stores!,
      builtin.chat!,
      builtin.my!,
    ]);
    expect(resolve("/post/abc")).toBe(1);
    expect(resolve("/products/123")).toBe(1);
    expect(resolve("/write/trade")).toBe(1);
    expect(resolve("/orders/abc")).toBe(2);
    expect(resolve("/community/foo")).toBe(0);
    expect(resolve("/chats/abc")).toBe(3);
    expect(resolve("/my/orders")).toBe(4);
  });

  it("does not confuse /community-messenger with /community alias", () => {
    const resolve = buildCanonicalNavIndexResolver([
      builtin.community!,
      builtin.home!,
      builtin.stores!,
      builtin.chat!,
      builtin.my!,
    ]);
    expect(resolve("/community-messenger")).toBe(3);
    expect(resolve("/community-messenger/trade-chats")).toBe(3);
    expect(resolve("/community/board")).toBe(0);
  });

  it("excluded surfaces (/admin, /auth, /account) → null", () => {
    const resolve = buildCanonicalNavIndexResolver([
      builtin.community!,
      builtin.home!,
      builtin.stores!,
      builtin.chat!,
      builtin.my!,
    ]);
    expect(resolve("/admin/menus/main-bottom-nav")).toBeNull();
    expect(resolve("/auth/login")).toBeNull();
    expect(resolve("/account/profile")).toBeNull();
  });

  it("custom_* tab — matched only by its own href prefix", () => {
    const customTab: BottomNavItemConfig = {
      id: "custom_event01",
      href: "/event",
      label: "이벤트",
      icon: "home",
    };
    const resolve = buildCanonicalNavIndexResolver([
      builtin.community!,
      customTab,
      builtin.home!,
    ]);
    expect(resolve("/event")).toBe(1);
    expect(resolve("/event/promo")).toBe(1);
    expect(resolve("/philife")).toBe(0);
    expect(resolve("/market")).toBe(2);
  });

  it("empty tabs → always null (provider not mounted yet)", () => {
    const resolve = buildCanonicalNavIndexResolver([]);
    expect(resolve("/philife")).toBeNull();
    expect(resolve("/market")).toBeNull();
  });

  it("BUILTIN_TAB_PATH_ALIASES covers all 5 builtin ids", () => {
    expect(Object.keys(BUILTIN_TAB_PATH_ALIASES).sort()).toEqual(
      ["chat", "community", "home", "my", "stores"]
    );
  });
});
