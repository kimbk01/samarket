import { describe, expect, it } from "vitest";
import {
  isBottomNavEligibleRoute,
  shouldRenderMainBottomNav,
  type BottomNavSuppressionInput,
} from "@/lib/navigation/bottom-nav-route-policy";

describe("bottom-nav-route-policy", () => {
  it.each([
    "/philife",
    "/market",
    "/stores",
    "/community-messenger",
    "/mypage",
    "/community-messenger/trade-chats",
    "/community-messenger/delivery-chats",
  ])("shows main bottom nav on hub route %s", (pathname) => {
    expect(isBottomNavEligibleRoute(pathname)).toBe(true);
    expect(shouldRenderMainBottomNav({ pathname })).toBe(true);
  });

  it("shows nav on messenger room route in 768px+ split viewport", () => {
    expect(
      isBottomNavEligibleRoute("/community-messenger/rooms/test", { messengerSplitViewport: true })
    ).toBe(true);
    expect(
      shouldRenderMainBottomNav({
        pathname: "/community-messenger/rooms/test",
        messengerSplitViewport: true,
      })
    ).toBe(true);
  });

  it("hides nav on messenger room route without split (mobile full-page)", () => {
    expect(isBottomNavEligibleRoute("/community-messenger/rooms/test")).toBe(false);
    expect(shouldRenderMainBottomNav({ pathname: "/community-messenger/rooms/test" })).toBe(false);
  });

  it.each([
    "/mypage/trade/chat/test",
    "/chats/test",
    "/philife/write",
    "/write/trade",
    "/post/test",
    "/products/test",
    "/products/test/edit",
    "/stores/test/p/product",
    "/stores/test/checkout",
    "/orders",
    "/orders/store/test/review",
    "/mypage/addresses",
    "/mypage/addresses/edit",
    "/stores/owner",
    "/stores/owner/orders",
    "/mypage/business",
    "/my/business",
    "/market/trade-meet-spot",
  ])("hides main bottom nav on excluded route %s", (pathname) => {
    expect(isBottomNavEligibleRoute(pathname)).toBe(false);
    expect(shouldRenderMainBottomNav({ pathname })).toBe(false);
  });

  it("hides nav while write sheet is open", () => {
    expect(shouldRenderMainBottomNav({ pathname: "/market", isWriteSheetOpen: true })).toBe(false);
  });

  it("hides nav while messenger call surface suppresses global chrome", () => {
    expect(shouldRenderMainBottomNav({ pathname: "/community-messenger", messengerCallSuppressesBottomNav: true })).toBe(false);
  });

  it("hides nav while header messenger stack owns the surface", () => {
    expect(
      shouldRenderMainBottomNav({
        pathname: "/philife",
        isMessengerStackSurface: true,
        headerMessengerFromPhilife: true,
      })
    ).toBe(false);
  });

  it("keeps nav decision independent from badge, auth, profile, and membership data", () => {
    const input: BottomNavSuppressionInput = { pathname: "/mypage" };
    expect(shouldRenderMainBottomNav(input)).toBe(true);
  });
});
