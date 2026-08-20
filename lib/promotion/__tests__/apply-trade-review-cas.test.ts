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
import {
  approveTradePaidExposure,
  computeTradePromotionActiveWindow,
  rejectTradePaidExposure,
} from "@/lib/promotion/apply-trade-paid-exposure";

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

  it("second approve after active does not credit and is not_pending on reject", async () => {
    const sb = createMemorySb({ order: pendingOrder(), holds: [held()] });
    const first = await approveTradePaidExposure(sb as never, {
      orderId: "ord-1",
      adminUserId: "admin",
    });
    expect(first.ok).toBe(true);
    expect(sb.state.order.order_status).toBe("active");
    expect(sb.state.holds[0]?.status).toBe("captured");

    const second = await approveTradePaidExposure(sb as never, {
      orderId: "ord-1",
      adminUserId: "admin",
    });
    expect(second.ok).toBe(true);
    expect(sb.state.holds.filter((h) => h.status === "captured")).toHaveLength(1);

    const rej = await rejectTradePaidExposure(sb as never, {
      orderId: "ord-1",
      reason: "nope",
    });
    expect(rej.ok).toBe(false);
    if (!rej.ok) expect(rej.error).toBe("not_pending");
    expect(creditMock).not.toHaveBeenCalled();
  });

  it("second reject does not credit twice", async () => {
    const sb = createMemorySb({ order: pendingOrder(), holds: [held()] });
    const first = await rejectTradePaidExposure(sb as never, {
      orderId: "ord-1",
      reason: "spam",
    });
    expect(first.ok).toBe(true);
    expect(sb.state.order.order_status).toBe("rejected");
    expect(sb.state.holds[0]?.status).toBe("released");
    expect(creditMock).toHaveBeenCalledTimes(1);

    const second = await rejectTradePaidExposure(sb as never, {
      orderId: "ord-1",
      reason: "spam2",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toBe("not_pending");
    expect(creditMock).toHaveBeenCalledTimes(1);
  });

  it("concurrent-style approve then reject: reject loses CAS", async () => {
    const sb = createMemorySb({ order: pendingOrder(), holds: [held()] });
    const ok = await approveTradePaidExposure(sb as never, {
      orderId: "ord-1",
      adminUserId: "admin",
    });
    expect(ok.ok).toBe(true);
    const rej = await rejectTradePaidExposure(sb as never, {
      orderId: "ord-1",
      reason: "late",
    });
    expect(rej.ok).toBe(false);
    expect(sb.state.order.order_status).toBe("active");
    expect(sb.state.holds[0]?.status).toBe("captured");
    expect(creditMock).not.toHaveBeenCalled();
  });

  it("concurrent-style reject then approve: approve loses CAS", async () => {
    const sb = createMemorySb({ order: pendingOrder(), holds: [held()] });
    const rej = await rejectTradePaidExposure(sb as never, {
      orderId: "ord-1",
      reason: "no",
    });
    expect(rej.ok).toBe(true);
    const ok = await approveTradePaidExposure(sb as never, {
      orderId: "ord-1",
      adminUserId: "admin",
    });
    expect(ok.ok).toBe(false);
    if (!ok.ok) expect(ok.error).toBe("not_pending");
    expect(sb.state.order.order_status).toBe("rejected");
    expect(sb.state.holds[0]?.status).toBe("released");
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
