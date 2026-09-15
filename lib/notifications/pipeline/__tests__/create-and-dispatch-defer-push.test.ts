import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: vi.fn(async (_sb: unknown, input: { userId: string }) => ({
    ok: true as const,
    row: {
      id: "evt-1",
      user_id: input.userId,
      type: "trade_message",
      category: "chat",
      room_id: "room-1",
      message_id: "msg-1",
      push_suppressed_reason: null,
      created_at: new Date().toISOString(),
    },
  })),
}));

const { dispatchPush } = vi.hoisted(() => ({
  dispatchPush: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock("@/lib/notifications/pipeline/notify-push-dispatcher", () => ({
  dispatchNotificationPushIfAllowed: dispatchPush,
}));

describe("createAndDispatchNotificationEvent deferPush", () => {
  it("persists event without awaiting push when deferPush=true", async () => {
    const { createAndDispatchNotificationEvent, dispatchNotificationEvent } = await import(
      "@/lib/notifications/pipeline/notification-event-dispatcher"
    );
    dispatchPush.mockClear();
    const created = await createAndDispatchNotificationEvent(
      {} as never,
      {
        userId: "u1",
        type: "trade_message",
        category: "chat",
        roomId: "room-1",
        messageId: "msg-1",
        title: "t",
        body: "b",
        dedupeKey: "d1",
      } as never,
      { deferPush: true }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.pushDeferred).toBe(true);
    expect(dispatchPush).not.toHaveBeenCalled();

    // Explicit later dispatch still works.
    await dispatchNotificationEvent({} as never, created.row, { appState: "background" });
    expect(dispatchPush).toHaveBeenCalledTimes(1);
  });

  it("awaits push by default (compat)", async () => {
    const { createAndDispatchNotificationEvent } = await import(
      "@/lib/notifications/pipeline/notification-event-dispatcher"
    );
    dispatchPush.mockClear();
    const slow = new Promise<void>((resolve) => setTimeout(resolve, 40));
    dispatchPush.mockImplementationOnce(async () => {
      await slow;
    });
    const t0 = Date.now();
    await createAndDispatchNotificationEvent(
      {} as never,
      {
        userId: "u1",
        type: "trade_message",
        category: "chat",
        roomId: "room-1",
        messageId: "msg-2",
        title: "t",
        body: "b",
        dedupeKey: "d2",
      } as never
    );
    expect(Date.now() - t0).toBeGreaterThanOrEqual(35);
    expect(dispatchPush).toHaveBeenCalledTimes(1);
  });
});
