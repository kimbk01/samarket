import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apply = vi.hoisted(() => ({
  applyStoreOrderStatusTransition: vi.fn(async (_sb: unknown, o: { nextStatus: string }) => ({
    ok: true as const,
    order_status: o.nextStatus,
    previous: "x",
  })),
}));
const audit = vi.hoisted(() => ({ appendAuditLog: vi.fn(async () => undefined) }));
const restore = vi.hoisted(() => ({ resolveRefundRequestRestoreStatus: vi.fn(async () => "accepted" as string | null) }));

vi.mock("@/lib/stores/apply-store-order-status-transition", () => apply);
vi.mock("@/lib/audit/append-audit-log", () => audit);
vi.mock("@/lib/stores/admin-store-order-intervention", () => restore);

import { runOwnerStoreOrderDecision } from "@/lib/stores/owner-store-order-decision";
import { ownerStoreOrderDecisionActions } from "@/lib/stores/owner-store-order-decision-contract";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

type Calls = { updates: { table: string; patch: unknown; eqs: [string, unknown][] }[] };

function fakeSb(rows: Record<string, unknown>, calls: Calls) {
  return {
    from(table: string) {
      const eqs: [string, unknown][] = [];
      let patch: unknown = null;
      const chain = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          eqs.push([k, v]);
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        update: (p: unknown) => {
          patch = p;
          calls.updates.push({ table, patch, eqs });
          return chain;
        },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (res: (v: { error: null }) => unknown) => res({ error: null }),
      };
      return chain;
    },
  } as never;
}

const base = { storeId: "s1", orderId: "o1", ownerUserId: "owner-1" };

beforeEach(() => {
  apply.applyStoreOrderStatusTransition.mockClear();
  audit.appendAuditLog.mockClear();
  restore.resolveRefundRequestRestoreStatus.mockClear();
});

describe("owner decision service", () => {
  it("actions only for request statuses", () => {
    expect(ownerStoreOrderDecisionActions("cancel_requested")).toEqual(["cancel_request_approve", "cancel_request_reject"]);
    expect(ownerStoreOrderDecisionActions("refund_requested")).toEqual(["refund_approve", "refund_reject"]);
    expect(ownerStoreOrderDecisionActions("preparing")).toEqual([]);
  });

  it("admin-locked order → 409, no write", async () => {
    const calls: Calls = { updates: [] };
    const r = await runOwnerStoreOrderDecision(
      fakeSb({ store_orders: { id: "o1", store_id: "s1", order_status: "cancel_requested", admin_locked: true } }, calls),
      { ...base, action: "cancel_request_approve", reason: "", expectedStatus: "cancel_requested" }
    );
    expect(r).toMatchObject({ ok: false, error: "order_admin_locked", httpStatus: 409 });
    expect(apply.applyStoreOrderStatusTransition).not.toHaveBeenCalled();
  });

  it("status changed since the owner looked → 409 status_changed", async () => {
    const r = await runOwnerStoreOrderDecision(
      fakeSb({ store_orders: { id: "o1", store_id: "s1", order_status: "cancelled" } }, { updates: [] }),
      { ...base, action: "cancel_request_approve", reason: "", expectedStatus: "cancel_requested" }
    );
    expect(r).toMatchObject({ ok: false, error: "status_changed", httpStatus: 409, currentStatus: "cancelled" });
    expect(apply.applyStoreOrderStatusTransition).not.toHaveBeenCalled();
  });

  it("reject without a reason → 400", async () => {
    const r = await runOwnerStoreOrderDecision(
      fakeSb({ store_orders: { id: "o1", store_id: "s1", order_status: "cancel_requested" } }, { updates: [] }),
      { ...base, action: "cancel_request_reject", reason: " ", expectedStatus: "cancel_requested" }
    );
    expect(r).toMatchObject({ ok: false, error: "reason_required", httpStatus: 400 });
  });

  it("approve cancel request → OWNER cancelled, ledger closed only while pending, audit", async () => {
    const calls: Calls = { updates: [] };
    const r = await runOwnerStoreOrderDecision(
      fakeSb(
        {
          store_orders: { id: "o1", store_id: "s1", order_status: "cancel_requested" },
          store_order_cancel_requests: { id: "req-1", previous_order_status: "accepted" },
        },
        calls
      ),
      { ...base, action: "cancel_request_approve", reason: "", expectedStatus: "cancel_requested" }
    );
    expect(r).toEqual({ ok: true, fromStatus: "cancel_requested", toStatus: "cancelled" });
    expect(apply.applyStoreOrderStatusTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: "o1",
        nextStatus: "cancelled",
        actor: "OWNER",
        expectedCurrentStatus: "cancel_requested",
        // ORD-06: the ledger approval is written by the decide RPC in the status transaction.
        cancelRequestDecision: { decision: "approve", actorRole: "owner" },
      })
    );
    expect(calls.updates.find((u) => u.table === "store_order_cancel_requests")).toBeUndefined();
    expect(audit.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "store_order.owner_decision", actor_id: "owner-1" })
    );
  });

  it("reject cancel request → restore the recorded previous status with the reason (buyer-visible)", async () => {
    const calls: Calls = { updates: [] };
    const r = await runOwnerStoreOrderDecision(
      fakeSb(
        {
          store_orders: { id: "o1", store_id: "s1", order_status: "cancel_requested" },
          store_order_cancel_requests: { id: "req-1", previous_order_status: "accepted" },
        },
        calls
      ),
      { ...base, action: "cancel_request_reject", reason: "이미 조리 중입니다", expectedStatus: "cancel_requested" }
    );
    expect(r).toEqual({ ok: true, fromStatus: "cancel_requested", toStatus: "accepted" });
    expect(apply.applyStoreOrderStatusTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nextStatus: "accepted",
        actor: "OWNER",
        restoreToStatus: "accepted",
        cancelRequestDecision: { decision: "reject", actorRole: "owner", reason: "이미 조리 중입니다" },
        eventMetadata: { source: "owner_cancel_request_reject", rejected_reason: "이미 조리 중입니다" },
      })
    );
    expect(calls.updates.find((u) => u.table === "store_order_cancel_requests")).toBeUndefined();
  });

  it("unknown recorded previous status → 409, no write", async () => {
    const r = await runOwnerStoreOrderDecision(
      fakeSb(
        {
          store_orders: { id: "o1", store_id: "s1", order_status: "cancel_requested" },
          store_order_cancel_requests: { id: "req-1", previous_order_status: "" },
        },
        { updates: [] }
      ),
      { ...base, action: "cancel_request_reject", reason: "사유 입력", expectedStatus: "cancel_requested" }
    );
    expect(r).toMatchObject({ ok: false, error: "cancel_restore_status_unknown", httpStatus: 409 });
    expect(apply.applyStoreOrderStatusTransition).not.toHaveBeenCalled();
  });

  it("refund reject uses the unambiguous-evidence restore; unknown → 409", async () => {
    const sb = fakeSb({ store_orders: { id: "o1", store_id: "s1", order_status: "refund_requested" } }, { updates: [] });
    const ok = await runOwnerStoreOrderDecision(sb, {
      ...base,
      action: "refund_reject",
      reason: "구매자 오요청",
      expectedStatus: "refund_requested",
    });
    expect(ok).toEqual({ ok: true, fromStatus: "refund_requested", toStatus: "accepted" });
    expect(apply.applyStoreOrderStatusTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventMetadata: { source: "owner_refund_reject", rejected_reason: "구매자 오요청" } })
    );
    restore.resolveRefundRequestRestoreStatus.mockResolvedValueOnce(null);
    const blocked = await runOwnerStoreOrderDecision(sb, {
      ...base,
      action: "refund_reject",
      reason: "구매자 오요청",
      expectedStatus: "refund_requested",
    });
    expect(blocked).toMatchObject({ ok: false, error: "refund_restore_status_unknown", httpStatus: 409 });
  });
});

