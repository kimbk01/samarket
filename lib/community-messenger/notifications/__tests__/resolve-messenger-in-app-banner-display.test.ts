import { describe, expect, it, beforeEach, vi } from "vitest";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import {
  clearMessengerInAppBannerMessageCacheForTests,
  recordMessengerInAppBannerMessageHint,
} from "@/lib/community-messenger/notifications/messenger-in-app-banner-message-cache";
import { resolveMessengerInAppBannerDisplay } from "@/lib/community-messenger/notifications/resolve-messenger-in-app-banner-display";

const ROOM_ID = "b19e2672-f26f-4a2e-8125-52575da4a62a";

function seedDirectRoomBootstrap() {
  const bootstrap = {
    me: null,
    tabs: { friends: 0, chats: 1, groups: 0, calls: 0 },
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [],
    chats: [
      {
        id: ROOM_ID,
        roomType: "direct" as const,
        roomStatus: "active" as const,
        visibility: "private" as const,
        joinPolicy: "invite_only" as const,
        identityPolicy: "real_name" as const,
        isReadonly: false,
        title: "메인관리자",
        subtitle: "",
        summary: "",
        avatarUrl: "/samarket-default-avatar.svg",
        unreadCount: 1,
        lastMessage: "이전 메시지",
        lastMessageType: "text" as const,
        lastMessageAt: "2026-06-19T10:00:00.000Z",
        memberCount: 2,
        ownerUserId: null,
        ownerLabel: "",
        memberLimit: null,
        isDiscoverable: false,
        requiresPassword: false,
        allowMemberInvite: false,
      },
    ],
    groups: [],
    discoverableGroups: [],
    calls: [],
  } satisfies CommunityMessengerBootstrap;
  primeBootstrapCache(bootstrap);
}

describe("resolveMessengerInAppBannerDisplay", () => {
  beforeEach(() => {
    clearMessengerInAppBannerMessageCacheForTests();
    primeBootstrapCache(null as unknown as CommunityMessengerBootstrap);
  });

  it("uses realtime message row for sender title and preview", () => {
    seedDirectRoomBootstrap();
    recordMessengerInAppBannerMessageHint(ROOM_ID, {
      id: "msg-1",
      room_id: ROOM_ID,
      sender_id: "11111111-1111-1111-1111-111111111111",
      message_type: "text",
      content: "P0 banner preview",
      created_at: "2026-06-19T10:01:00.000Z",
    });

    const display = resolveMessengerInAppBannerDisplay({ roomId: ROOM_ID, language: "ko" });

    expect(display.title).toBe("메인관리자");
    expect(display.preview).toBe("P0 banner preview");
    expect(display.senderName).toBe("메인관리자");
    expect(display.senderAvatarUrl).toBe("/samarket-default-avatar.svg");
    expect(display.routeUrl).toBe(`/community-messenger/rooms/${ROOM_ID}`);
  });

  it("falls back to room summary preview when message cache is empty", () => {
    seedDirectRoomBootstrap();
    const display = resolveMessengerInAppBannerDisplay({ roomId: ROOM_ID, language: "ko" });
    expect(display.preview).toBe("이전 메시지");
  });
});
