import { describe, expect, it } from "vitest";
import {
  isMissingRelationError,
  loadAdminActionQueueCounts,
  STORE_ORDER_ADMIN_QUEUE_OR_FILTER,
} from "@/lib/admin/admin-action-queue";
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES,
  formatAdminBellBadge,
  menuKeyHasUnavailableAdminQueue,
  sumAdminQueueCountsForMenuKey,
} from "@/lib/admin/admin-action-queue-registry";

type Result = { count?: number | null; data?: unknown[] | null; error?: { message?: string; code?: string } | null };

/** Minimal PostgREST builder fake: records filters per table, resolves to a configured result. */
function fakeSb(results: Record<string, Result>, calls: { table: string; ops: string[] }[] = []) {
  return {
    from(table: string) {
      const rec = { table, ops: [] as string[] };
      calls.push(rec);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "or", "limit", "neq", "not"]) {
        builder[op] = (...args: unknown[]) => {
          rec.ops.push(`${op}:${JSON.stringify(args)}`);
          return builder;
        };
      }
      builder.then = (resolve: (r: Result) => unknown) =>
        resolve(results[table] ?? { count: 0, data: [], error: null });
      return builder;
    },
  } as never;
}

const PROD_SNAPSHOT: Record<string, Result> = {
  // Direct-pay model: admin settlement work = cancel/refund commission reviews only.
  store_sale_fee_obligations: { count: 1, error: null },
  store_orders: { count: 63, error: null },
  delivery_ad_operations_cases: { count: 8, error: null },
  reports: { count: 2, error: null },
  community_messenger_reports: { count: 0, error: null },
  store_inquiries: { count: 4, error: null },
  feed_ad_requests: { data: [], error: null },
};

