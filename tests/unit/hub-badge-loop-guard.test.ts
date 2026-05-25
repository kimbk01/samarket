import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchOwnerHubBadgeRefresh } from "@/lib/chats/chat-channel-events";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";

describe("hub badge loop guards", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T00:00:00.000Z"));
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dedupes participant unread increase resync per room within 2.5s", () => {
    const dispatch = window.dispatchEvent as ReturnType<typeof vi.fn>;

    requestMessengerHubBadgeResync("participant_unread_changed", {
      roomId: "room-a",
      participantUnreadDirection: "increase",
    });
    requestMessengerHubBadgeResync("participant_unread_changed", {
      roomId: "room-a",
      participantUnreadDirection: "increase",
    });

    expect(dispatch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2_600);

    requestMessengerHubBadgeResync("participant_unread_changed", {
      roomId: "room-a",
      participantUnreadDirection: "increase",
    });

    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("keeps decrease resync dedupe separate from increase", () => {
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
