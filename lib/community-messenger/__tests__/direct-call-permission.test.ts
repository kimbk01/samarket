import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/social/user-block-ssot", () => ({
  fetchBlockedPairFromSb: vi.fn(async () => ({
    blockedByMe: false,
    blockedByPeer: false,
    blockedEitherWay: false,
  })),
}));

vi.mock("@/lib/community-messenger/friendship/community-messenger-friendships-ssot", () => ({
  fetchFriendshipPairRow: vi.fn(async () => null),
}));

import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";
import { fetchFriendshipPairRow } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import {
  canStartDirectCallBetweenUsers,
  resolveDirectCallPolicy,
  mapDenyCodeToApiError,
  directCallGateFromPermissionResult,
} from "@/lib/community-messenger/direct-call-permission";
import { getFriendshipPairState } from "@/lib/community-messenger/friendship-resolver";
import { resolvePeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";

const CALLER = "11111111-1111-1111-1111-111111111111";
const CALLEE = "22222222-2222-2222-2222-222222222222";
const ROOM = "33333333-3333-3333-3333-333333333333";

function mockSb(
  profiles: Record<string, unknown>,
  participants: Array<{ user_id: string }> = [],
  room: Record<string, unknown> | null = null,
  socialFriendRows: Array<{ owner_user_id: string; target_user_id: string }> = []
) {
  return {
    from: vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: profiles, error: null })),
            })),
          })),
        };
      }
      if (table === "community_messenger_rooms") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: room, error: null })),
            })),
          })),
        };
      }
      if (table === "community_messenger_participants") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: participants, error: null })),
          })),
        };
      }
      if (table === "user_social_relations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              eq: vi.fn((col2: string, val2: string) => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => {
                    const hit = socialFriendRows.find(
                      (r) => r.owner_user_id === val && r.target_user_id === val2
                    );
                    return { data: hit ? { id: "f1" } : null, error: null };
                  }),
                })),
              })),
            })),
          })),
        };
      }
      if (table === "community_friend_requests") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              or: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
              })),
            })),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
    }),
  } as unknown as SupabaseClient<any>;
}

describe("resolveDirectCallPolicy", () => {
  it("defaults null/unknown to everybody (Kakao)", () => {
    expect(resolveDirectCallPolicy(null)).toBe("everybody");
    expect(resolveDirectCallPolicy("")).toBe("everybody");
    expect(resolveDirectCallPolicy("everyone")).toBe("everybody");
    expect(resolveDirectCallPolicy("friends_only")).toBe("friends_only");
    expect(resolveDirectCallPolicy("nobody")).toBe("nobody");
  });
});

describe("resolvePeerRelationLabel", () => {
  it("classifies mutual only when both sides saved", () => {
    expect(
      resolvePeerRelationLabel({
        blockedEitherWay: false,
        savedByMe: true,
        savedByPeer: true,
        friendship: { state: "accepted", source: "social_relations" },
      })
    ).toBe("mutual_friend");
    expect(
      resolvePeerRelationLabel({
        blockedEitherWay: false,
        savedByMe: true,
        savedByPeer: false,
        friendship: { state: "accepted", source: "social_relations" },
      })
    ).toBe("saved_by_me");
    expect(
      resolvePeerRelationLabel({
        blockedEitherWay: false,
        savedByMe: false,
        savedByPeer: false,
        friendship: { state: "none", source: "none" },
      })
    ).toBe("stranger");
  });
});

