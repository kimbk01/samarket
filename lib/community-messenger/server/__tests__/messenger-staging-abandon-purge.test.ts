import { describe, expect, it, vi } from "vitest";
import {
  MESSENGER_STAGING_ABANDON_MS,
  purgeStaleMessengerStagingObjects,
} from "@/lib/community-messenger/server/messenger-media-upload-send";

const USER = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockSb(listData: unknown[]) {
  const list = vi.fn(async () => ({ data: listData, error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const sb = { storage: { from: vi.fn(() => ({ list, remove })) } };
  return { sb: sb as never, list, remove };
}

describe("purgeStaleMessengerStagingObjects (abandoned staged uploads)", () => {
  const now = Date.parse("2026-10-15T12:00:00Z");
  const old = new Date(now - MESSENGER_STAGING_ABANDON_MS - 1000).toISOString();
  const fresh = new Date(now - 60_000).toISOString();

  it("removes only stale objects in the caller's own room staging dir", async () => {
    const { sb, list, remove } = mockSb([
      { name: `${UUID_A}.pdf`, id: "1", created_at: old },
      { name: `${UUID_B}.pdf`, id: "2", created_at: fresh },
      { name: "nested", id: null, created_at: null },
      { name: "evil.pdf", id: "3", created_at: old },
    ]);
    const n = await purgeStaleMessengerStagingObjects({ sb, kind: "file", userId: USER, roomId: ROOM, nowMs: now });
    expect(n).toBe(1);
    expect(list).toHaveBeenCalledWith(`${USER}/community/messenger-file-staging/${ROOM}`, { limit: 100 });
    expect(remove).toHaveBeenCalledWith([`${USER}/community/messenger-file-staging/${ROOM}/${UUID_A}.pdf`]);
  });

  it("never throws and removes nothing when listing fails", async () => {
    const sb = { storage: { from: () => ({ list: async () => ({ data: null, error: { message: "x" } }), remove: vi.fn() }) } };
    expect(await purgeStaleMessengerStagingObjects({ sb: sb as never, kind: "image", userId: USER, roomId: ROOM })).toBe(0);
  });
});
