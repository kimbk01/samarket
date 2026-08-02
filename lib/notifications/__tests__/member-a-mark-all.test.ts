import { describe, expect, it, vi } from "vitest";
import {
  aggregateMemberAMarkAllUpdated,
  markMemberANotificationsAllRead,
} from "@/lib/notifications/inbox-read-bridge";

vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  invalidateNotificationBadgeCache: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));

vi.mock("@/lib/notifications/owner-store-commerce-notification-meta", () => ({
  isOwnerStoreCommerceNotificationRow: (row: { notification_type?: string }) =>
    row.notification_type === "owner_commerce",
}));

vi.mock("@/lib/notifications/inapp-chat-message-notification", () => ({
  isInAppChatMessageNotificationRow: (row: { notification_type?: string }) =>
    row.notification_type === "chat",
}));

describe("Slice 2-2 member A mark-all stores", () => {
  it("aggregates legacy + event without treating either zero as failure", () => {
    expect(aggregateMemberAMarkAllUpdated(0, 3)).toEqual({
      legacyUpdated: 0,
      eventUpdated: 3,
      updated: 3,
    });
    expect(aggregateMemberAMarkAllUpdated(2, 0)).toEqual({
      legacyUpdated: 2,
      eventUpdated: 0,
      updated: 2,
    });
    expect(aggregateMemberAMarkAllUpdated(0, 0)).toEqual({
      legacyUpdated: 0,
      eventUpdated: 0,
      updated: 0,
    });
    expect(aggregateMemberAMarkAllUpdated(2, 3)).toEqual({
      legacyUpdated: 2,
      eventUpdated: 3,
      updated: 5,
    });
  });

  it("calls event mark-all even when legacy unread is empty", async () => {
    const markEvents = vi.fn().mockResolvedValue(3);
    const sb = {
      from: vi.fn(() => {
        const node: Record<string, unknown> = {};
        const self = () => node;
        node.select = vi.fn(self);
        node.eq = vi.fn(self);
        node.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
        node.update = vi.fn(self);
        node.in = vi.fn(() => Promise.resolve({ error: null }));
        return node;
      }),
    };

    const result = await markMemberANotificationsAllRead(sb as never, "user-1", {
      markEvents,
    });
    expect(markEvents).toHaveBeenCalledTimes(1);
    expect(markEvents).toHaveBeenCalledWith(sb, "user-1");
    expect(result).toEqual({
      legacyUpdated: 0,
      eventUpdated: 3,
      updated: 3,
    });
  });

  it("marks legacy non-chat rows and still runs event mark-all", async () => {
    const markEvents = vi.fn().mockResolvedValue(0);
    const sb = {
      from: vi.fn(() => {
        const node: Record<string, unknown> = {};
        const self = () => node;
        node.select = vi.fn(self);
        node.eq = vi.fn(self);
        node.limit = vi.fn(() =>
          Promise.resolve({
            data: [
              { id: "l1", notification_type: "trade_status", meta: {} },
              { id: "l2", notification_type: "chat", meta: {} },
              { id: "l3", notification_type: "admin_notice", meta: {} },
            ],
            error: null,
          })
        );
        node.update = vi.fn(self);
        node.in = vi.fn((_col: string, ids: string[]) => {
          expect(ids).toEqual(["l1", "l3"]);
          return Promise.resolve({ error: null });
        });
        return node;
      }),
    };

    const result = await markMemberANotificationsAllRead(sb as never, "user-1", {
      markEvents,
    });
    expect(markEvents).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      legacyUpdated: 2,
      eventUpdated: 0,
      updated: 2,
    });
  });

  it("second mark-all with empty stores is idempotent updated 0", async () => {
    const markEvents = vi.fn().mockResolvedValue(0);
    const sb = {
      from: vi.fn(() => {
        const node: Record<string, unknown> = {};
        const self = () => node;
        node.select = vi.fn(self);
        node.eq = vi.fn(self);
        node.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
        return node;
      }),
    };
    const first = await markMemberANotificationsAllRead(sb as never, "user-1", { markEvents });
    const second = await markMemberANotificationsAllRead(sb as never, "user-1", { markEvents });
    expect(first).toEqual({ legacyUpdated: 0, eventUpdated: 0, updated: 0 });
    expect(second).toEqual({ legacyUpdated: 0, eventUpdated: 0, updated: 0 });
    expect(markEvents).toHaveBeenCalledTimes(2);
  });
});
