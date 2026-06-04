import { describe, expect, it } from "vitest";
import {
  mergeOwnerStoreOrderListRows,
  pickNewerOwnerStoreOrderListRow,
} from "@/lib/business/merge-owner-store-order-list-rows";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";

function row(partial: Partial<OwnerStoreOrderListRow> & { id: string; order_status: string }): OwnerStoreOrderListRow {
  return {
    order_no: "SO1",
    buyer_user_id: "u1",
    total_amount: 100,
    payment_amount: 100,
    payment_status: "paid",
    fulfillment_type: "local_delivery",
    buyer_note: null,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: null,
    items: [],
    ...partial,
    id: partial.id,
    order_status: partial.order_status,
  };
}

describe("pickNewerOwnerStoreOrderListRow", () => {
  it("keeps newer updated_at order_status when incoming list is stale", () => {
    const existing = row({
      id: "o1",
      order_status: "preparing",
      updated_at: "2026-06-01T12:00:00.000Z",
    });
    const incoming = row({
      id: "o1",
      order_status: "accepted",
      updated_at: "2026-06-01T11:00:00.000Z",
    });
    expect(pickNewerOwnerStoreOrderListRow(existing, incoming).order_status).toBe("preparing");
  });

  it("takes incoming when incoming updated_at is newer", () => {
    const existing = row({
      id: "o1",
      order_status: "accepted",
      updated_at: "2026-06-01T11:00:00.000Z",
    });
    const incoming = row({
      id: "o1",
      order_status: "preparing",
      updated_at: "2026-06-01T12:00:00.000Z",
    });
    expect(pickNewerOwnerStoreOrderListRow(existing, incoming).order_status).toBe("preparing");
  });
});

describe("mergeOwnerStoreOrderListRows", () => {
  it("does not regress optimistic row when load returns stale snapshot row", () => {
    const prev = [
      row({
        id: "o1",
        order_status: "preparing",
        updated_at: "2026-06-01T12:05:00.000Z",
      }),
    ];
    const incoming = [
      row({
        id: "o1",
        order_status: "accepted",
        updated_at: "2026-06-01T11:00:00.000Z",
      }),
    ];
    const merged = mergeOwnerStoreOrderListRows(prev, incoming);
    expect(merged[0]?.order_status).toBe("preparing");
  });
});
