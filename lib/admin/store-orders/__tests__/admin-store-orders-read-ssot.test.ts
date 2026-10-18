import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_STORE_ORDERS_PAGE_SIZE,
  ADMIN_STORE_ORDERS_TAB_STATUSES,
  ADMIN_STORE_ORDERS_TABS,
  adminStoreOrderIntegrityFlags,
  adminStoreOrdersQueryToParams,
  adminStoreOrdersRpcArgs,
  parseAdminStoreOrdersQuery,
} from "@/lib/admin/store-orders/admin-store-orders-contract";
import { mapAdminStoreOrderRow } from "@/lib/admin/store-orders/load-admin-store-orders-page";
import {
  STORE_ORDER_ADMIN_DECISION_STATUSES,
  STORE_ORDER_CLOSED_STATUSES,
} from "@/lib/admin/admin-ops-actionable-status";
import { STORE_ORDER_STATUS_LIST } from "@/lib/stores/order-status-transitions";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const MIG = read("supabase/migrations/20270511120000_admin_store_orders_page.sql");
const LEDGER_MIG = read("supabase/migrations/20270510120000_store_commission_cash_ssot.sql");

function fnBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  return sql.slice(start, sql.indexOf("\n$$;", start));
}

describe("A. tabs = order status contract", () => {
  it("every order status is in exactly one tab (tab counts add up to all)", () => {
    const seen = Object.values(ADMIN_STORE_ORDERS_TAB_STATUSES).flat();
    expect([...seen].sort()).toEqual([...STORE_ORDER_STATUS_LIST].sort());
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("arrived (배송지도착) and completed (주문완료) stay different tabs", () => {
    expect(ADMIN_STORE_ORDERS_TAB_STATUSES.in_progress).toContain("arrived");
    expect(ADMIN_STORE_ORDERS_TAB_STATUSES.completed).toEqual(["completed"]);
  });

  it("tab groups and the admin queue predicate are passed to SQL from TS (not restated)", () => {
    const args = adminStoreOrdersRpcArgs(parseAdminStoreOrdersQuery(new URLSearchParams("queue=admin_attention")));
    expect(args.p_tab_groups).toBe(ADMIN_STORE_ORDERS_TAB_STATUSES);
    expect(args.p_queue_statuses).toEqual([...STORE_ORDER_ADMIN_DECISION_STATUSES]);
    expect(args.p_queue_closed_statuses).toEqual([...STORE_ORDER_CLOSED_STATUSES]);
    const body = fnBody(MIG, "admin_store_orders_page");
    for (const s of STORE_ORDER_STATUS_LIST) expect(body).not.toContain(`'${s}'`);
  });
});

describe("B. paging contract", () => {
  it("defaults: page 1, 50 rows, fixed order, snapshot", () => {
    const q = parseAdminStoreOrdersQuery(new URLSearchParams());
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(ADMIN_STORE_ORDERS_PAGE_SIZE);
    expect(ADMIN_STORE_ORDERS_PAGE_SIZE).toBe(50);
    const args = adminStoreOrdersRpcArgs({ ...q, page: 3 });
    expect(args.p_offset).toBe(100);
    expect(args.p_limit).toBe(50);
    const body = fnBody(MIG, "admin_store_orders_page");
    expect(body).toContain("ORDER BY f.created_at DESC, f.id DESC");
    expect(body).toContain("o.created_at <= pr.as_of");
    expect(MIG).toContain("ON public.store_orders (created_at DESC, id DESC)");
  });

  it("total and tab counts are computed from the same filtered base as the rows", () => {
    const body = fnBody(MIG, "admin_store_orders_page");
    expect(body).toContain("'total', (SELECT count(*) FROM filtered)");
    expect(body).toContain("FROM base b");
    expect(body).toContain("jsonb_build_object('all', (SELECT count(*) FROM base))");
  });

  it("page size is capped and invalid input falls back", () => {
    const q = parseAdminStoreOrdersQuery(new URLSearchParams("page=-4&page_size=99999&tab=nope&order_status=bogus&store_id=x"));
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(200);
    expect(q.tab).toBe("all");
    expect(q.orderStatus).toBeNull();
    expect(q.storeId).toBeNull();
  });

  it("URL round-trip keeps filters; page/as_of only when paging is requested", () => {
    const sp = new URLSearchParams(
      "tab=completed&store_name=김밥&order_no=SO1&buyer=w&period=custom&from=2026-09-01&to=2026-09-30&fulfillment=pickup&payment_status=paid&page=2&as_of=2026-10-01T00:00:00.000Z"
    );
    const q = parseAdminStoreOrdersQuery(sp);
    const out = adminStoreOrdersQueryToParams(q);
    expect(out.get("tab")).toBe("completed");
    expect(out.get("from")).toBe("2026-09-01");
    expect(out.get("page")).toBeNull();
    expect(out.get("as_of")).toBeNull();
    const paged = adminStoreOrdersQueryToParams(q, { includePaging: true });
    expect(paged.get("page")).toBe("2");
    expect(paged.get("as_of")).toBe("2026-10-01T00:00:00.000Z");
  });

  it("existing deep links stay exact filters", () => {
    const id = "c78d16e6-8294-4ea6-b765-8bac8f037b43";
    const q = parseAdminStoreOrdersQuery(new URLSearchParams(`order_id=${id}&store_id=${id}&buyer_user_id=${id}&queue=admin_attention&order_status=refund_requested`));
    expect(q.orderId).toBe(id);
    expect(q.storeId).toBe(id);
    expect(q.buyerUserId).toBe(id);
    expect(q.adminQueue).toBe(true);
    expect(q.orderStatus).toBe("refund_requested");
  });

  it("period uses the settlement Manila-day boundaries", () => {
    const q = parseAdminStoreOrdersQuery(new URLSearchParams("period=custom&from=2026-09-01&to=2026-09-30"));
    const args = adminStoreOrdersRpcArgs(q);
    expect(args.p_from).toBe("2026-08-31T16:00:00.000Z");
    expect(args.p_to).toBe("2026-09-30T16:00:00.000Z");
  });
});

describe("C. settlement SSOT — one commission row-state rule", () => {
  it("helper carries the exact rule from the settlement ledger", () => {
    const helper = fnBody(MIG, "store_commission_row_state");
    for (const line of [
      "WHEN p_adjustment_status = 'review_required' THEN 'review_required'",
      "WHEN p_fee_outstanding_minor > 0 THEN 'outstanding'",
      "WHEN p_adjustment_status = 'refunded' OR p_status = 'waived' THEN 'refunded'",
      "WHEN p_adjustment_status = 'kept' THEN 'kept'",
      "ELSE 'charged'",
    ]) {
      expect(helper).toContain(line);
      expect(fnBody(LEDGER_MIG, "store_commission_ledger_page")).toContain(line.replace(/p_adjustment_status/g, "ob.adjustment_status").replace(/p_fee_outstanding_minor/g, "ob.fee_outstanding_minor").replace(/p_status/g, "ob.status"));
    }
  });

  it("ledger is re-created unchanged except the CASE → helper call", () => {
    const original = fnBody(LEDGER_MIG, "store_commission_ledger_page");
    const recreated = fnBody(MIG, "store_commission_ledger_page");
    const caseStart = original.indexOf("           CASE\n");
    const caseEnd = original.indexOf("END AS state") + "END AS state".length;
    const expected =
      original.slice(0, caseStart) +
      "           public.store_commission_row_state(ob.adjustment_status, ob.fee_outstanding_minor, ob.status) AS state" +
      original.slice(caseEnd);
    expect(recreated).toBe(expected);
  });

  it("the admin list uses the helper and reads (never writes) money tables", () => {
    const body = fnBody(MIG, "admin_store_orders_page");
    expect(body).toContain("public.store_commission_row_state(ob.adjustment_status, ob.fee_outstanding_minor, ob.status)");
    expect(body).toContain("LEFT JOIN public.store_sale_fee_obligations ob ON ob.order_id = o.id");
    expect(body).toMatch(/STABLE\s+SECURITY DEFINER/);
    expect(body).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(MIG).toContain("TO service_role;");
    expect(MIG).toMatch(/FROM PUBLIC, anon, authenticated;/);
  });
});

describe("D. integrity flags (shown, never corrected)", () => {
  it("cancelled + paid and refunded + paid are payment mismatches", () => {
    expect(adminStoreOrderIntegrityFlags({ order_status: "cancelled", payment_status: "paid", completed_at: null })).toEqual(["payment_status_mismatch"]);
    expect(adminStoreOrderIntegrityFlags({ order_status: "cancelled", payment_status: "failed", completed_at: null })).toEqual([]);
    expect(adminStoreOrderIntegrityFlags({ order_status: "refunded", payment_status: "paid", completed_at: "x" })).toEqual(["payment_status_mismatch"]);
    expect(adminStoreOrderIntegrityFlags({ order_status: "pending", payment_status: "paid", completed_at: null })).toEqual([]);
  });

  it("completed without an order_completed event is flagged", () => {
    expect(adminStoreOrderIntegrityFlags({ order_status: "completed", payment_status: "paid", completed_at: null })).toEqual(["completion_record_missing"]);
    expect(adminStoreOrderIntegrityFlags({ order_status: "completed", payment_status: "paid", completed_at: "2026-09-01T00:00:00Z" })).toEqual([]);
  });

  it("row mapper never invents money or status", () => {
    const row = mapAdminStoreOrderRow({ id: "a", order_status: "cancelled", payment_status: "paid", total_amount: "1050", commission_state: null });
    expect(row.total_amount).toBe(1050);
    expect(row.payment_amount).toBe(0);
    expect(row.commission_state).toBeNull();
    expect(row.integrity_flags).toEqual(["payment_status_mismatch"]);
  });
});

describe("E. screen CTA contract (static)", () => {
  const ui = read("components/admin/stores/AdminStoreOrdersPage.tsx");
  const api = read("app/api/admin/store-orders/list/route.ts");

  it("search and refresh both re-query the server with no client cache", () => {
    expect(ui).toContain('cache: "no-store"');
    expect(ui).toContain("/api/admin/store-orders/list");
    expect(ui).not.toContain("useAdminQuery");
    expect(ui).not.toContain("pollIntervalMs");
    expect(api).toContain('"Cache-Control": "no-store"');
  });

  it("search resets to page 1 with a new snapshot; refresh keeps the page", () => {
    expect(ui).toMatch(/page: 1,\s*asOf: null/);
    expect(ui).toContain('void load({ ...applied, asOf: null }, "refresh")');
  });

  it("a failed load keeps the previous rows (no setResult(null) on error)", () => {
    expect(ui).not.toContain("setResult(null)");
    expect(ui).toContain("직전 조회 결과를 표시하고 있습니다");
  });

  it("developer surface removed from the list: UUID inputs, bulk delete, checkboxes", () => {
    expect(ui).not.toContain("bulk-delete");
    expect(ui).not.toContain('type="checkbox"');
    expect(ui).not.toContain("order_id (UUID)");
  });

  it("all tabs render from the contract", () => {
    for (const tab of ADMIN_STORE_ORDERS_TABS) expect(tab.length).toBeGreaterThan(0);
    expect(ui).toContain("ADMIN_STORE_ORDERS_TABS.map");
  });
});
