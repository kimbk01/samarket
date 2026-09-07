import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("group open gap product close contracts", () => {
  it("GAP1: group list avatar never falls back to peerProfilesBase[0]", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(src).toContain("isGroupRoomType ? roomAvatar : roomAvatar || peerProfilesBase[0]?.avatarUrl");
    expect(src).not.toMatch(/avatarUrl:\s*roomAvatar\s*\|\|\s*peerProfilesBase\[0\]/);
  });

  it("GAP2: group header identity opens Group Info menu sheet", () => {
    const src = readFileSync(
      join(process.cwd(), "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx"),
      "utf8"
    );
    expect(src).toContain('data-group-header-identity="1"');
    expect(src).toContain('vm.setActiveSheet("menu")');
    expect(src).toContain("GroupDomainAvatar");
    expect(src).toContain("vm.isGroupRoom ? (");
  });

  it("GAP3: group member count uses active membership (left_at)", () => {
    const service = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("isActiveMembershipParticipantRow");
    expect(service).toContain("countActiveParticipants");
    expect(service).toContain("left_at");
    const assemble = readFileSync(
      join(process.cwd(), "lib/community-messenger/room-bootstrap-snapshot-assemble.ts"),
      "utf8"
    );
    expect(assemble).toContain("activeRows");
    expect(assemble).toContain("left_at");
  });

  it("GAP4: product notification path does not query experimental group_rooms", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/display/load-message-notification-display-context.ts"),
      "utf8"
    );
    expect(src).not.toMatch(/\.from\(\s*["']group_rooms["']\s*\)/);
    expect(src).toContain("community_messenger_rooms");
    expect(src).toContain("Experimental group_rooms must never be a product notification authority");
  });
});
