import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationEvent = vi.fn();
const dispatchNotificationPushIfAllowed = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: (...args: unknown[]) => createNotificationEvent(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-push-dispatcher", () => ({
  dispatchNotificationPushIfAllowed: (...args: unknown[]) => dispatchNotificationPushIfAllowed(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: (...args: unknown[]) => invalidateNotificationBadgeCache(...args),
}));

import { notifyMissedCallPipeline } from "@/lib/notifications/pipeline/notify-missed-call-pipeline";

const sb = {} as never;

describe("notify-missed-call-pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-missed", user_id: "user-a" },
    });
    dispatchNotificationPushIfAllowed.mockResolvedValue(undefined);
  });

  it("creates missed_call events for both parties", async () => {
    await notifyMissedCallPipeline(sb, {
      sessionId: "sess-1",
      roomId: "room-1",
      initiatorUserId: "user-a",
      recipientUserId: "user-b",
      initiatorDisplayName: "Alice",
      recipientDisplayName: "Bob",
    });
    expect(createNotificationEvent).toHaveBeenCalledTimes(2);
    expect(createNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ type: "missed_call", userId: "user-a" })
    );
    expect(createNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ type: "missed_call", userId: "user-b" })
    );
    expect(dispatchNotificationPushIfAllowed).toHaveBeenCalledTimes(2);
  });
});
