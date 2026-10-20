import { describe, expect, it } from "vitest";
import {
  appendOwnerOrderHistoryRows,
  mergeOwnerStoreOrderListRows,
  ownerOrdersHistoryStartCursor,
  pickNewerOwnerStoreOrderListRow,
  retainOwnerOrderHistoryRows,
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

  it("keeps enrich discount_amount when newer list snapshot omits it", () => {
    const existing = row({
      id: "o1",
      order_status: "completed",
      updated_at: "2026-06-01T11:00:00.000Z",
      discount_amount: 100,
      total_amount: 1950,
      payment_amount: 1850,
    });
    const incoming = row({
      id: "o1",
      order_status: "completed",
      updated_at: "2026-06-01T12:00:00.000Z",
      total_amount: 1950,
      payment_amount: 1850,
    });
    expect(pickNewerOwnerStoreOrderListRow(existing, incoming).discount_amount).toBe(100);
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

describe("owner orders history paging (ORD-05)", () => {
  it("starts history after the oldest loaded terminal row", () => {
    const rows = [
      row({ id: "a", order_status: "completed", created_at: "2026-10-21T10:00:00.000Z" }),
      row({ id: "b", order_status: "cancelled", created_at: "2026-10-21T09:00:00.000Z" }),
      row({ id: "c", order_status: "pending", created_at: "2026-07-01T09:00:00.000Z" }),
    ];
    expect(ownerOrdersHistoryStartCursor(rows)).toBe("2026-10-21T09:00:00.000Z|b");
  });

  it("falls back to the oldest row when nothing is terminal, null when empty", () => {
    const rows = [
      row({ id: "x", order_status: "pending", created_at: "2026-10-21T10:00:00.000Z" }),
      row({ id: "y", order_status: "accepted", created_at: "2026-10-20T10:00:00.000Z" }),
    ];
    expect(ownerOrdersHistoryStartCursor(rows)).toBe("2026-10-20T10:00:00.000Z|y");
    expect(ownerOrdersHistoryStartCursor([])).toBeNull();
  });

  it("silent reload keeps appended terminal history but drops vanished open rows", () => {
    const prev = [
      row({ id: "new", order_status: "pending", created_at: "2026-10-21T10:00:00.000Z" }),
      row({ id: "old-done", order_status: "completed", created_at: "2026-08-01T10:00:00.000Z" }),
      row({ id: "old-open", order_status: "accepted", created_at: "2026-08-01T09:00:00.000Z" }),
    ];
    const incoming = [row({ id: "new", order_status: "pending", created_at: "2026-10-21T10:00:00.000Z" })];
    const merged = mergeOwnerStoreOrderListRows(prev, incoming);
    expect(retainOwnerOrderHistoryRows(prev, merged).map((r) => r.id)).toEqual(["new", "old-done"]);
  });

  it("appends older pages without duplicates", () => {
    const current = [
      row({ id: "a", order_status: "completed", created_at: "2026-10-21T10:00:00.000Z" }),
      row({ id: "p", order_status: "pending", created_at: "2026-07-01T10:00:00.000Z" }),
    ];
    const older = [
      row({ id: "p", order_status: "pending", created_at: "2026-07-01T10:00:00.000Z" }),
      row({ id: "z", order_status: "completed", created_at: "2026-06-01T10:00:00.000Z" }),
    ];
    expect(appendOwnerOrderHistoryRows(current, older).map((r) => r.id).sort()).toEqual(["a", "p", "z"]);
  });
});
