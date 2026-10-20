import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/points/user-point-ledger", () => ({
  spendUserPoints: vi.fn(async () => ({ ok: true })),
  creditUserPoints: vi.fn(async () => ({ ok: true })),
  appendUserPointLedgerAudit: vi.fn(async () => undefined),
}));

import { creditUserPoints } from "@/lib/points/user-point-ledger";
import {
  captureHeldPointsForPromotionOrder,
  releaseHeldPointsForPromotionOrder,
} from "@/lib/promotion/promotion-point-hold-flow";
import { computeTradePromotionActiveWindow } from "@/lib/promotion/apply-trade-paid-exposure";

const creditMock = vi.mocked(creditUserPoints);

type HoldRow = {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  promotion_order_id: string;
};

type OrderRow = Record<string, unknown>;

function createMemorySb(input: { order: OrderRow; holds: HoldRow[] }) {
  const state = {
    order: { ...input.order },
    holds: input.holds.map((h) => ({ ...h })),
  };

  function matches(row: Record<string, unknown>, filters: Record<string, string>) {
    return Object.entries(filters).every(([k, v]) => String(row[k] ?? "") === v);
  }

  function from(table: string) {
    const ctx: {
      table: string;
      filters: Record<string, string>;
      patch: Record<string, unknown> | null;
      inValues: { col: string; values: string[] } | null;
    } = { table, filters: {}, patch: null, inValues: null };

    const api = {
      select() {
        return api;
      },
      eq(col: string, val: string) {
        ctx.filters[col] = String(val);
        return api;
      },
      in(col: string, values: string[]) {
        ctx.inValues = { col, values };
        return api;
      },
      update(patch: Record<string, unknown>) {
        ctx.patch = patch;
        return api;
      },
      async maybeSingle() {
        if (ctx.table === "point_promotion_orders") {
          if (ctx.patch) {
            if (!matches(state.order, ctx.filters)) {
              return { data: null, error: null };
            }
            Object.assign(state.order, ctx.patch);
            return { data: { id: state.order.id }, error: null };
          }
          if (ctx.filters.id && String(state.order.id) !== ctx.filters.id) {
            return { data: null, error: null };
          }
          return { data: { ...state.order }, error: null };
        }
        if (ctx.table === "promotion_point_holds" && ctx.patch) {
          const row = state.holds.find((h) => matches(h as unknown as Record<string, unknown>, ctx.filters));
          if (!row) return { data: null, error: null };
          Object.assign(row, ctx.patch);
          return { data: { id: row.id }, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (ctx.table === "promotion_point_holds" && !ctx.patch) {
          let rows = state.holds;
          if (ctx.filters.promotion_order_id) {
            rows = rows.filter((h) => h.promotion_order_id === ctx.filters.promotion_order_id);
          }
          if (ctx.filters.status) {
            rows = rows.filter((h) => h.status === ctx.filters.status);
          }
          resolve({ data: rows.map((h) => ({ ...h })), error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return api;
  }

  return { from, state };
}

describe("trade promotion review CAS", () => {
  beforeEach(() => {
    creditMock.mockClear();
    creditMock.mockResolvedValue({ ok: true, balanceAfter: 0 });
  });

  const pendingOrder = (): OrderRow => ({
    id: "ord-1",
    user_id: "u1",
    domain: "trade",
    order_status: "pending_review",
    point_cost: 500,
    duration_days: 7,
  });

  const held = (): HoldRow => ({
    id: "h1",
    user_id: "u1",
    amount: 500,
    status: "held",
    promotion_order_id: "ord-1",
  });

  // 거래 Admin 설계 v2 §G-0: approve/rejectTradePaidExposure(TS CAS) 삭제 — 승인·반려는 DB 함수 1번(주문 행 잠금 →
  // pending_review 확인 → 보류 확정/해제 → 감사)으로 한 트랜잭션. 두 번째 승인·반려는 already_processed 로 끝난다.
  it("approve / reject CAS lives in one DB transaction (row lock + pending_review gate)", () => {
    const mig = readFileSync(
      join(process.cwd(), "supabase/migrations/20270522120400_trade_admin_m8_trade_promotion_tx.sql"),
      "utf8"
    );
    for (const fn of ["admin_trade_promotion_approve", "admin_trade_promotion_reject"]) {
      const body = mig.slice(mig.indexOf(`function public.${fn}(`));
      expect(body).toMatch(
        /from public\.point_promotion_orders where id = p_order_id for update;[\s\S]{0,400}order_status <> 'pending_review'/
      );
      expect(body).toMatch(/from public\.promotion_point_holds where promotion_order_id = p_order_id for update/);
    }
    const admin = readFileSync(join(process.cwd(), "lib/admin/trade-admin/trade-promotion-admin.ts"), "utf8");
    expect(admin).toContain('fn = "admin_trade_promotion_approve"');
    expect(admin).toContain("admin_trade_promotion_${input.action}");
  });

  it("double capture CAS: second capture is no-op", async () => {
    const sb = createMemorySb({ order: pendingOrder(), holds: [held()] });
    const a = await captureHeldPointsForPromotionOrder(sb as never, {
      orderId: "ord-1",
      userId: "u1",
      pointCost: 500,
    });
    const b = await captureHeldPointsForPromotionOrder(sb as never, {
      orderId: "ord-1",
      userId: "u1",
      pointCost: 500,
    });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(sb.state.holds[0]?.status).toBe("captured");
  });

  it("double release CAS: second release does not credit", async () => {
    const sb = createMemorySb({ order: pendingOrder(), holds: [held()] });
    const a = await releaseHeldPointsForPromotionOrder(sb as never, { orderId: "ord-1" });
    const b = await releaseHeldPointsForPromotionOrder(sb as never, { orderId: "ord-1" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(creditMock).toHaveBeenCalledTimes(1);
  });
});

describe("approve clock", () => {
  it("trade_promote_7 window is 7 days from approve now, not purchase", () => {
    const now = Date.parse("2026-08-20T08:00:00.000Z");
    const w = computeTradePromotionActiveWindow(now, 7);
    expect(w.startAt).toBe("2026-08-20T08:00:00.000Z");
    expect(w.endAt).toBe("2026-08-27T08:00:00.000Z");
    const w14 = computeTradePromotionActiveWindow(now, 14);
    expect(w14.endAt).toBe("2026-09-03T08:00:00.000Z");
  });
});
