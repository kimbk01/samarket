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
  playCoalescedChatNotificationSound: vi.fn(() => ({
    status: "scheduled",
    dedupeKey: "test",
  })),
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

const pushOrMergeMock = vi.fn();
vi.mock("@/lib/community-messenger/notifications/messenger-in-app-banner-store", () => ({
  useMessengerInAppMessageBannerStore: { getState: () => ({ pushOrMerge: pushOrMergeMock }) },
}));

/** §14-11: 스냅샷 프리패치 실패 → 홈 목록 행으로 문구 */
vi.mock("@/lib/community-messenger/room-snapshot-cache", () => ({
  prefetchCommunityMessengerRoomSnapshot: vi.fn(async () => false),
  peekRoomSnapshot: vi.fn(() => null),
}));

const listRow = { current: null as Record<string, unknown> | null };
vi.mock("@/lib/community-messenger/home-list-patch", () => ({
  findHomeListRoomRow: () => listRow.current,
}));

vi.mock("@/lib/settings/user-settings-store", () => ({
  getUserSettings: () => ({ chat_preview_enabled: true }),
}));

describe("applyCmParticipantUnreadFullEffects", () => {
  it("lazy-imports room forward navigation when desktop handler navigates", async () => {
    forwardNavMock.mockClear();
    listRow.current = { id: "room-nav", title: "q테스트1", lastMessage: "안녕하세요", avatarUrl: null, unreadCount: 2 };
    const { applyCmParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-unread-full-effects"
    );

    applyCmParticipantUnreadFullEffects({
      nextRoomId: "room-nav",
      nextUnread: 2,
      prevUnread: 0,
      latencyKey: "latency",
      viewerUserId: "me",
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

  it("§14-11: 내용을 알 수 없으면 배너·데스크톱 알림을 띄우지 않는다 (고정 문구 금지)", async () => {
    forwardNavMock.mockClear();
    pushOrMergeMock.mockClear();
    listRow.current = null;
    const desktop = await import("@/lib/community-messenger/notifications/messenger-web-desktop-notification");
    const desktopMock = vi.mocked(desktop.tryShowMessengerWebDesktopNotification);
    desktopMock.mockClear();
    const { applyCmParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-unread-full-effects"
    );
    applyCmParticipantUnreadFullEffects({
      nextRoomId: "room-none",
      nextUnread: 1,
      prevUnread: 0,
      latencyKey: "latency",
      viewerUserId: "me",
      pathnameRef: { current: "/community-messenger" },
      visibilityRef: { current: "visible" },
      surfaceRef: { current: null },
      tRef: { current: (key: string) => key },
      routerRef: { current: { push: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(desktopMock).not.toHaveBeenCalled();
    expect(pushOrMergeMock).not.toHaveBeenCalled();
  });
});
