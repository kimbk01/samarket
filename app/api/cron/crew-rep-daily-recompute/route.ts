import { NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { clientSafeInternalErrorMessage } from "@/lib/http/api-route";
import { verifyCronRequestAuthorization } from "@/lib/security/cron-auth";
import { rejectCronIfSideEffectsBlocked } from "@/lib/security/cron-side-effect-gate";
import { getTradeServiceClient } from "@/lib/trade/service-supabase";
import { recomputeAllCrewRep } from "@/lib/trust/crew-rep-recompute-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CREW REP 매일 재계산 — 03:00 PHT (vercel.json `0 19 * * *` UTC).
 * 기간 가중(180일 절반·365일 제외)·깨끗한 활동 월이 시간에 따라 바뀌므로 매일 다시 계산한다(D6).
 */
async function runCrewRepDailyRecompute(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron_secret_not_configured" }, { status: 503 });
  }
  if (!verifyCronRequestAuthorization(req, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const blocked = rejectCronIfSideEffectsBlocked();
  if (blocked) return blocked;

  const sb = getTradeServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  try {
    const result = await recomputeAllCrewRep(sbAny, { cause: "daily_recompute" });
    const summary = { members: result.members, changed: result.changed, failed: result.failed };
    // 실행 기록은 점수가 바뀌었거나 실패가 있을 때만 남긴다.
    if (result.changed > 0 || result.failed > 0) {
      const rm = getAuditRequestMeta(req);
      void appendAuditLog(sbAny, {
        actor_type: "system",
        actor_id: null,
        target_type: "cron_job",
        target_id: "crew-rep-daily-recompute",
        action: "member_trust.crew_rep_daily_recompute",
        after_json: summary,
        ip: rm.ip,
        user_agent: rm.userAgent,
      });
    }
    return NextResponse.json({ ok: result.failed === 0, ...summary });
  } catch (err) {
    console.error("[cron crew-rep-daily-recompute]", err);
    return NextResponse.json({ ok: false, error: clientSafeInternalErrorMessage(String(err)) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return runCrewRepDailyRecompute(req);
}

export async function POST(req: Request) {
  return runCrewRepDailyRecompute(req);
}
