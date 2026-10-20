/**
 * G-1 stage 1 — DLV-01 rider ops badge · DLV-02 owner delivery CAS + delivered→arrived sync ·
 * ORD-09 / NTF-02 buyer copy · ORD-10 context 404 · ORD-11 idempotent replay · NTF-04 snapshot reads.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const append = vi.hoisted(() => ({ appendUserNotification: vi.fn(async () => ({ ok: true })) }));
const apply = vi.hoisted(() => ({
  applyStoreOrderStatusTransition: vi.fn(async () => ({ ok: true, order_status: "arrived", previous: "delivering" })),
}));
vi.mock("@/lib/notifications/append-user-notification", () => append);
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({ markOrderNotificationsRead: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({ invalidateNotificationUnreadCountCache: vi.fn() }));
vi.mock("@/lib/stores/apply-store-order-status-transition", () => apply);
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/community-messenger/store-order-chat-service", () => ({
  appendStoreOrderMessengerDeliveryStatusTransition: vi.fn(async () => undefined),
}));
vi.mock("@/lib/stores/store-order-events", () => ({ createStoreOrderDeliveryLifecycleEvent: vi.fn(async () => undefined) }));

import { notifyBuyerStoreOrderOwnerStatus } from "@/lib/notifications/notify-store-commerce";
import { notificationMessages } from "@/lib/i18n/catalog/notifications";
import { deliveryRiderOpsMode, deliveryRiderOpsModeNotice } from "@/lib/stores/delivery-rider-ops-mode";
import { ownerPatchStoreOrderDelivery } from "@/lib/stores/store-order-delivery-service";
import { syncOrderArrivedFromDeliveredRow } from "@/lib/stores/store-order-delivery-order-sync";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** Table → row for maybeSingle; records update filters. */
function fakeSb(rows: Record<string, unknown>, opts: { updateReturnsNull?: boolean } = {}) {
  const updates: { table: string; payload: unknown; filters: [string, unknown][] }[] = [];
  const sb = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      let isUpdate = false;
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return chain;
        },
        insert: () => chain,
        update: (p: unknown) => {
          isUpdate = true;
          updates.push({ table, payload: p, filters });
          return chain;
        },
        maybeSingle: async () => {
          if (isUpdate && table === "store_order_deliveries") {
            return opts.updateReturnsNull
              ? { data: null, error: null }
              : { data: { ...(rows[table] as object), ...(updates.at(-1)?.payload as object) }, error: null };
          }
          return { data: rows[table] ?? null, error: null };
        },
      };
      return chain;
    },
  } as never;
  return { sb, updates };
}

beforeEach(() => vi.clearAllMocks());

describe("DLV-01 rider operation mode", () => {
  it("0 riders → self-delivery only notice; riders → none; unknown → none", () => {
    expect(deliveryRiderOpsMode(0)).toBe("self_delivery_only");
    expect(deliveryRiderOpsMode(3)).toBe("rider_ops");
    expect(deliveryRiderOpsMode(null)).toBeNull();
    expect(deliveryRiderOpsModeNotice("self_delivery_only", true)).toContain("미운영");
    expect(deliveryRiderOpsModeNotice("self_delivery_only", false)).toContain("Not operated");
    expect(deliveryRiderOpsModeNotice("rider_ops", true)).toBeNull();
    expect(deliveryRiderOpsModeNotice(null, true)).toBeNull();
  });

  it("admin rider page shows the badge only after a successful load", () => {
    const src = read("components/admin/delivery-riders/AdminDeliveryRidersPage.tsx");
    expect(src).toContain("generatedAt && !loadErr ? deliveryRiderOpsMode(counts.riders) : null");
    expect(src).toContain('data-testid="admin-delivery-riders-ops-mode"');
    expect(read("docs/admin/dibay-admin-delivery-ops-audit-design.md")).toMatch(/\| 19 \| 라이더 .*미운영/);
  });
});

describe("DLV-02 owner delivery patch", () => {
  const order = { id: "o1", store_id: "s1", buyer_user_id: "b1", order_status: "delivering", admin_locked: false };

  it("update is conditional on the previous delivery status; lost race → 409", async () => {
    const { sb, updates } = fakeSb(
      { store_orders: order, store_order_deliveries: { order_id: "o1", store_id: "s1", delivery_status: "delivering" } },
      { updateReturnsNull: true }
    );
    const r = await ownerPatchStoreOrderDelivery(sb, {
      orderId: "o1",
      storeId: "s1",
      ownerUserId: "owner-1",
      setStatus: "delivered",
    });
    expect(r).toEqual({ ok: false, error: "delivery_status_stale_retry", httpStatus: 409 });
    expect(updates[0].filters).toEqual(expect.arrayContaining([["delivery_status", "delivering"]]));
    expect(apply.applyStoreOrderStatusTransition).not.toHaveBeenCalled();
  });

  it("delivered → order synced to arrived via SYSTEM delivery_sync", async () => {
    const { sb } = fakeSb({
      store_orders: order,
      store_order_deliveries: { order_id: "o1", store_id: "s1", delivery_status: "delivering" },
    });
    const r = await ownerPatchStoreOrderDelivery(sb, {
      orderId: "o1",
      storeId: "s1",
      ownerUserId: "owner-1",
      setStatus: "delivered",
    });
    expect(r.ok).toBe(true);
    expect(apply.applyStoreOrderStatusTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: "o1",
        nextStatus: "arrived",
        actor: "SYSTEM",
        systemPurpose: "delivery_sync",
        expectedCurrentStatus: "delivering",
      })
    );
  });

  it("sync is a no-op unless the order is still delivering (never jumps to completed)", async () => {
    const { sb } = fakeSb({ store_orders: { order_status: "arrived" } });
    expect(await syncOrderArrivedFromDeliveredRow(sb, { orderId: "o1", source: "t" })).toBeNull();
    expect(apply.applyStoreOrderStatusTransition).not.toHaveBeenCalled();
  });

  it("rider and admin delivered paths also sync", () => {
    const src = read("lib/stores/store-order-delivery-service.ts");
    expect(src.match(/syncOrderArrivedFromDeliveredRow\(sb,/g)?.length).toBe(3);
  });
});

