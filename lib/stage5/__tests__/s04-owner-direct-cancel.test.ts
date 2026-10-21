/**
 * 5단계 L1 — S04 오너 직접 취소 (G-2 §5-2 S04).
 *
 * 오너 라우트(`POST /api/me/stores/[storeId]/orders/[orderId]/cancel-request`) → 실제
 * `applyStoreOrderStatusTransition` → `store_order_owner_cancel_atomic`(상태형 mock, 계약 응답만)
 * → 관리자 상세 로더(`loadAdminStoreOrderDetail`) · 구매자 알림 payload.
 * L1 PASS 조건: 사유 필수 · 같은 사유 문자열이 원장(관리자 상세)·상태 이벤트·구매자 알림에 그대로(ORD-09) ·
 * CAS(`p_expected_status`) · TS 가 원장·수수료를 직접 쓰지 않음 · 픽업 이후·관리자 잠금 거부.
 * 원장+상태 같은 TX·재고 복원 시 수동 품절 유지(PRD-06)·조리 후 수수료 검토 플래그는 DB 함수/트리거 → L2.
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
const stock = vi.hoisted(() => ({ restoreStockForOrder: vi.fn(async () => ({ ok: true })) }));
const ctx = vi.hoisted(() => ({ world: null as unknown as { sb: never } }));

vi.mock("@/lib/notifications/notify-store-commerce", () => notify);
vi.mock("@/lib/stores/store-order-events", () => events);
vi.mock("@/lib/stores/restore-order-stock", () => stock);
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => ({
  recognizeOrderCurrencyOnCompleted: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => ({
  purgeStoreOrderDetailSnapshotRows: vi.fn(async () => undefined),
  invalidateStoreOrderDetailSnapshot: vi.fn(),
}));
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
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/owner-product-gate", () => ({
  getStoreIfOwner: async () => ({ ok: true, store: { id: "s1", owner_user_id: "owner-1", approval_status: "approved" } }),
}));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ctx.world.sb }));
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({ invalidateOwnerHubBadgeCache: vi.fn() }));
vi.mock("@/lib/delivery/owner/invalidate-owner-delivery-surfaces-after-mutation", () => ({
  invalidateOwnerDeliverySurfacesAfterMutation: vi.fn(),
}));

import { POST as ownerCancel } from "@/app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route";
import { PATCH as ownerPatch } from "@/app/api/me/stores/[storeId]/orders/[orderId]/route";
import { loadAdminStoreOrderDetail } from "@/lib/admin/store-orders/load-admin-store-order-detail";

type Json = Record<string, unknown>;

function newOrder(status: string, extra: Json = {}): Stage5OrderWorld {
  const w = createStage5OrderWorld({
    id: "o1",
    store_id: "s1",
    buyer_user_id: "b1",
    order_no: "N-4",
    order_status: status,
    fulfillment_type: "local_delivery",
    payment_status: "paid",
    payment_amount: 800,
    created_at: "2026-10-21T01:00:00.000Z",
    ...extra,
  });
  ctx.world = w;
  return w;
}

async function cancel(body: Json) {
  const res = await ownerCancel(
    new Request("https://x.test/api/me/stores/s1/orders/o1/cancel-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "s1", orderId: "o1" }) }
  );
  return { status: res.status, body: (await res.json()) as Json };
}

async function expectReasonEverywhere(w: Stage5OrderWorld, reason: string, from: string) {
  // server: one atomic call (ledger + status) with the CAS status and the reason; TS writes no ledger row itself
  expect(w.rpcCalls.filter((c) => c.name === "store_order_owner_cancel_atomic")).toEqual([
    {
      name: "store_order_owner_cancel_atomic",
      args: expect.objectContaining({ p_order_id: "o1", p_store_id: "s1", p_owner_user_id: "owner-1", p_expected_status: from, p_reason: reason }),
    },
  ]);
  expect(w.writes.some((x) => x.table === "store_order_cancel_requests")).toBe(false);
  expect(w.writes.some((x) => x.table === "store_orders")).toBe(false);
  expect(feeOrCashTouches(w)).toEqual([]);
  expect(w.order.order_status).toBe("cancelled");

  // buyer: one notice carrying the store's reason verbatim (ORD-09 / D-22)
  expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
  expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ buyerUserId: "b1", nextStatus: "cancelled", actor: "OWNER", cancelReason: reason })
  );
  // timeline event (admin + buyer order screens)
  expect(events.createStoreOrderStatusEvent).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      fromStatus: from,
      toStatus: "cancelled",
      actorRole: "owner",
      message: reason,
      metadata: expect.objectContaining({ source: "owner_direct_cancel", cancel_reason: reason }),
    })
  );
  // admin: same reason, requester = store
  const admin = await loadAdminStoreOrderDetail(w.sb, "o1");
  if (!admin.ok) throw new Error(admin.error);
  expect(admin.detail.order.orderStatus).toBe("cancelled");
  expect(admin.detail.cancelRequests).toEqual([
    expect.objectContaining({ requester: "owner", reason, status: "approved", previousStatus: from }),
  ]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S04-1 접수 후 재료 소진 (accepted)", () => {
  it("no reason → 400 cancel_reason_required, nothing written", async () => {
    const w = newOrder("accepted");
    expect(await cancel({ reason: "  " })).toEqual({ status: 400, body: { ok: false, error: "cancel_reason_required" } });
    expect(w.rpcCalls).toEqual([]);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });

  it("reason reaches ledger(admin) · event · buyer notice as the same string; stock restored once", async () => {
    const w = newOrder("accepted");
    const REASON = "재료가 모두 소진되었습니다";
    const r = await cancel({ reason: `  ${REASON}  `, detail_reason: "오늘 마감" });
    expect(r).toEqual({ status: 200, body: { ok: true, order_status: "cancelled", mode: "direct_cancel" } });
    await expectReasonEverywhere(w, REASON, "accepted");
    expect(w.cancelRequests[0].detail_reason).toBe("오늘 마감");
    expect(stock.restoreStockForOrder).toHaveBeenCalledTimes(1);
  });

  it("admin-locked order → 409 order_admin_locked, nothing written", async () => {
    const w = newOrder("accepted", { admin_locked: true });
    expect(await cancel({ reason: "재료 소진" })).toEqual({ status: 409, body: { ok: false, error: "order_admin_locked" } });
    expect(w.rpcCalls).toEqual([]);
  });
});

describe("S04-2 조리 후 (preparing)", () => {
  it("same reason contract after cooking; TS writes no fee/Cash rows (review flag is the trigger's)", async () => {
    const w = newOrder("preparing");
    const REASON = "주방 설비 고장";
    const r = await cancel({ reason: REASON });
    expect(r.status).toBe(200);
    await expectReasonEverywhere(w, REASON, "preparing");
  });

  it("status moved between the owner's read and the atomic call (CAS lost) → 409, no notice, no stock restore", async () => {
    const w = newOrder("preparing");
    w.rpcOverride.set("store_order_owner_cancel_atomic", { data: { ok: false, error: "transition_conflict" }, error: null });
    expect(await cancel({ reason: "재료 소진" })).toEqual({ status: 409, body: { ok: false, error: "transition_conflict" } });
    expect(w.order.order_status).toBe("preparing");
    expect(w.cancelRequests).toEqual([]);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
    expect(stock.restoreStockForOrder).not.toHaveBeenCalled();
  });

  it("courier already picked up → 400 cancel_not_allowed_for_status before any write", async () => {
    const w = newOrder("delivering");
    w.delivery = { order_id: "o1", delivery_status: "pickup_in_progress" };
    expect(await cancel({ reason: "재료 소진" })).toEqual({ status: 400, body: { ok: false, error: "cancel_not_allowed_for_status" } });
    expect(w.rpcCalls).toEqual([]);
  });

  it("the plain status PATCH cannot cancel after cooking (reasoned route required)", async () => {
    const w = newOrder("preparing");
    const res = await ownerPatch(
      new Request("https://x.test/api/me/stores/s1/orders/o1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_status: "cancelled" }),
      }) as never,
      { params: Promise.resolve({ storeId: "s1", orderId: "o1" }) }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("owner_cancel_route_required");
    expect(w.order.order_status).toBe("preparing");
    expect(w.rpcCalls).toEqual([]);
  });

  // 결함 2 (문서 J): pending·accepted 도 PATCH 로는 원장 없는 취소 불가 — 직접 호출해도 우회 없음.
  it.each(["pending", "accepted"])(
    "%s → plain PATCH cancelled is refused (400 owner_cancel_route_required, no RPC, no write)",
    async (from) => {
      const w = newOrder(from);
      const res = await ownerPatch(
        new Request("https://x.test/api/me/stores/s1/orders/o1", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order_status: "cancelled" }),
        }) as never,
        { params: Promise.resolve({ storeId: "s1", orderId: "o1" }) }
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("owner_cancel_route_required");
      expect(w.order.order_status).toBe(from);
      expect(w.rpcCalls).toEqual([]);
    }
  );

  it.each(["pending", "accepted"])("%s → reasoned cancel goes through the owner atomic RPC with the reason", async (from) => {
    const w = newOrder(from);
    const r = await cancel({ reason: "재료 소진" });
    expect(r.status).toBe(200);
    expect(w.rpcCalls.map((c: { name: string }) => c.name)).toContain("store_order_owner_cancel_atomic");
    const call = w.rpcCalls.find((c: { name: string }) => c.name === "store_order_owner_cancel_atomic") as {
      args: Record<string, unknown>;
    };
    expect(call.args.p_reason).toBe("재료 소진");
    expect(call.args.p_expected_status).toBe(from);
    expect(w.rpcCalls.map((c: { name: string }) => c.name)).not.toContain("store_order_cancel_direct_atomic");
  });
});
