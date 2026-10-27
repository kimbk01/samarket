/**
 * T5 (docs/audit/notification-f2-android-tap-read-fix-design-2026-10-28.md C).
 * 누락 복구 경로의 오너 새 주문 알림이 품목 수를 0 으로 고정해 「0개 품목」 이 나갔다
 * (운영 DB 2026-10-28 SO1793137356703t5: 품목 1행 · line_count 0). 정상 경로와 같이 품목 행 수를 넣는다.
 */
import { describe, expect, it, vi } from "vitest";

const notifyStoreOwnerNewOrder = vi.fn(async (_sb: unknown, _opts: { lineCount: number }) => undefined);

vi.mock("@/lib/notifications/notify-store-commerce", () => ({
  notifyStoreOwnerNewOrder: (sb: unknown, opts: { lineCount: number }) => notifyStoreOwnerNewOrder(sb, opts),
  notifyBuyerStoreOrderOwnerStatus: vi.fn(),
  notifyBuyerStorePaymentCompleted: vi.fn(),
  notifyBuyerStorePaymentFailed: vi.fn(),
  notifyBuyerStoreRefundApproved: vi.fn(),
  notifyBuyerStoreRefundRejected: vi.fn(),
  notifyStoreOwnerBuyerCancelled: vi.fn(),
  notifyStoreOwnerPaymentCompleted: vi.fn(),
  notifyStoreOwnerRefundRequested: vi.fn(),
}));

function fakeSb(itemCount: number) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, { select: chain, gte: chain, in: chain, order: chain, limit: chain, eq: chain });
      if (table === "store_order_events") {
        Object.assign(q, {
          limit: async () => ({
            data: [
              {
                id: "ev1",
                order_id: "order1",
                store_id: "store1",
                event_type: "order_created",
                to_status: "pending",
                actor_role: "buyer",
                message: null,
                metadata: null,
                created_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
        });
      }
      if (table === "store_orders") {
        Object.assign(q, {
          maybeSingle: async () => ({
            data: { order_no: "SO1", buyer_user_id: "buyer1", payment_amount: 299, total_amount: 299 },
            error: null,
          }),
        });
      }
      if (table === "store_order_items") {
        Object.assign(q, { eq: async () => ({ count: itemCount, error: null }) });
      }
      return q;
    },
  };
}

describe("T5 reconcile owner new order line count", () => {
  it("uses the order's item row count instead of 0", async () => {
    const { reconcileCommerceNotificationIntentsFromStoreOrderEvents } = await import(
      "@/lib/notifications/commerce-notification-reconcile"
    );
    const r = await reconcileCommerceNotificationIntentsFromStoreOrderEvents(fakeSb(1) as never);
    expect(r.reconciled).toBe(1);
    expect(notifyStoreOwnerNewOrder).toHaveBeenCalledTimes(1);
    expect(notifyStoreOwnerNewOrder.mock.calls[0][1].lineCount).toBe(1);

    notifyStoreOwnerNewOrder.mockClear();
    await reconcileCommerceNotificationIntentsFromStoreOrderEvents(fakeSb(3) as never);
    expect(notifyStoreOwnerNewOrder.mock.calls[0][1].lineCount).toBe(3);
  });
});
