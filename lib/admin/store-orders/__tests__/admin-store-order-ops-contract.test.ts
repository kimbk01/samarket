import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_ORDER_OPS_SCREEN,
  adminOrderExceptionReason,
  adminOrderOpsQueryToParams,
  adminOrderOpsRpcArgs,
  legacyStoreOrdersRedirectTarget,
  parseAdminOrderOpsQuery,
  type AdminOrderOpsRow,
} from "@/lib/admin/store-orders/admin-store-order-ops-contract";
import { describeStoreOrderAudit, storeOrderAuditCategoryActions, STORE_ORDER_AUDIT_KNOWN_ACTIONS } from "@/lib/admin/store-orders/admin-store-order-audit-labels";
import { adminOrderAuditQueryToParams, parseAdminOrderAuditQuery } from "@/lib/admin/store-orders/load-admin-store-order-audit";

const sp = (s: string) => new URLSearchParams(s);
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("D1 — independent pages, legacy list links", () => {
  it("legacy /admin/store-orders list params go to 주문 목록 with the same params", () => {
    expect(legacyStoreOrdersRedirectTarget(sp("order_status=pending&store_id=x"))).toBe("/admin/stores/orders?order_status=pending&store_id=x");
    expect(legacyStoreOrdersRedirectTarget(sp("order_no=SO-1"))).toBe("/admin/stores/orders?order_no=SO-1");
  });
  it("stays on 주문 액션 for no params, the queue marker, or modal params only", () => {
    expect(legacyStoreOrdersRedirectTarget(sp(""))).toBeNull();
    expect(legacyStoreOrdersRedirectTarget(sp("queue=admin_attention&q=SO-1"))).toBeNull();
    expect(legacyStoreOrdersRedirectTarget(sp("order=11111111-1111-1111-1111-111111111111&section=admin"))).toBeNull();
  });
  it("주문 액션 filter URLs always carry the marker, so applying a filter never redirects", () => {
    const q = parseAdminOrderOpsQuery("exceptions", sp("q=SO-1&period=today"));
    const p = adminOrderOpsQueryToParams(q);
    expect(p.get("queue")).toBe("admin_attention");
    expect(legacyStoreOrdersRedirectTarget(p)).toBeNull();
    expect(adminOrderOpsQueryToParams(parseAdminOrderOpsQuery("exceptions", sp(""))).toString()).toBe("");
  });
  it("pages are wired to their own screen", () => {
    expect(read("app/admin/stores/orders/page.tsx")).toContain('screen="list"');
    expect(read("app/admin/store-orders/page.tsx")).toContain('screen="exceptions"');
    expect(read("app/admin/store-orders/page.tsx")).toContain("legacyStoreOrdersRedirectTarget");
    expect(read("app/admin/stores/orders/cancellations/page.tsx")).toContain('screen="cancellations"');
    expect(read("app/admin/stores/orders/refunds/page.tsx")).toContain('screen="refunds"');
    expect(read("app/admin/stores/orders/logs/page.tsx")).toContain("AdminOrderAuditLogsScreen");
  });
});

describe("D2 — per-page basis", () => {
  it("cancellations: pending = request time, done = cancel time; refunds: done = refunded_at", () => {
    const c = ADMIN_ORDER_OPS_SCREEN.cancellations.tabs;
    expect(c.find((t) => t.key === "pending")?.basis).toBe("cancel_requested");
    expect(c.find((t) => t.key === "done")?.basis).toBe("cancelled");
    const r = ADMIN_ORDER_OPS_SCREEN.refunds.tabs;
    expect(r.find((t) => t.key === "pending")?.basis).toBe("refund_requested");
    expect(r.find((t) => t.key === "done")?.basis).toBe("refunded");
    expect(ADMIN_ORDER_OPS_SCREEN.list.tabs.every((t) => t.basis === "created")).toBe(true);
  });
  it("legacy order_no / store_name fold into q; this_week → last 7 days", () => {
    expect(parseAdminOrderOpsQuery("list", sp("order_no=SO-9")).q).toBe("SO-9");
    expect(parseAdminOrderOpsQuery("list", sp("store_name=치킨")).q).toBe("치킨");
    expect(parseAdminOrderOpsQuery("list", sp("period=this_week")).period).toBe("last_7_days");
  });
  it("only the exceptions screen passes the closed-status exclusion", () => {
    expect(adminOrderOpsRpcArgs(parseAdminOrderOpsQuery("list", sp(""))).p_queue_closed_statuses).toBeNull();
    expect(adminOrderOpsRpcArgs(parseAdminOrderOpsQuery("exceptions", sp(""))).p_queue_closed_statuses?.length).toBeGreaterThan(0);
  });
});

describe("D9 — exception reason only from records", () => {
  const base = { rider_failure_reported_at: null, sla_warning_reason: null, needs_admin_attention: false } as unknown as AdminOrderOpsRow;
  it("never invents a reason", () => {
    expect(adminOrderExceptionReason(base, true)).toBe("사유 기록 없음");
    expect(adminOrderExceptionReason({ ...base, rider_failure_reported_at: "2026-01-01T00:00:00Z" }, true)).toBe("라이더 실패 신고");
  });
});

describe("D8 — audit categories", () => {
  it("category action lists partition the known actions, QA stays separate", () => {
    const cats = (["admin", "owner", "buyer", "system"] as const).flatMap((c) => storeOrderAuditCategoryActions(c));
    expect(new Set(cats).size).toBe(STORE_ORDER_AUDIT_KNOWN_ACTIONS.length);
    expect(cats.some((a) => a.startsWith("fin_ssot_") || a.startsWith("phase_d_"))).toBe(false);
    for (const a of cats) {
      const c = describeStoreOrderAudit({ action: a }, true).category;
      expect(storeOrderAuditCategoryActions(c as "admin")).toContain(a);
    }
  });
  it("unmapped action is 기타 regardless of actor (matches the server filter)", () => {
    expect(describeStoreOrderAudit({ action: "store_order.new_thing", actor_type: "admin" }, true).category).toBe("other");
  });
  it("logs query round-trips and defaults to all periods, QA excluded", () => {
    const q = parseAdminOrderAuditQuery(sp("category=qa&q=SO-1&page=3"));
    expect(q).toMatchObject({ category: "qa", q: "SO-1", page: 3, period: "all" });
    expect(adminOrderAuditQueryToParams(q).toString()).toBe("category=qa&q=SO-1&page=3");
    expect(parseAdminOrderAuditQuery(sp("")).category).toBe("all");
    const src = read("lib/admin/store-orders/load-admin-store-order-audit.ts");
    expect(src).toContain('query = query.not("action", "like", p)');
  });
});
