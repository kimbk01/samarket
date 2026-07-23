import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyOptimisticUnreadZeroSurfaces,
  clearCmParticipantSurfaceSoundHandledForTests,
  noteCmParticipantSurfaceSoundHandled,
  shouldSkipNotificationInsertSoundForCmParticipant,
} from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import { clearBootstrapCacheBusWriterStateForTests, noteBootstrapCacheBusWriterViewerUserId } from "@/lib/community-messenger/home/bootstrap-cache-bus-writer";
import { __resetMessengerRoomUnreadAuthorityForTest } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import {
  __testApplyOwnerHubBadgePayloadForTest,
  getOwnerHubBadgeSnapshot,
} from "@/lib/chats/owner-hub-badge-store";
import { OWNER_HUB_BADGE_EMPTY } from "@/lib/chats/owner-hub-badge-types";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

vi.mock("@/lib/community-messenger/notifications/messenger-in-app-banner-store", () => {
  let banner: { roomId: string } | null = null;
  return {
    useMessengerInAppMessageBannerStore: {
      getState: () => ({
        banner,
        dismiss: () => {
          banner = null;
        },
        pushOrMerge: (b: { roomId: string }) => {
          banner = { roomId: b.roomId };
        },
        __set: (b: { roomId: string } | null) => {
          banner = b;
        },
      }),
    },
  };
});

function room(
  partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">
): CommunityMessengerRoomSummary {
  const { id, ...rest } = partial;
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "Peer",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    chatDomain: "general_direct",
    ...rest,
  };
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: { id: "user-a" },
    tabs: { chats: chats.length, groups: 0, calls: 0, requests: 0 },
    chats,
    groups: [],
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    discoverableGroups: [],
    requests: [],
    calls: [],
  } as unknown as CommunityMessengerBootstrap;
}

describe("cm-participant-surface-sync", () => {
  beforeEach(() => {
    clearBootstrapCache();
    clearBootstrapCacheBusWriterStateForTests();
    __resetMessengerRoomUnreadAuthorityForTest();
    clearCmParticipantSurfaceSoundHandledForTests();
    noteBootstrapCacheBusWriterViewerUserId("user-a");
    __testApplyOwnerHubBadgePayloadForTest(
      { ok: true, ...OWNER_HUB_BADGE_EMPTY, communityMessengerUnread: 1, total: 1 },
      "client_cache"
    );
  });

  it("note sound handled skips notification insert for same room", () => {
    expect(shouldSkipNotificationInsertSoundForCmParticipant("room-a")).toBe(false);
    noteCmParticipantSurfaceSoundHandled("room-a");
    expect(shouldSkipNotificationInsertSoundForCmParticipant("room-a")).toBe(true);
    expect(shouldSkipNotificationInsertSoundForCmParticipant("room-b")).toBe(false);
  });

  it("optimistic unread zero clears bottom and list cache in same stack", () => {
    primeBootstrapCache(
      bootstrap([room({ id: "room-a", unreadCount: 2, lastMessageAt: "2026-06-01T00:00:00.000Z" })])
    );
    const t0 = performance.now();
    applyOptimisticUnreadZeroSurfaces({
      roomId: "room-a",
      viewerUserId: "user-a",
      prevUnreadHint: 2,
    });
    const elapsed = performance.now() - t0;
    expect(peekBootstrapCache()?.chats?.[0]?.unreadCount).toBe(0);
    expect(getOwnerHubBadgeSnapshot().communityMessengerUnread).toBe(0);
    expect(elapsed).toBeLessThan(50);
  });
});
