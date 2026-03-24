import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const dynamic = "force-dynamic";

type PatchBody = {
  status?: string;
  action_type?: string | null;
  action_memo?: string | null;
};

/** 관리자: 신고 검토 완료(기각/조치) */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ reportId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { reportId } = await context.params;
  const rid = typeof reportId === "string" ? reportId.trim() : "";
  if (!rid) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const status = String(body.status ?? "").trim();
  if (status !== "dismissed" && status !== "actioned") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const actionType =
    body.action_type != null && String(body.action_type).trim()
      ? String(body.action_type).trim().slice(0, 120)
      : null;
  const actionMemo =
    body.action_memo != null && String(body.action_memo).trim()
      ? String(body.action_memo).trim().slice(0, 2000)
      : null;

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: prev } = await sb
    .from("store_reports")
    .select("status, target_type, target_id")
    .eq("id", rid)
    .maybeSingle();

  const { data: updated, error } = await sb
    .from("store_reports")
    .update({
      status,
      action_type: actionType,
      action_memo: actionMemo,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", rid)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.message?.includes("store_reports") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[PATCH admin/store-reports]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ ok: false, error: "not_open_or_missing" }, { status: 409 });
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_report",
    target_id: rid,
    action: "store_report.resolve",
    before_json: prev
      ? {
          status: prev.status,
          target_type: prev.target_type,
          target_id: prev.target_id,
        }
      : null,
    after_json: { status, action_type: actionType, action_memo: actionMemo },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, status });
}
