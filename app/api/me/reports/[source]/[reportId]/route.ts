import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isMyReportSource, loadMyReportDetail } from "@/lib/reports/my-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ source: string; reportId: string }> };

/** GET — 내 신고 1건 (본인 신고만, 아니면 404). */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { source, reportId } = await ctx.params;
  const id = String(reportId ?? "").trim();
  if (!isMyReportSource(source) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  try {
    const report = await loadMyReportDetail(sb, auth.userId, source, id);
    if (!report) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, report });
  } catch {
    return NextResponse.json({ ok: false, error: "report_fetch_failed" }, { status: 500 });
  }
}
