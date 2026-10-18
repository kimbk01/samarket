import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Order moved accepted → preparing after the caller read it (and recorded `accepted`). */
function sbWithOrder(orderStatus: string) {
  const update = vi.fn();
  const sb = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: (p: unknown) => {
          update(p);
          return chain;
        },
        maybeSingle: async () => ({
          data: {
            id: "o1",
            store_id: "s1",
            order_status: orderStatus,
            fulfillment_type: "delivery",
            payment_status: "paid",
            payment_amount: 100,
            auto_complete_at: null,
            buyer_user_id: "b1",
            order_no: "N1",
            created_at: "2026-10-18T00:00:00Z",
          },
          error: null,
        }),
      };
      return chain;
    },
  } as never;
  return { sb, update };
}

function sbForBuyerRequest(rpcResult: { data: unknown; error: { message: string } | null }) {
  const tables: string[] = [];
  const rpc = vi.fn(async () => rpcResult);
  const sb = {
    rpc,
    from: (table: string) => {
      tables.push(table);
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        insert: () => chain,
        delete: () => chain,
        maybeSingle: async () => ({
          data: {
            id: "o1",
            store_id: "s1",
            order_status: "preparing",
            fulfillment_type: "delivery",
            payment_status: "paid",
            payment_amount: 100,
            auto_complete_at: null,
            buyer_user_id: "b1",
            order_no: "N1",
            created_at: "2026-10-18T00:00:00Z",
          },
          error: null,
        }),
      };
      return chain;
    },
  } as never;
  return { sb, rpc, tables };
}

const buyerReq = {
  orderId: "o1",
  nextStatus: "cancel_requested",
  actor: "CUSTOMER" as const,
  expectedCurrentStatus: "preparing",
  audit: { actor_type: "user" as const, actor_id: "b1", action: "t" },
};

describe("buyer cancel request goes through store_order_buyer_cancel_request_atomic", () => {
  it("no reason → 400, no RPC", async () => {
    const { sb, rpc } = sbForBuyerRequest({ data: null, error: null });
    expect(await applyStoreOrderStatusTransition(sb, buyerReq)).toEqual({
      ok: false,
      error: "cancel_reason_required",
      httpStatus: 400,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["picked_up", "cannot_request_cancel", 400],
    ["transition_conflict", "transition_conflict", 409],
    ["cancel_request_pending", "cancel_request_pending", 409],
    ["order_admin_locked", "order_admin_locked", 409],
  ])("RPC %s → %s (%i); TS writes no ledger row and no order row", async (code, error, httpStatus) => {
    const { sb, rpc, tables } = sbForBuyerRequest({ data: { ok: false, error: code }, error: null });
    const r = await applyStoreOrderStatusTransition(sb, { ...buyerReq, buyerCancelRequestReason: "늦어요" });
    expect(r).toEqual({ ok: false, error, httpStatus });
    expect(rpc).toHaveBeenCalledWith("store_order_buyer_cancel_request_atomic", {
      p_order_id: "o1",
      p_buyer_user_id: "b1",
      p_expected_status: "preparing",
      p_reason: "늦어요",
    });
    expect(tables).toEqual(["store_orders"]);
  });

  it("function not deployed → 503 (no fallback write)", async () => {
    const { sb, tables } = sbForBuyerRequest({
      data: null,
      error: { message: "Could not find the function public.store_order_buyer_cancel_request_atomic in the schema cache" },
    });
    const r = await applyStoreOrderStatusTransition(sb, { ...buyerReq, buyerCancelRequestReason: "늦어요" });
    expect(r).toEqual({ ok: false, error: "store_order_buyer_cancel_request_atomic_missing", httpStatus: 503 });
    expect(tables).toEqual(["store_orders"]);
  });
});

describe("applyStoreOrderStatusTransition expectedCurrentStatus", () => {
  it("status changed since the caller read it → 409 transition_conflict, no write", async () => {
    const { sb, update } = sbWithOrder("preparing");
    const r = await applyStoreOrderStatusTransition(sb, {
      orderId: "o1",
      nextStatus: "cancel_requested",
      actor: "CUSTOMER",
      expectedCurrentStatus: "accepted",
      audit: { actor_type: "user", actor_id: "b1", action: "t" },
    });
    expect(r).toEqual({ ok: false, error: "transition_conflict", httpStatus: 409 });
    expect(update).not.toHaveBeenCalled();
  });

  it("phase-3 callers pass the status they decided on", () => {
    expect(read("app/api/me/store-orders/[orderId]/route.ts")).toContain("expectedCurrentStatus: status,");
    expect(read("app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts")).toContain(
      'expectedCurrentStatus: String(order.order_status ?? ""),'
    );
    const svc = read("lib/stores/owner-store-order-decision.ts");
    expect(svc.match(/expectedCurrentStatus: current,/g)?.length).toBe(4);
  });
});
