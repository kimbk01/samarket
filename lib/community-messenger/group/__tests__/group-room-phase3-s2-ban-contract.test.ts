import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(process.cwd());

describe("group chat Phase3 S2-1 ban contracts", () => {
  it("migration defines group_bans + ban/unban RPCs + grants", () => {
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20261011140000_cm_group_bans.sql"),
      "utf8"
    );
    expect(sql).toContain("community_messenger_group_bans");
    expect(sql).toContain("community_messenger_group_bans_one_active_uidx");
    expect(sql).toContain("unbanned_at IS NULL");
    expect(sql).toContain("cm_group_is_user_banned");
    expect(sql).toContain("community_messenger_ban_group_member");
    expect(sql).toContain("community_messenger_unban_group_member");
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.community_messenger_ban_group_member(uuid, uuid, uuid, text) TO service_role"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.community_messenger_unban_group_member(uuid, uuid, uuid) TO service_role"
    );
    expect(sql).toContain("user_banned");
    // Ban sets left_at; unban does not auto-rejoin
    expect(sql).toContain("SET left_at = v_now");
    expect(sql).toContain("Unban (does not auto-rejoin)");
  });

  it("TS ban service + invite/join/open gates reference USER_BANNED", () => {
    const banSvc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-ban-service.ts"),
      "utf8"
    );
    expect(banSvc).toContain("community_messenger_ban_group_member");
    expect(banSvc).toContain("community_messenger_unban_group_member");
    expect(banSvc).toContain("listActiveGroupBans");

    const roomSvc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-service.ts"),
      "utf8"
    );
    expect(roomSvc).toContain("isUserBannedFromGroup");
    expect(roomSvc).toContain("USER_BANNED");
    expect(roomSvc).toContain("options?: { roomId?: string | null }");

    const inviteSvc = readFileSync(
      join(ROOT, "lib/community-messenger/group/group-room-invite-link-service.ts"),
      "utf8"
    );
    expect(inviteSvc).toContain('viewerStatus = "banned"');
    expect(inviteSvc).toContain("assertNotBannedFromGroup");

    const bootstrap = readFileSync(
      join(ROOT, "app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts"),
      "utf8"
    );
    expect(bootstrap).toContain("isUserBannedFromGroup");
    expect(bootstrap).toContain("user_banned");

    const roomGet = readFileSync(
      join(ROOT, "app/api/community-messenger/rooms/[roomId]/route.ts"),
      "utf8"
    );
    expect(roomGet).toContain("isUserBannedFromGroup");
    expect(roomGet).toContain("user_banned");
  });

  it("UI separates Kick vs Ban and lists Blocked Members", () => {
    const modal = readFileSync(
      join(
        ROOT,
        "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MemberActionModal.tsx"
      ),
      "utf8"
    );
    expect(modal).toContain("removeGroupMember");
    expect(modal).toContain("banGroupMember");
    expect(modal).toContain("cm_ui_ban_from_group");

    const blocked = readFileSync(
      join(ROOT, "components/community-messenger/group/GroupBlockedMembersSection.tsx"),
      "utf8"
    );
    expect(blocked).toContain("/bans");
    expect(blocked).toContain("cm_ui_blocked_members");
    expect(blocked).toContain("cm_ui_unban_member");

    const preview = readFileSync(join(ROOT, "app/(main)/group/[token]/page.tsx"), "utf8");
    expect(preview).toContain('viewerStatus === "banned"');
  });

  it("kick/rejoin Phase2 contracts remain intact", () => {
    const phase2 = readFileSync(
      join(ROOT, "lib/community-messenger/group/__tests__/group-room-phase2-rejoin-permission.test.ts"),
      "utf8"
    );
    expect(phase2).toContain("reactivates left members");
    expect(phase2).not.toContain("community_messenger_group_bans");

    const leave = readFileSync(
      join(ROOT, "lib/community-messenger/group/__tests__/group-room-leave-owner-transfer.test.ts"),
      "utf8"
    );
    expect(leave).toContain("community_messenger_leave_private_group");
  });
});
