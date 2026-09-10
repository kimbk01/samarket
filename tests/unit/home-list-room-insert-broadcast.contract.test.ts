import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCanonicalHomeListRoomSummaryPayload } from "@/lib/community-messenger/realtime/home-list-room-insert-broadcast";

describe("home-list room insert broadcast contract", () => {
  it("rejects non-canonical payloads", () => {
    expect(isCanonicalHomeListRoomSummaryPayload(null)).toBe(false);
    expect(isCanonicalHomeListRoomSummaryPayload({ id: "x" })).toBe(false);
    expect(
      isCanonicalHomeListRoomSummaryPayload({
        id: "r1",
        roomType: "private_group",
        title: "G",
        lastMessageAt: "2026-09-10T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("invite/create publish invitee user-channel INSERT (no first-paint home-summary)", () => {
    const svc = readFileSync(join(process.cwd(), "lib/community-messenger/group/group-room-service.ts"), "utf8");
    expect(svc).toContain("publishHomeListRoomInsertForInviteesBestEffort");
    expect(svc).toContain("ROOM_SUMMARY_UNAVAILABLE");
    const home = readFileSync(
      join(process.cwd(), "components/community-messenger/CommunityMessengerHome.tsx"),
      "utf8"
    );
    expect(home).not.toMatch(/createPrivateGroup[\s\S]{0,800}home-summary/);
    expect(home).toContain('json.roomId && json.room');
  });
});
