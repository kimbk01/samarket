import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildGroupRoomWebPath } from "@/lib/community-messenger/group/group-room-deeplink";
import { GROUP_ROOM_ERROR } from "@/lib/community-messenger/group/group-room-errors";
import {
  GROUP_ADMIN_CAN_EDIT_ROOM_META,
  canEditGroupRoomMeta,
  canInviteToGroup,
  canKickGroupMember,
} from "@/lib/community-messenger/group/group-room-permissions";
import {
  GROUP_MESSAGE_FCM_PUSH_KIND,
  groupMessageFcmPayloadKindForRoom,
  groupRoomAppearsInOpenChatJoinedList,
  matchesGroupChatListKindFilter,
  resolveGroupMessageRoomKind,
} from "@/lib/community-messenger/group/group-room-notification-policy";
import { kickGroupMember, validateGroupInviteTargets } from "@/lib/community-messenger/group/group-room-service";
import { isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/friendship-resolver", () => ({
  isAcceptedFriendPair: vi.fn(),
}));

vi.mock("@/lib/community-messenger/social-relations", () => ({
  isBlockedEitherWayActive: vi.fn(),
}));

vi.mock("@/lib/community-messenger/group/group-room-realtime", () => ({
  publishGroupRoomListBump: vi.fn(async () => {}),
}));

vi.mock("@/lib/community-messenger/group/group-room-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/community-messenger/group/group-room-repository")>();
  return {
    ...actual,
    resolveGroupRoomSupabase: vi.fn(() => ({ from: vi.fn() })),
    profileIdsExist: vi.fn(async () => true),
    fetchPrivateGroupRoom: vi.fn(),
    fetchActiveParticipant: vi.fn(),
    markParticipantLeft: vi.fn(async () => ({ ok: true })),
    fetchProfileLabels: vi.fn(async () => new Map()),
    insertGroupSystemMessage: vi.fn(async () => ({ ok: true, createdAt: new Date().toISOString() })),
  };
});

import { isAcceptedFriendPair } from "@/lib/community-messenger/friendship-resolver";
import { isBlockedEitherWayActive } from "@/lib/community-messenger/social-relations";
import { profileIdsExist, fetchPrivateGroupRoom, fetchActiveParticipant, markParticipantLeft } from "@/lib/community-messenger/group/group-room-repository";

const viewer = "11111111-1111-1111-1111-111111111111";
const peerA = "22222222-2222-2222-2222-222222222222";
const peerB = "33333333-3333-3333-3333-333333333333";

