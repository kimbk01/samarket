/**
 * 5단계 L1 — S05 관리자 개입이 오너 결정을 덮어쓰는 경우 (G-2 §5-2 S05).
 *
 * 관리자 라우트(`POST /api/admin/store-orders/[orderId]/intervene`, 실제 `requireAdminPermission("business")`)
 * → `runAdminStoreOrderIntervention` → 실제 ops → `applyStoreOrderStatusTransition` → 상태형 mock.
 * 오너 반려는 실제 `runOwnerStoreOrderDecision` 으로 같은 주문에 먼저 적용한다.
 * L1 PASS 조건: 확인 시점 상태가 CAS 값(ORD-04) → 바뀌었으면 409 `status_changed`+최신 상태, 아무것도 쓰지 않음 ·
 * 권한키 없는 스태프 403 · 사유 필수 · 감사 1행(사유) · 오너 알림 1 · 구매자 최종 알림 1(관리자 사유 비노출) · 재실행 부수효과 0.
 */
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
const audit = vi.hoisted(() => ({ appendAuditLog: vi.fn(async () => undefined) }));
const ownerNotice = vi.hoisted(() => ({ appendUserNotification: vi.fn(async () => ({ ok: true })) }));
const ctx = vi.hoisted(() => ({ world: null as unknown as { sb: never }, permissions: ["business"] as string[] }));

vi.mock("@/lib/notifications/notify-store-commerce", () => notify);
vi.mock("@/lib/stores/store-order-events", () => events);
vi.mock("@/lib/audit/append-audit-log", () => audit);
vi.mock("@/lib/notifications/append-user-notification", () => ownerNotice);
vi.mock("@/lib/notifications/notification-user-language", () => ({ loadNotificationUserLanguage: async () => "ko" }));
vi.mock("@/lib/notifications/notify-safe-translate", () => ({
  notifySafeT: (_lang: string, key: string, o?: { vars?: Record<string, unknown> }) => `${key}${o?.vars ? JSON.stringify(o.vars) : ""}`,
}));
vi.mock("@/lib/stores/restore-order-stock", () => ({ restoreStockForOrder: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => ({
  recognizeOrderCurrencyOnCompleted: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => ({
  purgeStoreOrderDetailSnapshotRows: vi.fn(async () => undefined),
  invalidateStoreOrderDetailSnapshot: vi.fn(),
}));
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
vi.mock("@/lib/stores/store-order-counts-cache", () => ({ invalidateStoreOrderCountsCache: vi.fn() }));
vi.mock("@/lib/chats/owner-hub-badge-cache", () => ({ invalidateOwnerHubBadgeCache: vi.fn() }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => ctx.world.sb }));
// requireAdminPermission runs for real; only its identity / membership / permission sources are stubbed.
vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: async () => ({
    ok: true,
    userId: "admin-1",
    profile: { id: "admin-1" },
    membership: { role: "admin", admin_tier: "operator" },
  }),
}));
vi.mock("@/lib/auth/server-guards", () => ({ getCurrentProfile: async () => ({ id: "admin-1" }) }));
vi.mock("@/lib/env/runtime", () => ({ requireSupabaseEnv: () => ({ ok: true, url: "https://x.test", serviceKey: "k" }) }));
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: () => ({}),
}));
vi.mock("@/lib/admin/admin-membership", () => ({
  hasActiveAdminMembershipOrLegacyRole: async () => true,
  loadActiveAdminMembership: async () => ({ admin_tier: "operator" }),
  resolveEffectiveAdminRole: async () => "admin",
}));
vi.mock("@/lib/admin/admin-user-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/admin-user-server")>()),
  loadEffectiveStaffPermissions: async () => ctx.permissions,
}));

import { POST as intervene } from "@/app/api/admin/store-orders/[orderId]/intervene/route";
import { runOwnerStoreOrderDecision } from "@/lib/stores/owner-store-order-decision";

type Json = Record<string, unknown>;

