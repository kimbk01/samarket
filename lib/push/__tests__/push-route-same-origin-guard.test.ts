import { describe, expect, it } from "vitest";
import { resolveSameOriginPushRoutePath } from "@/lib/push/push-route-policy";

describe("resolveSameOriginPushRoutePath (LINK-01)", () => {
  it.each([
    "//evil.com",
    "//evil.com/path",
    "/\\evil.com",
    "/\\/evil.com",
    "\\\\evil.com",
    "https://evil.com/x",
    "javascript:alert(1)",
    "evil.com",
    "/market\nfoo",
    "/market\u0000",
    "",
    "   ",
  ])("rejects %j", (raw) => {
    expect(resolveSameOriginPushRoutePath(raw)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(resolveSameOriginPushRoutePath(undefined)).toBeNull();
    expect(resolveSameOriginPushRoutePath(null)).toBeNull();
    expect(resolveSameOriginPushRoutePath(42)).toBeNull();
  });

  // Routes produced today by the server payload contract and by the Android
  // FcmPayloadResolver on installed binaries must pass unchanged.
  it.each([
    "/",
    "/community-messenger/calls/s1?action=accept",
    "/community-messenger/calls/s1?callAction=reject",
    "/community-messenger/calls/logs?callId=s1",
    "/calls/logs?callId=c1",
    "/community-messenger/rooms/r1",
    "/community-messenger/rooms/r1?focus=call-history&callId=c1",
    "/community-messenger/rooms/r1?type=group",
    "/orders/store/o1",
    "/stores/owner/orders?orderId=o1",
    "/philife/posts/p1",
    "/community/posts/p1",
    "/support/cases/abc",
    "/events/e1",
    "/notifications/n1",
    "/notifications?fallback=origin_unavailable",
    "/%5Cevil.com",
  ])("keeps %j unchanged", (path) => {
    expect(resolveSameOriginPushRoutePath(path)).toBe(path);
    expect(resolveSameOriginPushRoutePath(`  ${path}  `)).toBe(path);
  });
});
