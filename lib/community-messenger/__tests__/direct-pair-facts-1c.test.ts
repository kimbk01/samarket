import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 1-C — 1:1 관계 행을 `community_messenger_direct_pair_facts` 1회로 읽어도
 * 통화 권한·방 관계 판정이 기존 개별 조회와 같다. RPC 실패 → 기존 개별 조회.
 */
vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: vi.fn(),
}));

import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";
import { canStartDirectCallBetweenUsers } from "@/lib/community-messenger/direct-call-permission";
import { resolveDirectRoomPeerRelation } from "@/lib/community-messenger/friendship/direct-room-peer-relation";
import { loadDirectPairFacts } from "@/lib/community-messenger/server/direct-pair-facts";

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";

type World = {
  blockedByMe: boolean;
  blockedByPeer: boolean;
  savedByMe: boolean;
  savedByPeer: boolean;
  rejectedByPeer: boolean;
  pending: null | "mine" | "theirs";
  policy: string;
  myStatus: string;
  peerStatus: string;
  room: null | { status: string; readonly: boolean; meIn: boolean; peerIn: boolean };
};

const base: World = {
  blockedByMe: false,
  blockedByPeer: false,
  savedByMe: false,
  savedByPeer: false,
  rejectedByPeer: false,
  pending: null,
  policy: "everybody",
  myStatus: "active",
  peerStatus: "active",
  room: { status: "active", readonly: false, meIn: true, peerIn: true },
};

/** Legacy table-by-table fake + optional RPC. Counts calls. */
function fakeSb(world: World, opts: { rpc: boolean }, counts: Record<string, number>) {
  const chainFor = (table: string) => {
    const filters: Record<string, string> = {};
    const chain: Record<string, unknown> = {};
    const done = (v: unknown) => {
      counts[table] = (counts[table] ?? 0) + 1;
      return v;
    };
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn((col: string, val: string) => {
      filters[col] = val;
      if (table === "community_messenger_participants" && col === "room_id") {
        const ids = world.room ? [world.room.meIn ? ME : null, world.room.peerIn ? PEER : null].filter(Boolean) : [];
        return Object.assign(Promise.resolve(done({ data: ids.map((user_id) => ({ user_id })), error: null })), chain);
      }
      return chain;
    });
    chain.or = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.in = vi.fn(async (_col: string, ids: string[]) =>
      done({
        data: ids.map((id) => ({ id, status: id === ME ? world.myStatus : world.peerStatus })),
        error: null,
      })
    );
    chain.maybeSingle = vi.fn(async () => {
      if (table === "profiles") return done({ data: { messenger_direct_call_policy: world.policy }, error: null });
      if (table === "user_social_relations") {
        const saved = filters.owner_user_id === ME ? world.savedByMe : world.savedByPeer;
        return done({ data: saved ? { id: "rel" } : null, error: null });
      }
      if (table === "community_friend_requests") {
        if (filters.status === "rejected") return done({ data: world.rejectedByPeer ? { id: "rq" } : null, error: null });
        if (filters.status === "pending" && world.pending)
          return done({ data: { id: "pend-1", requester_id: world.pending === "mine" ? ME : PEER }, error: null });
        return done({ data: null, error: null });
      }
      if (table === "community_messenger_rooms") {
        return done({
          data: world.room ? { room_type: "direct", room_status: world.room.status, is_readonly: world.room.readonly } : null,
          error: null,
        });
      }
      return done({ data: null, error: null });
    });
    return chain;
  };
  const sb: Record<string, unknown> = { from: vi.fn((table: string) => chainFor(table)) };
  if (opts.rpc) {
    sb.rpc = vi.fn(async (name: string, args: { p_room_key: string | null }) => {
      counts[`rpc:${name}`] = (counts[`rpc:${name}`] ?? 0) + 1;
      const room = args.p_room_key ? world.room : null;
      return {
        data: {
          blocked_by_viewer: world.blockedByMe,
          blocked_by_peer: world.blockedByPeer,
          saved_by_viewer: world.savedByMe,
          saved_by_peer: world.savedByPeer,
          rejected_by_peer: world.rejectedByPeer,
          pending_request_id: world.pending ? "pend-1" : null,
          pending_requester_id: world.pending ? (world.pending === "mine" ? ME : PEER) : null,
          viewer_status: world.myStatus,
          peer_status: world.peerStatus,
          peer_call_policy: world.policy,
          unknown_peer_notice_dismissed_at: null,
          room_exists: Boolean(room),
          room_type: room ? "direct" : null,
          room_status: room?.status ?? null,
          room_is_readonly: room?.readonly ?? null,
          viewer_in_room: room?.meIn ?? false,
          peer_in_room: room?.peerIn ?? false,
        },
        error: null,
      };
    });
  }
  return sb as unknown as SupabaseClient<any>;
}

