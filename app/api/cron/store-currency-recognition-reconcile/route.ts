import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import {
  RECONCILE_APPLY_FROM_ENV,
  applyOrderCurrencyReconcileWrites,
  buildOrderCurrencyReconcileReport,
  resolveReconcileWriteGate,
} from "@/lib/currency/reconcile-order-currency";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * F-04 / F-05 — store order currency reconciliation.
 * REPORT-ONLY by default. Write mode requires the in-code approval constant AND `apply=1`
 * AND env DIBAY_CURRENCY_RECONCILE_APPLY_FROM (see lib/currency/reconcile-order-currency.ts).
 */
async function runStoreCurrencyRecognitionReconcile(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }

  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const gate = resolveReconcileWriteGate({
    applyParam: url.searchParams.get("apply"),
    envApplyFrom: process.env[RECONCILE_APPLY_FROM_ENV],
  });

  let built: Awaited<ReturnType<typeof buildOrderCurrencyReconcileReport>>;
  try {
    built = await buildOrderCurrencyReconcileReport(sb);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron store-currency-recognition-reconcile]", msg);
    return NextResponse.json(
      { ok: false, error: clientSafeInternalErrorMessage(msg) },
      { status: 500 }
    );
  }

  let write:
    | { mode: "report_only"; refused: string | null }
    | { mode: "apply"; cutoffIso: string; outcomes: unknown[] } = {
    mode: "report_only",
    refused: gate.allowed ? null : gate.requested ? gate.reason : null,
  };

  if (gate.allowed) {
    const applied = await applyOrderCurrencyReconcileWrites(sb, built.candidates, gate);
    write = applied.ok
      ? { mode: "apply", cutoffIso: gate.cutoffIso, outcomes: applied.outcomes }
      : { mode: "report_only", refused: applied.error };
  }

  // 실행 기록은 쓰기 실행·거부 또는 발견 건이 있을 때만 남긴다 — 이상 0건 보고는 쌓지 않는다.
  const auditWorthy =
    write.mode === "apply" ||
    (write.mode === "report_only" && write.refused != null) ||
    built.report.completedMissingSaleCoin.count > 0 ||
    built.report.refundedUnreversed.count > 0 ||
    built.report.cancelledGiftNotRestored.count > 0 ||
    built.report.excludedPaidSettlement.count > 0;
  if (auditWorthy) {
    const rm = getAuditRequestMeta(req);
    void appendAuditLog(sb, {
      actor_type: "system",
      actor_id: null,
      target_type: "cron_job",
      target_id: "store-currency-recognition-reconcile",
      action: "store_currency.cron_reconcile",
      after_json: {
        mode: write.mode,
        refused: write.mode === "report_only" ? write.refused : null,
        completed_missing_sale_coin: built.report.completedMissingSaleCoin.count,
        refunded_unreversed: built.report.refundedUnreversed.count,
        cancelled_gift_not_restored: built.report.cancelledGiftNotRestored.count,
        excluded_paid_settlement: built.report.excludedPaidSettlement.count,
      },
      ip: rm.ip,
      user_agent: rm.userAgent,
    });
  }

  return NextResponse.json({ ok: true, ...write, report: built.report });
}

export async function GET(req: Request) {
  return runStoreCurrencyRecognitionReconcile(req);
}

export async function POST(req: Request) {
  return runStoreCurrencyRecognitionReconcile(req);
}
