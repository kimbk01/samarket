import { describe, expect, it } from "vitest";
import {
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderOwnerListViewModel,
} from "@/lib/messenger/store-order/row-model";
import { buildStoreOrderCustomerHeaderModel } from "@/lib/messenger/store-order/customer-header";
import { buildStoreOrderOwnerHeaderModel } from "@/lib/messenger/store-order/owner-header";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";

function item(partial: Partial<StoreOrderListItem> = {}): StoreOrderListItem {
  return {
    roomId: "room-1",
    chatDomain: "store_order",
    domainIdentityKey: "store_order:order-1",
    orderId: "order-1",
    storeId: "store-1",
    storeName: "맛있는집",
    storeImageUrl: null,
    customerUserId: "buyer-1",
    customerName: "구매자",
    customerAvatarUrl: null,
    latestChatMessageText: "hi",
    latestChatMessageType: "text",
    latestChatMessageAt: "2026-07-22T00:00:00.000Z",
    unreadCount: 0,
    orderStatusLabel: "pending",
    fulfillmentType: null,
    generation: "test",
    ...partial,
  };
}

describe("order-status raw enum → SSOT label (list row + room header)", () => {
  it("row-model customer list: translates raw order_status via processStatusLabel, not raw-passthrough", () => {
    const vm = buildStoreOrderCustomerListViewModel(item({ orderStatusLabel: "pending" }), "ko");
    expect(vm.statusBadge).toBe("주문접수");
    expect(vm.statusBadge).not.toBe("pending");
  });

  it("row-model customer list: respects explicit lang", () => {
    const vm = buildStoreOrderCustomerListViewModel(item({ orderStatusLabel: "pending" }), "en");
    expect(vm.statusBadge).toBe("Order received");
  });

  it("row-model customer list: defaults to ko when lang omitted (server-safe default, not client global)", () => {
    const vm = buildStoreOrderCustomerListViewModel(item({ orderStatusLabel: "pending" }));
    expect(vm.statusBadge).toBe("주문접수");
  });

  it("row-model owner list: uses owner_badge audience wording", () => {
    const vm = buildStoreOrderOwnerListViewModel(item({ orderStatusLabel: "pending" }), "ko");
    expect(vm.statusBadge).not.toBe("pending");
    expect(typeof vm.statusBadge).toBe("string");
  });

  it("customer room header: translates orderStatusLabel the same way as the list row", () => {
    const header = buildStoreOrderCustomerHeaderModel(item({ orderStatusLabel: "ready_for_pickup" }), "ko");
    expect(header.orderStatusLabel).not.toBe("ready_for_pickup");
    expect(header.orderStatusLabel).toBeTruthy();
  });

  it("owner room header: translates orderStatusLabel", () => {
    const header = buildStoreOrderOwnerHeaderModel(item({ orderStatusLabel: "ready_for_pickup" }), "ko");
    expect(header.orderStatusLabel).not.toBe("ready_for_pickup");
    expect(header.orderStatusLabel).toBeTruthy();
  });

  it("unrecognized/legacy fixture strings pass through unchanged (no throw, no mangling)", () => {
    const vm = buildStoreOrderCustomerListViewModel(item({ orderStatusLabel: "준비중" }), "ko");
    expect(vm.statusBadge).toBe("준비중");
  });

  it("null orderStatusLabel stays null", () => {
    const vm = buildStoreOrderCustomerListViewModel(item({ orderStatusLabel: null }), "ko");
    expect(vm.statusBadge).toBeNull();
  });
});
