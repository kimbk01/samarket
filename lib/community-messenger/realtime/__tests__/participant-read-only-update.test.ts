import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isParticipantReadOnlyUpdate } from "@/lib/community-messenger/realtime/participant-read-only-update";

const row = {
  id: "p1",
  room_id: "r1",
  user_id: "u1",
  unread_count: 0,
  last_read_message_id: "m1",
  last_read_at: "2026-11-18T00:00:00Z",
  is_muted: false,
  left_at: null,
  role: "member",
  is_archived: false,
};

describe("L2 isParticipantReadOnlyUpdate", () => {
  it("true when only read cursor / unread_count changed (send RPC · mark_read)", () => {
    expect(isParticipantReadOnlyUpdate({ eventType: "UPDATE", oldRecord: row, newRecord: { ...row, unread_count: 3 } })).toBe(true);
    expect(
      isParticipantReadOnlyUpdate({
        eventType: "UPDATE",
        oldRecord: row,
        newRecord: { ...row, last_read_message_id: "m2", last_read_at: "2026-11-18T00:01:00Z", unread_count: 0 },
      })
    ).toBe(true);
  });

  it("false when a meta column changes (mute · leave · role · archive)", () => {
    for (const patch of [{ is_muted: true }, { left_at: "2026-11-18T00:00:00Z" }, { role: "admin" }, { is_archived: true }]) {
      expect(
        isParticipantReadOnlyUpdate({ eventType: "UPDATE", oldRecord: row, newRecord: { ...row, unread_count: 2, ...patch } })
      ).toBe(false);
    }
  });

  it("false (fallback to meta reload) when old row lacks columns (PK only) or event is not UPDATE", () => {
    expect(isParticipantReadOnlyUpdate({ eventType: "UPDATE", oldRecord: { id: "p1" }, newRecord: { ...row, unread_count: 1 } })).toBe(false);
    expect(isParticipantReadOnlyUpdate({ eventType: "INSERT", oldRecord: null, newRecord: row })).toBe(false);
    expect(isParticipantReadOnlyUpdate({ eventType: "UPDATE", oldRecord: row, newRecord: row })).toBe(false);
  });

  it("bundle channel gates meta.schedule with the helper and still emits participant event", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/realtime/global-messenger-room-bundle-channel.ts"),
      "utf8"
    );
    expect(src).toMatch(/if \(\s*!isParticipantReadOnlyUpdate\([\s\S]*?\)\s*\) \{\s*getOrCreateRoomSchedulers\(entry, roomKey\)\.meta\.schedule\(\);\s*\}\s*emitRoomParticipantPostgresForRoom/);
  });
});
