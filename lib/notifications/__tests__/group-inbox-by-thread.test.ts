import { describe, expect, it } from "vitest";
import { buildInboxGroupItems, groupKeyForInboxRow } from "@/lib/notifications/group-inbox-by-thread";

describe("groupKeyForInboxRow", () => {
  it("groups commerce rows by order_id", () => {
    const row = {
      id: "n1",
      notification_type: "commerce",
      title: "t",
      body: null,
      link_url: null,
      is_read: false,
      created_at: "2026-06-05T10:00:00Z",
      meta: { order_id: "order-abc", kind: "store_order_owner_status" },
      domain: "order",
    };
    expect(groupKeyForInboxRow(row)).toBe("order:order-abc");
  });

  it("falls back to one:id for commerce without order_id", () => {
    const row = {
      id: "n2",
      notification_type: "commerce",
      title: "t",
      body: null,
      link_url: null,
      is_read: false,
      created_at: "2026-06-05T10:00:00Z",
      meta: { kind: "store_point_low" },
      domain: "store",
    };
    expect(groupKeyForInboxRow(row)).toBe("one:n2");
  });
});

describe("buildInboxGroupItems", () => {
  it("merges multiple status notifications for same order into one card", () => {
    const rows = [
      {
        id: "a",
        notification_type: "commerce",
        title: "Old",
        body: "b1",
        link_url: "/my/store-orders",
        is_read: true,
        created_at: "2026-06-05T10:00:00Z",
        meta: {
          order_id: "order-1",
          order_status: "accepted",
          kind: "store_order_owner_status",
        },
        domain: "order",
      },
      {
        id: "b",
        notification_type: "commerce",
        title: "Latest",
        body: "b2",
        link_url: "/my/store-orders",
        is_read: false,
        created_at: "2026-06-05T11:00:00Z",
        meta: {
          order_id: "order-1",
          order_status: "preparing",
          kind: "store_order_owner_status",
        },
        domain: "order",
      },
    ];
    const grouped = buildInboxGroupItems(rows, "ko");
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.isOrderGroup).toBe(true);
    expect(grouped[0]?.ids).toEqual(["b", "a"]);
    expect(grouped[0]?.displayTitle).toBeTruthy();
    expect(grouped[0]?.unreadCount).toBe(1);
  });
});
