/**
 * Owner 결정 1 — 선물 받을 친구 목록이 차단 목록을 못 읽으면 503 (예전: 서버 오류 → 화면은 「보낼 친구 없음」)
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api-session", () => ({
  requireAuthenticatedUserId: async () => ({ ok: true, userId: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/lib/http/api-route", () => ({
  enforceRateLimit: async () => ({ ok: true }),
  getRateLimitKey: () => "k",
}));
vi.mock("@/lib/gift-certificate/list-gift-transfer-eligible-friends", async () => {
  const { SocialExclusionLookupError } = await import("@/lib/social/user-block-ssot");
  return {
    listGiftTransferEligibleFriends: async () => {
      throw new SocialExclusionLookupError("blocked_author_ids", { message: "timeout" });
    },
  };
});

describe("선물 친구 목록 — 차단 목록 조회 실패", () => {
  it("503 friends_unavailable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("@/app/api/me/gift-certificates/friends/eligible/route");
    const res = await GET(new Request("http://localhost/api/me/gift-certificates/friends/eligible") as never);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("friends_unavailable");
  });
});
