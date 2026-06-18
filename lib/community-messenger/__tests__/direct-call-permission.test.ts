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
} from "@/lib/community-messenger/direct-call-permission";
import { getFriendshipPairState } from "@/lib/community-messenger/friendship-resolver";

const CALLER = "11111111-1111-1111-1111-111111111111";
const CALLEE = "22222222-2222-2222-2222-222222222222";
const ROOM = "33333333-3333-3333-3333-333333333333";

function mockSb(profiles: Record<string, unknown>, participants: Array<{ user_id: string }> = [], room: Record<string, unknown> | null = null) {
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
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({ data: null, error: null })),
                })),
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
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
  it("defaults null/unknown to friends_only", () => {
    expect(resolveDirectCallPolicy(null)).toBe("friends_only");
    expect(resolveDirectCallPolicy("")).toBe("friends_only");
    expect(resolveDirectCallPolicy("everyone")).toBe("everybody");
    expect(resolveDirectCallPolicy("nobody")).toBe("nobody");
  });
});

describe("canStartDirectCallBetweenUsers", () => {
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

  it("A: pre-request denies not friend", async () => {
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_not_friend" });
  });

  it("B: pending denies pending friend", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_pending_friend" });
  });

  it("C-D: accepted allows audio and video", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const audio = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    const video = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "video",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(audio).toEqual({ allowed: true, reason: "allow_friend" });
    expect(video).toEqual({ allowed: true, reason: "allow_friend" });
  });

  it("E: friendships accepted allows even if social fallback empty", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("F: block denies", async () => {
    vi.mocked(fetchBlockedPairFromSb).mockResolvedValue({
      blockedByMe: true,
      blockedByPeer: false,
      blockedEitherWay: true,
    });
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_blocked" });
  });

  it("G: readd cooldown denies not friend", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "removed",
      readd_blocked_until: new Date(Date.now() + 86_400_000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_not_friend" });
  });

  it("H: hidden room flags do not deny when room active direct participants ok", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb(
      { messenger_direct_call_policy: "friends_only", status: "active" },
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

  it("I: friends_only + accepted allows", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result.allowed).toBe(true);
  });

  it("J: nobody + accepted denies privacy", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "nobody", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_privacy" });
  });

  it("K: everybody allows without friendship", async () => {
    const sb = mockSb({ messenger_direct_call_policy: "everybody", status: "active" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: true, reason: "allow_everybody_policy" });
  });

  it("L: missing participant denies room mismatch", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb(
      { messenger_direct_call_policy: "friends_only", status: "active" },
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
    expect(result).toEqual({ allowed: false, code: "deny_room_state_mismatch" });
  });

  it("M: suspended callee denies deleted account", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "suspended" });
    const result = await canStartDirectCallBetweenUsers({
      callerUserId: CALLER,
      calleeUserId: CALLEE,
      callKind: "audio",
      supabase: sb,
      skipRoomCheck: true,
    });
    expect(result).toEqual({ allowed: false, code: "deny_deleted_account" });
  });

  it("maps deny codes to API errors", () => {
    expect(mapDenyCodeToApiError("deny_pending_friend")).toBe("call_denied_pending_friend");
    expect(mapDenyCodeToApiError("deny_privacy")).toBe("call_denied_privacy");
  });

  it("friendshipPreload skips duplicate friendship fetch", async () => {
    const sb = mockSb({ messenger_direct_call_policy: "friends_only", status: "active" });
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
  it("prioritizes friendships SSOT accepted", async () => {
    vi.mocked(fetchFriendshipPairRow).mockResolvedValue({
      id: "f1",
      requester_user_id: CALLER,
      addressee_user_id: CALLEE,
      status: "accepted",
      readd_blocked_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const sb = mockSb({ status: "active" });
    const resolved = await getFriendshipPairState(sb, CALLER, CALLEE);
    expect(resolved.state).toBe("accepted");
    expect(resolved.source).toBe("friendships_ssot");
  });
});
