import { beforeEach, describe, expect, it, vi } from "vitest";

const createAndDispatchNotificationEvent = vi.fn();
const getBlockedRelation = vi.fn();
const isNotificationSuppressedForActor = vi.fn();
const bumpNotificationTargetFromInboxRow = vi.fn();

vi.mock("@/lib/notifications/pipeline/notification-event-dispatcher", () => ({
  createAndDispatchNotificationEvent: (...args: unknown[]) =>
    createAndDispatchNotificationEvent(...args),
}));

vi.mock("@/lib/community-messenger/social-relations", () => ({
  getBlockedRelation: (...args: unknown[]) => getBlockedRelation(...args),
}));

vi.mock("@/lib/social/user-block-ssot", () => ({
  isNotificationSuppressedForActor: (...args: unknown[]) =>
    isNotificationSuppressedForActor(...args),
}));

vi.mock("@/lib/notifications/notification-target-from-inbox-row", () => ({
  bumpNotificationTargetFromInboxRow: (...args: unknown[]) =>
    bumpNotificationTargetFromInboxRow(...args),
}));

vi.mock("@/lib/notifications/publish-notification-side-effect", () => ({
  publishNotificationSideEffect: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));

vi.mock("@/lib/delivery/owner/apply-owner-commerce-notification-invalidate", () => ({
  applyOwnerCommerceNotificationInvalidate: vi.fn(() => false),
  resolveOwnerCommerceNotificationStoreId: vi.fn(() => null),
}));

describe("appendUserNotification SSOT bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createAndDispatchNotificationEvent.mockReset();
    getBlockedRelation.mockResolvedValue(null);
    isNotificationSuppressedForActor.mockReturnValue(false);
    bumpNotificationTargetFromInboxRow.mockResolvedValue(undefined);
  });

  it("does not touch legacy notifications insert when SSOT path succeeds", async () => {
    createAndDispatchNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-1", user_id: "u1" },
    });

    const insert = vi.fn();
    const sb = { from: vi.fn(() => ({ insert })) } as unknown as Parameters<
      (typeof import("@/lib/notifications/append-user-notification"))["appendUserNotification"]
    >[0];
    const { appendUserNotification } = await import(
      "@/lib/notifications/append-user-notification"
    );

    const ok = await appendUserNotification(sb, {
      user_id: "u1",
      notification_type: "system",
      title: "title",
      body: "body",
      push_kind: "marketing",
    });

    expect(ok).toBe(true);
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("preserves legacyDomain in notification_events displayPayload", async () => {
    createAndDispatchNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-sold-out", user_id: "owner-1" },
    });

    const insert = vi.fn();
    const sb = { from: vi.fn(() => ({ insert })) } as unknown as Parameters<
      (typeof import("@/lib/notifications/append-user-notification"))["appendUserNotification"]
    >[0];
    const { appendUserNotification } = await import(
      "@/lib/notifications/append-user-notification"
    );

    const ok = await appendUserNotification(sb, {
      user_id: "owner-1",
      notification_type: "commerce",
      domain: "store",
      title: "sold out",
      body: "body",
      meta: { kind: "store_order_sold_out", store_id: "store-1" },
    });

    expect(ok).toBe(true);
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        displayPayload: expect.objectContaining({
          legacyDomain: "store",
          legacyMeta: expect.objectContaining({ kind: "store_order_sold_out" }),
        }),
      })
    );
  });

  it("routes trade status meta kinds to trade_status badge category", async () => {
    createAndDispatchNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-trade", user_id: "seller-1" },
    });

    const insert = vi.fn();
    const sb = { from: vi.fn(() => ({ insert })) } as unknown as Parameters<
      (typeof import("@/lib/notifications/append-user-notification"))["appendUserNotification"]
    >[0];
    const { appendUserNotification } = await import(
      "@/lib/notifications/append-user-notification"
    );

    const ok = await appendUserNotification(sb, {
      user_id: "seller-1",
      notification_type: "status",
      domain: "trade_chat",
      ref_id: "room-1",
      title: "trade done",
      body: "body",
      meta: { kind: "trade_completed", room_id: "room-1" },
    });

    expect(ok).toBe(true);
    expect(createAndDispatchNotificationEvent).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({
        type: "trade_status",
        category: "trade_status",
        displayPayload: expect.objectContaining({
          legacyDomain: "trade_chat",
          legacyMeta: expect.objectContaining({ kind: "trade_completed" }),
        }),
      })
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("keeps legacy fallback disabled by default when SSOT fails", async () => {
    createAndDispatchNotificationEvent.mockRejectedValue(new Error("boom"));

    const insert = vi.fn();
    const sb = { from: vi.fn(() => ({ insert })) } as unknown as Parameters<
      (typeof import("@/lib/notifications/append-user-notification"))["appendUserNotification"]
    >[0];
    const { appendUserNotification } = await import(
      "@/lib/notifications/append-user-notification"
    );

    const ok = await appendUserNotification(sb, {
      user_id: "u1",
      notification_type: "system",
      title: "title",
      body: "body",
      push_kind: "system",
    });

    expect(ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
});
