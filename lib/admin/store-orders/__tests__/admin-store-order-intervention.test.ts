import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ops = vi.hoisted(() => ({
  adminApproveStoreOrderCancelRequest: vi.fn(async () => ({ ok: true as const })),
  adminRejectStoreOrderCancelRequest: vi.fn(async () => ({ ok: true as const })),
  adminCompleteRefundStoreOrder: vi.fn(async () => ({ ok: true as const })),
  adminRejectRefundStoreOrder: vi.fn(async () => ({ ok: true as const })),
  adminForceCancelStoreOrder: vi.fn(async () => ({ ok: true as const })),
  adminSetRefundRequestedStoreOrder: vi.fn(async () => ({ ok: true as const })),
}));
const audit = vi.hoisted(() => ({ appendAuditLog: vi.fn(async () => undefined) }));

vi.mock("@/lib/stores/apply-admin-store-order-operations", () => ops);
vi.mock("@/lib/audit/append-audit-log", () => audit);

import {
  adminStoreOrderInterventionActions,
  normalizeAdminInterventionReason,
} from "@/lib/admin/store-orders/admin-store-order-intervention-contract";
import { runAdminStoreOrderIntervention } from "@/lib/stores/admin-store-order-intervention";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Minimal Supabase stub: per-table row returned by `.maybeSingle()`. */
function fakeSb(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return chain;
    },
  } as never;
}

const AUDIT = { adminUserId: "admin-1", ip: null, user_agent: null };

beforeEach(() => {
  Object.values(ops).forEach((f) => f.mockClear());
  audit.appendAuditLog.mockClear();
});

describe("A. contract", () => {
  it("actions follow the ADMIN transition graph", () => {
    expect(adminStoreOrderInterventionActions("cancel_requested", "paid")).toEqual(["cancel_request_approve", "cancel_request_reject"]);
    expect(adminStoreOrderInterventionActions("refund_requested", "paid")).toEqual(["refund_approve", "refund_reject"]);
    expect(adminStoreOrderInterventionActions("pending", "paid")).toEqual(["force_cancel", "refund_request_create"]);
    expect(adminStoreOrderInterventionActions("preparing", "paid")).toEqual(["force_cancel", "refund_request_create"]);
    expect(adminStoreOrderInterventionActions("completed", "paid")).toEqual(["refund_request_create"]);
    expect(adminStoreOrderInterventionActions("cancelled", "cancelled")).toEqual([]);
    expect(adminStoreOrderInterventionActions("refunded", "refunded")).toEqual([]);
  });

  it("reason is required (2–500 chars)", () => {
    expect(normalizeAdminInterventionReason("")).toEqual({ ok: false, error: "reason_required" });
    expect(normalizeAdminInterventionReason(" a ")).toEqual({ ok: false, error: "reason_required" });
    expect(normalizeAdminInterventionReason("x".repeat(501))).toEqual({ ok: false, error: "reason_too_long" });
    expect(normalizeAdminInterventionReason("  매장  연락 불가 ")).toEqual({ ok: true, reason: "매장 연락 불가" });
  });
});

describe("B. server re-check and dispatch", () => {
  it("no reason → 400, nothing written", async () => {
    const r = await runAdminStoreOrderIntervention(fakeSb({ store_orders: { id: "o", order_status: "cancel_requested", payment_status: "paid" } }), {
      orderId: "o",
      action: "cancel_request_approve",
      reason: "",
      expectedStatus: "cancel_requested",
      audit: AUDIT,
    });
    expect(r).toMatchObject({ ok: false, error: "reason_required", httpStatus: 400 });
    expect(ops.adminApproveStoreOrderCancelRequest).not.toHaveBeenCalled();
    expect(audit.appendAuditLog).not.toHaveBeenCalled();
  });

  it("status changed since the admin looked → 409 status_changed, nothing written", async () => {
    const r = await runAdminStoreOrderIntervention(fakeSb({ store_orders: { id: "o", order_status: "cancelled", payment_status: "cancelled" } }), {
      orderId: "o",
      action: "cancel_request_approve",
      reason: "매장 요청 확인",
      expectedStatus: "cancel_requested",
      audit: AUDIT,
    });
    expect(r).toMatchObject({ ok: false, error: "status_changed", httpStatus: 409, currentStatus: "cancelled" });
    expect(ops.adminApproveStoreOrderCancelRequest).not.toHaveBeenCalled();
  });

  it("action outside the ADMIN graph → 409", async () => {
    const r = await runAdminStoreOrderIntervention(fakeSb({ store_orders: { id: "o", order_status: "completed", payment_status: "paid" } }), {
      orderId: "o",
      action: "force_cancel",
      reason: "테스트 사유",
      expectedStatus: "completed",
      audit: AUDIT,
    });
    expect(r).toMatchObject({ ok: false, error: "action_not_allowed_for_status", httpStatus: 409 });
    expect(ops.adminForceCancelStoreOrder).not.toHaveBeenCalled();
  });

  it("approve cancel request → existing op + audit with reason and actor", async () => {
    const r = await runAdminStoreOrderIntervention(fakeSb({ store_orders: { id: "o", order_status: "cancel_requested", payment_status: "paid" } }), {
      orderId: "o",
      action: "cancel_request_approve",
      reason: "매장 재고 소진 확인",
      expectedStatus: "cancel_requested",
      audit: AUDIT,
    });
    expect(r).toEqual({ ok: true, fromStatus: "cancel_requested", toStatus: "cancelled" });
    expect(ops.adminApproveStoreOrderCancelRequest).toHaveBeenCalledWith(expect.anything(), "o", AUDIT);
    expect(audit.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor_type: "admin",
        actor_id: "admin-1",
        target_id: "o",
        action: "store_order.admin_intervention",
        after_json: { action: "cancel_request_approve", reason: "매장 재고 소진 확인", order_status: "cancelled" },
      })
    );
  });
});

