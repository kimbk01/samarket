import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readRoomEntryGateFields } from "@/lib/community-messenger/group/group-room-delete-service";

function sbReturning(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  const from = vi.fn(() => chain);
  return { sb: { from } as never, from, chain };
}

describe("R2-b readRoomEntryGateFields", () => {
  it("one rooms read returns type and deleted flag", async () => {
    const { sb, from, chain } = sbReturning({ data: { room_type: "direct", deleted_at: null }, error: null });
    await expect(readRoomEntryGateFields(sb, " room-1 ")).resolves.toEqual({ deleted: false, roomType: "direct" });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("community_messenger_rooms");
    expect(chain.select).toHaveBeenCalledWith("room_type, deleted_at");
  });

  it("deleted group room", async () => {
    const { sb } = sbReturning({ data: { room_type: "private_group", deleted_at: "2026-10-01T00:00:00Z" }, error: null });
    await expect(readRoomEntryGateFields(sb, "g-1")).resolves.toEqual({ deleted: true, roomType: "private_group" });
  });

  it("error or missing row → not deleted, unknown type (caller keeps the ban check)", async () => {
    await expect(readRoomEntryGateFields(sbReturning({ data: null, error: { message: "x" } }).sb, "r")).resolves.toEqual({
      deleted: false,
      roomType: "",
    });
    await expect(readRoomEntryGateFields(sbReturning({ data: null, error: null }).sb, "r")).resolves.toEqual({
      deleted: false,
      roomType: "",
    });
  });
});
