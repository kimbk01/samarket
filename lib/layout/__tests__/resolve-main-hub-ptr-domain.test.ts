import { describe, expect, it } from "vitest";
import { resolveMainHubPtrDomain } from "@/lib/layout/resolve-main-hub-ptr-domain";

describe("resolveMainHubPtrDomain", () => {
  it("returns single domain per pathname", () => {
    expect(resolveMainHubPtrDomain("/philife")).toBe("philife");
    expect(resolveMainHubPtrDomain("/")).toBe("philife");
    expect(resolveMainHubPtrDomain("/market")).toBe("trade");
    expect(resolveMainHubPtrDomain("/stores")).toBe("stores");
    expect(resolveMainHubPtrDomain("/community-messenger")).toBe("messenger");
    expect(resolveMainHubPtrDomain("/community-messenger/trade-chats")).toBe("messenger");
  });

  it("returns null for messenger room and call routes", () => {
    expect(resolveMainHubPtrDomain("/community-messenger/rooms/abc")).toBe(null);
    expect(resolveMainHubPtrDomain("/community-messenger/calls/abc")).toBe(null);
  });

  it("returns null for browse and unsupported paths", () => {
    expect(resolveMainHubPtrDomain("/stores/browse/restaurant")).toBe(null);
    expect(resolveMainHubPtrDomain("/market/trade-meet-spot")).toBe(null);
    expect(resolveMainHubPtrDomain("/mypage")).toBe(null);
  });
});
