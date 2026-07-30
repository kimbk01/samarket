import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  communityMessengerRoomIsGloballyUsable,
  communityMessengerRoomIsInboxHidden,
  communityMessengerRoomIsVisibleInMainChatInbox,
} from "@/lib/community-messenger/types";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import { GROUP_DELETE_AUDIT_ACTION } from "@/lib/community-messenger/group/group-room-delete-service";

const ROOT = join(process.cwd());

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("group chat Phase3 S2-4 Delete contracts", () => {
  const mig = "supabase/migrations/20261011150000_cm_group_delete_tombstone.sql";

  it("migration adds soft tombstone columns + owner delete RPC (no hard DELETE)", () => {
    const sql = read(mig);
    expect(sql).toContain("deleted_at timestamptz NULL");
    expect(sql).toContain("deleted_by uuid NULL");
    expect(sql).toContain("community_messenger_delete_private_group");
    expect(sql).toContain("cm_group_room_is_deleted");
    expect(sql).toContain("already_deleted");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.community_messenger_delete_private_group(uuid, uuid) TO service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.community_messenger_delete_private_group(uuid, uuid) FROM anon, authenticated");
    expect(sql).toContain("DO NOT: DELETE rooms");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.community_messenger_rooms/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.community_messenger_group_bans/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.community_messenger_messages/i);
    // Invite/request closed, history preserved
    expect(sql).toContain("revoked_at = coalesce(revoked_at, v_now)");
    expect(sql).toContain("status = 'rejected'");
    // Defense triggers
    expect(sql).toContain("cm_block_write_on_deleted_group");
    expect(sql).toContain("cm_block_rejoin_on_deleted_group");
    expect(sql).toContain("get_community_messenger_unread_room_count");
    expect(sql).toContain("AND r.deleted_at IS NULL");
  });

  it("delete service uses soft RPC + group_deleted audit; never hard-delete helper", () => {
    const svc = read("lib/community-messenger/group/group-room-delete-service.ts");
    expect(svc).toContain("community_messenger_delete_private_group");
    expect(svc).toContain(GROUP_DELETE_AUDIT_ACTION);
    expect(svc).toContain("publishGroupRoomListBump");
    expect(svc).toContain("invalidateRoomBootstrapSnapshotCache");
    expect(svc).not.toContain("deletePrivateGroupRoom(");
    expect(svc).not.toContain('.from("community_messenger_rooms").delete(');
  });

  it("API route DELETE maps Owner soft-delete errors safely", () => {
    const route = read("app/api/community-messenger/group-rooms/[roomId]/route.ts");
    expect(route).toContain("deletePrivateGroupRoomSoft");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("GROUP_ROOM_ERROR.ROOM_DELETED");
    expect(route).not.toContain('.from("community_messenger_rooms").delete(');
  });

  it("tombstone gates list/open/bootstrap/send/invite and usability helpers", () => {
    expect(GROUP_ROOM_ERROR.ROOM_DELETED).toBe("room_deleted");

    expect(
      communityMessengerRoomIsGloballyUsable({
        roomStatus: "active",
        isReadonly: false,
        deletedAt: "2026-07-31T00:00:00.000Z",
      })
    ).toBe(false);
    expect(
      communityMessengerRoomIsInboxHidden({
        roomStatus: "active",
        isArchivedByViewer: false,
        deletedAt: "2026-07-31T00:00:00.000Z",
      })
    ).toBe(true);
    expect(
      communityMessengerRoomIsVisibleInMainChatInbox({
        roomStatus: "active",
        isArchivedByViewer: false,
        isBlockedHiddenByViewer: false,
        deletedAt: "2026-07-31T00:00:00.000Z",
      })
    ).toBe(false);

    const repo = read("lib/community-messenger/group/group-room-repository.ts");
    expect(repo).toContain('.is("deleted_at", null)');

    const roomSvc = read("lib/community-messenger/group/group-room-service.ts");
    expect(roomSvc).toContain("ROOM_DELETED");
    expect(roomSvc).toContain("roomDeletedError");

    const bootstrap = read("app/api/community-messenger/rooms/[roomId]/bootstrap/route.ts");
    expect(bootstrap).toContain("isPrivateGroupRoomDeleted");
    expect(bootstrap).toContain("group_deleted");

    const roomGet = read("app/api/community-messenger/rooms/[roomId]/route.ts");
    expect(roomGet).toContain("isPrivateGroupRoomDeleted");
    expect(roomGet).toContain("group_deleted");

    const invite = read("lib/community-messenger/group/group-room-invite-link-service.ts");
    expect(invite).toContain("ROOM_DELETED");
    expect(invite).toContain("roomPre.deleted_at");

    const svc = read("lib/community-messenger/service.ts");
    expect(svc).toContain('error: "room_deleted"');
    expect(svc).toContain("trimText(room.deleted_at)");
  });

  it("Delete ≠ leave / kick / ban / viewer archive / room archive", () => {
    const migSql = read(mig);
    expect(migSql).not.toContain("community_messenger_leave_private_group");
    expect(migSql).not.toContain("SET left_at = v_now");
    expect(migSql).not.toContain("room_status = 'archived'");
    expect(migSql).toContain("archive ≠ delete");

    const leave = read("lib/community-messenger/group/group-room-service.ts");
    expect(leave).toContain("community_messenger_leave_private_group");
    expect(leave).not.toContain("community_messenger_delete_private_group");

    const ban = read("lib/community-messenger/group/group-room-ban-service.ts");
    expect(ban).not.toContain("community_messenger_delete_private_group");
    expect(ban).not.toContain("deleted_at");
  });

  it("Owner-only Delete UI; Admin/Member not shown", () => {
    const sheets = read(
      "components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx"
    );
    expect(sheets).toContain("deletePrivateGroupRoom");
    expect(sheets).toContain("cm_ui_delete_group");
    expect(sheets).toContain("vm.isOwner && vm.isPrivateGroupRoom");

    const ctrl = read(
      "lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts"
    );
    expect(ctrl).toContain("deletePrivateGroupRoom");
    expect(ctrl).toContain('method: "DELETE"');
    expect(ctrl).toContain("if (!isPrivateGroupRoom || !isOwner) return");

    const i18n = read("lib/i18n/catalog/community-messenger-ui.ts");
    expect(i18n).toContain("cm_ui_delete_group:");
    expect(i18n).toContain("cm_ui_delete_group_confirm_body:");
    expect(i18n).toContain("cm_ui_group_deleted_unavailable:");
  });

  it("LOCK files Ban/Ghost/Online remain untouched by Delete service import boundary", () => {
    const ban = read("lib/community-messenger/group/group-room-ban-service.ts");
    const ghost = read("lib/community-messenger/group/group-room-ghost-service.ts");
    const online = read("lib/community-messenger/group/group-room-online-authority.ts");
    expect(ban).not.toContain("group-room-delete-service");
    expect(ghost).not.toContain("group-room-delete-service");
    expect(online).not.toContain("group-room-delete-service");
    expect(online).not.toContain("deleted_at");

    const ghostRoute = read("app/api/admin/community-messenger/rooms/[id]/ghost/route.ts");
    expect(ghostRoute).toContain("isPrivateGroupRoomDeleted");

    const banRoute = read("app/api/community-messenger/group-rooms/[roomId]/bans/route.ts");
    expect(banRoute).toContain("isPrivateGroupRoomDeleted");
  });

  it("Phase2 leave / S1 invite / Ban / Ghost / Online contract files still present", () => {
    expect(read("lib/community-messenger/group/__tests__/group-room-leave-owner-transfer.test.ts")).toContain(
      "community_messenger_leave_private_group"
    );
    expect(read("lib/community-messenger/group/__tests__/group-room-phase3-s2-ban-contract.test.ts")).toContain(
      "community_messenger_group_bans"
    );
    expect(read("lib/community-messenger/group/__tests__/group-room-phase3-s2-ghost-contract.test.ts")).toContain(
      "ghost_enter"
    );
    expect(read("lib/community-messenger/group/__tests__/group-room-phase3-s2-online-contract.test.ts")).toContain(
      "computeGroupRoomOnlineAuthority"
    );
  });
});