describe("Admin Action Queue registry contract", () => {
  it("every category is registered once; owner/legacy categories never enter the total", () => {
    const keys = ADMIN_ACTION_QUEUE_REGISTRY.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES).not.toContain("store_inquiry_open");
    expect(ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES).not.toContain("store_charges");
    for (const d of ADMIN_ACTION_QUEUE_REGISTRY) {
      if (ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES.includes(d.key)) {
        expect(d.nextActor).toBe("admin");
        expect(d.listHref, `${d.key} needs an admin list`).toMatch(/^\/admin/);
      }
    }
  });

  it("total == Σ ok in-total categories (no chat_room double count, owner work excluded)", async () => {
    const calls: { table: string; ops: string[] }[] = [];
    const sb = fakeSb(PROD_SNAPSHOT, calls);
    const r = await loadAdminActionQueueCounts({ storesSb: sb, notesSb: sb });
    // 1 + 63 + 8 + 2 (messenger 0, store_inquiry 4 is owner work)
    expect(r.total).toBe(74);
    expect(r.total_complete).toBe(true);
    const sum = r.categories
      .filter((c) => c.inTotal && c.status === "ok")
      .reduce((n, c) => n + (c.count ?? 0), 0);
    expect(sum).toBe(r.total);
    // trade `reports` is queried exactly once (ownership: chat_room belongs to `reports`)
    expect(calls.filter((c) => c.table === "reports")).toHaveLength(1);
    expect(r.store_inquiry_open).toBe(4);
    expect(r.categories.find((c) => c.key === "store_inquiry_open")?.inTotal).toBe(false);
  });

  it("orders predicate = admin decision statuses OR attention flag on a non-closed order", async () => {
    expect(STORE_ORDER_ADMIN_QUEUE_OR_FILTER).toBe(
      "order_status.in.(cancel_requested,refund_requested),and(needs_admin_attention.eq.true,order_status.not.in.(completed,cancelled,refunded))"
    );
    const calls: { table: string; ops: string[] }[] = [];
    await loadAdminActionQueueCounts({ storesSb: fakeSb({}, calls), notesSb: fakeSb({}) });
    const orders = calls.find((c) => c.table === "store_orders");
    expect(orders?.ops.some((o) => o.startsWith("or:"))).toBe(true);
    const settle = calls.find((c) => c.table === "store_sale_fee_obligations");
    expect(settle?.ops).toContain('eq:["adjustment_status","review_required"]');
    expect(calls.some((c) => c.table === "store_settlements")).toBe(false);
  });

  it("a real error is unavailable (count null, total incomplete) — never a silent 0", async () => {
    const sb = fakeSb({
      ...PROD_SNAPSHOT,
      store_sale_fee_obligations: {
        count: null,
        error: { code: "42501", message: "permission denied for table store_sale_fee_obligations" },
      },
      // column drift: names the relation but is NOT a missing relation
      reports: { count: null, error: { code: "42703", message: "column reports.status does not exist" } },
    });
    const r = await loadAdminActionQueueCounts({ storesSb: sb, notesSb: sb });
    const settle = r.categories.find((c) => c.key === "settlements_actionable");
    expect(settle).toMatchObject({ status: "unavailable", count: null });
    expect(r.categories.find((c) => c.key === "reports")?.status).toBe("unavailable");
    expect(r.total_complete).toBe(false);
    expect(r.unavailable).toEqual(expect.arrayContaining(["settlements_actionable", "reports"]));
    expect(r.total).toBe(63 + 8);
  });

  it("only a missing SOURCE relation is treated as not-deployed (0)", () => {
    expect(isMissingRelationError({ code: "42P01", message: 'relation "public.meeting_reports" does not exist' }, "meeting_reports")).toBe(true);
    expect(isMissingRelationError({ code: "PGRST205", message: "Could not find the table 'public.stores' in the schema cache" }, "stores")).toBe(true);
    expect(isMissingRelationError({ code: "42P01", message: 'relation "public.store_reports" does not exist' }, "reports")).toBe(false);
    expect(isMissingRelationError({ code: "42703", message: "column stores.approval_status does not exist" }, "stores")).toBe(false);
    expect(isMissingRelationError({ code: "57014", message: "canceling statement due to statement timeout" }, "reports")).toBe(false);
  });

  it("missing supabase client is unavailable, not zero", async () => {
    const r = await loadAdminActionQueueCounts({ storesSb: null, notesSb: null });
    expect(r.total_complete).toBe(false);
    expect(r.categories.find((c) => c.key === "settlements_actionable")?.status).toBe("unavailable");
  });

  it("permission scope hides categories the caller cannot act on (and excludes them from total)", async () => {
    const sb = fakeSb(PROD_SNAPSHOT);
    const operator = await loadAdminActionQueueCounts({
      storesSb: sb,
      notesSb: sb,
      permissionScope: { isSuperAdmin: false, permissions: [] },
    });
    expect(operator.categories.find((c) => c.key === "settlements_actionable")).toMatchObject({
      status: "forbidden",
      count: null,
    });
    expect(operator.categories.find((c) => c.key === "reports")?.status).toBe("forbidden");
    expect(operator.total).toBe(63 + 8);
    expect(operator.total_complete).toBe(true);

    const finance = await loadAdminActionQueueCounts({
      storesSb: sb,
      notesSb: sb,
      permissionScope: { isSuperAdmin: false, permissions: ["business", "reports"] },
    });
    expect(finance.total).toBe(74);

    const sup = await loadAdminActionQueueCounts({
      storesSb: sb,
      notesSb: sb,
      permissionScope: { isSuperAdmin: true, permissions: [] },
    });
    expect(sup.total).toBe(74);
  });

  it("sidebar badge sums mapped categories; unavailable mapped category flags the menu", () => {
    const cats = [
      { key: "cash_charges", count: 2, status: "ok", inTotal: true, nextActor: "admin", listHref: "/a" },
      { key: "user_charges", count: 3, status: "ok", inTotal: true, nextActor: "admin", listHref: "/b" },
      { key: "settlements_actionable", count: null, status: "unavailable", inTotal: true, nextActor: "admin", listHref: "/c" },
    ] as const;
    expect(sumAdminQueueCountsForMenuKey("store-finance-admin", cats)).toBe(5);
    expect(sumAdminQueueCountsForMenuKey("points-charge", cats)).toBe(3);
    expect(menuKeyHasUnavailableAdminQueue("store-settlements-admin", cats)).toBe(true);
    expect(menuKeyHasUnavailableAdminQueue("points-charge", cats)).toBe(false);
  });

  it("99+ only when the valid total is ≥ 100", () => {
    expect(formatAdminBellBadge(99)).toBe("99");
    expect(formatAdminBellBadge(100)).toBe("99+");
  });
});