describe("canStartDirectCallBetweenUsers — Kakao open call", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({
      blockedByMe: false,
      blockedByPeer: false,
      blockedEitherWay: false,
    });
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("B: stranger + active direct room → audio call allowed", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "everyone", status: "active" },
      [{ user_id: CALLER }, { user_id: CALLEE }],
      { room_type: "direct", room_status: "active", is_readonly: false }
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      roomId: ROOM,
      callKind: "audio",
      supabase: sb,
    });
    expect(result).toMatchObject({ allowed: true, relationLabel: "stranger" });
  });

  it("C: stranger → video call allowed", async () => {
    const sb = mockSb({ messenger_direct_call_policy: "everyone", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "video",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("F/H: block denies with deny_blocked", async () => {
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({
      blockedByMe: true,
      blockedByPeer: false,
      blockedEitherWay: true,
    });
    const sb = mockSb({ messenger_direct_call_policy: "everyone", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_blocked", relationLabel: "blocked" });
  });

  it("M: mutual contact saves allow without extra privacy gate", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "everyone", status: "active" },
      [],
      null,
      [
        { owner_user_id: CALLER, target_user_id: CALLEE },
        { owner_user_id: CALLEE, target_user_id: CALLER },
      ]
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toMatchObject({ allowed: true, relationLabel: "mutual_friend" });
  });

  it("friends_only allows when callee saved caller (Telegram direction)", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "friends_only", status: "active" },
      [],
      null,
      [{ owner_user_id: CALLEE, target_user_id: CALLER }]
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toMatchObject({ allowed: true, relationLabel: "saved_by_peer" });
  });

  it("friends_only denies when only caller saved callee", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "friends_only", status: "active" },
      [],
      null,
      [{ owner_user_id: CALLER, target_user_id: CALLEE }]
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toMatchObject({ allowed: false, code: "deny_privacy", relationLabel: "saved_by_me" });
  });

  it("N: hidden room is not a deny reason when room active", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "everyone", status: "active" },
      [{ user_id: CALLER }, { user_id: CALLEE }],
      { room_type: "direct", room_status: "active", is_readonly: false }
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      roomId: ROOM,
      callKind: "audio",
      supabase: sb,
    });
    expect(result.allowed).toBe(true);
  });

  it("explicit friends_only policy denies stranger", async () => {
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toMatchObject({ allowed: false, code: "deny_privacy" });
  });

  it("nobody policy denies even mutual contact", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "nobody", status: "active" },
      [],
      null,
      [
        { owner_user_id: CALLER, target_user_id: CALLEE },
        { owner_user_id: CALLEE, target_user_id: CALLER },
      ]
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_privacy", relationLabel: "mutual_friend" });
  });

  it("missing participant denies room mismatch", async () => {
    const sb = mockSb(
      { messenger_direct_call_policy: "everyone", status: "active" },
      [{ user_id: CALLER }],
      { room_type: "direct", room_status: "active", is_readonly: false }
    );
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      roomId: ROOM,
      callKind: "audio",
      supabase: sb,
    });
    expect(result).toMatchObject({ allowed: false, code: "deny_room_state_mismatch" });
  });

  it("directCallGate includes relationLabel", () => {
    const gate = directCallGateFromPermissionResult({
      allowed: true,
      reason: "allow_open_direct",
      relationLabel: "stranger",
    });
    expect(gate).toEqual({
      canStartVoice: true,
      canStartVideo: true,
      relationLabel: "stranger",
    });
  });

  it("maps deny codes to API errors", () => {
    expect(mapDenyCodeToApiError("deny_blocked")).toBe("call_denied_blocked");
    expect(mapDenyCodeToApiError("deny_privacy")).toBe("call_denied_privacy");
  });

  it("friendshipPreload skips duplicate friendship fetch", async () => {
    const sb = mockSb({ messenger_direct_call_policy: "everyone", status: "active" });
    await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
      friendshipPreload: { state: "accepted", source: "friendships_ssot" },
    });
    expect(fetchFriendshipPairRow).not.toHaveBeenCalled();
  });
});

describe("getFriendshipPairState", () => {
  it("uses viewer-local contact save (social_relations)", async () => {
    const sb = mockSb(
      { status: "active" },
      [],
      null,
      [{ owner_user_id: CALLER, target_user_id: CALLEE }]
    );
    const resolved = await getFriendshipPairState(sb, CALLER, CALLEE);
    expect(resolved.state).toBe("accepted");
    expect(resolved.source).toBe("social_relations");
  });
});
