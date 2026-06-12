import { describe, expect, it } from "vitest";
import {
  isAuthRequiredPrivatePath,
  isGuestPublicBrowsePath,
  shouldAllowUnauthenticatedHtmlRequest,
  shouldBlockUnauthenticatedHtmlRequest,
} from "@/lib/auth/guest-browse-access-policy";

describe("guest-browse-access-policy", () => {
  const publicPaths = [
    "/",
    "/community",
    "/community/some-post-id",
    "/philife",
    "/philife/some-post-id",
    "/market",
    "/market/trade",
    "/post/abc",
    "/products/abc",
    "/stores",
    "/stores/browse/delivery",
    "/stores/some-store",
    "/stores/some-store/menu",
    "/stores/some-store/checkout",
    "/search",
    "/mypage",
    "/mypage/account",
    "/mypage/section/trade",
    "/mypage/community-posts",
    "/community-messenger",
    "/community-messenger/trade-chats",
  ];

  const privatePaths = [
    "/community-messenger/rooms/room-1",
    "/group-chat/room-1",
    "/orders/store/order-1/chat",
    "/mypage/store-orders/order-1/chat",
    "/my/business/store-order-chat/order-1",
    "/chats/room-1",
    "/mypage/trade/chat/room-1",
    "/stores/owner",
    "/rider",
    "/admin",
    "/my/notifications",
    "/onboarding/profile",
    "/community-messenger/calls/session-1",
    "/mypage/section/account/profile/edit",
    "/mypage/business",
    "/mypage/business/apply",
  ];

  it("allows guest public browse paths", () => {
    for (const path of publicPaths) {
      expect(isGuestPublicBrowsePath(path), path).toBe(true);
      expect(shouldAllowUnauthenticatedHtmlRequest(path), path).toBe(true);
      expect(shouldBlockUnauthenticatedHtmlRequest(path), path).toBe(false);
    }
  });

  it("blocks private paths for guests", () => {
    for (const path of privatePaths) {
      expect(isAuthRequiredPrivatePath(path), path).toBe(true);
      expect(isGuestPublicBrowsePath(path), path).toBe(false);
      expect(shouldBlockUnauthenticatedHtmlRequest(path), path).toBe(true);
    }
  });

  it("excludes community/philife my and write from public browse", () => {
    expect(isGuestPublicBrowsePath("/community/my")).toBe(false);
    expect(isGuestPublicBrowsePath("/community/write")).toBe(false);
    expect(isGuestPublicBrowsePath("/philife/my")).toBe(false);
    expect(isGuestPublicBrowsePath("/philife/write")).toBe(false);
  });
});
