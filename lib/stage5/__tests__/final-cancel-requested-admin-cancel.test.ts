/**
 * 최종 마무리 — `cancel_requested` 주문의 관리자 강제 취소는 대기 요청을 승인으로 함께 확정한다
 * (store_order_cancel_request_decide_atomic). 직접 취소 RPC 로 가지 않는다 (ND-3 C6.4 관찰).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStage5OrderWorld, feeOrCashTouches, type Stage5OrderWorld } from "./helpers/stage5-order-world";

const notify = vi.hoisted(() => ({
  notifyBuyerStoreOrderAutoCompleted: vi.fn(async () => undefined),
  notifyBuyerStoreOrderOwnerStatus: vi.fn(async () => undefined),
  notifyStoreOwnerAcceptTimeoutCancelled: vi.fn(async () => undefined),
  notifyBuyerStoreRefundApproved: vi.fn(async () => undefined),
  notifyBuyerStoreRefundRejected: vi.fn(async () => undefined),
  notifyStoreOwnerBuyerCancelled: vi.fn(async () => undefined),
  notifyStoreOwnerRefundRequested: vi.fn(async () => undefined),
}));
const events = vi.hoisted(() => {
  let n = 0;
  return {
    createStoreOrderEvent: vi.fn(async () => ({ ok: true, inserted: true, row: { id: `dev-${++n}` } })),
    createStoreOrderStatusEvent: vi.fn(async () => ({ ok: true, inserted: true, row: { id: `ev-${++n}` } })),
  };
});
const audit = vi.hoisted(() => ({ appendAuditLog: vi.fn(async () => undefined) }));
const stock = vi.hoisted(() => ({ restoreStockForOrder: vi.fn(async () => ({ ok: true })) }));
const ctx = vi.hoisted(() => ({ world: null as unknown as { sb: never }, userId: "b1" }));

vi.mock("@/lib/notifications/notify-store-commerce", () => notify);
vi.mock("@/lib/stores/store-order-events", () => events);
vi.mock("@/lib/audit/append-audit-log", () => audit);
vi.mock("@/lib/stores/restore-order-stock", () => stock);
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => ({
  recognizeOrderCurrencyOnCompleted: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => ({
  purgeStoreOrderDetailSnapshotRows: vi.fn(async () => undefined),
  invalidateStoreOrderDetailSnapshot: vi.fn(),
}));
vi.mock("@/lib/stores/store-order-detail-snapshot", () => ({ tryLoadBuyerStoreOrderDetailFromSnapshot: vi.fn(async () => null) }));
vi.mock("@/lib/community-messenger/store-order-chat-service", () => ({
  appendStoreOrderMessengerStatusTransition: vi.fn(async () => undefined),
  syncStoreOrderMessengerRoomContextMeta: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({ markOrderNotificationsRead: vi.fn(async () => undefined) }));
vi.mock("@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache", () => ({
  invalidateBuyerStoreOrdersListSnapshot: vi.fn(),
}));
vi.mock("@/lib/stores/load-commerce-settings", () => ({ loadCommerceSettings: vi.fn(async () => ({ autoCompleteDays: 3 })) }));
vi.mock("@/lib/stores/discovery/store-order-popularity-projection", () => ({
  applyStoreOrderPopularityProjectionOnCompleted: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => ctx.userId }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true, profile: {} }) }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true, store: { id: "s1", owner_user_id: "owner-1", approval_status: "approved" } }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ctx.world.sb }));
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({ invalidateOwnerHubBadgeCache: vi.fn() }));
vi.mock("@/lib/stores/store-order-counts-cache", () => ({ invalidateStoreOrderCountsCache: vi.fn() }));
vi.mock("@/lib/delivery/owner/invalidate-owner-delivery-surfaces-after-mutation", () => ({
  invalidateOwnerDeliverySurfacesAfterMutation: vi.fn(),
}));

import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { adminForceCancelStoreOrder } from "@/lib/stores/apply-admin-store-order-operations";

type Json = Record<string, unknown>;

function newOrder(status: string): Stage5OrderWorld {
  const w = createStage5OrderWorld({
    id: "o1",
    store_id: "s1",
    buyer_user_id: "b1",
    order_no: "N-3",
    order_status: status,
    fulfillment_type: "local_delivery",
    payment_status: "paid",
    payment_amount: 500,
    created_at: "2026-10-21T01:00:00.000Z",
  });
  ctx.world = w;
  return w;
}

function withPendingRequest(w: Stage5OrderWorld) {
  w.cancelRequests.push({
    id: "r1",
    order_id: "o1",
    status: "pending",
    previous_order_status: "accepted",
    requested_by: "b1",
    requested_role: "buyer",
    reason: "단순 변심",
    created_at: "2026-10-21T02:00:00.000Z",
  });
}

describe("cancel_requested + admin/owner cancel closes the pending request in the same TX", () => {
  beforeEach(() => vi.clearAllMocks());

  it("admin force cancel → decide approve (admin), request approved, no direct cancel RPC", async () => {
    const w = newOrder("cancel_requested");
    withPendingRequest(w);
    const r = await adminForceCancelStoreOrder(w.sb as never, "o1", { adminUserId: "adm-1" } as never, {
      expectedCurrentStatus: "cancel_requested",
    } as never);
    expect(r).toEqual({ ok: true });
    const names = w.rpcCalls.map((c) => c.name);
    expect(names).toContain("store_order_cancel_request_decide_atomic");
    expect(names).not.toContain("store_order_cancel_direct_atomic");
    const call = w.rpcCalls.find((c) => c.name === "store_order_cancel_request_decide_atomic")!;
    expect(call.args).toMatchObject({ p_decision: "approve", p_actor_role: "admin", p_expected_status: "cancel_requested" });
    expect(w.order.order_status).toBe("cancelled");
    expect(w.cancelRequests[0].status).toBe("approved");
    expect(feeOrCashTouches(w)).toEqual([]);
  });

  it("owner cancelled on cancel_requested without explicit decision → same approve path (owner)", async () => {
    const w = newOrder("cancel_requested");
    withPendingRequest(w);
    const r = await applyStoreOrderStatusTransition(w.sb as never, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      expectedCurrentStatus: "cancel_requested",
      audit: { actor_type: "user", actor_id: "owner-1", action: "t", ip: null, user_agent: null },
    } as never);
    expect(r.ok).toBe(true);
    const call = w.rpcCalls.find((c) => c.name === "store_order_cancel_request_decide_atomic")!;
    expect(call.args).toMatchObject({ p_decision: "approve", p_actor_role: "owner" });
    expect(w.rpcCalls.map((c) => c.name)).not.toContain("store_order_cancel_direct_atomic");
    expect(w.cancelRequests[0].status).toBe("approved");
  });

  it("pending (not cancel_requested) admin force cancel keeps the direct atomic cancel", async () => {
    const w = newOrder("pending");
    const r = await adminForceCancelStoreOrder(w.sb as never, "o1", { adminUserId: "adm-1" } as never, {
      expectedCurrentStatus: "pending",
    } as never);
    expect(r).toEqual({ ok: true });
    expect(w.rpcCalls.map((c) => c.name)).toContain("store_order_cancel_direct_atomic");
    expect(w.rpcCalls.map((c) => c.name)).not.toContain("store_order_cancel_request_decide_atomic");
  });
});
