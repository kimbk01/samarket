import { describe, expect, it } from "vitest";
import { groupKeyForInboxRow, buildInboxGroupItems } from "@/lib/notifications/group-inbox-by-thread";
import { buildTradeTargetId } from "@/lib/notifications/badge-target-policy";

describe("groupKeyForInboxRow trade/post targets", () => {
  it("groups trade_offer status by trade target id", () => {
    const key = groupKeyForInboxRow({
      id: "n1",
      notification_type: "status",
      title: "offer",
      body: null,
      link_url: null,
      is_read: false,
      created_at: "2026-01-01T00:00:00Z",
      meta: {
        kind: "trade_offer",
        product_id: "p1",
        seller_id: "s1",
        buyer_id: "b1",
      },
    });
    expect(key).toBe(`trade:${buildTradeTargetId("p1", "s1", "b1")}`);
  });

  it("groups community post notifications by post id", () => {
    const key = groupKeyForInboxRow({
      id: "n2",
      notification_type: "review",
      title: "comment",
      body: null,
      link_url: null,
      is_read: false,
      created_at: "2026-01-01T00:00:00Z",
      meta: { post_id: "post-abc" },
      domain: "community",
    });
    expect(key).toBe("post:post-abc");
  });
});

describe("buildInboxGroupItems surface priority", () => {
  it("puts matching push_kind rows first without changing count", () => {
    const rows = [
      {
        id: "a",
        notification_type: "system",
        title: "other",
        body: null,
        link_url: null,
        is_read: false,
        created_at: "2026-01-02T00:00:00Z",
        push_kind: "notice",
      },
      {
        id: "b",
        notification_type: "commerce",
        title: "order",
        body: null,
        link_url: null,
        is_read: false,
        created_at: "2026-01-01T00:00:00Z",
        meta: { order_id: "o1", kind: "buyer_order_placed" },
        push_kind: "delivery",
      },
    ] as Parameters<typeof buildInboxGroupItems>[0];

    const grouped = buildInboxGroupItems(rows, "ko", "delivery");
    expect(grouped[0]?.notification_type).toBe("commerce");
    expect(grouped).toHaveLength(2);
  });
});