describe("routes and writer wiring (static)", () => {
  it("owner PATCH cannot bypass decisions or the reasoned cancel route", () => {
    const patch = read("app/api/me/stores/[storeId]/orders/[orderId]/route.ts");
    expect(patch).toContain('nextStatus === "cancel_requested"');
    expect(patch).toContain("owner_decision_route_required");
    expect(patch).toContain("owner_cancel_route_required");
  });

  it("owner cancel route only cancels directly (no owner cancel_requested any more)", () => {
    const route = read("app/api/me/stores/[storeId]/orders/[orderId]/cancel-request/route.ts");
    expect(route).toContain('policy.kind !== "direct_cancel"');
    expect(route).not.toContain('nextStatus: "cancel_requested"');
  });

  it("buyer request: reason required, ledger row + status via the atomic writer path only", () => {
    const buyer = read("app/api/me/store-orders/[orderId]/route.ts");
    expect(buyer).toContain('nextStatus: "cancel_requested"');
    expect(buyer).toContain("cancel_reason_required");
    expect(buyer).toContain("buyerCancelRequestReason: reasonCheck.reason");
    expect(buyer).not.toContain("store_order_cancel_requests");
    expect(buyer).not.toContain("void reason");
    const sql = read("supabase/migrations/20270512120000_store_order_buyer_cancel_request_atomic.sql");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("FOR SHARE");
    expect(sql).toContain("'buyer'");
  });

  it("pickup after a committed buyer request is refused in the DB and surfaced as 409 on every pickup path", () => {
    const sql = read("supabase/migrations/20270512120000_store_order_buyer_cancel_request_atomic.sql");
    expect(sql).toContain("CREATE TRIGGER trg_store_order_deliveries_pickup_requires_dispatch");
    expect(sql).toContain("IN ('ready_for_pickup', 'delivering', 'arrived')");
    // request function locks delivery before order (same order as pickup UPDATE + trigger → no deadlock)
    expect(sql.indexOf("FROM public.store_order_deliveries")).toBeLessThan(sql.indexOf("FROM public.store_orders\n   WHERE id = p_order_id AND buyer_user_id"));
    const svc = read("lib/stores/store-order-delivery-service.ts");
    expect(svc.match(/isPickupBlockedByOrderStatus\(/g)?.length).toBe(4);
  });

  it("decide route gates ownership and requires expected_status", () => {
    const route = read("app/api/me/stores/[storeId]/orders/[orderId]/decide/route.ts");
    expect(route).toContain("getStoreIfOwner");
    expect(route).toContain("expected_status_required");
    expect(route).toContain("runOwnerStoreOrderDecision");
  });

  it("writer notifies the store of a buyer cancel request and the buyer of any request rejection", () => {
    const w = read("lib/stores/apply-store-order-status-transition.ts");
    expect(w).toContain('nextStatus === "cancel_requested" && actor === "CUSTOMER"');
    expect(w).toContain('request: "cancel" as const');
    for (const src of ["admin_refund_reject", "admin_cancel_request_reject", "owner_refund_reject", "owner_cancel_request_reject"]) {
      expect(w).toContain(`"${src}"`);
    }
    // 5단계: cancel requests are the store's decision — the writer never flags them for the admin.
    expect(w).not.toMatch(/nextStatus === "cancel_requested"\) \{[^}]*needs_admin_attention = true/);
  });

  it("decision service writes no commission or cash rows (DB trigger owns commission)", () => {
    const svc = read("lib/stores/owner-store-order-decision.ts");
    expect(svc).not.toMatch(/store_sale_fee|store_commission|business_cash/);
  });
});
