/**
 * 5단계 S06 (L1) — 환불: 쿠폰·상품권·Coin 역거래 (문서 G-2 §5-2 S06 · §5-4 3-C 게이트).
 *
 * 역거래 실행·금액·멱등은 DB 함수 안(같은 TX)이라 L2(ND-3) 범위다. L1 이 결정할 수 있는 셀만 본다:
 *  - 4 케이스(매장 부담 쿠폰 · 플랫폼 부담 쿠폰 · 상품권 · 완료 후 환불 Coin) × 오너/주문자/관리자 경로가
 *    상태 전이와 역거래를 하나의 DB 함수로 보내고(TS 가 따로 쿠폰·상품권·Coin RPC 를 부르지 않음),
 *    재요청(idempotent)은 부수효과 0 인지 — 「상태만 바뀌고 복원 미실행」·「복원만 실행」이 TS 경로로 생길 수 없음.
 *  - 주문자 결과: 복원(restored) 쿠폰은 만료 전이면 쿠폰함 「사용 가능」·장바구니 선택 가능, 만료 후는 만료.
 * 기존 L1(같은 경로의 일반 주문 형태·마이그레이션 계약)은 J 매트릭스 문서에 매핑했다.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notify = vi.hoisted(() => ({
  notifyBuyerStoreOrderAutoCompleted: vi.fn(async () => undefined),
  notifyBuyerStoreOrderOwnerStatus: vi.fn(async () => undefined),
  notifyStoreOwnerAcceptTimeoutCancelled: vi.fn(async () => undefined),
  notifyBuyerStoreRefundApproved: vi.fn(async () => undefined),
  notifyBuyerStoreRefundRejected: vi.fn(async () => undefined),
  notifyStoreOwnerBuyerCancelled: vi.fn(async () => undefined),
  notifyStoreOwnerRefundRequested: vi.fn(async () => undefined),
}));
const stock = vi.hoisted(() => ({ restoreStockForOrder: vi.fn(async () => ({ ok: true })) }));
const coin = vi.hoisted(() => ({ reverseCoinCreditsForOrder: vi.fn(async () => ({ ok: true })) }));

vi.mock("@/lib/notifications/notify-store-commerce", () => notify);
vi.mock("@/lib/stores/store-order-events", () => ({
  createStoreOrderEvent: vi.fn(async () => ({ ok: true, inserted: true, row: { id: "ev-x" } })),
  createStoreOrderStatusEvent: vi.fn(async () => ({ ok: true, inserted: true, row: { id: "ev-1" } })),
}));
vi.mock("@/lib/stores/store-order-detail-snapshot-cache", () => ({
  purgeStoreOrderDetailSnapshotRows: vi.fn(async () => undefined),
  invalidateStoreOrderDetailSnapshot: vi.fn(),
}));
vi.mock("@/lib/stores/restore-order-stock", () => stock);
vi.mock("@/lib/currency/coin-reversal-writer", () => coin);
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/community-messenger/store-order-chat-service", () => ({
  appendStoreOrderMessengerStatusTransition: vi.fn(async () => undefined),
  syncStoreOrderMessengerRoomContextMeta: vi.fn(async () => undefined),
}));
vi.mock("@/lib/notifications/pipeline/notify-read-service", () => ({ markOrderNotificationsRead: vi.fn(async () => undefined) }));
vi.mock("@/lib/delivery/customer/buyer-store-orders-list-snapshot-cache", () => ({
  invalidateBuyerStoreOrdersListSnapshot: vi.fn(),
}));
vi.mock("@/lib/stores/cancel-store-settlement", () => ({ cancelScheduledSettlementForOrder: vi.fn(async () => undefined) }));
vi.mock("@/lib/stores/adjust-store-settlement-on-refund", () => ({ adjustStoreSettlementOnRefund: vi.fn(async () => undefined) }));
vi.mock("@/lib/stores/ensure-store-settlement", () => ({
  ensureStoreSettlementForCompletedOrder: vi.fn(async () => undefined),
  LEGACY_STORE_SETTLEMENT_WRITER_ENABLED: false,
}));
vi.mock("@/lib/stores/load-commerce-settings", () => ({ loadCommerceSettings: vi.fn(async () => ({ autoCompleteDays: 3 })) }));
vi.mock("@/lib/currency/recognize-order-currency-on-completed", () => ({
  recognizeOrderCurrencyOnCompleted: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/discovery/store-order-popularity-projection", () => ({
  applyStoreOrderPopularityProjectionOnCompleted: vi.fn(async () => undefined),
}));
vi.mock("@/lib/stores/load-store-coupon-visual-context", () => ({ loadStoreCouponVisualContextBatch: async () => ({}) }));

import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { loadCustomerCouponWalletCards } from "@/lib/stores/load-customer-coupon-wallet-cards";

/** TS 가 직접 부르면 안 되는 역거래 RPC (DB 함수 안에서만 실행) */
const TS_MONEY_RPCS = [
  "restore_store_coupon_entitlement",
  "gift_certificate_cancel_order_restore",
  "gift_certificate_redemption_reverse",
  "reverse_coin_credits_for_order",
];
/** 상태 전이 + 역거래를 한 TX 로 수행하는 DB 함수 */
const ATOMIC = {
  direct: "store_order_cancel_direct_atomic",
  ownerCancel: "store_order_owner_cancel_atomic",
  decide: "store_order_cancel_request_decide_atomic",
  refund: "gift_certificate_refund_order_atomic",
};

