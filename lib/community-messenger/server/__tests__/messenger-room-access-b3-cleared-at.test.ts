import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  viewerParticipantPreflightFromAccess,
  type MessengerRoomAccessFacts,
} from "@/lib/community-messenger/server/messenger-room-access";

const ROOT = process.cwd();

describe("B3 room_access cleared_at preflight", () => {
  it("builds message-list preflight from access when active + id present", () => {
    const access: MessengerRoomAccessFacts = {
      roomId: "r1",
      roomExists: true,
      roomType: "direct",
      deleted: false,
      participantActive: true,
      participantId: "p1",
      clearedAt: "2026-11-01T00:00:00.000Z",
      groupParticipant: null,
      banned: false,
    };
    expect(viewerParticipantPreflightFromAccess(access)).toEqual({
      id: "p1",
      cleared_at: "2026-11-01T00:00:00.000Z",
    });
  });

  it("returns null when not an active participant", () => {
    expect(
      viewerParticipantPreflightFromAccess({
        roomId: "r1",
        roomExists: true,
        roomType: "direct",
        deleted: false,
        participantActive: false,
        participantId: "",
        clearedAt: null,
        groupParticipant: null,
        banned: false,
      })
    ).toBeNull();
  });

  it("migration adds participant_id and cleared_at", () => {
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20261118180000_community_messenger_room_access_cleared_at_b3.sql"),
      "utf8"
    );
    expect(sql).toContain("participant_id");
    expect(sql).toContain("cleared_at");
    expect(sql).toContain("community_messenger_room_access");
  });

  it("GET messages wires viewerParticipantPreflight into latest/before", () => {
    const src = readFileSync(
      join(ROOT, "app/api/community-messenger/rooms/[roomId]/messages/route.ts"),
      "utf8"
    );
    expect(src).toContain("viewerParticipantPreflightFromAccess");
    expect(src).toContain("viewerParticipantPreflight");
  });
});
