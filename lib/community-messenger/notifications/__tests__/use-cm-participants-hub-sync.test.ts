import { describe, expect, it, vi } from "vitest";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import {
  getParticipantRoomId,
  getParticipantUnreadCount,
} from "@/lib/community-messenger/notifications/cm-participant-notification-types";

const prefetchMock = vi.fn().mockResolvedValue(undefined);
const fullEffectsMock = vi.fn();

vi.mock("@/lib/community-messenger/room-snapshot-cache", () => ({
  prefetchCommunityMessengerRoomSnapshot: (...args: unknown[]) => prefetchMock(...args),
}));

vi.mock("@/lib/community-messenger/notifications/cm-participant-unread-full-effects", () => ({
  applyCmParticipantUnreadFullEffects: (...args: unknown[]) => fullEffectsMock(...args),
}));

describe("cm-participant-notification-types", () => {
  it("parses room id and unread count", () => {
    expect(getParticipantRoomId({ room_id: "r1", unread_count: 3 })).toBe("r1");
    expect(getParticipantUnreadCount({ room_id: "r1", unread_count: "4" })).toBe(4);
  });
});

describe("cm-participant-hub-sync-lazy", () => {
  it("prefetchRoomSnapshotLazy dynamic-imports room-snapshot-cache", async () => {
    prefetchMock.mockClear();
    const { prefetchRoomSnapshotLazy } = await import(
      "@/lib/community-messenger/notifications/cm-participant-hub-sync-lazy"
    );
    prefetchRoomSnapshotLazy("room-1");
    await vi.waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith("room-1", { force: true });
    });
  });

  it("scheduleParticipantUnreadFullEffects dynamic-imports full effects module", async () => {
    fullEffectsMock.mockClear();
    const { scheduleParticipantUnreadFullEffects } = await import(
      "@/lib/community-messenger/notifications/cm-participant-hub-sync-lazy"
    );
    const args = {
      nextRoomId: "room-2",
      nextUnread: 1,
      prevUnread: 0,
      latencyKey: "k",
      pathnameRef: { current: "/stores" },
      visibilityRef: { current: "visible" as DocumentVisibilityState },
      surfaceRef: { current: null },
      tRef: { current: (key: string) => key },
      routerRef: { current: { push: vi.fn(), replace: vi.fn() } as unknown as AppRouterInstance },
    };
    scheduleParticipantUnreadFullEffects(args);
    await vi.waitFor(() => {
      expect(fullEffectsMock).toHaveBeenCalledWith(args);
    });
  });
});
