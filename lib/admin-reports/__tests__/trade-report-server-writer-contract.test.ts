import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * 거래 Admin 설계 v2 §C-4 · §F-3: 예전 TS writer(applyReportActionDaangn, 상태 CAS + 기록 보상)는 삭제 —
 * 처리 1건 = DB 함수 admin_decide_trade_report 1번 (신고 행 잠금 → 대기 상태 확인 → 같은 트랜잭션 기록).
 */
describe("Trade report server writer (R6)", () => {
  const MIG = "supabase/migrations/20270522120300_trade_admin_m7_trade_restrictions.sql";

  it("first admin resolves; a concurrent second admin gets already_processed (row lock + pending check in one tx)", () => {
    const mig = read(MIG);
    expect(mig).toMatch(/from public\.reports where id = p_report_id for update/);
    expect(mig).toMatch(/not in \('pending', 'reviewing'\)[\s\S]{0,120}already_processed/);
  });

  it("writer is the single DB function (no client-side multi-step write to restore)", () => {
    const writer = read("lib/admin/trade-admin/trade-report-decision.ts");
    expect(writer).toContain('import "server-only"');
    expect(writer).toContain('"admin_decide_trade_report"');
    expect(writer).not.toMatch(/\.from\("report_actions"\)\s*\.insert/);
  });

  it("account actions stay MCC-only", () => {
    const route = read("app/api/admin/reports/[reportId]/action/route.ts");
    expect(route).toMatch(/account_suspend[\s\S]{0,80}account_ban[\s\S]{0,200}status: 400/);
  });

  it("route enforces trade admin gate (O-2) and the panel no longer writes from the browser", () => {
    const route = read("app/api/admin/reports/[reportId]/action/route.ts");
    expect(route).toContain("requireTradeAdmin()");
    expect(route).toContain("decideTradeReport");
    expect(route).toContain("reason_required");
    const writer = read("lib/admin/trade-admin/trade-report-decision.ts");
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
