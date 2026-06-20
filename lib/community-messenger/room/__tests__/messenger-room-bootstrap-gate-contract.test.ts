import { describe, expect, it } from "vitest";
import { canMountCommunityMessengerRoomClient } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";

describe("CommunityMessengerRoomBootstrapGate mount contract", () => {
  it("bootstrap complete 전 RoomClient 미마운트 — incomplete seed", () => {
    expect(
      canMountCommunityMessengerRoomClient({
        viewerUserId: "u1",
        myRole: "member",
        room: {
          id: "r1",
          roomType: "direct",
          roomStatus: "active",
          visibility: "private",
          joinPolicy: "invite_only",
          identityPolicy: "alias_allowed",
          isReadonly: false,
          title: "",
          subtitle: "",
          summary: "",
          avatarUrl: null,
          unreadCount: 0,
          lastMessage: "hint only",
          lastMessageAt: new Date().toISOString(),
          memberCount: 2,
          ownerUserId: null,
          ownerLabel: "",
          memberLimit: null,
          isDiscoverable: false,
          requiresPassword: false,
          allowMemberInvite: false,
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
          roomType: "direct",
          roomStatus: "active",
          visibility: "private",
          joinPolicy: "invite_only",
          identityPolicy: "alias_allowed",
          isReadonly: false,
          title: "",
          subtitle: "",
          summary: "",
          avatarUrl: null,
          unreadCount: 0,
          lastMessage: "",
          lastMessageAt: new Date().toISOString(),
          memberCount: 0,
          ownerUserId: null,
          ownerLabel: "",
          memberLimit: null,
          isDiscoverable: false,
          requiresPassword: false,
          allowMemberInvite: false,
        },
        members: [],
        messages: [],
        readReceipt: null,
        activeCall: null,
      })
    ).toBe(true);
  });
});