describe("group-room P0 contract", () => {
  beforeEach(() => {
    vi.mocked(isAcceptedFriendPair).mockReset();
    vi.mocked(isBlockedEitherWayActive).mockReset();
    vi.mocked(profileIdsExist).mockReset();
    vi.mocked(fetchPrivateGroupRoom).mockReset();
    vi.mocked(fetchActiveParticipant).mockReset();
    vi.mocked(markParticipantLeft).mockReset();
    vi.mocked(isAcceptedFriendPair).mockResolvedValue(true);
    vi.mocked(isBlockedEitherWayActive).mockResolvedValue(false);
    vi.mocked(profileIdsExist).mockResolvedValue(true);
    vi.mocked(markParticipantLeft).mockResolvedValue({ ok: true });
  });

  describe("resolveGroupMessageRoomKind", () => {
    it("maps private_group and open_group to group", () => {
      expect(resolveGroupMessageRoomKind("private_group", null)).toBe("group");
      expect(resolveGroupMessageRoomKind("open_group", "trade_pc:abc")).toBe("group");
    });

    it("maps trade direct keys on direct rooms to trade", () => {
      expect(resolveGroupMessageRoomKind("direct", "trade_pc:room-1")).toBe("trade");
      expect(resolveGroupMessageRoomKind("direct", "trade_item:room-2")).toBe("trade");
    });

    it("defaults plain direct rooms to direct", () => {
      expect(resolveGroupMessageRoomKind("direct", "aa:bb")).toBe("direct");
      expect(resolveGroupMessageRoomKind("direct", null)).toBe("direct");
    });
  });

  describe("permissions", () => {
    const baseRoom = {
      owner_user_id: viewer,
      allow_member_invite: true,
      allow_admin_invite: true,
      allow_admin_kick: true,
      allow_admin_edit_notice: true,
    };

    it("owner can invite, kick members, and edit meta", () => {
      expect(
        canInviteToGroup({ viewerUserId: viewer, viewerRole: "owner", room: baseRoom })
      ).toBe(true);
      expect(
        canKickGroupMember({
          viewerUserId: viewer,
          viewerRole: "owner",
          room: baseRoom,
          targetUserId: peerA,
          targetRole: "member",
        })
      ).toBe(true);
      expect(
        canEditGroupRoomMeta({ viewerUserId: viewer, viewerRole: "owner", room: baseRoom })
      ).toBe(true);
      expect(GROUP_ADMIN_CAN_EDIT_ROOM_META).toBe(true);
    });

    it("member invite respects allow_member_invite", () => {
      expect(
        canInviteToGroup({
          viewerUserId: peerA,
          viewerRole: "member",
          room: { ...baseRoom, allow_member_invite: false },
        })
      ).toBe(false);
    });

    it("admin kick respects allow_admin_kick and cannot kick owner", () => {
      expect(
        canKickGroupMember({
          viewerUserId: peerA,
          viewerRole: "admin",
          room: { ...baseRoom, allow_admin_kick: false },
          targetUserId: peerB,
          targetRole: "member",
        })
      ).toBe(false);
      expect(
        canKickGroupMember({
          viewerUserId: peerA,
          viewerRole: "admin",
          room: baseRoom,
          targetUserId: viewer,
          targetRole: "owner",
        })
      ).toBe(false);
    });
  });

  describe("validateGroupInviteTargets", () => {
    it("rejects blocked targets", async () => {
      vi.mocked(isBlockedEitherWayActive).mockResolvedValueOnce(true);
      const result = await validateGroupInviteTargets(viewer, [peerA], {} as any);
      expect(result).toEqual({ ok: false, error: GROUP_ROOM_ERROR.BLOCKED_TARGET });
    });

    it("requires mutual accepted friendship", async () => {
      vi.mocked(isAcceptedFriendPair).mockResolvedValueOnce(false);
      const result = await validateGroupInviteTargets(viewer, [peerA], {} as any);
      expect(result).toEqual({ ok: false, error: GROUP_ROOM_ERROR.FRIEND_REQUIRED });
    });

    it("dedupes viewer and returns validated peer ids", async () => {
      const result = await validateGroupInviteTargets(viewer, [viewer, peerA, peerA], {} as any);
      expect(result).toEqual({ ok: true, memberIds: [peerA] });
    });

    it("rejects missing profiles", async () => {
      vi.mocked(profileIdsExist).mockResolvedValueOnce(false);
      const result = await validateGroupInviteTargets(viewer, [peerA], {} as any);
      expect(result).toEqual({ ok: false, error: GROUP_ROOM_ERROR.INVALID_TARGET });
    });
  });

  describe("chat list filter logic", () => {
    it("private_group chip matches only private_group rooms", () => {
      expect(
        matchesGroupChatListKindFilter({ roomType: "private_group", contextMeta: null, messengerDirectKey: null }, "private_group")
      ).toBe(true);
      expect(
        matchesGroupChatListKindFilter({ roomType: "open_group", contextMeta: null, messengerDirectKey: null }, "private_group")
      ).toBe(false);
    });

    it("all filter excludes open_group and private_group from main chat inbox mirror", () => {
      expect(
        matchesGroupChatListKindFilter({ roomType: "open_group", contextMeta: null, messengerDirectKey: null }, "all")
      ).toBe(false);
      expect(
        matchesGroupChatListKindFilter({ roomType: "private_group", contextMeta: null, messengerDirectKey: null }, "all")
      ).toBe(false);
      expect(
        matchesGroupChatListKindFilter(
          { roomType: "direct", contextMeta: null, messengerDirectKey: "trade_pc:x" },
          "all"
        )
      ).toBe(false);
    });

    it("open chat joined list includes open_group only", () => {
      expect(groupRoomAppearsInOpenChatJoinedList({ roomType: "open_group" })).toBe(true);
      expect(groupRoomAppearsInOpenChatJoinedList({ roomType: "private_group" })).toBe(false);
      expect(groupRoomAppearsInOpenChatJoinedList({ roomType: "direct" })).toBe(false);
    });
  });

  describe("home groups bucket", () => {
    it("includes private_group only in kakao-style group list bucket", () => {
      expect(isCommunityMessengerPrivateGroupListRoomType("private_group")).toBe(true);
      expect(isCommunityMessengerPrivateGroupListRoomType("open_group")).toBe(false);
    });
  });

  describe("kickGroupMember", () => {
    const roomId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    it("owner can kick member via gated participant update", async () => {
      vi.mocked(fetchPrivateGroupRoom).mockResolvedValueOnce({
        id: roomId,
        room_type: "private_group",
        owner_user_id: viewer,
        allow_admin_kick: true,
      } as any);
      vi.mocked(fetchActiveParticipant)
        .mockResolvedValueOnce({ role: "owner" } as any)
        .mockResolvedValueOnce({ role: "member" } as any);
      const result = await kickGroupMember({ userId: viewer, roomId, targetUserId: peerA });
      expect(result).toEqual({ ok: true });
      expect(markParticipantLeft).toHaveBeenCalled();
    });

    it("member cannot kick", async () => {
      vi.mocked(fetchPrivateGroupRoom).mockResolvedValueOnce({
        id: roomId,
        room_type: "private_group",
        owner_user_id: viewer,
      } as any);
      vi.mocked(fetchActiveParticipant)
        .mockResolvedValueOnce({ role: "member" } as any)
        .mockResolvedValueOnce({ role: "member" } as any);
      const result = await kickGroupMember({ userId: peerA, roomId, targetUserId: peerB });
      expect(result).toEqual({ ok: false, error: GROUP_ROOM_ERROR.FORBIDDEN });
    });
  });

  describe("FCM group_message", () => {
    it("emits group_message only for group kind rooms", () => {
      expect(groupMessageFcmPayloadKindForRoom("private_group", null)).toBe(GROUP_MESSAGE_FCM_PUSH_KIND);
      expect(groupMessageFcmPayloadKindForRoom("direct", "trade_pc:x")).toBe(null);
      expect(GROUP_MESSAGE_FCM_PUSH_KIND).toBe("group_message");
    });
  });

  describe("deeplink", () => {
    it("builds web path with type=group query", () => {
      const roomId = "abc-def-123";
      expect(buildGroupRoomWebPath(roomId)).toBe(
        `/community-messenger/rooms/${encodeURIComponent(roomId)}?type=group`
      );
    });
  });
});