/** Buyer asked to cancel an accepted order (ledger pending, recorded previous status = accepted). */
function cancelRequestedOrder(): Stage5OrderWorld {
  const w = createStage5OrderWorld({
    id: "o1",
    store_id: "s1",
    buyer_user_id: "b1",
    order_no: "N-5",
    order_status: "cancel_requested",
    fulfillment_type: "local_delivery",
    payment_status: "paid",
    payment_amount: 700,
    created_at: "2026-10-21T01:00:00.000Z",
  });
  w.cancelRequests.push({
    id: "req-1",
    order_id: "o1",
    status: "pending",
    previous_order_status: "accepted",
    requested_by: "b1",
    requested_role: "buyer",
    reason: "주소를 잘못 입력했어요",
    created_at: "2026-10-21T01:10:00.000Z",
  });
  ctx.world = w;
  return w;
}

async function adminPost(body: Json) {
  const res = await intervene(
    new Request("https://x.test/api/admin/store-orders/o1/intervene", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ orderId: "o1" }) }
  );
  return { status: res.status, body: (await res.json()) as Json };
}

const interventionAudits = () =>
  (audit.appendAuditLog.mock.calls as unknown as Array<[unknown, Json]>).filter((c) => c[1].action === "store_order.admin_intervention");

beforeEach(() => {
  vi.clearAllMocks();
  ctx.permissions = ["business"];
});

describe("S05-1 오너 반려 직후 관리자 개입", () => {
  it("admin decided on the pre-reject screen → 409 status_changed + latest status; nothing written, no notice", async () => {
    const w = cancelRequestedOrder();
    const owner = await runOwnerStoreOrderDecision(w.sb, {
      storeId: "s1",
      orderId: "o1",
      ownerUserId: "owner-1",
      action: "cancel_request_reject",
      reason: "이미 조리 중입니다",
      expectedStatus: "cancel_requested",
    });
    expect(owner).toEqual({ ok: true, fromStatus: "cancel_requested", toStatus: "accepted" });
    expect(notify.notifyBuyerStoreRefundRejected).toHaveBeenCalledTimes(1);
    const rpcBefore = w.rpcCalls.length;

    const r = await adminPost({ action: "cancel_request_approve", reason: "구매자 요청 재확인", expected_status: "cancel_requested" });
    expect(r).toEqual({ status: 409, body: { ok: false, error: "status_changed", current_status: "accepted" } });
    expect(w.rpcCalls.length).toBe(rpcBefore);
    expect(w.order.order_status).toBe("accepted");
    expect(interventionAudits()).toHaveLength(0);
    expect(ownerNotice.appendUserNotification).not.toHaveBeenCalled();
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });

  it("admin re-checks and force-cancels on the latest status: CAS on accepted, one audit with reason, one owner + one buyer notice; resend → 409, no repeat", async () => {
    const w = cancelRequestedOrder();
    await runOwnerStoreOrderDecision(w.sb, {
      storeId: "s1",
      orderId: "o1",
      ownerUserId: "owner-1",
      action: "cancel_request_reject",
      reason: "이미 조리 중입니다",
      expectedStatus: "cancel_requested",
    });
    const ADMIN_REASON = "매장 연락 두절 — 관리자 취소";
    const r = await adminPost({ action: "force_cancel", reason: ADMIN_REASON, expected_status: "accepted" });
    expect(r).toEqual({ status: 200, body: { ok: true, from_status: "accepted", order_status: "cancelled" } });
    expect(w.order.order_status).toBe("cancelled");
    expect(w.rpcCalls.find((c) => c.name === "store_order_cancel_direct_atomic")?.args).toEqual({
      p_order_id: "o1",
      p_expected_status: "accepted",
      p_payment_status: "cancelled",
      p_actor: "ADMIN",
    });

    expect(interventionAudits()).toHaveLength(1);
    expect(interventionAudits()[0][1]).toMatchObject({
      actor_type: "admin",
      actor_id: "admin-1",
      target_id: "o1",
      before_json: { order_status: "accepted" },
      after_json: { action: "force_cancel", reason: ADMIN_REASON, order_status: "cancelled" },
    });
    expect(ownerNotice.appendUserNotification).toHaveBeenCalledTimes(1);
    const n = (ownerNotice.appendUserNotification.mock.calls as unknown as Array<[unknown, Json]>)[0][1];
    expect(n).toMatchObject({ user_id: "owner-1", ref_id: "o1", meta: expect.objectContaining({ action: "force_cancel" }) });
    expect(String(n.body)).toContain(ADMIN_REASON);

    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
    const buyerNotice = (notify.notifyBuyerStoreOrderOwnerStatus.mock.calls as unknown as Array<[unknown, Json]>)[0][1];
    expect(buyerNotice).toMatchObject({ buyerUserId: "b1", nextStatus: "cancelled", actor: "ADMIN" });
    expect(JSON.stringify(buyerNotice)).not.toContain(ADMIN_REASON);
    expect(feeOrCashTouches(w)).toEqual([]);

    const again = await adminPost({ action: "force_cancel", reason: ADMIN_REASON, expected_status: "accepted" });
    expect(again).toEqual({ status: 409, body: { ok: false, error: "status_changed", current_status: "cancelled" } });
    expect(interventionAudits()).toHaveLength(1);
    expect(ownerNotice.appendUserNotification).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
  });

  it("order changed after the server check (write CAS lost) → 409 status_changed with the newest status, no audit / notice", async () => {
    const w = cancelRequestedOrder();
    w.rpcOverride.set("store_order_cancel_request_decide_atomic", { data: { ok: false, error: "transition_conflict" }, error: null });
    const r = await adminPost({ action: "cancel_request_approve", reason: "구매자 요청 확인", expected_status: "cancel_requested" });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ ok: false, error: "status_changed" });
    expect(interventionAudits()).toHaveLength(0);
    expect(ownerNotice.appendUserNotification).not.toHaveBeenCalled();
    expect(notify.notifyBuyerStoreOrderOwnerStatus).not.toHaveBeenCalled();
  });
});

