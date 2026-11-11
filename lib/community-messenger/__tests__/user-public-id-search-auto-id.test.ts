import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 설계안 v3 §3.3 — 친구 찾기 판정은 DB `cm_search_members` 한 곳.
 * 이 시험은 앱이 그 결과를 그대로 쓰는지(인자·아이디 표시·정확 일치 선택)를 본다. 판정 규칙 자체는
 * `lib/auth/__tests__/member-id-v3-db-contract.test.ts`(마이그레이션 계약)이 본다.
 */

type RpcRow = {
  user_id: string;
  dibay_id: string | null;
  nickname: string | null;
  display_name: string | null;
  avatar_url: string | null;
  match_kind: string;
  match_rank: number;
};

let rpcRows: RpcRow[] = [];
let rpcError: { message: string } | null = null;
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: rpcError ? null : rpcRows, error: rpcError };
    },
  }),
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

const autoMember: RpcRow = {
  user_id: "u-auto",
  dibay_id: "48213sun",
  nickname: "홍길동",
  display_name: "홍길동",
  avatar_url: null,
  match_kind: "prefix",
  match_rank: 1,
};
const customMember: RpcRow = {
  user_id: "u-custom",
  dibay_id: "jjchoi",
  nickname: "커스텀",
  display_name: "다른이름",
  avatar_url: null,
  match_kind: "prefix",
  match_rank: 1,
};

describe("CM user search — DB cm_search_members", () => {
  beforeEach(() => {
    rpcRows = [];
    rpcError = null;
    rpcCalls.length = 0;
  });

  it("passes viewer, normalized query and limit to cm_search_members", async () => {
    rpcRows = [autoMember];
    const { searchCommunityMessengerUsersRanked } = await import("@/lib/community-messenger/user-public-id-search");
    const res = await searchCommunityMessengerUsersRanked("viewer-1", "@48213");
    expect(rpcCalls[0]).toEqual({
      fn: "cm_search_members",
      args: { p_viewer: "viewer-1", p_query: "48213", p_limit: 20 },
    });
    expect(res.map((r) => r.id)).toEqual(["u-auto"]);
    expect(res[0]!.publicId).toBe("48213sun");
    expect(res[0]!.matchType).toBe("prefix");
    expect(res[0]!.highlightRanges).toEqual([{ start: 0, end: 5 }]);
  });

  it("shows the one member id for every match kind; label uses nickname SSOT", async () => {
    rpcRows = [{ ...customMember, match_kind: "name", match_rank: 3 }];
    const { searchCommunityMessengerUsersRanked } = await import("@/lib/community-messenger/user-public-id-search");
    const res = await searchCommunityMessengerUsersRanked("viewer-1", "커스");
    expect(res[0]!.publicId).toBe("jjchoi");
    expect(res[0]!.displayName).toBe("커스텀");
    expect(res[0]!.matchType).toBe("name");
  });

  it("does not call the DB under 2 characters and returns [] on DB error", async () => {
    const { searchCommunityMessengerUsersRanked } = await import("@/lib/community-messenger/user-public-id-search");
    expect(await searchCommunityMessengerUsersRanked("viewer-1", "a")).toEqual([]);
    expect(rpcCalls).toHaveLength(0);
    rpcError = { message: "boom" };
    expect(await searchCommunityMessengerUsersRanked("viewer-1", "jjch")).toEqual([]);
  });

  it("resolveUserByPublicId picks only the exact match", async () => {
    rpcRows = [
      { ...customMember, match_kind: "prefix" },
      { ...autoMember, match_kind: "exact", match_rank: 0 },
    ];
    const { resolveUserByPublicId } = await import("@/lib/community-messenger/social-relations");
    const hit = await resolveUserByPublicId("@48213SUN", "viewer-1");
    expect(hit).toEqual({ id: "u-auto", displayName: "홍길동", avatarUrl: null, publicId: "48213sun" });
    expect(rpcCalls[0]!.args).toEqual({ p_viewer: "viewer-1", p_query: "48213sun", p_limit: 5 });
  });

  it("resolveUserByPublicId returns null without an exact match and uses a no-viewer id when none given", async () => {
    rpcRows = [{ ...customMember, match_kind: "contains" }];
    const { resolveUserByPublicId } = await import("@/lib/community-messenger/social-relations");
    expect(await resolveUserByPublicId("jjcho")).toBeNull();
    expect(rpcCalls[0]!.args.p_viewer).toBe("00000000-0000-0000-0000-000000000000");
  });
});
