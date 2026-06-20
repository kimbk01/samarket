import { describe, expect, it } from "vitest";
import { canMountCommunityMessengerRoomClient } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";

const emptyDirectRoomShell = {
  roomType: "direct" as const,
  roomStatus: "active" as const,
  visibility: "private" as const,
  joinPolicy: "invite_only" as const,
  identityPolicy: "alias_allowed" as const,
  isReadonly: false,
  title: "",
  subtitle: "",
  summary: "",
  avatarUrl: null,
  unreadCount: 0,
  lastMessageAt: new Date().toISOString(),
  memberCount: 0,
  ownerUserId: null,
  ownerLabel: "",
  memberLimit: null,
  isDiscoverable: false,
  requiresPassword: false,
  allowMemberInvite: false,
};

describe("CommunityMessengerRoomBootstrapGate mount contract", () => {
  it("bootstrap complete 전 RoomClient 미마운트 — incomplete seed", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r1",
          ...emptyDirectRoomShell,
          memberCount: 2,
          lastMessage: "hint only",
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(false);
  });

  it("진짜 빈 방은 mount 허용", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r-empty",
          ...emptyDirectRoomShell,
          lastMessage: "",
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(true);
  });

  it("목록 placeholder lastMessage + 빈 messages[] — 신규 1:1 mount 허용", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r-new-direct",
          ...emptyDirectRoomShell,
          lastMessage: "메시지를 보내 보세요.",
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(true);
  });
});
