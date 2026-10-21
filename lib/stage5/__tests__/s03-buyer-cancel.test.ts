/**
 * 5단계 L1 — S03 구매자 취소 (G-2 §5-2 S03).
 *
 * 구매자 라우트(`PATCH /api/me/store-orders/[orderId]`) → 오너 라우트(`PATCH …/orders/[orderId]`, `POST …/decide`)
 * → 실제 `applyStoreOrderStatusTransition` → 상태형 mock(`stage5-order-world`, RPC 는 계약 응답만).
 * L1 PASS 조건: CAS(`p_expected_status`/`expected_status`)로 한쪽만 성공 · 반려 사유 문자열이 원장·상태 이벤트·
 * 감사·구매자 알림에 그대로 · 알림 구매자/오너 각 1 · pending 원장 잔존 0 · TS 수수료 쓰기 0.
 * 원장+상태 1 TX·2세션 경합·조리 후 승인 시 수수료 검토 플래그는 DB 함수/트리거 → L2.
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

import { PATCH as buyerPatch } from "@/app/api/me/store-orders/[orderId]/route";
import { PATCH as ownerPatch } from "@/app/api/me/stores/[storeId]/orders/[orderId]/route";
import { POST as ownerDecide } from "@/app/api/me/stores/[storeId]/orders/[orderId]/decide/route";
import { loadAdminStoreOrderDetail } from "@/lib/admin/store-orders/load-admin-store-order-detail";

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

async function call(handler: (req: never, c: never) => Promise<Response>, url: string, method: string, body: Json, params: Json) {
  const res = await handler(
    new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never,
    { params: Promise.resolve(params) } as never
  );
  return { status: res.status, body: (await res.json()) as Json };
}

const asBuyer = (body: Json) => {
  ctx.userId = "b1";
  return call(buyerPatch as never, "https://x.test/api/me/store-orders/o1", "PATCH", body, { orderId: "o1" });
};
const asOwnerPatch = (body: Json) => {
  ctx.userId = "owner-1";
  return call(ownerPatch as never, "https://x.test/api/me/stores/s1/orders/o1", "PATCH", body, { storeId: "s1", orderId: "o1" });
};
const asOwnerDecide = (body: Json) => {
  ctx.userId = "owner-1";
  return call(ownerDecide as never, "https://x.test/api/me/stores/s1/orders/o1/decide", "POST", body, {
    storeId: "s1",
    orderId: "o1",
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S03-1 접수 전 즉시 취소", () => {
  it("buyer cancels a pending order: CAS on pending in the cancel DB function, owner notified once, stock restored, no fee writes", async () => {
    const w = newOrder("pending");
    const r = await asBuyer({ cancel: true });
    expect(r).toEqual({ status: 200, body: { ok: true, order_status: "cancelled", payment_status: "cancelled" } });
    expect(w.rpcCalls.find((c) => c.name === "store_order_cancel_direct_atomic")?.args).toEqual({
      p_order_id: "o1",
      p_expected_status: "pending",
      p_payment_status: "cancelled",
      p_actor: "CUSTOMER",
    });
    expect(notify.notifyStoreOwnerBuyerCancelled).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
    expect(stock.restoreStockForOrder).toHaveBeenCalledTimes(1);
    expect(feeOrCashTouches(w)).toEqual([]);

    // the owner's accept arriving afterwards cannot revive it
    const late = await asOwnerPatch({ order_status: "accepted", estimated_prep_minutes: 15 });
    expect(late.status).toBe(400);
    expect(w.order.order_status).toBe("cancelled");
  });

  it("owner accepted first → buyer direct cancel refused (one side wins), nothing written", async () => {
    const w = newOrder("pending");
    expect((await asOwnerPatch({ order_status: "accepted", estimated_prep_minutes: 15 })).status).toBe(200);
    const r = await asBuyer({ cancel: true });
    expect(r).toEqual({ status: 400, body: { ok: false, error: "cannot_cancel_after_accepted" } });
    expect(w.order.order_status).toBe("accepted");
    expect(w.rpcCalls.some((c) => c.name === "store_order_cancel_direct_atomic")).toBe(false);
    expect(notify.notifyStoreOwnerBuyerCancelled).not.toHaveBeenCalled();
  });

  it("accept lands between the read and the cancel DB function (CAS lost) → 409, no owner notice, no stock restore", async () => {
    const w = newOrder("pending");
    w.rpcOverride.set("store_order_cancel_direct_atomic", { data: { ok: false, error: "transition_conflict" }, error: null });
    const r = await asBuyer({ cancel: true });
    expect(r).toEqual({ status: 409, body: { ok: false, error: "transition_conflict" } });
    expect(notify.notifyStoreOwnerBuyerCancelled).not.toHaveBeenCalled();
    expect(stock.restoreStockForOrder).not.toHaveBeenCalled();
  });
});

const BUYER_REASON = "배달이 너무 늦어요";

async function buyerRequestsCancel(w: Stage5OrderWorld) {
  const r = await asBuyer({ request_cancel: true, cancel_reason: BUYER_REASON });
  expect(r).toEqual({ status: 200, body: { ok: true, order_status: "cancel_requested" } });
  expect(w.cancelRequests).toEqual([
    expect.objectContaining({ status: "pending", previous_order_status: "accepted", requested_role: "buyer", reason: BUYER_REASON }),
  ]);
  expect(notify.notifyStoreOwnerRefundRequested).toHaveBeenCalledTimes(1);
  expect(notify.notifyStoreOwnerRefundRequested).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ orderId: "o1", request: "cancel" })
  );
}

describe("S03-2 접수 후 취소 요청 → 오너 승인", () => {
  it("request without a reason → 400, nothing written", async () => {
    const w = newOrder("accepted");
    const r = await asBuyer({ request_cancel: true, cancel_reason: " " });
    expect(r).toEqual({ status: 400, body: { ok: false, error: "cancel_reason_required" } });
    expect(w.rpcCalls).toEqual([]);
  });

  it("buyer request → owner approve with expected_status → cancelled, ledger approved, buyer notified once, no pending left", async () => {
    const w = newOrder("accepted");
    await buyerRequestsCancel(w);
    const r = await asOwnerDecide({ action: "cancel_request_approve", expected_status: "cancel_requested" });
    expect(r).toEqual({ status: 200, body: { ok: true, from_status: "cancel_requested", order_status: "cancelled" } });
    expect(w.rpcCalls.find((c) => c.name === "store_order_cancel_request_decide_atomic")?.args).toMatchObject({
      p_expected_status: "cancel_requested",
      p_decision: "approve",
      p_actor_role: "owner",
      p_actor_user_id: "owner-1",
    });
    expect(w.order.order_status).toBe("cancelled");
    expect(w.cancelRequests.filter((x) => x.status === "pending")).toHaveLength(0);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buyerUserId: "b1", nextStatus: "cancelled", actor: "OWNER" })
    );
    expect(notify.notifyStoreOwnerRefundRequested).toHaveBeenCalledTimes(1);
    expect(feeOrCashTouches(w)).toEqual([]);

    const admin = await loadAdminStoreOrderDetail(w.sb, "o1");
    if (!admin.ok) throw new Error(admin.error);
    expect(admin.detail.order.orderStatus).toBe("cancelled");
    expect(admin.detail.cancelRequests).toEqual([
      expect.objectContaining({ requester: "buyer", reason: BUYER_REASON, status: "approved", previousStatus: "accepted" }),
    ]);
  });

  it("owner decided on a stale screen (expected accepted) → 409 status_changed + current status, nothing written", async () => {
    const w = newOrder("accepted");
    await buyerRequestsCancel(w);
    const before = w.rpcCalls.length;
    const r = await asOwnerDecide({ action: "cancel_request_approve", expected_status: "accepted" });
    expect(r).toEqual({ status: 409, body: { ok: false, error: "status_changed", current_status: "cancel_requested" } });
    expect(w.rpcCalls.length).toBe(before);
  });

  it("owner PATCH cannot decide a request (decision route required)", async () => {
    const w = newOrder("accepted");
    await buyerRequestsCancel(w);
    const r = await asOwnerPatch({ order_status: "cancelled" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("owner_decision_route_required");
    expect(w.order.order_status).toBe("cancel_requested");
  });
});

describe("S03-3 접수 후 취소 요청 → 오너 반려", () => {
  it("reject without a reason → 400 reason_required, request stays pending", async () => {
    const w = newOrder("accepted");
    await buyerRequestsCancel(w);
    const r = await asOwnerDecide({ action: "cancel_request_reject", reason: " ", expected_status: "cancel_requested" });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("reason_required");
    expect(w.cancelRequests[0].status).toBe("pending");
  });

  it("reject restores the recorded status; the same reason string reaches ledger, status event, audit and the buyer notice", async () => {
    const w = newOrder("accepted");
    await buyerRequestsCancel(w);
    const REASON = "이미 조리를 시작했습니다";
    const r = await asOwnerDecide({ action: "cancel_request_reject", reason: `  ${REASON} `, expected_status: "cancel_requested" });
    expect(r).toEqual({ status: 200, body: { ok: true, from_status: "cancel_requested", order_status: "accepted" } });
    expect(w.order.order_status).toBe("accepted");

    const decide = w.rpcCalls.find((c) => c.name === "store_order_cancel_request_decide_atomic")?.args;
    expect(decide).toMatchObject({ p_decision: "reject", p_restore_status: "accepted", p_reason: REASON, p_expected_status: "cancel_requested" });
    expect(w.cancelRequests[0]).toMatchObject({ status: "rejected", rejected_reason: REASON });
    expect(w.cancelRequests.filter((x) => x.status === "pending")).toHaveLength(0);

    expect(events.createStoreOrderStatusEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        fromStatus: "cancel_requested",
        toStatus: "accepted",
        message: REASON,
        metadata: expect.objectContaining({ source: "owner_cancel_request_reject", rejected_reason: REASON }),
      })
    );
    expect(audit.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "store_order.owner_decision",
        after_json: expect.objectContaining({ action: "cancel_request_reject", order_status: "accepted", reason: REASON }),
      })
    );
    expect(notify.notifyBuyerStoreRefundRejected).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreRefundRejected).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buyerUserId: "b1", orderId: "o1", reason: REASON, request: "cancel" })
    );
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
    expect(feeOrCashTouches(w)).toEqual([]);

    // admin order detail reads the same ledger row: same status, requester, buyer reason and reject reason
    const admin = await loadAdminStoreOrderDetail(w.sb, "o1");
    if (!admin.ok) throw new Error(admin.error);
    expect(admin.detail.order.orderStatus).toBe("accepted");
    expect(admin.detail.cancelRequests).toEqual([
      expect.objectContaining({ requester: "buyer", reason: BUYER_REASON, status: "rejected", rejectedReason: REASON }),
    ]);
  });

  it("a second decision on the same request (double tap) → 409 status_changed, no second notice", async () => {
    const w = newOrder("accepted");
    await buyerRequestsCancel(w);
    await asOwnerDecide({ action: "cancel_request_reject", reason: "재료 충분", expected_status: "cancel_requested" });
    const again = await asOwnerDecide({ action: "cancel_request_reject", reason: "재료 충분", expected_status: "cancel_requested" });
    expect(again).toEqual({ status: 409, body: { ok: false, error: "status_changed", current_status: "accepted" } });
    expect(notify.notifyBuyerStoreRefundRejected).toHaveBeenCalledTimes(1);
    expect(w.order.order_status).toBe("accepted");
  });
});
