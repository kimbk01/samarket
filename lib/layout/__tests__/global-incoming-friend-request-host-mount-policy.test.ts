import { describe, expect, it } from "vitest";
import {
  isCommunityMessengerFriendRequestImmediateSurface,
  isFriendRequestImmediateSocialSurface,
  isMypagePhilifeFriendRequestIdleDeferSurface,
  shouldIdleDeferGlobalIncomingFriendRequestHost,
} from "@/lib/layout/global-incoming-friend-request-host-mount-policy";

describe("global-incoming-friend-request-host-mount-policy", () => {
  it("mypage·philife 허브는 idle defer 대상", () => {
    expect(isMypagePhilifeFriendRequestIdleDeferSurface("/mypage")).toBe(true);
    expect(isMypagePhilifeFriendRequestIdleDeferSurface("/mypage/trade")).toBe(true);
    expect(isMypagePhilifeFriendRequestIdleDeferSurface("/philife")).toBe(true);
    expect(isMypagePhilifeFriendRequestIdleDeferSurface("/philife/write")).toBe(true);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/mypage")).toBe(true);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/philife")).toBe(true);
  });

  it("community-messenger·social surface·기타 경로는 defer 제외", () => {
    expect(isCommunityMessengerFriendRequestImmediateSurface("/community-messenger")).toBe(true);
    expect(isCommunityMessengerFriendRequestImmediateSurface("/community-messenger/rooms/abc")).toBe(true);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/community-messenger")).toBe(false);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/community-messenger?section=friends")).toBe(false);

    expect(isFriendRequestImmediateSocialSurface("/community")).toBe(true);
    expect(isFriendRequestImmediateSocialSurface("/philife/my")).toBe(true);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/community")).toBe(false);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/philife/my")).toBe(false);

    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/market")).toBe(false);
    expect(shouldIdleDeferGlobalIncomingFriendRequestHost("/stores")).toBe(false);
  });
});
