/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  clearCmParticipantSurfaceSoundHandledForTests,
  shouldSkipNotificationInsertSoundForCmParticipant,
} from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import { syncNotificationSoundGateSnapshot } from "@/lib/notifications/notification-sound-gate";

const { playCoalescedMock } = vi.hoisted(() => ({
  playCoalescedMock: vi.fn(() => ({ status: "scheduled" as const, dedupeKey: "k" })),
}));

vi.mock("@/lib/notifications/coalesced-chat-alert-sound", () => ({
  playCoalescedChatNotificationSound: playCoalescedMock,
  clearCoalescedChatAlertSoundForTests: vi.fn(),
}));

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: vi.fn(),
  MESSENGER_CHAT_ALERT_MIN_GAP_MS: 800,
}));

vi.mock("@/lib/community-messenger/notifications/messenger-web-desktop-notification", () => ({
  tryShowMessengerWebDesktopNotification: vi.fn(),
}));

vi.mock("@/lib/community-messenger/stores/useCallStore", () => ({
  useCallStore: { getState: () => ({ callStatus: "idle" }) },
}));

vi.mock("@/lib/community-messenger/notifications/messenger-room-reader-state-store", () => ({
  useMessengerRoomReaderStateStore: {
    getState: () => ({ getScrollPositionForPolicy: () => null }),
  },
}));

vi.mock("@/lib/community-messenger/notifications/messenger-in-app-banner-store", () => ({
  useMessengerInAppMessageBannerStore: { getState: () => ({ pushOrMerge: vi.fn() }) },
}));

describe("applyCmParticipantUnreadFullEffects — sound with null surface (root bridge)", () => {
  beforeEach(() => {
    playCoalescedMock.mockClear();
    playCoalescedMock.mockReturnValue({ status: "scheduled", dedupeKey: "k" });
    clearCmParticipantSurfaceSoundHandledForTests();
    syncNotificationSoundGateSnapshot(null);
  });

  it("plays sound when surfaceRef is null but gate snapshot has settings (root layout bridge)", async () => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: null,
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });

    const { applyCmParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-unread-full-effects"
    );

    applyCmParticipantUnreadFullEffects({
      nextRoomId: "room-other",
      nextUnread: 1,
      prevUnread: 0,
      latencyKey: "lat",
      pathnameRef: { current: "/community-messenger" },
      visibilityRef: { current: "visible" },
      surfaceRef: { current: null },
      tRef: { current: (key: string) => key },
      routerRef: { current: { push: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance },
    });

    expect(playCoalescedMock).toHaveBeenCalled();
    expect(shouldSkipNotificationInsertSoundForCmParticipant("room-other")).toBe(true);
  });

  it("does not treat missing settings as sound OFF when surface and gate are both empty", async () => {
    const { applyCmParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-unread-full-effects"
    );

    applyCmParticipantUnreadFullEffects({
      nextRoomId: "room-list",
      nextUnread: 2,
      prevUnread: 1,
      latencyKey: "lat2",
      pathnameRef: { current: "/market" },
      visibilityRef: { current: "visible" },
      surfaceRef: { current: null },
      tRef: { current: (key: string) => key },
      routerRef: { current: { push: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance },
    });

    expect(playCoalescedMock).toHaveBeenCalled();
  });

  it("mutes only the active room from gate when surface is null", async () => {
    syncNotificationSoundGateSnapshot({
      userNotificationSettings: {
        trade_chat_enabled: true,
        community_chat_enabled: true,
        order_enabled: true,
        store_enabled: true,
        sound_enabled: true,
        vibration_enabled: true,
      },
      activeTradeChatRoomId: null,
      activeCommunityChatRoomId: "room-open",
      activeGroupChatRoomId: null,
      isWindowFocused: true,
    });

    const { applyCmParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-unread-full-effects"
    );

    applyCmParticipantUnreadFullEffects({
      nextRoomId: "room-open",
      nextUnread: 3,
      prevUnread: 2,
      latencyKey: "lat3",
      pathnameRef: { current: "/community-messenger/rooms/room-open" },
      visibilityRef: { current: "visible" },
      surfaceRef: { current: null },
      tRef: { current: (key: string) => key },
      routerRef: { current: { push: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance },
    });

    expect(playCoalescedMock).not.toHaveBeenCalled();
  });
});
