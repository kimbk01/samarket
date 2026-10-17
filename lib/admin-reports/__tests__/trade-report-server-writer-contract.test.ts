import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyReportActionDaangn } from "@/lib/admin-reports/applyReportActionDaangn";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

type Row = { id: string; status: string; target_type: string; target_id: string; product_id: string | null };

/** In-memory fake: supports the exact chains the writer uses, including the status CAS. */
function fakeSb(report: Row, opts: { failActionInsert?: boolean } = {}) {
  const state = { report: { ...report }, actions: [] as unknown[], sanctions: [] as unknown[] };
  const sb = {
    from(table: string) {
      const filters: { col: string; op: "eq" | "in"; val: unknown }[] = [];
      let patch: Record<string, unknown> | null = null;
      let insertRow: unknown = null;
      const matches = () =>
        filters.every((f) => {
          const v = (state.report as Record<string, unknown>)[f.col];
          return f.op === "eq" ? v === f.val : (f.val as unknown[]).includes(v);
        });
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => (filters.push({ col, op: "eq", val }), b),
        in: (col: string, val: unknown[]) => (filters.push({ col, op: "in", val }), b),
        update: (p: Record<string, unknown>) => ((patch = p), b),
        insert: (row: unknown) => ((insertRow = row), b),
        maybeSingle: () => Promise.resolve({ data: table === "reports" && matches() ? state.report : null, error: null }),
        then: (resolve: (r: unknown) => unknown) => {
          if (insertRow) {
            if (table === "report_actions" && opts.failActionInsert) {
              return resolve({ error: { message: "insert_failed" } });
            }
            (table === "sanctions" ? state.sanctions : state.actions).push(insertRow);
            return resolve({ error: null });
          }
          if (patch && table === "reports") {
            if (!matches()) return resolve({ data: [], error: null });
            Object.assign(state.report, patch);
            return resolve({ data: [{ id: state.report.id }], error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return b;
    },
  };
  return { sb: sb as never, state };
}

const base: Row = { id: "r1", status: "pending", target_type: "user", target_id: "u1", product_id: null };

describe("Trade report server writer (R6)", () => {
  it("first admin resolves; a concurrent second admin gets 409 and writes nothing", async () => {
    const { sb, state } = fakeSb(base);
    const a = await applyReportActionDaangn(sb, { reportId: "r1", actionType: "reject", targetUserId: "", adminUserId: "admin-a" });
    expect(a).toMatchObject({ ok: true, previousStatus: "pending", status: "rejected" });
    const b = await applyReportActionDaangn(sb, { reportId: "r1", actionType: "reject", targetUserId: "", adminUserId: "admin-b" });
    expect(b).toMatchObject({ ok: false, httpStatus: 409 });
    expect(state.actions).toHaveLength(1);
    expect(state.report.status).toBe("rejected");
  });

  it("restores the queue state when the action record cannot be written", async () => {
    const { sb, state } = fakeSb(base, { failActionInsert: true });
    const r = await applyReportActionDaangn(sb, { reportId: "r1", actionType: "reject", targetUserId: "", adminUserId: "admin-a" });
    expect(r).toMatchObject({ ok: false, httpStatus: 500 });
    expect(state.report.status).toBe("pending");
  });

  it("account actions stay MCC-only", async () => {
    const { sb } = fakeSb(base);
    const r = await applyReportActionDaangn(sb, { reportId: "r1", actionType: "account_ban", targetUserId: "", adminUserId: "a" });
    expect(r).toMatchObject({ ok: false, httpStatus: 400 });
  });

  it("route enforces staff permission `reports` and the panel no longer writes from the browser", () => {
    const route = read("app/api/admin/reports/[reportId]/action/route.ts");
    expect(route).toContain('requireAdminPermission("reports")');
    expect(route).toContain("appendAuditLog");
    const writer = read("lib/admin-reports/applyReportActionDaangn.ts");
    expect(writer).toContain('import "server-only"');
    expect(writer).not.toContain('"use client"');
    expect(writer).not.toContain("getSupabaseClient");
    const panel = read("components/admin/reports/AdminSanctionPanel.tsx");
    expect(panel).toContain("/api/admin/reports/");
    expect(panel).not.toContain("applyReportActionDaangn(");
  });

  it("RLS migration aligns admin reads to admin_memberships and pins client admin writes to false (non-destructive)", () => {
    const mig = read("supabase/migrations/20270507120000_trade_reports_admin_rls_membership_ssot.sql");
    expect(mig).toContain("alter policy reports_update_admin on public.reports using (false) with check (false)");
    expect(mig).toContain("alter policy report_actions_insert_admin on public.report_actions with check (false)");
    expect(mig).toContain("alter policy sanctions_insert_admin on public.sanctions with check (false)");
    expect(mig).toContain("internal.is_platform_admin(auth.uid())");
    expect(mig).not.toMatch(/^\s*drop\s/im);
    expect(mig).not.toMatch(/p\.role\s*=\s*any/i);
  });
});