const worlds: Array<[string, Partial<World>]> = [
  ["stranger", {}],
  ["mutual friend", { savedByMe: true, savedByPeer: true }],
  ["blocked by me", { blockedByMe: true, savedByMe: true }],
  ["blocked by peer", { blockedByPeer: true }],
  ["rejected by peer", { rejectedByPeer: true }],
  ["friends_only, peer did not save me", { savedByMe: true, policy: "friends_only" }],
  ["friends_only, peer saved me", { savedByPeer: true, policy: "friends_only" }],
  ["nobody policy", { policy: "nobody" }],
  ["peer deleted", { peerStatus: "deleted" }],
  ["me suspended", { myStatus: "suspended" }],
  ["peer not in room", { room: { status: "active", readonly: false, meIn: true, peerIn: false } }],
  ["room readonly", { room: { status: "active", readonly: true, meIn: true, peerIn: true } }],
  ["room archived", { room: { status: "archived", readonly: false, meIn: true, peerIn: true } }],
  ["room missing", { room: null }],
  ["pending mine", { pending: "mine" }],
  ["pending theirs", { pending: "theirs" }],
];

function legacyBlocked(world: World) {
  return {
    blockedByMe: world.blockedByMe,
    blockedByPeer: world.blockedByPeer,
    blockedEitherWay: world.blockedByMe || world.blockedByPeer,
  };
}

describe("1-C direct pair facts", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(worlds)("%s: 통화 권한 결과가 기존 개별 조회와 같고, RPC 1회만 쓴다", async (_n, patch) => {
    const world = { ...base, ...patch };
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue(legacyBlocked(world));
    for (const roomId of [ROOM, undefined]) {
      const legacyCounts: Record<string, number> = {};
      const legacy = await canStartDirectCallBetweenUsers({
        callerUserId: ME,
        calleeUserId: PEER,
        roomId,
        callKind: "audio",
        supabase: fakeSb(world, { rpc: false }, legacyCounts),
      });
      const factsCounts: Record<string, number> = {};
      vi.mocked(fetchBlockedPairFromSb).mockClear();
      const viaFacts = await canStartDirectCallBetweenUsers({
        callerUserId: ME,
        calleeUserId: PEER,
        roomId,
        callKind: "audio",
        supabase: fakeSb(world, { rpc: true }, factsCounts),
      });
      expect(viaFacts).toEqual(legacy);
      expect(factsCounts).toEqual({ "rpc:community_messenger_direct_pair_facts": 1 });
      expect(vi.mocked(fetchBlockedPairFromSb)).not.toHaveBeenCalled();
    }
  });

  it.each(worlds)("%s: 방 관계 표시가 기존 개별 조회와 같다", async (_n, patch) => {
    const world = { ...base, ...patch };
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue(legacyBlocked(world));
    for (const withRelationLabel of [false, true]) {
      const legacy = await resolveDirectRoomPeerRelation(
        fakeSb(world, { rpc: false }, {}) as any,
        ME,
        PEER,
        undefined,
        { withRelationLabel }
      );
      const counts: Record<string, number> = {};
      const viaFacts = await resolveDirectRoomPeerRelation(fakeSb(world, { rpc: true }, counts) as any, ME, PEER, undefined, {
        withRelationLabel,
      });
      expect(viaFacts).toEqual(legacy);
      expect(counts).toEqual({ "rpc:community_messenger_direct_pair_facts": 1 });
    }
  });

  it("같은 요청에서 읽은 facts 를 넘기면 다시 읽지 않는다", async () => {
    const world = { ...base, savedByMe: true, savedByPeer: true };
    const counts: Record<string, number> = {};
    const sb = fakeSb(world, { rpc: true }, counts);
    const facts = await loadDirectPairFacts(sb, ME, PEER, ROOM);
    expect(facts).not.toBeNull();
    await canStartDirectCallBetweenUsers({ callerUserId: ME, calleeUserId: PEER, roomId: ROOM, callKind: "audio", supabase: sb, pairFacts: facts });
    await resolveDirectRoomPeerRelation(sb as any, ME, PEER, undefined, { pairFacts: facts });
    expect(counts).toEqual({ "rpc:community_messenger_direct_pair_facts": 1 });
  });

  it("다른 방의 facts 는 쓰지 않고 다시 읽는다", async () => {
    const counts: Record<string, number> = {};
    const sb = fakeSb(base, { rpc: true }, counts);
    const facts = await loadDirectPairFacts(sb, ME, PEER, null);
    await canStartDirectCallBetweenUsers({ callerUserId: ME, calleeUserId: PEER, roomId: ROOM, callKind: "audio", supabase: sb, pairFacts: facts });
    expect(counts["rpc:community_messenger_direct_pair_facts"]).toBe(2);
  });

  it("RPC 실패 → 기존 개별 조회로 같은 판정", async () => {
    const world = { ...base, savedByMe: true, savedByPeer: true };
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue(legacyBlocked(world));
    const counts: Record<string, number> = {};
    const sb = fakeSb(world, { rpc: false }, counts) as unknown as Record<string, unknown>;
    sb.rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    const r = await canStartDirectCallBetweenUsers({
      callerUserId: ME,
      calleeUserId: PEER,
      roomId: ROOM,
      callKind: "audio",
      supabase: sb as unknown as SupabaseClient<any>,
    });
    expect(r.allowed).toBe(true);
    expect(counts.user_social_relations).toBeGreaterThan(0);
    expect(vi.mocked(fetchBlockedPairFromSb)).toHaveBeenCalled();
  });
});
