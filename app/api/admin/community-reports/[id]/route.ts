import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { getCommunityReportByIdForAdmin } from "@/lib/community-feed/admin-community-reports";
import { applyCommunityPointReclaimFromReportTarget } from "@/lib/points/community-point-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["open", "reviewing", "resolved", "dismissed"]);

/** 관리자: 피드 신고 1건 (통합 상세 화면용) */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await isRouteAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rid = id?.trim();
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }
  try {
    const row = await getCommunityReportByIdForAdmin(rid);
    if (!row) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}

/** 관리자: 동네생활 피드 신고(community_reports) 상태·메모 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await isRouteAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const rid = id?.trim();
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: { status?: string; admin_memo?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const status = String(body.status ?? "").trim();
  if (!STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const memo =
    body.admin_memo != null && String(body.admin_memo).trim()
      ? String(body.admin_memo).trim().slice(0, 2000)
      : null;

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: before, error: beforeErr } = await sb
    .from("community_reports")
    .select("status, target_type, target_id")
    .eq("id", rid)
    .maybeSingle();
  if (beforeErr) {
    return NextResponse.json({ ok: false, error: beforeErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const prevStatus = String((before as { status?: string }).status ?? "");
  const done = status === "resolved" || status === "dismissed";
  const { error } = await sb
    .from("community_reports")
    .update({
      status,
      admin_memo: memo,
      processed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", rid);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (status === "resolved" && prevStatus !== "resolved") {
    await applyCommunityPointReclaimFromReportTarget({
      targetType: String((before as { target_type?: string }).target_type ?? ""),
      targetId: String((before as { target_id?: string }).target_id ?? ""),
    });
  }

  const meta = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: null,
    target_type: "community_report",
    target_id: rid,
    action: `community_report.status_${status}`,
    before_json: {
      status: prevStatus,
      target_type: (before as { target_type?: string | null }).target_type ?? null,
      target_id: (before as { target_id?: string | null }).target_id ?? null,
    },
    after_json: {
      status,
      admin_memo: memo,
      processed_at: done ? "set" : null,
    },
    ip: meta.ip,
    user_agent: meta.userAgent,
  });

  return NextResponse.json({ ok: true });
}
