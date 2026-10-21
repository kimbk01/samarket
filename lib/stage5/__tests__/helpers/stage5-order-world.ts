/**
 * 5단계 L1 공용 — 주문 1건을 추적하는 상태형 Supabase mock.
 *
 * - `store_orders` UPDATE 는 `.eq("order_status", x)` CAS 를 그대로 적용한다 (불일치 → 0행).
 * - 주문 DB 함수(RPC)는 **계약 응답만** 흉내 낸다 (`p_expected_status` CAS · 원장 행 기록). 실제 SQL 의
 *   트랜잭션·트리거(수수료 의무·검토 플래그)는 L2 영역이며 여기서 증명하지 않는다.
 * - 모든 쓰기·RPC 호출을 기록해 "TS 가 수수료·캐시 원장을 쓰지 않는다" 같은 부정 조건을 검사한다.
 */
type Row = Record<string, unknown>;
type Filter = [string, string, unknown];

export type Stage5Write = { table: string; op: "update" | "insert" | "delete"; payload: unknown; filters: Filter[] };

/** `store_order_cancel_requests` columns as the DB functions write them (20270512120000 / 20270603130000). */
export type Stage5CancelRequest = {
  id: string;
  order_id: string;
  status: "pending" | "approved" | "rejected";
  previous_order_status: string;
  requested_by: string;
  requested_role: "buyer" | "owner";
  reason: string;
  detail_reason?: string | null;
  approved_by?: string | null;
  rejected_reason?: string | null;
  created_at: string;
};

