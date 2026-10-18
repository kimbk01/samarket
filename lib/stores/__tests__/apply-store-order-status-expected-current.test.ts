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