describe("C. refund reject restores the server-recorded status (never client-chosen)", () => {
  it("restores the status before refund_requested (accepted, not completed)", async () => {
    const r = await runAdminStoreOrderIntervention(
      fakeSb({
        store_orders: { id: "o", order_status: "refund_requested", payment_status: "paid" },
        store_order_events: { from_status: "accepted" },
      }),
      { orderId: "o", action: "refund_reject", reason: "구매자 오요청", expectedStatus: "refund_requested", audit: AUDIT }
    );
    expect(r).toEqual({ ok: true, fromStatus: "refund_requested", toStatus: "accepted" });
    expect(ops.adminRejectRefundStoreOrder).toHaveBeenCalledWith(expect.anything(), "o", "accepted", "구매자 오요청", AUDIT);
  });

  it("unknown or not-restorable previous status (e.g. pending) → 409, no write", async () => {
    const r = await runAdminStoreOrderIntervention(
      fakeSb({
        store_orders: { id: "o", order_status: "refund_requested", payment_status: "paid" },
        store_order_events: { from_status: "pending" },
      }),
      { orderId: "o", action: "refund_reject", reason: "구매자 오요청", expectedStatus: "refund_requested", audit: AUDIT }
    );
    expect(r).toMatchObject({ ok: false, error: "refund_restore_status_unknown", httpStatus: 409 });
    expect(ops.adminRejectRefundStoreOrder).not.toHaveBeenCalled();
  });
});

describe("D. every admin decision path goes through the service", () => {
  it("intervene + legacy endpoints delegate; no client-chosen restore", () => {
    const intervene = read("app/api/admin/store-orders/[orderId]/intervene/route.ts");
    expect(intervene).toContain("runAdminStoreOrderIntervention");
    expect(intervene).toContain("expected_status_required");
    for (const p of [
      "app/api/admin/store-orders/[orderId]/approve-refund/route.ts",
      "app/api/admin/store-orders/[orderId]/cancel-request/route.ts",
      "app/api/admin/store-orders/[orderId]/route.ts",
    ]) {
      const src = read(p);
      expect(src, p).toContain("runAdminStoreOrderIntervention");
      expect(src, p).not.toMatch(/adminCompleteRefundStoreOrder\(|adminForceCancelStoreOrder\(|adminRejectRefundStoreOrder\(|adminApproveStoreOrderCancelRequest\(|adminSetRefundRequestedStoreOrder\(/);
    }
    expect(read("lib/stores/admin-store-order-intervention.ts")).toContain("resolveRefundRequestRestoreStatus");
  });

  it("admin reasons stay out of buyer-visible order events", () => {
    const ops = read("lib/stores/apply-admin-store-order-operations.ts");
    const svc = read("lib/stores/admin-store-order-intervention.ts");
    expect(svc).not.toContain("eventMessage");
    for (const fn of ["adminForceCancelStoreOrder", "adminSetRefundRequestedStoreOrder", "adminCompleteRefundStoreOrder"]) {
      const start = ops.indexOf(`export async function ${fn}(`);
      const body = ops.slice(start, ops.indexOf("\n}\n", start));
      expect(body, fn).not.toContain("eventMessage");
    }
  });

  it("cancel-request ledger updates only a still-pending row", () => {
    const ops = read("lib/stores/apply-admin-store-order-operations.ts");
    expect(ops.match(/\.eq\("status", "pending"\);/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("list and refund queue no longer decide; they send the admin to the order detail", () => {
    const list = read("components/admin/stores/AdminStoreOrdersPage.tsx");
    expect(list).not.toContain("/cancel-request");
    expect(list).not.toContain("/approve-refund");
    expect(list).not.toContain("restore_to_status");
    expect(list).toContain("admin-order-decision-link");
    const refunds = read("components/admin/delivery-orders/DeliveryRefundsClient.tsx");
    expect(refunds).not.toContain("/approve-refund");
    expect(refunds).toContain("/admin/stores/orders/");
    const detail = read("components/admin/delivery-orders/DeliveryOrderDetailClient.tsx");
    expect(detail).toContain("AdminStoreOrderInterventionPanel");
    expect(detail).not.toContain("force_cancel: true");
    expect(detail).not.toContain("complete_refund: true");
    const panel = read("components/admin/delivery-orders/AdminStoreOrderInterventionPanel.tsx");
    expect(panel).toContain("/intervene");
    expect(panel).toContain("expected_status: orderStatus");
    expect(panel).toContain("required: true");
  });
});
