import { beforeEach, describe, expect, it, vi } from "vitest";

/** 정책 B — 자동 발급 기본 아이디(dibay_[hex6])도 정확 일치 검색으로 친구 추가 가능 */

type Row = Record<string, unknown>;
let rows: Row[] = [];
const ilikeCalls: Array<{ column: string; pattern: string }> = [];

function makeQuery() {
  let filtered = rows.slice();
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.or = () => q;
  q.neq = (col: string, v: unknown) => {
    filtered = filtered.filter((r) => r[col] !== v);
    return q;
  };
  q.eq = (col: string, v: unknown) => {
    filtered = filtered.filter((r) => r[col] === v);
    return q;
  };
  q.ilike = (col: string, pattern: string) => {
    ilikeCalls.push({ column: col, pattern });
    const literal = pattern.replace(/\\_/g, "_").replace(/\\%/g, "%").toLowerCase();
    filtered = filtered.filter((r) => String(r[col] ?? "").toLowerCase() === literal);
    return q;
  };
  q.limit = () => q;
  q.maybeSingle = async () => ({ data: filtered[0] ?? null, error: null });
  q.then = (resolve: (v: unknown) => void) => resolve({ data: filtered, error: null });
  return q;
}

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: () => makeQuery() }),
}));

vi.mock("@/lib/community-messenger/social-relations", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    resolveDirectInteractionGuard: async () => ({
      isFriend: false,
      isBlockedByMe: false,
      isBlockedByPeer: false,
      canMessage: true,
      canCall: true,
    }),
  };
});

const autoMember = {
  id: "u-auto",
  nickname: "홍길동",
  display_name: "홍길동",
  username: "dibay_a1b2c3",
  dibay_id: "dibay_a1b2c3",
  dibay_id_auto_assigned: true,
  username_confirmed: true,
  avatar_url: null,
};
const customMember = {
  id: "u-custom",
  nickname: "커스텀",
  display_name: "다른이름",
  username: "jjchoi",
  dibay_id: "jjchoi",
  dibay_id_auto_assigned: false,
  username_confirmed: true,
  avatar_url: null,
};

describe("CM user search — auto-assigned public id", () => {
  beforeEach(() => {
    rows = [autoMember, customMember];
    ilikeCalls.length = 0;
  });

  it("finds an auto-assigned member by exact id (with @ and uppercase)", async () => {
    const { searchCommunityMessengerUsersRanked } = await import("@/lib/community-messenger/user-public-id-search");
    const res = await searchCommunityMessengerUsersRanked("viewer", "@DIBAY_A1B2C3");
    expect(res.map((r) => r.id)).toEqual(["u-auto"]);
    expect(res[0]!.publicId).toBe("dibay_a1b2c3");
    expect(res[0]!.matchType).toBe("exact");
  });

  it("does not expose auto-assigned members on partial or nickname match", async () => {
    const { searchCommunityMessengerUsersRanked } = await import("@/lib/community-messenger/user-public-id-search");
    expect((await searchCommunityMessengerUsersRanked("viewer", "dibay_a1")).map((r) => r.id)).toEqual([]);
    expect((await searchCommunityMessengerUsersRanked("viewer", "홍길")).map((r) => r.id)).toEqual([]);
  });

  it("custom id members stay partially searchable; label uses nickname SSOT", async () => {
    const { searchCommunityMessengerUsersRanked } = await import("@/lib/community-messenger/user-public-id-search");
    const res = await searchCommunityMessengerUsersRanked("viewer", "jjch");
    expect(res.map((r) => r.id)).toEqual(["u-custom"]);
    expect(res[0]!.displayName).toBe("커스텀");
  });

  it("resolveUserByPublicId resolves an auto id and escapes ilike wildcards", async () => {
    const { resolveUserByPublicId } = await import("@/lib/community-messenger/social-relations");
    const hit = await resolveUserByPublicId("dibay_a1b2c3");
    expect(hit?.id).toBe("u-auto");
    expect(hit?.publicId).toBe("dibay_a1b2c3");
    expect(ilikeCalls[0]).toEqual({ column: "dibay_id", pattern: "dibay\\_a1b2c3" });
  });

  it("resolveUserByPublicId does not match a different id through `_` wildcard", async () => {
    rows = [{ ...customMember, id: "u-x", dibay_id: "kimxa1", username: "kimxa1" }];
    const { resolveUserByPublicId } = await import("@/lib/community-messenger/social-relations");
    expect(await resolveUserByPublicId("kim_a1")).toBeNull();
  });
});
