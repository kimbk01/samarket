import { describe, expect, it, vi, beforeEach } from "vitest";
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
  };
});

import {
  resolveGroupRoomSupabase,
  fetchPrivateGroupRoom,
  fetchActiveParticipant,
} from "@/lib/community-messenger/group/group-room-repository";
import { publishGroupRoomListBump } from "@/lib/community-messenger/group/group-room-realtime";

const ownerId = "11111111-1111-1111-1111-111111111111";
const memberId = "22222222-2222-2222-2222-222222222222";
const roomId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("leaveGroupRoom owner transfer (atomic RPC)", () => {
  beforeEach(() => {
    vi.mocked(fetchPrivateGroupRoom).mockReset();
    vi.mocked(fetchActiveParticipant).mockReset();
    vi.mocked(resolveGroupRoomSupabase).mockReset();
    vi.mocked(publishGroupRoomListBump).mockClear();
  });

  it("private_group owner leaves: calls leave RPC and bumps list", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, action: "transferred", next_owner_user_id: memberId },
      error: null,
    }));
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ rpc } as never);
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
    expect(rpc).toHaveBeenCalledWith("community_messenger_leave_private_group", {
      p_room_id: roomId,
      p_user_id: ownerId,
    });
    expect(publishGroupRoomListBump).toHaveBeenCalled();
  });

  it("private_group normal member leaves: same RPC path", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, action: "left" }, error: null }));
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ rpc } as never);
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
    expect(rpc).toHaveBeenCalledWith("community_messenger_leave_private_group", {
      p_room_id: roomId,
      p_user_id: memberId,
    });
  });

  it("sole owner leave RPC archive: ok", async () => {
    const rpc = vi.fn(async () => ({ data: { ok: true, action: "archived" }, error: null }));
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ rpc } as never);
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
  });

  it("RPC failure surfaces leave_failed", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ rpc } as never);
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
    expect(result.ok).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("missing RPC falls back without throwing", async () => {
    const limit = vi.fn(async () => ({ data: [{ user_id: memberId }], error: null }));
    const order2 = vi.fn(() => ({ limit }));
    const order1 = vi.fn(() => ({ order: order2 }));
    const is2 = vi.fn(() => ({ order: order1 }));
    const is1 = vi.fn(() => ({ is: is2 }));
    const neq = vi.fn(() => ({ is: is1 }));
    const eqSelect = vi.fn(() => ({ neq }));
    const select = vi.fn(() => ({ eq: eqSelect }));
    const updateIs = vi.fn(async () => ({ error: null }));
    const updateEq2 = vi.fn(() => ({ is: updateIs }));
    const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
    const update = vi.fn(() => ({ eq: updateEq1 }));
    const from = vi.fn((table: string) => {
      if (table === "community_messenger_participants") {
        return { select, update };
      }
      return {
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      };
    });
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Could not find the function community_messenger_leave_private_group" },
    }));
    vi.mocked(resolveGroupRoomSupabase).mockReturnValue({ rpc, from } as never);
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
  });
});
