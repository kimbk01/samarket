import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isCommunityMessengerGroupRoomTypeString,
} from "@/lib/community-messenger/group/group-active-membership-gate";

describe("group active membership gate contract", () => {
  it("recognizes only private_group and open_group", () => {
    expect(isCommunityMessengerGroupRoomTypeString("private_group")).toBe(true);
    expect(isCommunityMessengerGroupRoomTypeString("open_group")).toBe(true);
    expect(isCommunityMessengerGroupRoomTypeString("direct")).toBe(false);
    expect(isCommunityMessengerGroupRoomTypeString("group")).toBe(false);
    expect(isCommunityMessengerGroupRoomTypeString(null)).toBe(false);
  });

  it("canonical resolve requires active group membership", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/server/messenger-room-canonical-resolve-core.ts"),
      "utf8"
    );
    expect(src).toContain("assertActiveGroupMembershipIfGroup");
    expect(src).toContain('roomType === "private_group" || roomType === "open_group"');
  });

  it("shared send path gates group membership before insert", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
    const sendIdx = src.indexOf("export async function sendCommunityMessengerMessage");
    expect(sendIdx).toBeGreaterThan(0);
    const slice = src.slice(sendIdx, sendIdx + 2500);
    expect(slice).toContain("assertActiveGroupMembershipIfGroup");
  });

  it("bump recipients use active group membership for groups", () => {
    const bump = readFileSync(
      join(process.cwd(), "lib/community-messenger/server/publish-messenger-room-bump.ts"),
      "utf8"
    );
    expect(bump).toContain("listActiveGroupRecipientUserIds");
    const bridge = readFileSync(
      join(process.cwd(), "lib/notifications/notification-target-messenger-bridge.ts"),
      "utf8"
    );
    expect(bridge).toContain("listActiveGroupRecipientUserIds");
    expect(bridge).toContain('rt === "private_group" || rt === "open_group"');
  });

  it("migration filters group left_at without changing non-group", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20261207120000_cm_group_active_membership_authority.sql"),
      "utf8"
    );
    expect(sql).toContain("community_messenger_bootstrap_my_room_ids");
    expect(sql).toContain("cm_can_access_messenger_room");
    expect(sql).toContain("r.room_type IN ('private_group', 'open_group')");
    expect(sql).toContain("OR p.left_at IS NULL");
    expect(sql).toContain("r.room_type IS DISTINCT FROM 'private_group'");
  });
});
