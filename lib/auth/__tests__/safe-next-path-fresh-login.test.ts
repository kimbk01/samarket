import { describe, expect, it } from "vitest";
import {
  sanitizeFreshLoginLandingPath,
  sanitizeNextPath,
} from "@/lib/auth/safe-next-path";

describe("sanitizeFreshLoginLandingPath", () => {
  it("allows tab roots and hubs", () => {
    expect(sanitizeFreshLoginLandingPath("/philife")).toBe("/philife");
    expect(sanitizeFreshLoginLandingPath("/stores")).toBe("/stores");
    expect(sanitizeFreshLoginLandingPath("/community-messenger")).toBe("/community-messenger");
    expect(sanitizeFreshLoginLandingPath("/community-messenger?section=open_chat")).toBe(
      "/community-messenger?section=open_chat"
    );
    expect(sanitizeFreshLoginLandingPath("/mypage")).toBe("/mypage");
    expect(sanitizeFreshLoginLandingPath("/orders")).toBe("/orders");
  });

  it("denies deep links that must not restore after account switch", () => {
    expect(sanitizeFreshLoginLandingPath("/community-messenger/rooms/abc")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/chats/room-1")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/orders/store/order-1")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/mypage/store-orders/o1")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/post/123")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/products/456")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("/community-messenger/calls/outgoing")).toBeNull();
  });

  it("still rejects unsafe paths like sanitizeNextPath", () => {
    expect(sanitizeFreshLoginLandingPath("//evil.example")).toBeNull();
    expect(sanitizeFreshLoginLandingPath("https://evil.example")).toBeNull();
  });

  it("sanitizeNextPath still allows deep links for onboarding handoff", () => {
    expect(sanitizeNextPath("/community-messenger/rooms/abc")).toBe(
      "/community-messenger/rooms/abc"
    );
  });
});
