import { describe, expect, it, vi, beforeEach } from "vitest";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { leaveGroupRoom } from "@/lib/community-messenger/group/group-room-service";

vi.mock("@/lib/community-messenger/group/group-room-realtime", () => ({
  publishGroupRoomListBump: vi.fn(async () => {}),
}));

vi.mock("@/lib/community-messenger/group/group-room-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/group/group-room-repository")>();
  return {
    ...actual,
    resolveGroupRoomSupabase: vi.fn(),
    fetchPrivateGroupRoom: vi.fn(),
    fetchActiveParticipant: vi.fn(),
    markParticipantLeft: vi.fn(async () => ({ ok: true })),
  };
});

import {
  resolveGroupRoomSupabase,
  fetchPrivateGroupRoom,
  fetchActiveParticipant,
  markParticipantLeft,
} from "@/lib/community-messenger/group/group-room-repository";

const ownerId = "11111111-1111-1111-1111-111111111111";
const memberId = "22222222-2222-2222-2222-222222222222";
const roomId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

function buildSelectChain(rows: unknown[]) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.neq = vi.fn(self);
  chain.is = vi.fn(self);
  chain.order = vi.fn(async () => ({ data: rows, error: null }));
  return chain;
}

function buildUpdateChain(error: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const self = () => chain;
  chain.update = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.is = vi.fn(async () => ({ error }));
  return chain;
}

function mockSupabaseForOwnerTransfer() {
  let participantFromCalls = 0;
  const mockFrom = vi.fn((table: string) => {
    if (table === "community_messenger_participants") {
      participantFromCalls += 1;
      if (participantFromCalls === 1) {
        return buildSelectChain([{ user_id: memberId, joined_at: "2026-01-01T00:00:00.000Z" }]);
      }
      return buildUpdateChain(null);
    }
    if (table === "community_messenger_rooms") {
      return buildUpdateChain(null);
    }
    throw new Error(`unexpected table ${table}`);
  });
  vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ from: mockFrom } as never);
  return mockFrom;
}

describe("leaveGroupRoom owner transfer", () => {
  beforeEach(() => {
    vi.mocked(fetchPrivateGroupRoom).mockReset();
    vi.mocked(fetchActiveParticipant).mockReset();
    vi.mocked(markParticipantLeft).mockReset();
    vi.mocked(resolveGroupRoomSupabase).mockReset();
    vi.mocked(markParticipantLeft).mockResolvedValue({ ok: true });
  });

  it("private_group owner leaves with active member: ok, promotes oldest member, marks owner left", async () => {
    const mockFrom = mockSupabaseForOwnerTransfer();
    vi.mocked(fetchPrivateGroupRoom).mockResolvedValueOnce({
      id: roomId,
      room_type: "private_group",
      owner_user_id: ownerId,
    } as never);
    vi.mocked(fetchActiveParticipant).mockResolvedValueOnce({
      user_id: ownerId,
      role: "owner",
    } as never);

    const result = await leaveGroupRoom({ userId: ownerId, roomId });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("community_messenger_participants");
    expect(mockFrom).toHaveBeenCalledWith("community_messenger_rooms");
    expect(markParticipantLeft).toHaveBeenCalledWith(expect.anything(), roomId, ownerId);
  });

  it("private_group normal member leaves: unchanged behavior", async () => {
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ from: vi.fn() } as never);
    vi.mocked(fetchPrivateGroupRoom).mockResolvedValueOnce({
      id: roomId,
      room_type: "private_group",
      owner_user_id: ownerId,
    } as never);
    vi.mocked(fetchActiveParticipant).mockResolvedValueOnce({
      user_id: memberId,
      role: "member",
    } as never);

    const result = await leaveGroupRoom({ userId: memberId, roomId });

    expect(result).toEqual({ ok: true });
    expect(markParticipantLeft).toHaveBeenCalledWith(expect.anything(), roomId, memberId);
  });

  it("sole owner leaves: ok and archives room", async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === "community_messenger_participants") {
        return buildSelectChain([]);
      }
      if (table === "community_messenger_rooms") {
        return buildUpdateChain(null);
      }
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ from: mockFrom } as never);
    vi.mocked(fetchPrivateGroupRoom).mockResolvedValueOnce({
      id: roomId,
      room_type: "private_group",
      owner_user_id: ownerId,
    } as never);
    vi.mocked(fetchActiveParticipant).mockResolvedValueOnce({
      user_id: ownerId,
      role: "owner",
    } as never);

    const result = await leaveGroupRoom({ userId: ownerId, roomId });

    expect(result).toEqual({ ok: true });
    expect(mockFrom).toHaveBeenCalledWith("community_messenger_rooms");
    expect(markParticipantLeft).toHaveBeenCalledWith(expect.anything(), roomId, ownerId);
  });

  it("does not return owner_cannot_leave", async () => {
    mockSupabaseForOwnerTransfer();
    vi.mocked(fetchPrivateGroupRoom).mockResolvedValueOnce({
      id: roomId,
      room_type: "private_group",
      owner_user_id: ownerId,
    } as never);
    vi.mocked(fetchActiveParticipant).mockResolvedValueOnce({
      user_id: ownerId,
      role: "owner",
    } as never);

    const result = await leaveGroupRoom({ userId: ownerId, roomId });

    expect(result.error).not.toBe(GROUP_ROOM_ERROR.OWNER_CANNOT_LEAVE);
    expect(result.ok).toBe(true);
  });
});
