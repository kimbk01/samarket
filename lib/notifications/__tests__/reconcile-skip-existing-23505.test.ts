/**
 * 23505 반복 차단 (docs/audit/commerce-reconcile-23505-fix-design-2026-10-29.md).
 * 재처리는 이미 (store_order_event_id, kind) 알림이 있는 이벤트에 알림 함수를 다시 부르지 않는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyBuyerStoreOrderOwnerStatus = vi.fn(async () => undefined);
const notifyStoreOwnerNewOrder = vi.fn(async () => undefined);

vi.mock("@/lib/notifications/notify-store-commerce", () => ({
  notifyStoreOwnerNewOrder: (...a: unknown[]) => notifyStoreOwnerNewOrder(...(a as [])),
  notifyBuyerStoreOrderOwnerStatus: (...a: unknown[]) => notifyBuyerStoreOrderOwnerStatus(...(a as [])),
  notifyBuyerStorePaymentCompleted: vi.fn(),
  notifyBuyerStorePaymentFailed: vi.fn(),
  notifyBuyerStoreRefundApproved: vi.fn(),
  notifyBuyerStoreRefundRejected: vi.fn(),
  notifyStoreOwnerBuyerCancelled: vi.fn(),
  notifyStoreOwnerPaymentCompleted: vi.fn(),
  notifyStoreOwnerRefundRequested: vi.fn(),
}));

type Existing = { data: { event_id: string; kind: string }[] | null; error: { message: string } | null };

function fakeSb(events: Record<string, unknown>[], existing: Existing) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, { select: chain, gte: chain, order: chain, limit: chain, eq: chain, in: chain });
      if (table === "store_order_events") {
        Object.assign(q, { limit: async () => ({ data: events, error: null }) });
      }
      if (table === "notification_events") {
        Object.assign(q, { in: async () => existing });
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
        Object.assign(q, { eq: async () => ({ count: 1, error: null }) });
      }
      return q;
    },
  };
}

function ev(id: string, event_type: string, to_status: string, actor_role: string) {
  return {
    id,
    order_id: "order1",
    store_id: "store1",
    event_type,
    to_status,
    actor_role,
    message: null,
    metadata: null,
    created_at: new Date().toISOString(),
  };
}

describe("reconcile 23505 — 이미 있는 알림은 다시 INSERT 하지 않는다", () => {
  beforeEach(() => {
    notifyBuyerStoreOrderOwnerStatus.mockClear();
    notifyStoreOwnerNewOrder.mockClear();
  });

  it("(이벤트, kind) 가 이미 있으면 알림 함수를 부르지 않는다", async () => {
    const { reconcileCommerceNotificationIntentsFromStoreOrderEvents } = await import(
      "@/lib/notifications/commerce-notification-reconcile"
    );
    const r = await reconcileCommerceNotificationIntentsFromStoreOrderEvents(
      fakeSb([ev("e1", "order_created", "pending", "buyer"), ev("e2", "order_accepted", "accepted", "owner")], {
        data: [
          { event_id: "e1", kind: "store_order_created" },
          { event_id: "e2", kind: "store_order_owner_status" },
        ],
        error: null,
      }) as never
    );
    expect(r).toMatchObject({ scanned: 2, reconciled: 0, skippedExisting: 2 });
    expect(notifyStoreOwnerNewOrder).not.toHaveBeenCalled();
    expect(notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });

  it("같은 이벤트라도 다른 kind 만 있으면 부른다 (시스템 취소: 오너 미접수 알림만 있음)", async () => {
    const { reconcileCommerceNotificationIntentsFromStoreOrderEvents } = await import(
      "@/lib/notifications/commerce-notification-reconcile"
    );
    const r = await reconcileCommerceNotificationIntentsFromStoreOrderEvents(
      fakeSb([ev("e3", "order_cancelled", "cancelled", "system")], {
        data: [{ event_id: "e3", kind: "store_order_accept_timeout_cancelled" }],
        error: null,
      }) as never
    );
    expect(r).toMatchObject({ reconciled: 1, skippedExisting: 0 });
    expect(notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
  });

  it("기존 알림 조회가 실패하면 전부 기존처럼 부른다 (fail-open)", async () => {
    const { reconcileCommerceNotificationIntentsFromStoreOrderEvents } = await import(
      "@/lib/notifications/commerce-notification-reconcile"
    );
    const r = await reconcileCommerceNotificationIntentsFromStoreOrderEvents(
      fakeSb([ev("e1", "order_created", "pending", "buyer")], { data: null, error: { message: "boom" } }) as never
    );
    expect(r).toMatchObject({ reconciled: 1, skippedExisting: 0 });
    expect(notifyStoreOwnerNewOrder).toHaveBeenCalledTimes(1);
  });

  it("kind 값은 notify-store-commerce.ts 와 같다 (계약)", async () => {
    const { RECONCILE_NOTIFICATION_KIND } = await import("@/lib/notifications/commerce-notification-reconcile");
    const src = readFileSync(join(process.cwd(), "lib/notifications/notify-store-commerce.ts"), "utf8");
    for (const kind of Object.values(RECONCILE_NOTIFICATION_KIND)) {
      expect(src.includes(`"${kind}"`), kind).toBe(true);
    }
  });
});
