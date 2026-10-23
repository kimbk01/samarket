import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Bundle7 Wave A — S-1 group media POST membership", () => {
  it("POST requires fetchActiveParticipant before read counts", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/community-messenger/group-rooms/[roomId]/media/route.ts"),
      "utf8"
    );
    expect(src).toContain("fetchActiveParticipant");
    expect(src).toContain("GROUP_ROOM_ERROR.FORBIDDEN");
    const postIdx = src.indexOf("export async function POST");
    const participantIdx = src.indexOf("fetchActiveParticipant", postIdx);
    const countsIdx = src.indexOf("fetchGroupMessageReadCounts", postIdx);
    expect(postIdx).toBeGreaterThan(-1);
    expect(participantIdx).toBeGreaterThan(postIdx);
    expect(countsIdx).toBeGreaterThan(participantIdx);
  });
});

describe("Bundle7 Wave A — G-2 open group capacity", () => {
  it("joinOpenGroupRoomWithPassword filters left_at and uses >= memberLimit", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    const fnIdx = src.indexOf("export async function joinOpenGroupRoomWithPassword");
    expect(fnIdx).toBeGreaterThan(-1);
    const slice = src.slice(fnIdx, fnIdx + 4500);
    expect(slice).toContain('.is("left_at", null)');
    expect(slice).toContain("room_full");
    expect(slice).toMatch(/\(participantHead\?\.length \?\? 0\)\s*>=\s*memberLimit/);
    expect(slice).not.toMatch(/\(participantHead\?\.length \?\? 0\)\s*>\s*memberLimit/);
  });
});

describe("Bundle7 Wave A — F-9 friendship sync table", () => {
  it("subscribes to user_social_relations with primitive deps", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/use-messenger-room-friendship-sync.ts"),
      "utf8"
    );
    expect(src).toContain('table: "user_social_relations"');
    expect(src).toContain("owner_user_id=eq.");
    expect(src).not.toMatch(/table:\s*"community_messenger_friendships"/);
    expect(src).not.toContain("snapshot?.room,");
    expect(src).toContain("viewerUserId,");
    expect(src).toContain("peerUserId,");
    expect(src).toContain("shouldSync,");
  });
});
