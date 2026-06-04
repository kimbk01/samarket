import { describe, expect, it } from "vitest";
import {
  buildOwnerOrdersEntryHref,
  OWNER_ORDERS_FRESH_LIST_PARAM,
  shouldOwnerOrdersForceNetwork,
  shouldOwnerOrdersSkipCachePeek,
} from "@/lib/business/owner-orders-entry-policy";

const STORE = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";

describe("shouldOwnerOrdersForceNetwork", () => {
  it("is true when order_id is set", () => {
    expect(shouldOwnerOrdersForceNetwork({ orderId: ORDER })).toBe(true);
  });

  it("is true when fresh_list=1", () => {
    expect(shouldOwnerOrdersForceNetwork({ freshList: "1" })).toBe(true);
  });

  it("is true when ack_owner_notifications=1", () => {
    expect(shouldOwnerOrdersForceNetwork({ ackOwnerNotifications: "1" })).toBe(true);
  });

  it("is false for plain tab navigation", () => {
    expect(shouldOwnerOrdersForceNetwork({})).toBe(false);
  });
});

describe("shouldOwnerOrdersSkipCachePeek", () => {
  it("matches force network policy", () => {
    expect(shouldOwnerOrdersSkipCachePeek({ orderId: ORDER })).toBe(true);
    expect(shouldOwnerOrdersSkipCachePeek({})).toBe(false);
  });
});

describe("buildOwnerOrdersEntryHref", () => {
  it("includes fresh_list for dashboard entry", () => {
    const href = buildOwnerOrdersEntryHref({ storeId: STORE, tab: "new", freshList: true });
    expect(href).toContain(`${OWNER_ORDERS_FRESH_LIST_PARAM}=1`);
    expect(href).toContain("tab=new");
  });

  it("includes order_id and fresh_list for notification entry", () => {
    const href = buildOwnerOrdersEntryHref({
      storeId: STORE,
      orderId: ORDER,
      kind: "store_order_created",
      ackOwnerNotifications: true,
    });
    expect(href).toContain(`order_id=${encodeURIComponent(ORDER)}`);
    expect(href).toContain("fresh_list=1");
    expect(href).toContain("ack_owner_notifications=1");
  });
});