function fakeSb(orderRow: Record<string, unknown>, rpcResults: Record<string, { data: unknown; error: null }> = {}) {
  const writes: Array<{ table: string; op: string }> = [];
  const rpc = vi.fn(async (name: string) => rpcResults[name] ?? { data: { ok: true }, error: null });
  const sb = {
    rpc,
    from(table: string) {
      let op = "select";
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        update: () => {
          op = "update";
          writes.push({ table, op });
          return chain;
        },
        delete: () => {
          op = "delete";
          writes.push({ table, op });
          return chain;
        },
        maybeSingle: async () => {
          if (table === "store_orders" && op === "select") return { data: orderRow, error: null };
          if (table === "store_orders") return { data: { id: orderRow.id }, error: null };
          if (table === "stores") return { data: { owner_user_id: "owner-1" }, error: null };
          return { data: null, error: null };
        },
        then: (res: (v: { data: null; error: null }) => unknown) => res({ data: null, error: null }),
      };
      return chain;
    },
  } as never;
  return { sb, rpc, writes };
}

const order = (status: string, money: Record<string, unknown>) => ({
  id: "o1",
  store_id: "s1",
  order_status: status,
  fulfillment_type: "local_delivery",
  payment_status: "paid",
  payment_amount: 450,
  auto_complete_at: null,
  buyer_user_id: "b1",
  order_no: "N1",
  created_at: "2026-10-21T00:00:00Z",
  ...money,
});

const CASES: Array<[string, Record<string, unknown>]> = [
  ["매장 부담 쿠폰", { coupon_campaign_id: "cc1", user_coupon_id: "uc1", discount_amount: 50, store_funded_amount: 50, platform_funded_amount: 0 }],
  ["플랫폼 부담 쿠폰", { coupon_campaign_id: "cc2", user_coupon_id: "uc2", discount_amount: 50, store_funded_amount: 0, platform_funded_amount: 50 }],
  ["상품권 사용", { gift_instance_ids: ["g1"], amount_before_gift: 500, payment_amount: 200 }],
];
const ownerAudit = { actor_type: "user" as const, actor_id: "owner-1", action: "t" };
const names = (rpc: ReturnType<typeof vi.fn>) => rpc.mock.calls.map((c) => String(c[0]));

