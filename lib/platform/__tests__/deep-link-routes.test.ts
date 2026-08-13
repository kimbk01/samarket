import { describe, expect, it } from "vitest";
import {
  buildDibayDeepLink,
  resolveAppPathToDibayDeepLink,
  resolveDibayDeepLinkToAppPath,
} from "@/lib/platform/deep-link-routes";

describe("deep-link-routes", () => {
  it("maps chat deep link to messenger room", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://chat/room-abc")).toBe(
      "/community-messenger/rooms/room-abc"
    );
  });

  it("maps trade chat deep link", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://trade/chat/trade-room-1")).toBe(
      "/chats/trade-room-1"
    );
  });

  it("maps order deep link", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://orders/order-99")).toBe("/orders/store/order-99");
  });

  it("maps community post deep link", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://community/post/post-1")).toBe(
      "/community/posts/post-1"
    );
  });

  it("maps call deep link", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://call/sess-1")).toBe(
      "/community-messenger/calls/sess-1"
    );
    expect(resolveDibayDeepLinkToAppPath("dibay://call/sess-1?action=accept&nativeAccept=1")).toBe(
      "/community-messenger/calls/sess-1?action=accept&nativeAccept=1"
    );
  });

  it("maps call-v4 deep link to calls-v4 accept route", () => {
    expect(resolveDibayDeepLinkToAppPath("dibay://call-v4/sess-1")).toBe(
      "/community-messenger/calls-v4/sess-1"
    );
    expect(
      resolveDibayDeepLinkToAppPath("dibay://call-v4/sess-1?action=accept&source=native_accept")
    ).toBe("/community-messenger/calls-v4/sess-1?action=accept&source=native_accept");
  });

  it("round-trips app path to deep link", () => {
    const path = "/community-messenger/rooms/r1";
    expect(resolveAppPathToDibayDeepLink(path)).toBe(buildDibayDeepLink("chat", "r1"));
  });
});
