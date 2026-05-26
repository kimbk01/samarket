import { describe, expect, it, vi } from "vitest";
import {
  commitMainBottomNavRoute,
  mainBottomNavRouteUsesReplace,
  shouldMainBottomNavRouteScrollOnly,
} from "@/lib/main-menu/main-bottom-nav-route-commit";

describe("shouldMainBottomNavRouteScrollOnly", () => {
  it("동일 path·query — 스크롤만", () => {
    expect(
      shouldMainBottomNavRouteScrollOnly(
        "/community-messenger/delivery-chats",
        "from=delivery",
        "/community-messenger/delivery-chats?from=delivery"
      )
    ).toBe(true);
  });

  it("동일 path·query 다름 — 이동", () => {
    expect(
      shouldMainBottomNavRouteScrollOnly(
        "/community-messenger",
        "section=friends",
        "/community-messenger?section=chats"
      )
    ).toBe(false);
  });
});

describe("commitMainBottomNavRoute", () => {
  it("replace 후 onCloseOverlay", () => {
    const order: string[] = [];
    const replace = vi.fn(() => order.push("replace"));
    const onCloseOverlay = vi.fn(() => order.push("close"));

    const result = commitMainBottomNavRoute({
      pathname: "/community-messenger/delivery-chats",
      currentSearch: "from=delivery",
      href: "/stores",
      tabId: "delivery-home-hub",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace,
      onCloseOverlay,
      skipPerfMark: true,
    });

    expect(result).toBe("navigated");
    expect(order).toEqual(["replace", "close"]);
  });

  it("guard 실패 — blocked", () => {
    const push = vi.fn();
    expect(
      commitMainBottomNavRoute({
        pathname: "/orders",
        currentSearch: "",
        href: "/stores",
        tabId: "stores",
        beginMenuNavigation: vi.fn(),
        onNavigationIntent: vi.fn(),
        guardBeforeNavigate: () => false,
        push,
        replace: vi.fn(),
        skipPerfMark: true,
      })
    ).toBe("blocked");
    expect(push).not.toHaveBeenCalled();
  });

  it("/market 에서 다른 탭 — push", () => {
    const push = vi.fn();
    commitMainBottomNavRoute({
      pathname: "/market",
      currentSearch: "",
      href: "/stores",
      tabId: "stores",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push,
      replace: vi.fn(),
      skipPerfMark: true,
    });
    expect(push).toHaveBeenCalledWith("/stores");
  });
});

describe("mainBottomNavRouteUsesReplace", () => {
  it("/market 탈출은 push", () => {
    expect(mainBottomNavRouteUsesReplace("/market", "/stores")).toBe(false);
  });
});