describe("ORD-09 / NTF-02 buyer copy", () => {
  const base = { buyerUserId: "b1", orderId: "o1", orderNo: "N1", storeId: "s1" };
  const body = () => (append.appendUserNotification.mock.calls[0] as unknown[])[1] as Record<string, unknown>;

  it("owner cancel with reason → reason in body + meta (verbatim)", async () => {
    const { sb } = fakeSb({ stores: { store_name: "가게" }, profiles: { preferred_language: "ko" } });
    await notifyBuyerStoreOrderOwnerStatus(sb, { ...base, nextStatus: "cancelled", actor: "OWNER", cancelReason: "재료 소진" });
    expect(body().body).toBe("「가게」 N1 주문이 매장에 의해 취소되었습니다. 사유: 재료 소진");
    expect((body().meta as Record<string, unknown>).cancel_reason).toBe("재료 소진");
    expect(body().dedupe_key).toBe("commerce:buyer:owner_status:o1:cancelled");
  });

  it("owner cancel without reason keeps the old copy; admin reasons never used", async () => {
    const { sb } = fakeSb({ stores: { store_name: "가게" }, profiles: { preferred_language: "ko" } });
    await notifyBuyerStoreOrderOwnerStatus(sb, { ...base, nextStatus: "cancelled", actor: "ADMIN", cancelReason: "내부 메모" });
    expect(body().body).toBe("「가게」 N1 주문이 DIBAY 운영팀에 의해 취소되었습니다.");
  });

  it("delivery_sync arrival → delivered copy, not 'the store'", async () => {
    const { sb } = fakeSb({ stores: { store_name: "가게" }, profiles: { preferred_language: "en" } });
    await notifyBuyerStoreOrderOwnerStatus(sb, { ...base, nextStatus: "arrived", actor: "SYSTEM", systemPurpose: "delivery_sync" });
    expect(body().title).toBe("Order delivered");
    expect(String(body().body)).toContain("has been delivered");
  });

  it("new keys exist in every catalog language", () => {
    for (const lang of Object.keys(notificationMessages) as (keyof typeof notificationMessages)[]) {
      const m = notificationMessages[lang] as Record<string, string>;
      for (const k of [
        "notify_commerce_owner_status_cancelled_body_reason",
        "notify_commerce_delivery_sync_arrived_title",
        "notify_commerce_delivery_sync_arrived_body",
      ]) {
        expect(m[k], `${lang}.${k}`).toBeTruthy();
      }
    }
  });
});

describe("ORD-10 owner order context — no existence oracle", () => {
  it("another store's order answers 404 not_found like a missing one", () => {
    const src = read("app/api/me/owner-store-order-context/route.ts");
    expect(src).toContain('return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });');
    expect(src).not.toContain("403");
  });
});

describe("ORD-11 idempotent create replay returns stored amounts and writes nothing", () => {
  it("idempotent branch reads store_orders amounts and runs before the coupon snapshot UPDATE", () => {
    const src = read("app/api/me/store-orders/route.ts");
    const idem = src.indexOf("if (atomic.idempotent) {");
    const coupon = src.indexOf("if (userCouponId && discountAmount > 0) {");
    expect(idem).toBeGreaterThan(0);
    expect(idem).toBeLessThan(coupon);
    const block = src.slice(idem, coupon);
    expect(block).toContain('"order_no, total_amount, discount_amount, payment_amount, gift_redemption_amount, amount_before_gift"');
    expect(block).toContain("total_amount: num(row.total_amount, paymentGrandTotal)");
    expect(block).not.toContain(".update(");
    expect(src.match(/if \(atomic\.idempotent\)/g)?.length).toBe(1);
  });
});

describe("NTF-04 snapshot read path", () => {
  it("an expired counter row is never served; refresh re-runs when requested mid-flight", () => {
    const snap = read("lib/stores/store-order-detail-snapshot.ts");
    expect(snap).not.toContain("counter.hit && counter.stale");
    expect(snap).toContain("if (counter.hit && !counter.stale)");
    const refresh = read("lib/stores/store-order-detail-snapshot-refresh.ts");
    expect(refresh).toContain("rerunRequested.add(key)");
    const cache = read("lib/stores/store-order-detail-snapshot-cache.ts");
    expect(cache).toContain(".delete().eq(\"order_id\", oid)");
  });
});