describe("S05-2 관리자 권한 없는 스태프", () => {
  it("staff without the business permission key → 403 forbidden_permission; the order is never read or written", async () => {
    const w = cancelRequestedOrder();
    ctx.permissions = ["users", "products", "chats"];
    const r = await adminPost({ action: "cancel_request_approve", reason: "구매자 요청 확인", expected_status: "cancel_requested" });
    expect(r).toEqual({ status: 403, body: { ok: false, error: "forbidden_permission", permission: "business" } });
    expect(w.rpcCalls).toEqual([]);
    expect(w.writes).toEqual([]);
    expect(w.order.order_status).toBe("cancel_requested");
    expect(audit.appendAuditLog).not.toHaveBeenCalled();
    expect(ownerNotice.appendUserNotification).not.toHaveBeenCalled();
  });
});

describe("S05-3 정상 개입", () => {
  it("reason missing → 400 reason_required; expected_status missing → 400 expected_status_required; nothing written", async () => {
    const w = cancelRequestedOrder();
    expect(await adminPost({ action: "cancel_request_approve", reason: " ", expected_status: "cancel_requested" })).toEqual({
      status: 400,
      body: { ok: false, error: "reason_required" },
    });
    expect(await adminPost({ action: "cancel_request_approve", reason: "구매자 요청 확인" })).toEqual({
      status: 400,
      body: { ok: false, error: "expected_status_required" },
    });
    expect(w.rpcCalls).toEqual([]);
    expect(audit.appendAuditLog).not.toHaveBeenCalled();
  });

  it("admin approves the pending buyer request: decide RPC as admin on cancel_requested, ledger closed, audit 1, owner 1, buyer 1", async () => {
    const w = cancelRequestedOrder();
    const REASON = "구매자 요청 확인 — 매장 응답 없음";
    const r = await adminPost({ action: "cancel_request_approve", reason: REASON, expected_status: "cancel_requested" });
    expect(r).toEqual({ status: 200, body: { ok: true, from_status: "cancel_requested", order_status: "cancelled" } });
    expect(w.rpcCalls.find((c) => c.name === "store_order_cancel_request_decide_atomic")?.args).toMatchObject({
      p_actor_user_id: "admin-1",
      p_actor_role: "admin",
      p_expected_status: "cancel_requested",
      p_decision: "approve",
    });
    expect(w.cancelRequests[0]).toMatchObject({ status: "approved", approved_by: "admin-1" });
    expect(w.cancelRequests.filter((x) => x.status === "pending")).toHaveLength(0);
    expect(interventionAudits()).toHaveLength(1);
    expect(interventionAudits()[0][1].after_json).toEqual({ action: "cancel_request_approve", reason: REASON, order_status: "cancelled" });
    expect(ownerNotice.appendUserNotification).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledTimes(1);
    expect(notify.notifyBuyerStoreOrderOwnerStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextStatus: "cancelled", actor: "ADMIN" })
    );
    expect(feeOrCashTouches(w)).toEqual([]);
  });
});
