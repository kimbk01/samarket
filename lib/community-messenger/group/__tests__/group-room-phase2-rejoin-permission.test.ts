import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  canInviteToGroup,
  canKickGroupMember,
  resolveGroupRoomCapabilities,
} from "@/lib/community-messenger/group/group-room-permissions";
import { upsertGroupMemberParticipants } from "@/lib/community-messenger/group/group-room-repository";

const viewer = "11111111-1111-1111-1111-111111111111";
const peerA = "22222222-2222-2222-2222-222222222222";
const peerB = "33333333-3333-3333-3333-333333333333";
const roomId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("group Phase2 rejoin + permission parity", () => {
  describe("resolveGroupRoomCapabilities parity", () => {
    const baseRoom = {
      owner_user_id: viewer,
      allow_member_invite: false,
      allow_admin_invite: false,
      allow_admin_kick: false,
      allow_admin_edit_notice: false,
    };

    it("owner + all flags false → invite still allowed", () => {
      const caps = resolveGroupRoomCapabilities({
        viewerUserId: viewer,
        viewerRole: "owner",
        room: baseRoom,
      });
      expect(caps.canInviteMembers).toBe(true);
      expect(canInviteToGroup({ viewerUserId: viewer, viewerRole: "owner", room: baseRoom })).toBe(
        true
      );
      expect(caps.canUpdatePermissions).toBe(true);
      expect(caps.canPromoteMember).toBe(true);
    });

    it("admin invite respects allow_admin_invite", () => {
      expect(
        resolveGroupRoomCapabilities({
          viewerUserId: peerA,
          viewerRole: "admin",
          room: { ...baseRoom, allow_admin_invite: true },
        }).canInviteMembers
      ).toBe(true);
      expect(
        resolveGroupRoomCapabilities({
          viewerUserId: peerA,
          viewerRole: "admin",
          room: { ...baseRoom, allow_admin_invite: false },
        }).canInviteMembers
      ).toBe(false);
    });

    it("member invite respects allow_member_invite", () => {
      expect(
        resolveGroupRoomCapabilities({
          viewerUserId: peerA,
          viewerRole: "member",
          room: { ...baseRoom, allow_member_invite: true },
        }).canInviteMembers
      ).toBe(true);
      expect(
        resolveGroupRoomCapabilities({
          viewerUserId: peerA,
          viewerRole: "member",
          room: { ...baseRoom, allow_member_invite: false },
        }).canInviteMembers
      ).toBe(false);
    });

    it("admin kick: member only; never owner/admin", () => {
      const room = { ...baseRoom, allow_admin_kick: true, owner_user_id: viewer };
      expect(
        canKickGroupMember({
          viewerUserId: peerA,
          viewerRole: "admin",
          room,
          targetUserId: peerB,
          targetRole: "member",
        })
      ).toBe(true);
      expect(
        canKickGroupMember({
          viewerUserId: peerA,
          viewerRole: "admin",
          room,
          targetUserId: peerB,
          targetRole: "admin",
        })
      ).toBe(false);
      expect(
        canKickGroupMember({
          viewerUserId: peerA,
          viewerRole: "admin",
          room,
          targetUserId: viewer,
          targetRole: "owner",
        })
      ).toBe(false);
    });

    it("owner cannot kick self", () => {
      expect(
        canKickGroupMember({
          viewerUserId: viewer,
          viewerRole: "owner",
          room: baseRoom,
          targetUserId: viewer,
          targetRole: "owner",
        })
      ).toBe(false);
    });
  });

  describe("UI invite gate reintroduction ban", () => {
    it("presentation does not gate invite on allowMemberInvite alone", () => {
      const src = readFileSync(
        join(
          process.cwd(),
          "lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation.ts"
        ),
        "utf8"
      );
      expect(src).toContain("resolveGroupRoomCapabilities");
      expect(src).not.toMatch(
        /canInviteMembers\s*=\s*Boolean\(\s*isPrivateGroupRoom\s*&&\s*snapshot\?\.room\.allowMemberInvite\s*\)/
      );
    });
  });

  describe("upsertGroupMemberParticipants rejoin", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("reactivates left members as member and skips active; never touches blocked_hidden_at", async () => {
      const updateEq = vi.fn(() => ({
        in: vi.fn(() => ({
          not: vi.fn(async () => ({ error: null })),
        })),
      }));
      const update = vi.fn(() => ({ eq: updateEq }));
      const insert = vi.fn(async () => ({ error: null }));
      const selectIn = vi.fn(async () => ({
        data: [
          { user_id: peerA, left_at: "2026-01-01T00:00:00.000Z", role: "admin" },
          { user_id: peerB, left_at: null, role: "admin" },
        ],
        error: null,
      }));
      const select = vi.fn(() => ({
        eq: vi.fn(() => ({
          in: selectIn,
        })),
      }));
      const from = vi.fn(() => ({ select, update, insert }));
      const sb = { from } as never;

      const newId = "44444444-4444-4444-4444-444444444444";
      const result = await upsertGroupMemberParticipants(sb, roomId, [peerA, peerB, newId]);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.alreadyActiveMemberIds).toEqual([peerB]);
      expect(result.newlyInvitedMemberIds.sort()).toEqual([peerA, newId].sort());
      expect(update).toHaveBeenCalledWith({ left_at: null, role: "member" });
      const firstUpdateArg = (update as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0];
      expect(firstUpdateArg).toEqual({ left_at: null, role: "member" });
      expect(JSON.stringify(firstUpdateArg ?? {})).not.toContain("blocked_hidden_at");
      expect(insert).toHaveBeenCalledWith([
        { room_id: roomId, user_id: newId, role: "member", left_at: null },
      ]);
    });

    it("active-only invite is no-op with empty newlyInvitedMemberIds", async () => {
      const selectIn = vi.fn(async () => ({
        data: [{ user_id: peerA, left_at: null, role: "member" }],
        error: null,
      }));
      const from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ in: selectIn })),
        })),
        update: vi.fn(),
        insert: vi.fn(),
      }));
      const result = await upsertGroupMemberParticipants({ from } as never, roomId, [peerA]);
      expect(result).toEqual({
        ok: true,
        newlyInvitedMemberIds: [],
        alreadyActiveMemberIds: [peerA],
      });
    });
  });
});
