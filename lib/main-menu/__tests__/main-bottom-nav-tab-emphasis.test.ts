import { describe, expect, it } from "vitest";
import {
  isMainBottomNavMessengerEmphasisTab,
  isMainBottomNavMessengerShellPath,
  resolveMainBottomNavEmphasisTapHref,
  resolveMainBottomNavTabEmphasisKind,
  resolveMainBottomNavTabTapHref,
} from "@/lib/main-menu/main-bottom-nav-tab-emphasis";

describe("isMainBottomNavMessengerShellPath", () => {
  it("메신저 루트·하위 경로", () => {
    expect(isMainBottomNavMessengerShellPath("/community-messenger")).toBe(true);
    expect(isMainBottomNavMessengerShellPath("/community-messenger/rooms/abc")).toBe(true);
    expect(isMainBottomNavMessengerShellPath("/market")).toBe(false);
  });
});

describe("resolveMainBottomNavTabEmphasisKind", () => {
  it("stores 허브 — stores 탭 domain-hub", () => {
    expect(
      resolveMainBottomNavTabEmphasisKind("stores", "/stores", { hubDomain: "stores" })
    ).toBe("domain-hub");
  });

  it("메신저 — chat 탭 messenger-hub", () => {
    expect(isMainBottomNavMessengerEmphasisTab("chat", "/community-messenger")).toBe(true);
    expect(resolveMainBottomNavTabEmphasisKind("chat", "/community-messenger")).toBe("messenger-hub");
  });

  it("messenger-hub 짧은 탭 — 전체 인박스 홈", () => {
    expect(
      resolveMainBottomNavEmphasisTapHref("chat", "messenger-hub", "/community-messenger/delivery-chats", null)
    ).toContain("/community-messenger");
    expect(
      resolveMainBottomNavEmphasisTapHref("chat", "messenger-hub", "/community-messenger/delivery-chats", null)
    ).toContain("section=chats");
  });

  it("pendingChatNav — pathname 갱신 전 orbit", () => {
    expect(
      resolveMainBottomNavTabEmphasisKind("chat", "/stores", {
        hubDomain: "stores",
        pendingChatNav: true,
      })
    ).toBe("messenger-hub");
  });

  it("resolveMainBottomNavTabTapHref — emphasis·inbox·orders 단일", () => {
    expect(
      resolveMainBottomNavTabTapHref("chat", "/community-messenger?section=chats", {
        emphasisKind: "messenger-hub",
        pathname: "/community-messenger/delivery-chats",
      })
    ).toContain("section=chats");
    expect(
      resolveMainBottomNavTabTapHref("community", "/philife", {
        emphasisKind: "domain-hub",
        pathname: "/philife",
      })
    ).toBe("/philife");
  });

  it("비메신저·비허브 — null", () => {
    expect(resolveMainBottomNavTabEmphasisKind("my", "/mypage")).toBe(null);
  });
});