function expectSingleAtomic(rpc: ReturnType<typeof vi.fn>, fn: string) {
  const called = names(rpc);
  expect(called.filter((n) => n === fn)).toHaveLength(1);
  for (const n of TS_MONEY_RPCS) expect(called).not.toContain(n);
  for (const other of Object.values(ATOMIC)) if (other !== fn) expect(called).not.toContain(other);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("S06 L1 — 케이스 1~3 × 취소 경로: 상태 + 역거래 = DB 함수 1회, TS 역거래 0", () => {
  for (const [label, money] of CASES) {
    it(`${label}: 주문자 접수 전 취소 → ${ATOMIC.direct} 1회`, async () => {
      const { sb, rpc, writes } = fakeSb(order("pending", { ...money, payment_status: "pending" }));
      const r = await applyStoreOrderStatusTransition(sb, {
        orderId: "o1",
        nextStatus: "cancelled",
        actor: "CUSTOMER",
        audit: { actor_type: "user", actor_id: "b1", action: "t" },
      });
      expect(r).toMatchObject({ ok: true, order_status: "cancelled" });
      expectSingleAtomic(rpc, ATOMIC.direct);
      expect(writes.some((w) => w.table === "store_orders")).toBe(false);
      expect(coin.reverseCoinCreditsForOrder).not.toHaveBeenCalled();
    });

    it(`${label}: 오너 직접 취소(사유) → ${ATOMIC.ownerCancel} 1회`, async () => {
      const { sb, rpc } = fakeSb(order("preparing", money));
      const r = await applyStoreOrderStatusTransition(sb, {
        orderId: "o1",
        nextStatus: "cancelled",
        actor: "OWNER",
        ownerDirectCancel: { reason: "out of stock" },
        audit: ownerAudit,
      });
      expect(r).toMatchObject({ ok: true, order_status: "cancelled" });
      expectSingleAtomic(rpc, ATOMIC.ownerCancel);
    });

    it(`${label}: 구매자 취소 요청 → 오너 승인 → ${ATOMIC.decide} 1회`, async () => {
      const { sb, rpc } = fakeSb(order("cancel_requested", money));
      const r = await applyStoreOrderStatusTransition(sb, {
        orderId: "o1",
        nextStatus: "cancelled",
        actor: "OWNER",
        cancelRequestDecision: { decision: "approve", actorRole: "owner" },
        audit: ownerAudit,
      });
      expect(r).toMatchObject({ ok: true, order_status: "cancelled" });
      expectSingleAtomic(rpc, ATOMIC.decide);
    });
  }
});

describe("S06 L1 — 환불 승인(오너·관리자) × 4 케이스: 환불 DB 함수 1회 (Coin·쿠폰 역분개 포함), 재요청 부수효과 0", () => {
  const ALL: Array<[string, Record<string, unknown>]> = [
    ...CASES,
    ["완료 후 환불 Coin 역분개", { platform_funded_amount: 50, coupon_campaign_id: "cc2", user_coupon_id: "uc2", order_status_before: "completed" }],
  ];
  for (const [label, money] of ALL) {
    for (const actor of ["OWNER", "ADMIN"] as const) {
      it(`${label}: ${actor} refund_requested → refunded = ${ATOMIC.refund} 1회, TS Coin 역분개 0`, async () => {
        const { sb, rpc } = fakeSb(order("refund_requested", money));
        const r = await applyStoreOrderStatusTransition(sb, {
          orderId: "o1",
          nextStatus: "refunded",
          actor,
          audit: { actor_type: actor === "OWNER" ? "user" : "admin", actor_id: "x", action: "t" },
        });
        expect(r).toMatchObject({ ok: true, order_status: "refunded" });
        expectSingleAtomic(rpc, ATOMIC.refund);
        expect(coin.reverseCoinCreditsForOrder).not.toHaveBeenCalled();
        expect(notify.notifyBuyerStoreRefundApproved).toHaveBeenCalledTimes(1);
      });
    }

    it(`${label}: 같은 환불 재요청(DB idempotent) → 재고·알림 부수효과 0`, async () => {
      const { sb, rpc } = fakeSb(order("refund_requested", money), {
        [ATOMIC.refund]: { data: { ok: true, idempotent: true }, error: null },
      });
      const r = await applyStoreOrderStatusTransition(sb, {
        orderId: "o1",
        nextStatus: "refunded",
        actor: "OWNER",
        audit: ownerAudit,
      });
      expect(r).toMatchObject({ ok: true, idempotent: true });
      expectSingleAtomic(rpc, ATOMIC.refund);
      expect(stock.restoreStockForOrder).not.toHaveBeenCalled();
      expect(notify.notifyBuyerStoreRefundApproved).not.toHaveBeenCalled();
    });
  }

  it("환불 DB 함수 계약: Coin 역분개 키 coin_reversal:order:{id} · 쿠폰 복원 · 상태 갱신이 한 함수 본문", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20270603130000_stage2_2c_cancel_refund_money_atomic.sql"),
      "utf8"
    );
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION public.gift_certificate_refund_order_atomic(");
    const body = sql.slice(start, sql.indexOf("$function$;", start));
    expect(body).toContain("SET order_status = 'refunded'");
    expect(body).toContain("'coin_reversal:order:' || p_order_id::text");
    expect(body).toContain("public.restore_store_coupon_entitlement(p_order_id, true)");
  });
});

describe("S06 L1 — 주문자 결과: 복원 쿠폰은 만료 전 사용 가능, 만료 후 만료", () => {
  function walletSb(rows: Array<Record<string, unknown>>) {
    const chain: Record<string, unknown> = {};
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: async () => ({ data: rows, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res),
    });
    return { from: () => chain } as never;
  }
  const campaign = {
    title: "T",
    discount_type: "fixed_amount",
    discount_value: 50,
    min_order_amount: null,
    max_discount: null,
    terms_copy: null,
    funding_mode: "STORE_FUNDED",
    first_order_scope: null,
    end_at: null,
    issuer_role: "owner",
    campaign_purpose: null,
    created_by_user_id: null,
  };
  const ent = (id: string, status: string, expiresAt: string) => ({
    id,
    campaign_id: "cc1",
    store_id: "s1",
    status,
    reserved_php: 50,
    expires_at: expiresAt,
    redeemed_order_id: null,
    created_at: "2026-10-01T00:00:00Z",
    coupon_number: id,
    store_coupon_campaigns: campaign,
  });

  it("restored(만료 30일 후) → available 버킷·장바구니 선택 가능, restored(만료 지남) → expired·선택 불가", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const r = await loadCustomerCouponWalletCards(
      walletSb([ent("e-live", "restored", future), ent("e-old", "restored", past)]),
      { buyerUserId: "b1", tab: "all" }
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const live = r.cards.find((c) => c.entitlementId === "e-live");
    const old = r.cards.find((c) => c.entitlementId === "e-old");
    expect(live).toMatchObject({ bucket: "available", selectableInCart: true });
    expect(old).toMatchObject({ bucket: "expired", selectableInCart: false });
  });

  it("체크아웃·자동 추천·쿠폰 받기 화면이 restored 를 사용 가능 상태로 받는다", () => {
    const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
    expect(read("app/api/me/store-orders/route.ts")).toContain('!["available", "restored"].includes(String(ent.status))');
    expect(read("lib/stores/store-coupon-best-eligible.ts")).toContain('.in("status", ["available", "restored"])');
  });
});
