/**
 * G-1 stage 1 (4-E / 4-F / 4-H) — applyStoreOrderStatusTransition contracts:
 * ORD-06 ledger RPCs · ORD-09 owner cancel reason · NTF-02 SYSTEM notice matrix · NTF-03 accept ETA ·
 * NTF-04 snapshot row purge before responding · NTF-05 idempotent refund · DLV-02 delivery_sync + close
 * open delivery row on cancel/refund · stage 2-C (FIN-05 / ADS-21 / GFT-05 / FIN-06) cancel/refund money side
 * effects inside the DB functions.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => ({
  notifyBuyerStoreOrderAutoCompleted: vi.fn(async () => undefined),
  notifyBuyerStoreOrderOwnerStatus: vi.fn(async () => undefined),
  notifyStoreOwnerAcceptTimeoutCancelled: vi.fn(async () => undefined),
  notifyBuyerStoreRefundApproved: vi.fn(async () => undefined),
  notifyBuyerStoreRefundRejected: vi.fn(async () => undefined),
  notifyStoreOwnerBuyerCancelled: vi.fn(async () => undefined),
  notifyStoreOwnerRefundRequested: vi.fn(async () => undefined),
}));
const events = vi.hoisted(() => ({
  createStoreOrderEvent: vi.fn(async () => ({ ok: true, inserted: true, row: { id: "ev-x" } })),
  createStoreOrderStatusEvent: vi.fn(async () => ({ ok: true, inserted: true, row: { id: "ev-1" } })),
}));
const order = vi.hoisted(() => ({ calls: [] as string[] }));
const snap = vi.hoisted(() => ({
  purgeStoreOrderDetailSnapshotRows: vi.fn(async () => {
    order.calls.push("purge");
  }),
  invalidateStoreOrderDetailSnapshot: vi.fn(() => {
    order.calls.push("invalidate");
  }),
}));
const stock = vi.hoisted(() => ({ restoreStockForOrder: vi.fn(async () => ({ ok: true })) }));
const coin = vi.hoisted(() => ({ reverseCoinCreditsForOrder: vi.fn(async () => ({ ok: true })) }));

vi.mock("@/lib/notifications/notify-store-commerce", () => notify);
vi.mock("@/lib/stores/store-order-events", () => events);
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => snap);
vi.mock("@/lib/stores/restore-order-stock", () => stock);
vi.mock("@/lib/currency/coin-reversal-writer", () => coin);
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/community-messenger/store-order-chat-service", () => ({
  appendStoreOrderMessengerStatusTransition: vi.fn(async () => undefined),
  syncStoreOrderMessengerRoomContextMeta: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({ markOrderNotificationsRead: vi.fn(async () => undefined) }));
vi.mock("@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache", () => ({
  invalidateBuyerStoreOrdersListSnapshot: vi.fn(),
}));
const legacy = vi.hoisted(() => ({
  cancelScheduledSettlementForOrder: vi.fn(async () => undefined),
  adjustStoreSettlementOnRefund: vi.fn(async () => undefined),
}));
vi.mock("@/lib/stores/cancel-store-settlement", () => ({ cancelScheduledSettlementForOrder: legacy.cancelScheduledSettlementForOrder }));
vi.mock("@/lib/stores/adjust-store-settlement-on-refund", () => ({ adjustStoreSettlementOnRefund: legacy.adjustStoreSettlementOnRefund }));
vi.mock("@/lib/stores/ensure-store-settlement", () => ({
  ensureStoreSettlementForCompletedOrder: vi.fn(async () => undefined),
  LEGACY_STORE_SETTLEMENT_WRITER_ENABLED: false,
}));
vi.mock("@/lib/stores/load-commerce-settings", () => ({ loadCommerceSettings: vi.fn(async () => ({ autoCompleteDays: 3 })) }));
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => ({
  recognizeOrderCurrencyOnCompleted: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/discovery/store-order-popularity-projection", () => ({
  applyStoreOrderPopularityProjectionOnCompleted: vi.fn(async () => undefined),
}));

import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { allowedOrderTransitionsForActor } from "@/lib/stores/order-status-transitions";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

type Write = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };

function fakeSb(
  orderRow: Record<string, unknown>,
  rpcResults: Record<string, { data: unknown; error: { message: string } | null }> = {}
) {
  const writes: Write[] = [];
  const rpc = vi.fn(async (name: string) => {
    order.calls.push(`rpc:${name}`);
    return rpcResults[name] ?? { data: { ok: true }, error: null };
  });
  const sb = {
    rpc,
    from(table: string) {
      const w: Write = { table, op: "select", filters: [] };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          w.filters.push(["eq", k, v]);
          return chain;
        },
        in: (k: string, v: unknown) => {
          w.filters.push(["in", k, v]);
          return chain;
        },
        update: (p: unknown) => {
          w.op = "update";
          w.payload = p;
          writes.push(w);
          return chain;
        },
        delete: () => {
          w.op = "delete";
          writes.push(w);
          return chain;
        },
        maybeSingle: async () => {
          if (table === "store_orders" && w.op === "select") return { data: orderRow, error: null };
          if (table === "store_orders" && w.op === "update") return { data: { id: orderRow.id }, error: null };
          if (table === "stores") return { data: { owner_user_id: "owner-1" }, error: null };
          return { data: null, error: null };
        },
        then: (res: (v: { data: null; error: null }) => unknown) => res({ data: null, error: null }),
      };
      return chain;
    },
  } as never;
  return { sb, rpc, writes };
}

const baseOrder = (status: string, extra: Record<string, unknown> = {}) => ({
  id: "o1",
  store_id: "s1",
  order_status: status,
  fulfillment_type: "local_delivery",
  payment_status: "paid",
  payment_amount: 100,
  auto_complete_at: null,
  buyer_user_id: "b1",
  order_no: "N1",
  created_at: "2026-10-21T00:00:00Z",
  ...extra,
});

const ownerAudit = { actor_type: "user" as const, actor_id: "owner-1", action: "t" };

beforeEach(() => {
  vi.clearAllMocks();
  order.calls.length = 0;
});

describe("ORD-06 owner direct cancel → store_order_owner_cancel_atomic (ledger + status one TX)", () => {
  it("calls the RPC with the decided status and writes no TS ledger / order row", async () => {
    const { sb, rpc, writes } = fakeSb(baseOrder("preparing"));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      expectedCurrentStatus: "preparing",
      ownerDirectCancel: { reason: "  재료 소진 ", detail: "오늘 마감" },
      audit: ownerAudit,
    });
    expect(r).toEqual({ ok: true, order_status: "cancelled", previous: "preparing" });
    expect(rpc).toHaveBeenCalledWith("store_order_owner_cancel_atomic", {
      p_order_id: "o1",
      p_store_id: "s1",
      p_owner_user_id: "owner-1",
      p_expected_status: "preparing",
      p_reason: "재료 소진",
      p_detail: "오늘 마감",
    });
    expect(writes.some((w) => w.table === "store_order_cancel_requests")).toBe(false);
    expect(writes.some((w) => w.table === "store_orders" && w.op === "update")).toBe(false);
  });

  it.each([
    ["picked_up", "cancel_not_allowed_for_status", 400],
    ["transition_conflict", "transition_conflict", 409],
    ["order_admin_locked", "order_admin_locked", 409],
    ["forbidden", "forbidden", 403],
  ])("RPC %s → %s (%i), no side effects", async (code, error, httpStatus) => {
    const { sb } = fakeSb(baseOrder("preparing"), {
      store_order_owner_cancel_atomic: { data: { ok: false, error: code }, error: null },
    });
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      ownerDirectCancel: { reason: "r" },
      audit: ownerAudit,
    });
    expect(r).toEqual({ ok: false, error, httpStatus });
    expect(stock.restoreStockForOrder).not.toHaveBeenCalled();
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });

  it("commission charge refused inside the RPC → existing 409 mapping (status rolled back in DB)", async () => {
    const { sb } = fakeSb(baseOrder("cancel_requested"), {
      store_order_cancel_request_decide_atomic: {
        data: null,
        error: { message: "store_commission_charge_failed:policy" },
      },
    });
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "preparing",
      actor: "OWNER",
      restoreToStatus: "preparing",
      cancelRequestDecision: { decision: "reject", actorRole: "owner", reason: "진행" },
      audit: ownerAudit,
    });
    expect(r).toMatchObject({ ok: false, httpStatus: 409 });
  });

  it("function not deployed → 503, no fallback write", async () => {
    const { sb, writes } = fakeSb(baseOrder("accepted"), {
      store_order_owner_cancel_atomic: {
        data: null,
        error: { message: "Could not find the function public.store_order_owner_cancel_atomic in the schema cache" },
      },
    });
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      ownerDirectCancel: { reason: "r" },
      audit: ownerAudit,
    });
    expect(r).toEqual({ ok: false, error: "store_order_owner_cancel_atomic_missing", httpStatus: 503 });
    expect(writes).toEqual([]);
  });

  it("blank reason → 400 before any write; owner cancel only for OWNER → cancelled", async () => {
    const { sb, rpc } = fakeSb(baseOrder("accepted"));
    expect(
      await applyStoreOrderStatusTransition(sb, {
        orderId: "o1",
        nextStatus: "cancelled",
        actor: "OWNER",
        ownerDirectCancel: { reason: "  " },
        audit: ownerAudit,
      })
    ).toEqual({ ok: false, error: "cancel_reason_required", httpStatus: 400 });
    expect(
      await applyStoreOrderStatusTransition(sb, {
        orderId: "o1",
        nextStatus: "cancelled",
        actor: "ADMIN",
        ownerDirectCancel: { reason: "x" },
        audit: { actor_type: "admin", actor_id: "a1", action: "t" },
      })
    ).toEqual({ ok: false, error: "invalid_transition", httpStatus: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("ORD-06 cancel request decision → store_order_cancel_request_decide_atomic", () => {
  it("admin approve sends role/decision; reject sends the restore status + auto-complete for arrived", async () => {
    const a = fakeSb(baseOrder("cancel_requested"));
    await applyStoreOrderStatusTransition(a.sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "ADMIN",
      expectedCurrentStatus: "cancel_requested",
      cancelRequestDecision: { decision: "approve", actorRole: "admin" },
      audit: { actor_type: "admin", actor_id: "admin-1", action: "t" },
    });
    expect(a.rpc).toHaveBeenCalledWith(
      "store_order_cancel_request_decide_atomic",
      expect.objectContaining({
        p_actor_user_id: "admin-1",
        p_actor_role: "admin",
        p_expected_status: "cancel_requested",
        p_decision: "approve",
        p_restore_status: null,
        p_auto_complete_at: null,
      })
    );

    const b = fakeSb(baseOrder("cancel_requested"));
    const r = await applyStoreOrderStatusTransition(b.sb, {
      orderId: "o1",
      nextStatus: "arrived",
      actor: "OWNER",
      restoreToStatus: "arrived",
      cancelRequestDecision: { decision: "reject", actorRole: "owner", reason: "이미 도착" },
      eventMetadata: { source: "owner_cancel_request_reject", rejected_reason: "이미 도착" },
      audit: ownerAudit,
    });
    expect(r.ok).toBe(true);
    const args = (b.rpc.mock.calls as unknown[][]).find((c) => c[0] === "store_order_cancel_request_decide_atomic")?.[1] as Record<string, unknown>;
    expect(args).toMatchObject({ p_decision: "reject", p_restore_status: "arrived", p_reason: "이미 도착", p_actor_role: "owner" });
    expect(typeof args.p_auto_complete_at).toBe("string");
  });

  it("decision on a non-cancel_requested order → 400 before the RPC", async () => {
    const { sb, rpc } = fakeSb(baseOrder("preparing"));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      cancelRequestDecision: { decision: "approve", actorRole: "owner" },
      audit: ownerAudit,
    });
    expect(r).toEqual({ ok: false, error: "invalid_transition", httpStatus: 400 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["cancel_request_not_found", "cancel_request_not_found", 404],
    ["restore_status_mismatch", "cancel_restore_status_unknown", 409],
  ])("RPC %s → %s", async (code, error, httpStatus) => {
    const { sb } = fakeSb(baseOrder("cancel_requested"), {
      store_order_cancel_request_decide_atomic: { data: { ok: false, error: code }, error: null },
    });
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      cancelRequestDecision: { decision: "approve", actorRole: "owner" },
      audit: ownerAudit,
    });
    expect(r).toEqual({ ok: false, error, httpStatus });
  });

  it("SQL allowed statuses match the TS state machine (contract)", () => {
    const sql = read("supabase/migrations/20270602120000_store_order_cancel_ledger_atomic.sql");
    const ownerFrom = ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived"];
    for (const s of ownerFrom) {
      expect(allowedOrderTransitionsForActor("OWNER", s, "local_delivery")).toContain("cancelled");
    }
    expect(sql).toContain(`NOT IN ('${ownerFrom.join("', '")}')`);
    expect(sql).toContain("v_to NOT IN ('accepted', 'preparing', 'ready_for_pickup', 'delivering', 'arrived')");
    expect(sql).toContain("v_delivery_status IN ('pickup_in_progress', 'delivering', 'delivered', 'delivery_failed')");
    // ASCII-only function bodies (prod apply tool)
    for (const body of sql.split("$fn$").filter((_, i) => i % 2 === 1)) {
      expect(/^[\x00-\x7F]*$/.test(body)).toBe(true);
    }
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.store_order_owner_cancel_atomic[\s\S]*?TO service_role;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.store_order_cancel_request_decide_atomic[\s\S]*?FROM PUBLIC, anon, authenticated;/);
  });
});

describe("ORD-09 owner direct cancel reason reaches the buyer", () => {
  it("notice carries the reason (verbatim, trimmed ≤500)", async () => {
    const { sb } = fakeSb(baseOrder("accepted"));
    await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      ownerDirectCancel: { reason: "재료가 모두 소진되었습니다" },
      eventMessage: "재료가 모두 소진되었습니다",
      eventMetadata: { source: "owner_direct_cancel", cancel_reason: "재료가 모두 소진되었습니다" },
      audit: ownerAudit,
    });
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextStatus: "cancelled", actor: "OWNER", cancelReason: "재료가 모두 소진되었습니다" })
    );
    expect(events.createStoreOrderStatusEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: "재료가 모두 소진되었습니다",
        metadata: expect.objectContaining({ source: "owner_direct_cancel", cancel_reason: "재료가 모두 소진되었습니다" }),
      })
    );
  });

  it("owner cancel route sends the reason through the atomic path and no longer inserts the ledger itself", () => {
    const src = read("app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts");
    expect(src).toContain("ownerDirectCancel: { reason, detail: detailReason || null }");
    expect(src).toContain('source: "owner_direct_cancel", cancel_reason: reason');
    expect(src).not.toContain('from("store_order_cancel_requests")');
  });
});

describe("NTF-02 / NTF-03 buyer notice matrix", () => {
  it("SYSTEM auto_complete → auto-complete notice (not 'the store completed')", async () => {
    const { sb } = fakeSb(baseOrder("arrived", { auto_complete_at: "2020-01-01T00:00:00Z" }));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "completed",
      actor: "SYSTEM",
      requireAutoCompleteDue: true,
      systemPurpose: "auto_complete",
      audit: { actor_type: "system", actor_id: null, action: "t" },
    });
    expect(r.ok).toBe(true);
    expect(notify.notifyBuyerStoreOrderAutoCompleted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ buyerUserId: "b1", orderId: "o1", storeOrderEventId: "ev-1" })
    );
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });

  it("SYSTEM payment_failure → no status notice (payment-failed notice is the single one)", async () => {
    const { sb } = fakeSb(baseOrder("pending", { payment_status: "pending" }));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "SYSTEM",
      systemPurpose: "payment_failure",
      audit: { actor_type: "system", actor_id: null, action: "t" },
    });
    expect(r.ok).toBe(true);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
    expect(notify.notifyBuyerStoreOrderAutoCompleted).not.toHaveBeenCalled();
  });

  it("SYSTEM accept_timeout → buyer timeout copy (purpose passed) + owner notice kept", async () => {
    const { sb } = fakeSb(baseOrder("pending"));
    await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "SYSTEM",
      systemPurpose: "accept_timeout",
      audit: { actor_type: "system", actor_id: null, action: "t" },
    });
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actor: "SYSTEM", systemPurpose: "accept_timeout", nextStatus: "cancelled" })
    );
    expect(notify.notifyStoreOwnerAcceptTimeoutCancelled).toHaveBeenCalled();
  });

  it("SYSTEM delivery_sync delivering → arrived: arrival copy purpose, auto-complete timer starts", async () => {
    const { sb, writes } = fakeSb(baseOrder("delivering"));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "arrived",
      actor: "SYSTEM",
      systemPurpose: "delivery_sync",
      expectedCurrentStatus: "delivering",
      audit: { actor_type: "system", actor_id: null, action: "t" },
    });
    expect(r).toEqual({ ok: true, order_status: "arrived", previous: "delivering" });
    const upd = writes.find((w) => w.table === "store_orders" && w.op === "update");
    expect((upd?.payload as Record<string, unknown>).auto_complete_at).toEqual(expect.any(String));
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actor: "SYSTEM", systemPurpose: "delivery_sync", nextStatus: "arrived" })
    );
  });

  it("OWNER accept → notice carries the prep ETA minutes (NTF-03)", async () => {
    const { sb } = fakeSb(baseOrder("pending"));
    await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "accepted",
      actor: "OWNER",
      ownerAcceptPrepMinutes: 25,
      audit: ownerAudit,
    });
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextStatus: "accepted", estimatedPrepMinutes: 25 })
    );
  });

  it("duplicate status event (not inserted) → no second notice", async () => {
    events.createStoreOrderStatusEvent.mockResolvedValueOnce({ ok: true, inserted: false, row: { id: "ev-1" } } as never);
    const { sb } = fakeSb(baseOrder("accepted"));
    await applyStoreOrderStatusTransition(sb, { orderId: "o1", nextStatus: "preparing", actor: "OWNER", audit: ownerAudit });
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });

  it("auto-complete cron route still has no notification call (notice lives in the transition)", () => {
    expect(read("app/api/cron/store-orders-auto-complete/route.ts")).not.toContain("notifyBuyerStoreOrderAutoCompleted");
  });
});

describe("DLV-02 delivery_sync edge + close open delivery row", () => {
  it("delivery_sync only delivering → arrived on delivery fulfillment", () => {
    const o = { systemPurpose: "delivery_sync" as const };
    expect(allowedOrderTransitionsForActor("SYSTEM", "delivering", "local_delivery", o)).toEqual(["arrived"]);
    expect(allowedOrderTransitionsForActor("SYSTEM", "ready_for_pickup", "local_delivery", o)).toEqual([]);
    expect(allowedOrderTransitionsForActor("SYSTEM", "delivering", "pickup", o)).toEqual([]);
    expect(allowedOrderTransitionsForActor("SYSTEM", "arrived", "local_delivery", o)).toEqual([]);
  });

  it("order → cancelled: the cancel DB function closes the delivery row (no TS delivery write)", async () => {
    const { sb, rpc, writes } = fakeSb(baseOrder("accepted"));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: "a1", action: "t" },
    });
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("store_order_cancel_direct_atomic", expect.objectContaining({ p_order_id: "o1" }));
    expect(writes.some((w) => w.table === "store_order_deliveries")).toBe(false);
    expect(read("supabase/migrations/20270603130000_stage2_2c_cancel_refund_money_atomic.sql")).toMatch(
      /SET delivery_status = 'delivery_failed',\s+failure_note = 'order_cancelled'[\s\S]*?delivery_status IN \('waiting_rider', 'rider_assigned', 'pickup_in_progress', 'delivering'\)/
    );
  });

  it("order → refunded closes an open delivery row (delivery_failed)", async () => {
    const { sb, writes } = fakeSb(baseOrder("refund_requested"), {
      gift_certificate_refund_order_atomic: { data: { ok: true }, error: null },
    });
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "refunded",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: "a1", action: "t" },
    });
    expect(r.ok).toBe(true);
    const close = writes.find((w) => w.table === "store_order_deliveries" && w.op === "update");
    expect(close?.payload).toMatchObject({ delivery_status: "delivery_failed", failure_note: "order_refunded" });
    expect(close?.filters).toEqual(
      expect.arrayContaining([
        ["eq", "order_id", "o1"],
        ["in", "delivery_status", ["waiting_rider", "rider_assigned", "pickup_in_progress", "delivering"]],
      ])
    );
  });

  it("non-closing transitions leave delivery rows alone", async () => {
    const { sb, writes } = fakeSb(baseOrder("accepted"));
    await applyStoreOrderStatusTransition(sb, { orderId: "o1", nextStatus: "preparing", actor: "OWNER", audit: ownerAudit });
    expect(writes.some((w) => w.table === "store_order_deliveries")).toBe(false);
  });
});

describe("NTF-05 concurrent refund approval → no repeated side effects", () => {
  it("RPC idempotent:true → ok idempotent, no stock/coin/coupon/notice", async () => {
    const { sb, rpc } = fakeSb(baseOrder("refund_requested"), {
      gift_certificate_refund_order_atomic: { data: { ok: true, idempotent: true }, error: null },
    });
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "refunded",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: "a1", action: "t" },
    });
    expect(r).toEqual({ ok: true, order_status: "refunded", previous: "refund_requested", idempotent: true });
    expect(stock.restoreStockForOrder).not.toHaveBeenCalled();
    expect(coin.reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("restore_store_coupon_entitlement");
    expect(notify.notifyBuyerStoreRefundApproved).not.toHaveBeenCalled();
  });

  it("first approval still runs the TS side effects (stock restore); money reversals are in the RPC", async () => {
    const { sb, rpc } = fakeSb(baseOrder("refund_requested"), {
      gift_certificate_refund_order_atomic: { data: { ok: true }, error: null },
    });
    await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "refunded",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: "a1", action: "t" },
    });
    expect(stock.restoreStockForOrder).toHaveBeenCalled();
    expect(notify.notifyBuyerStoreRefundApproved).toHaveBeenCalled();
    expect(coin.reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("restore_store_coupon_entitlement");
  });
});

describe("stage 2-C FIN-05 / ADS-21 / GFT-05 / FIN-06 — cancel/refund money side effects in the DB transaction", () => {
  const sys = { actor_type: "system" as const, actor_id: null, action: "t" };
  const tsMoneyRpcs = ["restore_store_coupon_entitlement", "gift_certificate_cancel_order_restore", "reverse_coin_credits_for_order"];

  it.each([
    ["CUSTOMER", "pending", undefined, "cancelled"],
    ["ADMIN", "preparing", undefined, "cancelled"],
    ["SYSTEM", "pending", "accept_timeout", "cancelled"],
    ["SYSTEM", "pending", "payment_failure", "failed"],
  ] as const)("%s cancel from %s (%s) → store_order_cancel_direct_atomic (payment %s), no TS money RPC / order write", async (actor, from, purpose, pay) => {
    const { sb, rpc, writes } = fakeSb(baseOrder(from, { payment_status: from === "pending" ? "pending" : "paid" }));
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor,
      ...(purpose ? { systemPurpose: purpose } : {}),
      audit: actor === "SYSTEM" ? sys : { actor_type: actor === "ADMIN" ? "admin" : "user", actor_id: "u1", action: "t" },
    });
    expect(r).toEqual({ ok: true, order_status: "cancelled", previous: from });
    expect(rpc).toHaveBeenCalledWith("store_order_cancel_direct_atomic", {
      p_order_id: "o1",
      p_expected_status: from,
      p_payment_status: pay,
      p_actor: actor,
    });
    for (const name of tsMoneyRpcs) expect(rpc.mock.calls.map((c) => c[0])).not.toContain(name);
    expect(writes.some((w) => w.table === "store_orders" && w.op === "update")).toBe(false);
    expect(stock.restoreStockForOrder).toHaveBeenCalled();
    expect(legacy.cancelScheduledSettlementForOrder).not.toHaveBeenCalled();
  });

  it("owner direct cancel / request approve → side effects stay in the ledger RPC (no TS money RPC)", async () => {
    const a = fakeSb(baseOrder("preparing"));
    await applyStoreOrderStatusTransition(a.sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      ownerDirectCancel: { reason: "r" },
      audit: ownerAudit,
    });
    const b = fakeSb(baseOrder("cancel_requested"));
    await applyStoreOrderStatusTransition(b.sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      cancelRequestDecision: { decision: "approve", actorRole: "owner" },
      audit: ownerAudit,
    });
    for (const x of [a, b]) {
      const names = x.rpc.mock.calls.map((c) => c[0]);
      for (const name of [...tsMoneyRpcs, "store_order_cancel_direct_atomic"]) expect(names).not.toContain(name);
    }
    expect(legacy.cancelScheduledSettlementForOrder).not.toHaveBeenCalled();
  });

  it("direct cancel RPC errors keep the old HTTP mapping (conflict 409 · missing 503 · no side effects)", async () => {
    const c = fakeSb(baseOrder("pending"), {
      store_order_cancel_direct_atomic: { data: { ok: false, error: "transition_conflict" }, error: null },
    });
    expect(
      await applyStoreOrderStatusTransition(c.sb, { orderId: "o1", nextStatus: "cancelled", actor: "CUSTOMER", audit: ownerAudit })
    ).toEqual({ ok: false, error: "transition_conflict", httpStatus: 409 });
    const m = fakeSb(baseOrder("pending"), {
      store_order_cancel_direct_atomic: {
        data: null,
        error: { message: "Could not find the function public.store_order_cancel_direct_atomic in the schema cache" },
      },
    });
    expect(
      await applyStoreOrderStatusTransition(m.sb, { orderId: "o1", nextStatus: "cancelled", actor: "CUSTOMER", audit: ownerAudit })
    ).toEqual({ ok: false, error: "store_order_cancel_direct_atomic_missing", httpStatus: 503 });
    expect(stock.restoreStockForOrder).not.toHaveBeenCalled();
    expect(notify.notifyStoreOwnerBuyerCancelled).not.toHaveBeenCalled();
  });

  it("GFT-05: an expired gift restored by the cancel is flagged in the status event (restored_expired)", async () => {
    const { sb } = fakeSb(baseOrder("pending"), {
      store_order_cancel_direct_atomic: {
        data: { ok: true, side_effects: { ok: true, restored_expired: true } },
        error: null,
      },
    });
    await applyStoreOrderStatusTransition(sb, { orderId: "o1", nextStatus: "cancelled", actor: "CUSTOMER", audit: ownerAudit });
    expect(events.createStoreOrderStatusEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ restored_expired: true }) })
    );
    const plain = fakeSb(baseOrder("accepted"));
    await applyStoreOrderStatusTransition(plain.sb, {
      orderId: "o1",
      nextStatus: "cancelled",
      actor: "OWNER",
      ownerDirectCancel: { reason: "r" },
      audit: ownerAudit,
    });
    const last = events.createStoreOrderStatusEvent.mock.calls.at(-1) as unknown as [unknown, { metadata: Record<string, unknown> }];
    expect(last[1].metadata.restored_expired).toBeUndefined();
  });

  it("FIN-06: refund / cancel never touch the legacy store_settlements snapshot", async () => {
    const { sb, writes } = fakeSb(baseOrder("refund_requested"), {
      gift_certificate_refund_order_atomic: { data: { ok: true }, error: null },
    });
    await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "refunded",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: "a1", action: "t" },
    });
    expect(legacy.adjustStoreSettlementOnRefund).not.toHaveBeenCalled();
    expect(legacy.cancelScheduledSettlementForOrder).not.toHaveBeenCalled();
    expect(writes.some((w) => w.table === "store_settlements")).toBe(false);
  });

  it("migration: every cancel function runs the side effects; refund RPC reverses Coin + coupon in its TX", () => {
    const sql = read("supabase/migrations/20270603130000_stage2_2c_cancel_refund_money_atomic.sql");
    const fnBody = (name: string) => {
      const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
      return sql.slice(start, sql.indexOf("$function$;", start));
    };
    for (const fn of ["store_order_owner_cancel_atomic", "store_order_cancel_request_decide_atomic", "store_order_cancel_direct_atomic"]) {
      expect(fnBody(fn)).toContain("v_side := public.store_order_apply_cancel_side_effects(p_order_id);");
    }
    const side = fnBody("store_order_apply_cancel_side_effects");
    expect(side).toContain("public.restore_store_coupon_entitlement(p_order_id, false)");
    expect(side).toContain("public.gift_certificate_cancel_order_restore(p_order_id)");
    expect(side).toContain("'restored_expired'");
    const refund = fnBody("gift_certificate_refund_order_atomic");
    expect(refund).toContain("public.reverse_coin_credits_for_order(p_order_id, 'coin_reversal:order:' || p_order_id::text, 'order_refund')");
    expect(refund).toContain("public.restore_store_coupon_entitlement(p_order_id, true)");
    expect(refund.indexOf("SET order_status = 'refunded'")).toBeLessThan(refund.indexOf("reverse_coin_credits_for_order"));
    const restore = fnBody("restore_store_coupon_entitlement");
    expect(restore).not.toMatch(/DELETE FROM public\.store_coupon_redemptions/);
    expect(restore).toContain("SET status = 'restored'");
    expect(restore).toContain("IF v_campaign.lifecycle_state = 'active' THEN");
    expect(sql).toMatch(/store_coupon_redemptions_buyer_campaign_active_uidx[\s\S]*?WHERE reversed_at IS NULL;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.store_order_apply_cancel_side_effects\(uuid\) FROM PUBLIC, anon, authenticated, service_role;/);
    for (const body of sql.split("$function$").filter((_, i) => i % 2 === 1)) {
      expect(/^[\x00-\x7F]*$/.test(body)).toBe(true);
    }
  });
});

describe("NTF-04 detail snapshot rows are purged before the transition responds", () => {
  it("purge awaited, then in-memory invalidation", async () => {
    const { sb } = fakeSb(baseOrder("accepted"));
    await applyStoreOrderStatusTransition(sb, { orderId: "o1", nextStatus: "preparing", actor: "OWNER", audit: ownerAudit });
    expect(snap.purgeStoreOrderDetailSnapshotRows).toHaveBeenCalledWith(expect.anything(), "o1");
    expect(order.calls.indexOf("purge")).toBeLessThan(order.calls.indexOf("invalidate"));
  });

  it("conflict → no purge (nothing changed)", async () => {
    const { sb } = fakeSb(baseOrder("preparing"));
    await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "ready_for_pickup",
      actor: "OWNER",
      expectedCurrentStatus: "accepted",
      audit: ownerAudit,
    });
    expect(snap.purgeStoreOrderDetailSnapshotRows).not.toHaveBeenCalled();
  });
});
