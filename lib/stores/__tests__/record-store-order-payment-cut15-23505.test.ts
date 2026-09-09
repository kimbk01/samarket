import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/store-order-chat-service", () => ({
  appendStoreOrderMessengerPaymentCompletedLine: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/notify-store-commerce", () => ({
  notifyBuyerStorePaymentCompleted: vi.fn(),
  notifyBuyerStorePaymentFailed: vi.fn(),
  notifyStoreOwnerPaymentCompleted: vi.fn(),
}));

vi.mock("@/lib/stores/ensure-store-settlement", () => ({
  ensureStoreSettlementForPaidOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/stores/apply-store-order-status-transition", () => ({
  applyStoreOrderStatusTransition: vi.fn(),
}));

vi.mock("@/lib/stores/store-order-events", () => ({
  buildStoreOrderPaymentEventDedupeKey: (orderId: string, kind: string) => `${orderId}:${kind}`,
  createStoreOrderEvent: vi.fn().mockResolvedValue({ ok: true, inserted: false, row: { id: "ev1" } }),
}));

type PaymentRow = {
  id: string;
  order_id: string;
  provider_payment_id: string | null;
};

function createSb(opts: {
  order: Record<string, unknown>;
  insertError?: { code: string; message: string } | null;
  paymentByOrder?: PaymentRow | null;
  paymentByProvider?: PaymentRow | null;
  orderUpdates?: Array<{ payment_status: string; id: string }>;
}) {
  const orderUpdates = opts.orderUpdates ?? [];
  return {
    from(table: string) {
      if (table === "store_orders") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: opts.order, error: null }),
                };
              },
            };
          },
          update(patch: { payment_status: string }) {
            return {
              eq(_col: string, id: string) {
                orderUpdates.push({ payment_status: patch.payment_status, id });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "store_payments") {
        return {
          insert: async () => ({ error: opts.insertError ?? null }),
          select() {
            return {
              eq(col: string, value: string) {
                return {
                  maybeSingle: async () => {
                    if (col === "order_id") {
                      return { data: opts.paymentByOrder ?? null, error: null };
                    }
                    if (col === "provider_payment_id") {
                      return { data: opts.paymentByProvider ?? null, error: null };
                    }
                    return { data: null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("CUT 15 recordStoreOrderPaid 23505 identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CASE A — same-order UNIQUE(order_id) replay reconciles paid", async () => {
    const { recordStoreOrderPaid } = await import("@/lib/stores/record-store-order-payment");
    const orderUpdates: Array<{ payment_status: string; id: string }> = [];
    const sb = createSb({
      order: {
        id: "order-a",
        payment_amount: 1000,
        payment_status: "pending",
        order_status: "pending",
        store_id: "store-1",
        order_no: "A1",
        buyer_user_id: "buyer-1",
      },
      insertError: { code: "23505", message: "duplicate key" },
      paymentByOrder: {
        id: "pay-a",
        order_id: "order-a",
        provider_payment_id: "P1",
      },
      orderUpdates,
    });

    const r = await recordStoreOrderPaid(sb as never, {
      orderId: "order-a",
      provider: "generic",
      providerPaymentId: "P1",
    });

    expect(r).toEqual({ ok: true, payment_status: "paid", reconciled: true });
    expect(orderUpdates).toEqual([{ payment_status: "paid", id: "order-a" }]);
  });

  it("CASE B — cross-order provider_payment_id collision does not mark B paid", async () => {
    const { recordStoreOrderPaid } = await import("@/lib/stores/record-store-order-payment");
    const orderUpdates: Array<{ payment_status: string; id: string }> = [];
    const sb = createSb({
      order: {
        id: "order-b",
        payment_amount: 2000,
        payment_status: "pending",
        order_status: "pending",
        store_id: "store-1",
        order_no: "B1",
        buyer_user_id: "buyer-2",
      },
      insertError: { code: "23505", message: "duplicate key" },
      paymentByOrder: null,
      paymentByProvider: {
        id: "pay-a",
        order_id: "order-a",
        provider_payment_id: "P-SHARED",
      },
      orderUpdates,
    });

    const r = await recordStoreOrderPaid(sb as never, {
      orderId: "order-b",
      provider: "generic",
      providerPaymentId: "P-SHARED",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("provider_payment_id_conflict");
      expect(r.httpStatus).toBe(409);
    }
    expect(orderUpdates).toEqual([]);
  });

  it("CASE C — unresolved 23505 without same-order row fails closed", async () => {
    const { resolveStorePaymentUniqueConflict } = await import(
      "@/lib/stores/record-store-order-payment"
    );
    const sb = createSb({
      order: { id: "order-x" },
      paymentByOrder: null,
      paymentByProvider: null,
    });
    const r = await resolveStorePaymentUniqueConflict(sb as never, {
      orderId: "order-x",
      providerPaymentId: "P-missing",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("payment_unique_conflict_unresolved");
    }
  });
});
