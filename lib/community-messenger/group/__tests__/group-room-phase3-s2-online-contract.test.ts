import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeGroupRoomOnlineAuthority,
  isGroupPresenceOnline,
} from "@/lib/community-messenger/group/group-room-online-authority";

const ROOT = join(process.cwd());

describe("group chat Phase3 S2-3 Online contracts", () => {
  it("computes Online as active ∩ presence online − ban; memberCount = active", () => {
    const presence = new Map([
      ["u1", "online" as const],
      ["u2", "away" as const],
      ["u3", "online" as const],
      ["u4", "offline" as const],
      ["u5", "online" as const],
    ]);
    const result = computeGroupRoomOnlineAuthority({
      activeParticipantUserIds: ["u1", "u2", "u3", "u4", "u5", "u1"],
      bannedUserIds: ["u5"],
      presenceStateByUserId: presence,
    });
    expect(result.memberCount).toBe(5);
    expect(result.onlineCount).toBe(2);
    expect(result.onlineUserIds.sort()).toEqual(["u1", "u3"]);
    expect(isGroupPresenceOnline("online")).toBe(true);
    expect(isGroupPresenceOnline("away")).toBe(false);
  });

  it("excludes left/pending/ghost automatically when not in activeParticipantUserIds", () => {
    const result = computeGroupRoomOnlineAuthority({
      activeParticipantUserIds: ["a"],
      bannedUserIds: [],
      presenceStateByUserId: {
        a: "online",
        ghost: "online",
        pending: "online",
        left: "online",
      },
    });
    expect(result.memberCount).toBe(1);
    expect(result.onlineCount).toBe(1);
    expect(result.onlineUserIds).toEqual(["a"]);
  });

  it("online authority helper is presence-read only (no writer / policy mutation)", () => {
    const svc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-online-authority.ts"),
      "utf8"
    );
    expect(svc).toContain("derivePresenceFromDbRow");
    expect(svc).toContain("computeGroupRoomOnlineAuthority");
    expect(svc).toContain("resolveGroupRoomOnlineAuthority");
    expect(svc).toContain("community_messenger_presence_snapshots");
    expect(svc).toContain("left_at");
    expect(svc).toContain("community_messenger_group_bans");
    expect(svc).not.toContain("upsertCommunityMessengerPresenceSnapshot");
    expect(svc).not.toMatch(/\.insert\(/);
    expect(svc).not.toMatch(/\.update\(/);
    expect(svc).not.toMatch(/\.upsert\(/);
  });

  it("snapshot wires group onlineCount via resolveGroupRoomOnlineAuthority", () => {
    const service = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(service).toContain("resolveGroupRoomOnlineAuthority");
    expect(service).toContain("onlineCount");
    expect(service).toContain("groupOnlineMemberCount");
  });

  it("Header / Group Info / Member List consume shared onlineCount SSOT", () => {
    const presentation = readFileSync(
      join(ROOT, "lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts"),
      "utf8"
    );
    const sheets = readFileSync(
      join(ROOT, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"),
      "utf8"
    );
    const header = readFileSync(
      join(ROOT, "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx"),
      "utf8"
    );
    expect(presentation).toContain("cm_ui_group_members_online_line");
    expect(presentation).toContain("onlineCount");
    expect(sheets).toContain("cm_ui_group_members_online_line");
    expect(sheets).toContain("onlineCount");
    expect(sheets).toContain("GroupMemberPresenceLabel");
    // typing still wins for groups in Header
    expect(header).toContain("typingPeerCount");
    expect(header).toContain('roomType !== "direct"');
  });

  it("does not change Ban / Ghost LOCK surfaces", () => {
    const ban = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-ban-service.ts"),
      "utf8"
    );
    const ghost = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-ghost-service.ts"),
      "utf8"
    );
    expect(ban).toContain("community_messenger_ban_group_member");
    expect(ghost).toContain("community_messenger.ghost_enter");
  });

  it("presence-policy and presence POST route remain untouched by Online helper import graph", () => {
    const policy = readFileSync(
      join(ROOT, "lib/community-messenger/presence/presence-policy.ts"),
      "utf8"
    );
    const route = readFileSync(
      join(ROOT, "app/api/community-messenger/presence/route.ts"),
      "utf8"
    );
    const online = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-online-authority.ts"),
      "utf8"
    );
    expect(policy).toContain("derivePresenceFromDbRow");
    expect(route).toContain("upsertCommunityMessengerPresenceSnapshot");
    expect(online).not.toContain("presence/route");
    expect(online).not.toContain("use-community-messenger-presence-runtime");
  });
});
