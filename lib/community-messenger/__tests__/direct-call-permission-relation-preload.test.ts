import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: vi.fn(),
}));

import { fetchBlockedPairFromSb, type BlockedRelation } from "@/lib/social/user-block-ssot";
import { canStartDirectCallBetweenUsers } from "@/lib/community-messenger/direct-call-permission";

const CALLER = "11111111-1111-1111-1111-111111111111";
const CALLEE = "22222222-2222-2222-2222-222222222222";

type World = {
  blocked: BlockedRelation;
  savedByMe: boolean;
  savedByPeer: boolean;
  rejectedByPeer: boolean;
  policy: string;
};

/** Fake PostgREST — answers by table; counts queries per table. */
function fakeSb(world: World, counts: Record<string, number>) {
  const chainFor = (table: string) => {
    const filters: Array<[string, string]> = [];
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: string) => {
      filters.push([col, val]);
      return chain;
    });
    chain.or = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.in = vi.fn(async (col: string, ids: string[]) => {
      counts[table] = (counts[table] ?? 0) + 1;
      if (table === "profiles" && col === "id") {
        return {
          data: ids.map((id) => ({
            id,
            status: "active",
            messenger_direct_call_policy: world.policy,
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    });
    chain.maybeSingle = vi.fn(async () => {
      counts[table] = (counts[table] ?? 0) + 1;
      const f = Object.fromEntries(filters);
      if (table === "profiles") {
        return { data: { status: "active", messenger_direct_call_policy: world.policy }, error: null };
      }
      if (table === "user_social_relations") {
        const saved =
          f.owner_user_id === CALLER ? world.savedByMe : f.owner_user_id === CALLEE ? world.savedByPeer : false;
        return { data: saved ? { id: "rel" } : null, error: null };
      }
      if (table === "community_friend_requests") {
        return { data: f.status === "rejected" && world.rejectedByPeer ? { id: "req" } : null, error: null };
      }
      return { data: null, error: null };
    });
    return chain;
  };
  return { from: vi.fn((table: string) => chainFor(table)) } as unknown as SupabaseClient<any>;
}

const NOT_BLOCKED: BlockedRelation = { blockedByMe: false, blockedByPeer: false, blockedEitherWay: false };
const BLOCKED_BY_ME: BlockedRelation = { blockedByMe: true, blockedByPeer: false, blockedEitherWay: true };

const worlds: Array<[string, World]> = [
  ["stranger", { blocked: NOT_BLOCKED, savedByMe: false, savedByPeer: false, rejectedByPeer: false, policy: "everybody" }],
  ["mutual friend", { blocked: NOT_BLOCKED, savedByMe: true, savedByPeer: true, rejectedByPeer: false, policy: "everybody" }],
  ["saved by me only", { blocked: NOT_BLOCKED, savedByMe: true, savedByPeer: false, rejectedByPeer: false, policy: "everybody" }],
  ["blocked by me", { blocked: BLOCKED_BY_ME, savedByMe: true, savedByPeer: true, rejectedByPeer: false, policy: "everybody" }],
  ["rejected by peer", { blocked: NOT_BLOCKED, savedByMe: false, savedByPeer: false, rejectedByPeer: true, policy: "everybody" }],
  ["friends_only, peer did not save me", { blocked: NOT_BLOCKED, savedByMe: true, savedByPeer: false, rejectedByPeer: false, policy: "friends_only" }],
  ["friends_only, peer saved me", { blocked: NOT_BLOCKED, savedByMe: false, savedByPeer: true, rejectedByPeer: false, policy: "friends_only" }],
];

describe("R2-a canStartDirectCallBetweenUsers relationPreload", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(worlds)("%s: same result with and without the same-request preload", async (_name, world) => {
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue(world.blocked);
    const baseArgs = {
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio" as const,
      skipRoomCheck: true,
      friendshipPreload: { state: world.savedByMe ? "accepted" : "none", source: "social_relations" } as const,
    };

    const countsDirect: Record<string, number> = {};
    const direct = await canStartDirectCallBetweenUsers({ ...baseArgs, supabase: fakeSb(world, countsDirect) });
    const blockCallsDirect = vi.mocked(fetchBlockedPairFromSb).mock.calls.length;

    vi.mocked(fetchBlockedPairFromSb).mockClear();
    const countsPreload: Record<string, number> = {};
    const preloaded = await canStartDirectCallBetweenUsers({
      ...baseArgs,
      supabase: fakeSb(world, countsPreload),
      relationPreload: { blocked: world.blocked, rejectedByPeer: world.rejectedByPeer, savedByMe: world.savedByMe },
    });

    expect(preloaded).toEqual(direct);
    expect(blockCallsDirect).toBe(1);
    expect(vi.mocked(fetchBlockedPairFromSb)).not.toHaveBeenCalled();
    /** savedByMe 1회 줄고 savedByPeer 는 그대로 */
    expect(countsPreload.user_social_relations).toBe((countsDirect.user_social_relations ?? 0) - 1);
    /** 거절 조회는 차단 deny 전에 끝나는 경우가 있어 「직접 조회보다 많지 않음 + preload 는 0」 */
    expect(countsPreload.community_friend_requests ?? 0).toBe(0);
  });
});

describe("R2-a resolveDirectRoomPeerRelation same-request preload", () => {
  it("uses the passed block pair and rejection instead of querying them again", async () => {
    vi.doMock("server-only", () => ({}));
    const { resolveDirectRoomPeerRelation } = await import(
      "@/lib/community-messenger/friendship/direct-room-peer-relation"
    );
    const world: World = { blocked: BLOCKED_BY_ME, savedByMe: false, savedByPeer: false, rejectedByPeer: true, policy: "everybody" };
    const resolved = { state: "none", direction: "none", row: null, source: "none" } as never;

    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue(world.blocked);
    const countsDirect: Record<string, number> = {};
    const direct = await resolveDirectRoomPeerRelation(fakeSb(world, countsDirect), CALLER, CALLEE, resolved);

    vi.mocked(fetchBlockedPairFromSb).mockClear();
    const countsPreload: Record<string, number> = {};
    const preloaded = await resolveDirectRoomPeerRelation(fakeSb(world, countsPreload), CALLER, CALLEE, resolved, {
      blockedPair: world.blocked,
      rejectedByPeer: world.rejectedByPeer,
    });

    expect(preloaded).toEqual(direct);
    expect(preloaded.directMessageDenied).toBe("blocked");
    expect(preloaded.peerBlockedByMe).toBe(true);
    expect(vi.mocked(fetchBlockedPairFromSb)).not.toHaveBeenCalled();
    /** 거절 조회 1건이 빠진다(대기 요청 조회는 그대로) */
    expect(countsPreload.community_friend_requests ?? 0).toBe((countsDirect.community_friend_requests ?? 0) - 1);
  });
});
