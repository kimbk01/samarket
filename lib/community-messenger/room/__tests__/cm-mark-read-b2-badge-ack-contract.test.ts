import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("B2 mark_read PATCH Domain badge ACK contract", () => {
  it("route issues badgeAck on atomic mark and skips duplicate clear/engine", () => {
    const src = readFileSync(
      join(ROOT, "app/api/community-messenger/rooms/[roomId]/route.ts"),
      "utf8"
    );
    expect(src).toContain("issueDomainBadgeAuthorityForAck");
    expect(src).toContain("domainBadgeReadMutationAckFields");
    expect(src).toContain('roomReadFollowUp = "skip"');
    expect(src).toContain("mark_read_combined_rpc_used === 1");
    expect(src).toContain("clearMessengerRoomNotificationTargetAfterRead");
    // clear/legacy only on !atomicCleared
    expect(src).toContain("if (!atomicCleared)");
  });

  it("client parse type accepts roomReadFollowUp and badgeAck", () => {
    const src = readFileSync(
      join(ROOT, "lib/community-messenger/room/community-messenger-mark-read-fetch.ts"),
      "utf8"
    );
    expect(src).toContain('roomReadFollowUp?: "skip" | "required"');
    expect(src).toContain("badgeAck?:");
  });
});
