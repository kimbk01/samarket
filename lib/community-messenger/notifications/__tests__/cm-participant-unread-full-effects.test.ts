import { describe, expect, it, vi } from "vitest";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

const forwardNavMock = vi.fn();

vi.mock("@/lib/community-messenger/community-messenger-room-forward-navigation", () => ({
  runCommunityMessengerRoomForwardNavigation: (...args: unknown[]) => forwardNavMock(...args),
}));

vi.mock("@/lib/community-messenger/notifications/messenger-notification-contract", () => ({
  requestMessengerHubBadgeResync: vi.fn(),
}));

vi.mock("@/lib/notifications/coalesced-chat-alert-sound", () => ({
  playCoalescedChatNotificationSound: vi.fn(),
}));

vi.mock("@/lib/community-messenger/notifications/messenger-web-desktop-notification", () => ({
  tryShowMessengerWebDesktopNotification: vi.fn(({ onNavigateToRoom }: { onNavigateToRoom: (id: string) => void }) => {
    onNavigateToRoom("room-nav");
  }),
}));

vi.mock("@/lib/community-messenger/stores/useCallStore", () => ({
  useCallStore: { getState: () => ({ callStatus: "idle" }) },
}));

vi.mock("@/lib/community-messenger/notifications/messenger-room-reader-state-store", () => ({
  useMessengerRoomReaderStateStore: { getState: () => ({ getScrollPositionForPolicy: () => null }) },
}));

vi.mock("@/lib/community-messenger/notifications/messenger-in-app-banner-store", () => ({
  useMessengerInAppMessageBannerStore: { getState: () => ({ pushOrMerge: vi.fn() }) },
}));

describe("applyCmParticipantUnreadFullEffects", () => {
  it("lazy-imports room forward navigation when desktop handler navigates", async () => {
    forwardNavMock.mockClear();
    const { applyCmParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-unread-full-effects"
    );

    applyCmParticipantUnreadFullEffects({
      nextRoomId: "room-nav",
      nextUnread: 2,
      prevUnread: 0,
      latencyKey: "latency",
      pathnameRef: { current: "/community-messenger" },
      visibilityRef: { current: "visible" },
      surfaceRef: { current: null },
      tRef: { current: (key: string) => key },
      routerRef: { current: { push: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance },
    });

    await vi.waitFor(() => {
      expect(forwardNavMock).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: "room-nav" })
      );
    });
  });
});
