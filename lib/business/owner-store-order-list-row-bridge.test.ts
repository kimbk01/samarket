import { describe, expect, it } from "vitest";
import {
  normalizeOwnerStoreOrderListRow,
  parseOwnerStoreOrdersListFromApiJson,
  type OwnerStoreOrderListRow,
} from "./owner-store-order-list-row-bridge";

describe("normalizeOwnerStoreOrderListRow", () => {
  it("fills missing items with empty array", () => {
    const row = {
      id: "o1",
      order_no: "1",
      buyer_user_id: "u",
      total_amount: 1,
      payment_amount: 1,
      payment_status: "paid",
      order_status: "pending",
      fulfillment_type: "pickup",
      buyer_note: null,
      created_at: new Date().toISOString(),
    } as OwnerStoreOrderListRow;
    const out = normalizeOwnerStoreOrderListRow(row);
    expect(out.items).toEqual([]);
  });
});

describe("parseOwnerStoreOrdersListFromApiJson", () => {
  it("guarantees items on every row", () => {
    const rows = parseOwnerStoreOrdersListFromApiJson({
      orders: [{ id: "x", order_no: "1" }],
    });
    expect(rows).toHaveLength(1);
    expect(Array.isArray(rows[0]!.items)).toBe(true);
  });

  it("passes through store_orders.discount_amount snapshot without recomputing", () => {
    const rows = parseOwnerStoreOrdersListFromApiJson({
      orders: [{ id: "x", discount_amount: 100, total_amount: 1950, payment_amount: 1850 }],
    });
    expect(rows[0]!.discount_amount).toBe(100);
  });
});
