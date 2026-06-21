import { afterEach, describe, expect, it, vi } from "vitest";
import {
  commitMainBottomNavRoute,
  abortPendingMainBottomNavRouteCommits,
  mainBottomNavRouteUsesReplace,
  shouldMainBottomNavRouteScrollOnly,
} from "@/lib/main-menu/main-bottom-nav-route-commit";
import {
  beginRoomDeepRouteNavigationLock,
  resetDeepRouteNavigationLockForTests,
} from "@/lib/navigation/cm-deep-route-navigation-lock";
import { guardedClientNavigate } from "@/lib/navigation/guarded-client-navigation";

vi.mock("@/lib/navigation/main-shell-push-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/navigation/main-shell-push-session")>();
  return {
    ...actual,
    armMainShellPushEnterSession: vi.fn(),
  };
});

vi.mock("@/lib/dibay/delivery-store-detail-prewarm-lifecycle", () => ({
  abortStoresBrowseAmbientPrewarm: vi.fn(),
  isStoresBrowseHubPath: (path: string | null | undefined) => (path ?? "").replace(/\/+$/, "") === "/stores",
  isStoresSurfacePath: (path: string | null | undefined) => {
    const p = (path ?? "").replace(/\/+$/, "") || "/";
    return p === "/stores" || p.startsWith("/stores/");
  },
}));

import { armMainShellPushEnterSession } from "@/lib/navigation/main-shell-push-session";
import { abortStoresBrowseAmbientPrewarm } from "@/lib/dibay/delivery-store-detail-prewarm-lifecycle";

describe("shouldMainBottomNavRouteScrollOnly", () => {
  it("메신저 delivery-chats → 인박스 홈 — scroll_only 아님(이동)", () => {
    expect(
      shouldMainBottomNavRouteScrollOnly(
        "/community-messenger/delivery-chats",
        "from=delivery",
        "/community-messenger?section=chats&from=delivery"
      )
    ).toBe(false);
  });

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
  it("beginMenuNavigation — navigated 시 replace 보다 intent 먼저", async () => {
    const order: string[] = [];
    const beginMenuNavigation = vi.fn(() => {
      order.push("intent");
    });
    const replace = vi.fn(() => {
      order.push("replace");
    });

    commitMainBottomNavRoute({
      pathname: "/stores",
      currentSearch: "",
      href: "/philife",
      tabId: "community",
      beginMenuNavigation,
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace,
      skipPerfMark: true,
    });

    await Promise.resolve();
    expect(order).toEqual(["intent", "replace"]);
  });

  it("onNavigationIntent — blocked·scroll_only 제외, navigated 시 동기 호출", () => {
    const onNavigationIntent = vi.fn();
    commitMainBottomNavRoute({
      pathname: "/stores",
      currentSearch: "",
      href: "/philife",
      tabId: "community",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent,
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace: vi.fn(),
      skipPerfMark: true,
    });
    expect(onNavigationIntent).toHaveBeenCalledWith("community");
  });

  it("blocked — onNavigationIntent 미호출", () => {
    const onNavigationIntent = vi.fn();
    commitMainBottomNavRoute({
      pathname: "/stores",
      currentSearch: "",
      href: "/philife",
      tabId: "community",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent,
      guardBeforeNavigate: () => false,
      push: vi.fn(),
      replace: vi.fn(),
      skipPerfMark: true,
    });
    expect(onNavigationIntent).not.toHaveBeenCalled();
  });

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

  it("cross-group — session enter arm + crossGroup intent, exit·dual-panel 생략", () => {
    vi.mocked(armMainShellPushEnterSession).mockClear();
    const beginMenuNavigation = vi.fn();

    commitMainBottomNavRoute({
      pathname: "/stores",
      currentSearch: "",
      href: "/community-messenger?section=chats",
      tabId: "chat",
      beginMenuNavigation,
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace: vi.fn(),
      skipPerfMark: true,
    });

    expect(armMainShellPushEnterSession).toHaveBeenCalledWith(
      "rtl",
      "/stores",
      "/community-messenger"
    );
    expect(beginMenuNavigation).toHaveBeenCalledWith(
      "/community-messenger?section=chats",
      "bottom-nav",
      expect.objectContaining({ mainShellCrossGroupPush: true, mainShellPushAxis: "rtl" })
    );
  });

  it("/stores → community-messenger — ambient store detail prewarm abort", () => {
    vi.mocked(abortStoresBrowseAmbientPrewarm).mockClear();
    commitMainBottomNavRoute({
      pathname: "/stores",
      currentSearch: "",
      href: "/community-messenger?section=chats&from=delivery",
      tabId: "delivery-order-chat",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace: vi.fn(),
      skipPerfMark: true,
    });
    expect(abortStoresBrowseAmbientPrewarm).toHaveBeenCalledWith("bottom_nav_route_commit");
  });

  it("/stores → /stores/aa11 — ambient prewarm abort 생략", () => {
    vi.mocked(abortStoresBrowseAmbientPrewarm).mockClear();
    commitMainBottomNavRoute({
      pathname: "/stores",
      currentSearch: "",
      href: "/stores/aa11",
      tabId: "stores",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace: vi.fn(),
      skipPerfMark: true,
    });
    expect(abortStoresBrowseAmbientPrewarm).not.toHaveBeenCalled();
  });
});

describe("mainBottomNavRouteUsesReplace", () => {
  it("/market 탈출은 push", () => {
    expect(mainBottomNavRouteUsesReplace("/market", "/stores")).toBe(false);
  });
});

describe("commitMainBottomNavRoute deep route lock", () => {
  afterEach(() => {
    resetDeepRouteNavigationLockForTests();
  });

  it("room entry lock 중 programmatic /mypage replace 시도는 blocked", () => {
    beginRoomDeepRouteNavigationLock("room-1", "/community-messenger/rooms/room-1");
    const replace = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const ok = guardedClientNavigate(replace, "/mypage", "programmatic");
    expect(ok).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("abortPendingMainBottomNavRouteCommits — sync commit 즉시 replace", () => {
    abortPendingMainBottomNavRouteCommits();
    const replace = vi.fn();
    commitMainBottomNavRoute({
      pathname: "/community-messenger",
      currentSearch: "",
      href: "/mypage",
      tabId: "mypage",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace,
      skipPerfMark: true,
    });
    expect(replace).toHaveBeenCalledWith("/mypage");
  });

  it("room lock 중 hub 탭 commit — /mypage replace blocked", () => {
    beginRoomDeepRouteNavigationLock("room-1", "/community-messenger/rooms/room-1");
    const replace = vi.fn();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    commitMainBottomNavRoute({
      pathname: "/community-messenger",
      currentSearch: "",
      href: "/mypage",
      tabId: "mypage",
      beginMenuNavigation: vi.fn(),
      onNavigationIntent: vi.fn(),
      guardBeforeNavigate: () => true,
      push: vi.fn(),
      replace,
      skipPerfMark: true,
    });

    expect(replace).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
