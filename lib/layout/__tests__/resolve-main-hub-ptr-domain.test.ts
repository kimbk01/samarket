import { describe, expect, it } from "vitest";
import { resolveMainHubPtrDomain } from "@/lib/layout/resolve-main-hub-ptr-domain";

describe("resolveMainHubPtrDomain", () => {
  it("returns single domain per pathname", () => {
    expect(resolveMainHubPtrDomain("/philife")).toBe("philife");
    /** 앱 홈 (2026-11-09) — 자체 새로고침 도메인 */
    expect(resolveMainHubPtrDomain("/")).toBe("home");
    expect(resolveMainHubPtrDomain("/home")).toBe("home");
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
  });

  it("내정보 홈만 mypage — 하위 화면 제외 (docs/audit/mypage-ptr-2026-11-27)", () => {
    expect(resolveMainHubPtrDomain("/mypage")).toBe("mypage");
    expect(resolveMainHubPtrDomain("/mypage/")).toBe("mypage");
    expect(resolveMainHubPtrDomain("/my")).toBe("mypage");
    expect(resolveMainHubPtrDomain("/mypage?tab=x")).toBe("mypage");
    expect(resolveMainHubPtrDomain("/mypage/addresses")).toBe(null);
    expect(resolveMainHubPtrDomain("/mypage/trade/chat/abc")).toBe(null);
    expect(resolveMainHubPtrDomain("/my/business")).toBe(null);
    expect(resolveMainHubPtrDomain("/mypages")).toBe(null);
  });
});
