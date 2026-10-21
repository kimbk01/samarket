/**
 * 5단계 L1 — S02 주문 생성 → 접수 → 조리(수수료) → 배달 → 완료 (G-2 §5-2 S02).
 *
 * 오너 PATCH 라우트(`/api/me/stores/[storeId]/orders/[orderId]`) → 실제 `applyStoreOrderStatusTransition` →
 * 상태형 mock(`stage5-order-world`) 으로 같은 주문 ID 를 끝까지 추적한다.
 * L1 PASS 조건: 전이 그래프·CAS(이전 상태 조건)·단계별 구매자 알림 1회(수락 시 ETA)·완료 시 Coin 인식 1회,
 * 그리고 **TS 는 수수료 의무·Cash 원장을 쓰지 않는다**(기준 이후/이전 주문 모두 같은 TS 경로).
 * 수수료 의무 1행(7%)·기준 이전 0행은 DB 트리거(`trg_store_orders_commission_lifecycle`) 영역 → L2.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
const currency = vi.hoisted(() => ({ recognizeOrderCurrencyOnCompleted: vi.fn(async () => ({ ok: true })) }));
const world = vi.hoisted(() => ({ current: null as unknown as { sb: never } }));

vi.mock("@/lib/notifications/notify-store-commerce", () => notify);
vi.mock("@/lib/stores/store-order-events", () => events);
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => currency);
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => ({
  purgeStoreOrderDetailSnapshotRows: vi.fn(async () => undefined),
  invalidateStoreOrderDetailSnapshot: vi.fn(),
}));
vi.mock("@/lib/stores/restore-order-stock", () => ({ restoreStockForOrder: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
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
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => world.current.sb }));
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({ invalidateOwnerHubBadgeCache: vi.fn() }));
vi.mock("@/lib/delivery/owner/invalidate-owner-delivery-surfaces-after-mutation", () => ({
  invalidateOwnerDeliverySurfacesAfterMutation: vi.fn(),
}));
vi.mock("@/lib/security/cron-auth", () => ({ verifyCronRequestAuthorization: () => true }));

import { PATCH as ownerPatch } from "@/app/api/me/stores/[storeId]/orders/[orderId]/route";
import { GET as cronAutoComplete } from "@/app/api/cron/store-orders-auto-complete/route";
import { loadAdminStoreOrderDetail } from "@/lib/admin/store-orders/load-admin-store-order-detail";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const AFTER_CUTOFF = "2026-10-21T01:00:00.000Z";
const BEFORE_CUTOFF = "2026-10-19T01:00:00.000Z";

function newOrder(createdAt: string, extra: Record<string, unknown> = {}): Stage5OrderWorld {
  const w = createStage5OrderWorld({
    id: "o1",
    store_id: "s1",
    buyer_user_id: "b1",
    order_no: "N-1",
    order_status: "pending",
    fulfillment_type: "local_delivery",
    payment_status: "paid",
    payment_amount: 950,
    created_at: createdAt,
    ...extra,
  });
  world.current = w;
  return w;
}

async function patch(body: Record<string, unknown>) {
  const res = await ownerPatch(
    new Request("https://x.test/api/me/stores/s1/orders/o1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ storeId: "s1", orderId: "o1" }) }
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const DELIVERY_STEPS = ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived", "completed"] as const;

async function runOwnerHappyPath(w: Stage5OrderWorld) {
  const results: Array<{ status: number; body: Record<string, unknown> }> = [];
  for (const s of DELIVERY_STEPS) {
    results.push(await patch(s === "accepted" ? { order_status: s, estimated_prep_minutes: 20 } : { order_status: s }));
  }
  const orderUpdates = w.writes.filter((x) => x.table === "store_orders" && x.op === "update" && (x.payload as Record<string, unknown>).order_status);
  return { results, orderUpdates };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "stage5-secret";
});

describe("S02-1 기준 이후 생성 주문 정상 완료", () => {
  it("owner walks pending → completed: every step 200, CAS on the previous status, one buyer notice per step, Coin recognised once", async () => {
    const w = newOrder(AFTER_CUTOFF);
    const { results, orderUpdates } = await runOwnerHappyPath(w);
    expect(results.map((r) => [r.status, r.body.order_status])).toEqual(DELIVERY_STEPS.map((s) => [200, s]));
    expect(w.order.order_status).toBe("completed");

    const prev = ["pending", ...DELIVERY_STEPS.slice(0, -1)];
    expect(orderUpdates.map((u) => u.filters.find(([m, c]) => m === "eq" && c === "order_status")?.[2])).toEqual(prev);

    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(DELIVERY_STEPS.length);
    expect((notify.notifyBuyerStoreOrderOwnerStatus.mock.calls as unknown as Array<[unknown, Record<string, unknown>]>).map((c) => c[1].nextStatus)).toEqual([...DELIVERY_STEPS]);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ buyerUserId: "b1", orderId: "o1", nextStatus: "accepted", estimatedPrepMinutes: 20 })
    );
    expect(events.createStoreOrderStatusEvent).toHaveBeenCalledTimes(DELIVERY_STEPS.length);
    expect(currency.recognizeOrderCurrencyOnCompleted).toHaveBeenCalledTimes(1);
    expect(currency.recognizeOrderCurrencyOnCompleted).toHaveBeenCalledWith(expect.anything(), "o1");

    // admin order detail reads the same row: same final status and accept ETA the buyer was told
    const admin = await loadAdminStoreOrderDetail(w.sb, "o1");
    if (!admin.ok) throw new Error(admin.error);
    expect(admin.detail.order).toMatchObject({ orderStatus: "completed", paymentStatus: "paid", acceptedAt: w.order.accepted_at });
    expect(admin.detail.order.estimatedReadyAt).toBe(w.order.estimated_ready_at);
  });

  it("TS writes no fee obligation / Cash ledger / settlement row and calls no fee RPC (the trigger owns the 7% charge)", async () => {
    const w = newOrder(AFTER_CUTOFF);
    await runOwnerHappyPath(w);
    expect(feeOrCashTouches(w)).toEqual([]);
    const preparing = w.writes.find((x) => (x.payload as Record<string, unknown>)?.order_status === "preparing");
    expect(Object.keys(preparing?.payload as Record<string, unknown>).sort()).toEqual(["order_status"]);
  });

  it("commission trigger refuses the preparing UPDATE → 409 store_commission_charge_failed, order stays accepted, no buyer notice", async () => {
    const w = newOrder(AFTER_CUTOFF, { order_status: "accepted" });
    w.nextOrderUpdateError = "store_commission_charge_failed: cash locked";
    const r = await patch({ order_status: "preparing" });
    expect(r).toEqual({ status: 409, body: { ok: false, error: "store_commission_charge_failed" } });
    expect(w.order.order_status).toBe("accepted");
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
    expect(w.rpcCalls.map((c) => c.name)).toContain("store_commission_notify_charge_failure");
  });

  it("the same step sent twice (second device / retry) → idempotent 200, one write, one notice", async () => {
    const w = newOrder(AFTER_CUTOFF, { order_status: "accepted" });
    const first = await patch({ order_status: "preparing" });
    const second = await patch({ order_status: "preparing" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(w.writes.filter((x) => (x.payload as Record<string, unknown>)?.order_status === "preparing")).toHaveLength(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
  });
});

describe("S02-2 자동 구매확정 (ORD-02)", () => {
  it("cron completes a due arrived order once: auto-complete notice (not 'the store completed'), Coin recognised, no fee writes", async () => {
    const w = newOrder(AFTER_CUTOFF, { order_status: "arrived", auto_complete_at: "2026-10-21T02:00:00.000Z" });
    const res = await cronAutoComplete(new Request("https://x.test/api/cron/store-orders-auto-complete"));
    expect(await res.json()).toEqual({ ok: true, completed: 1, order_ids: ["o1"] });
    expect(w.order.order_status).toBe("completed");
    expect(notify.notifyBuyerStoreOrderAutoCompleted).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
    expect(currency.recognizeOrderCurrencyOnCompleted).toHaveBeenCalledTimes(1);
    expect(feeOrCashTouches(w)).toEqual([]);

    const again = await cronAutoComplete(new Request("https://x.test/api/cron/store-orders-auto-complete"));
    expect((await again.json()).completed).toBe(0);
    expect(notify.notifyBuyerStoreOrderAutoCompleted).toHaveBeenCalledTimes(1);
  });

  it("not yet due → cron skips it (no write, no notice)", async () => {
    const w = newOrder(AFTER_CUTOFF, { order_status: "arrived", auto_complete_at: "2999-01-01T00:00:00.000Z" });
    const res = await cronAutoComplete(new Request("https://x.test/api/cron/store-orders-auto-complete"));
    expect((await res.json()).completed).toBe(0);
    expect(w.order.order_status).toBe("arrived");
    expect(notify.notifyBuyerStoreOrderAutoCompleted).not.toHaveBeenCalled();
  });
});

describe("S02-3 기준 이전 생성 주문 상태 전이", () => {
  it("same TS path and payload shape as a post-cutoff order (TS never branches on created_at for fees)", async () => {
    const after = newOrder(AFTER_CUTOFF);
    await runOwnerHappyPath(after);
    const afterShape = after.writes.map((x) => [x.table, x.op, Object.keys((x.payload as Record<string, unknown>) ?? {}).sort().join(",")]);
    const afterRpcs = after.rpcCalls.map((c) => c.name);
    vi.clearAllMocks();

    const before = newOrder(BEFORE_CUTOFF);
    const { results } = await runOwnerHappyPath(before);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(before.order.order_status).toBe("completed");
    expect(before.writes.map((x) => [x.table, x.op, Object.keys((x.payload as Record<string, unknown>) ?? {}).sort().join(",")])).toEqual(afterShape);
    expect(before.rpcCalls.map((c) => c.name)).toEqual(afterRpcs);
    expect(feeOrCashTouches(before)).toEqual([]);
  });

  it("auto-complete cron does not pick up a pre-cutoff arrived order (automation starts at the same cutoff, D-5)", async () => {
    const w = newOrder(BEFORE_CUTOFF, { order_status: "arrived", auto_complete_at: "2026-10-19T05:00:00.000Z" });
    const res = await cronAutoComplete(new Request("https://x.test/api/cron/store-orders-auto-complete"));
    expect((await res.json()).completed).toBe(0);
    expect(w.order.order_status).toBe("arrived");
  });

  it("fee cutoff is the DB trigger's constant (2026-10-20 20:30 UTC) — the TS automation cutoff matches it", async () => {
    const sql = read("supabase/migrations/20270602100100_store_commission_trigger_reenable_no_backcharge.sql");
    expect(sql).toContain("c_charge_from constant timestamptz := '2026-10-20 20:30:00+00';");
    expect(sql).toContain("IF NEW.created_at < c_charge_from THEN");
    const { STORE_ORDER_AUTOMATION_FROM_ISO } = await import("@/lib/stores/store-order-lifecycle-automation");
    expect(Date.parse(STORE_ORDER_AUTOMATION_FROM_ISO)).toBe(Date.parse("2026-10-20T20:30:00+00:00"));
  });
});
