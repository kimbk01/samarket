import { beforeEach, describe, expect, it, vi } from "vitest";

const createAndDispatchNotificationEvent = vi.fn();
const invalidateNotificationBadgeCache = vi.fn();

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: (...args: unknown[]) => createAndDispatchNotificationEvent(...args),
}));

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: (...args: unknown[]) => invalidateNotificationBadgeCache(...args),
}));

import { notifyMissedCallPipeline } from "@/lib/notifications/pipeline/notify-missed-call-pipeline";

const sb = {} as never;

describe("notify-missed-call-pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAndDispatchNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-missed", user_id: "user-b", type: "missed_call", category: "missed_call" },
    });
  });

  it("creates missed_call event for callee only (not caller)", async () => {
    await notifyMissedCallPipeline(sb, {
      sessionId: "sess-1",
      roomId: "room-1",
      initiatorUserId: "user-a",
      recipientUserId: "user-b",
      initiatorDisplayName: "Alice",
      recipientDisplayName: "Bob",
    });
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledTimes(1);
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        type: "missed_call",
        category: "missed_call",
        unread: true,
        userId: "user-b",
        actorUserId: "user-a",
      })
    );
    expect(createAndDispatchNotificationEvent).not.toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ userId: "user-a" })
    );
  });
});
