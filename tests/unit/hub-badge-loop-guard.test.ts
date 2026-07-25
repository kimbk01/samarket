import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const requestNotificationBadgeCountResync = vi.fn();

vi.mock("@/lib/notifications/notification-badge-count-store", () => ({
  requestNotificationBadgeCountResync: (...args: unknown[]) =>
    requestNotificationBadgeCountResync(...args),
}));

import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";

describe("hub badge loop guards (P1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T00:00:00.000Z"));
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    requestNotificationBadgeCountResync.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("P1 Q3: participant_unread_changed is projection-only (no Hub CustomEvent)", () => {
    const dispatch = window.dispatchEvent as ReturnType<typeof vi.fn>;

    requestMessengerHubBadgeResync("participant_unread_changed", {
      roomId: "room-a",
      participantUnreadDirection: "increase",
    });
    requestMessengerHubBadgeResync("participant_unread_changed", {
      roomId: "room-a",
      participantUnreadDirection: "increase",
    });

    expect(dispatch).toHaveBeenCalledTimes(0);
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledTimes(2);
  });

  it("P1 Q3: mark_read reasons are projection-only", () => {
    const dispatch = window.dispatchEvent as ReturnType<typeof vi.fn>;
    requestMessengerHubBadgeResync("room_open_mark_read", { roomId: "r1" });
    requestMessengerHubBadgeResync("room_phase2_mark_read", { roomId: "r1" });
    expect(dispatch).toHaveBeenCalledTimes(0);
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledTimes(2);
  });

  it("non-projection reason still dispatches Hub refresh + badge-count", () => {
    const dispatch = window.dispatchEvent as ReturnType<typeof vi.fn>;
    requestMessengerHubBadgeResync("home_list_merge_summary");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(requestNotificationBadgeCountResync).toHaveBeenCalledWith("home_list_merge_summary");
  });

  it("keeps decrease resync dedupe separate from increase (direct Hub dispatch)", () => {
    const dispatch = window.dispatchEvent as ReturnType<typeof vi.fn>;

    dispatchOwnerHubBadgeRefresh({
      source: "community_messenger",
      key: "participant_unread_changed",
      roomId: "room-b",
      participantUnreadDirection: "decrease",
      dedupeMs: 4_000,
    });
    dispatchOwnerHubBadgeRefresh({
      source: "community_messenger",
      key: "participant_unread_changed",
      roomId: "room-b",
      participantUnreadDirection: "decrease",
      dedupeMs: 4_000,
    });

    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