export type Stage5OrderWorld = {
  order: Row;
  cancelRequests: Stage5CancelRequest[];
  writes: Stage5Write[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
  /** Force the next RPC with this name to answer this payload (once). */
  rpcOverride: Map<string, { data: unknown; error: { message: string } | null }>;
  /** `store_order_deliveries` row for this order (null = no dispatch row). */
  delivery: Row | null;
  /** The next `store_orders` UPDATE fails with this message (e.g. the commission trigger RAISE). */
  nextOrderUpdateError: string | null;
  /** Simulate another session moving the order between a read and a write. */
  setStatus: (s: string) => void;
  sb: never;
};

const FEE_TABLES = ["store_sale_fee_obligations", "business_cash_ledger", "business_cash_accounts", "store_settlements"];
export const isFeeOrCashTable = (t: string) => FEE_TABLES.includes(t);

export function createStage5OrderWorld(init: Row, opts: { ownerUserId?: string } = {}): Stage5OrderWorld {
  const ownerUserId = opts.ownerUserId ?? "owner-1";
  const world: Stage5OrderWorld = {
    order: { admin_locked: false, auto_complete_at: null, ...init },
    cancelRequests: [],
    writes: [],
    rpcCalls: [],
    rpcOverride: new Map(),
    nextOrderUpdateError: null,
    delivery: null,
    setStatus: (s) => {
      world.order.order_status = s;
    },
    sb: undefined as never,
  };

  /** eq / in / gte / lte (ISO strings compare lexically) — other operators are ignored. */
  const eqMatch = (filters: Filter[], row: Row) =>
    filters.every(([m, col, val]) => {
      if (m === "eq") return row[col] === val;
      if (m === "in") return (val as unknown[]).includes(row[col]);
      if (m === "gte") return row[col] != null && String(row[col]) >= String(val);
      if (m === "lte") return row[col] != null && String(row[col]) <= String(val);
      return true;
    });

  const read = (table: string, filters: Filter[], single: boolean): unknown => {
    if (table === "store_orders") {
      const hit = eqMatch(filters, world.order) ? { ...world.order } : null;
      return single ? hit : hit ? [hit] : [];
    }
    if (table === "stores") {
      const store = { id: world.order.store_id, owner_user_id: ownerUserId };
      return single ? store : [store];
    }
    if (table === "store_order_deliveries") {
      const hit = world.delivery ? { ...world.delivery } : null;
      return single ? hit : hit ? [hit] : [];
    }
    if (table === "store_order_cancel_requests") {
      const hits = world.cancelRequests.filter((r) => eqMatch(filters, r as unknown as Row)).reverse();
      return single ? (hits[0] ?? null) : hits;
    }
    return single ? null : [];
  };

  const from = (table: string) => {
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: unknown = null;
    const filters: Filter[] = [];
    const settle = (single: boolean): { data: unknown; error: null } => {
      if (op === "select") return { data: read(table, filters, single), error: null };
      world.writes.push({ table, op, payload, filters: [...filters] });
      if (op === "update" && table === "store_orders") {
        if (world.nextOrderUpdateError) {
          const message = world.nextOrderUpdateError;
          world.nextOrderUpdateError = null;
          return { data: null, error: { message } } as never;
        }
        if (!eqMatch(filters, world.order)) return { data: single ? null : [], error: null };
        Object.assign(world.order, payload as Row);
        return { data: single ? { id: world.order.id } : [{ id: world.order.id }], error: null };
      }
      return { data: single ? null : [], error: null };
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      order: self,
      limit: self,
      range: self,
      not: self,
      gte: (c: string, v: unknown) => {
        filters.push(["gte", c, v]);
        return chain;
      },
      lte: (c: string, v: unknown) => {
        filters.push(["lte", c, v]);
        return chain;
      },
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return chain;
      },
      insert: (p: unknown) => {
        op = "insert";
        payload = p;
        return chain;
      },
      upsert: (p: unknown) => {
        op = "insert";
        payload = p;
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      eq: (c: string, v: unknown) => {
        filters.push(["eq", c, v]);
        return chain;
      },
      in: (c: string, v: unknown) => {
        filters.push(["in", c, v]);
        return chain;
      },
      maybeSingle: async () => settle(true),
      single: async () => settle(true),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(settle(false)).then(res, rej),
    });
    return chain;
  };

  const casOrFail = (expected: unknown): boolean => world.order.order_status === expected;

  const rpc = async (name: string, args: Record<string, unknown> = {}) => {
    world.rpcCalls.push({ name, args });
    const forced = world.rpcOverride.get(name);
    if (forced) {
      world.rpcOverride.delete(name);
      return forced;
    }
    switch (name) {
      case "store_order_cancel_direct_atomic": {
        if (!casOrFail(args.p_expected_status)) return { data: { ok: false, error: "transition_conflict" }, error: null };
        Object.assign(world.order, { order_status: "cancelled", payment_status: args.p_payment_status });
        return { data: { ok: true, side_effects: { ok: true } }, error: null };
      }
      case "store_order_owner_cancel_atomic": {
        if (!casOrFail(args.p_expected_status)) return { data: { ok: false, error: "transition_conflict" }, error: null };
        world.cancelRequests.push({
          id: `req-${world.cancelRequests.length + 1}`,
          order_id: String(args.p_order_id),
          status: "approved",
          previous_order_status: String(args.p_expected_status),
          requested_by: String(args.p_owner_user_id),
          requested_role: "owner",
          reason: String(args.p_reason),
          detail_reason: (args.p_detail as string | null) ?? null,
          approved_by: String(args.p_owner_user_id),
          created_at: "2026-10-21T02:00:00.000Z",
        });
        Object.assign(world.order, { order_status: "cancelled", payment_status: "cancelled" });
        return { data: { ok: true, side_effects: { ok: true } }, error: null };
      }
      case "store_order_buyer_cancel_request_atomic": {
        if (!casOrFail(args.p_expected_status)) return { data: { ok: false, error: "transition_conflict" }, error: null };
        world.cancelRequests.push({
          id: `req-${world.cancelRequests.length + 1}`,
          order_id: String(args.p_order_id),
          status: "pending",
          previous_order_status: String(args.p_expected_status),
          requested_by: String(args.p_buyer_user_id),
          requested_role: "buyer",
          reason: String(args.p_reason),
          created_at: "2026-10-21T02:00:00.000Z",
        });
        Object.assign(world.order, { order_status: "cancel_requested" });
        return { data: { ok: true }, error: null };
      }
      case "store_order_cancel_request_decide_atomic": {
        if (!casOrFail(args.p_expected_status)) return { data: { ok: false, error: "transition_conflict" }, error: null };
        const req = [...world.cancelRequests].reverse().find((r) => r.status === "pending");
        if (!req) return { data: { ok: false, error: "cancel_request_not_found" }, error: null };
        if (args.p_decision === "approve") {
          req.status = "approved";
          req.approved_by = String(args.p_actor_user_id);
          Object.assign(world.order, { order_status: "cancelled", payment_status: "cancelled" });
        } else {
          if (args.p_restore_status !== req.previous_order_status) {
            return { data: { ok: false, error: "restore_status_mismatch" }, error: null };
          }
          req.status = "rejected";
          req.rejected_reason = (args.p_reason as string | null) ?? null;
          Object.assign(world.order, { order_status: req.previous_order_status });
        }
        return { data: { ok: true, side_effects: args.p_decision === "approve" ? { ok: true } : null }, error: null };
      }
      default:
        return { data: { ok: true }, error: null };
    }
  };

  world.sb = { from, rpc } as never;
  return world;
}

/** Writes and RPCs that would move fee / Cash money from TS (forbidden — DB trigger owns commission). */
export function feeOrCashTouches(world: Stage5OrderWorld): string[] {
  const out: string[] = [];
  for (const w of world.writes) if (isFeeOrCashTable(w.table)) out.push(`${w.op}:${w.table}`);
  for (const c of world.rpcCalls) {
    if (/sale_fee|commission_(charge|adjust|reverse)|business_cash|settle_store/i.test(c.name)) out.push(`rpc:${c.name}`);
  }
  return out;
}
