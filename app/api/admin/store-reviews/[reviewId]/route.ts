import { NextRequest, NextResponse } from "next/server";
import { appendAuditLog } from "@/lib/audit/append-audit-log";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PatchBody = { status?: string; reason?: string };

/** 관리자: 리뷰 숨김/복구 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ reviewId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { reviewId } = await context.params;
  const rid = typeof reviewId === "string" ? reviewId.trim() : "";
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
  if (status !== "visible" && status !== "hidden") {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }
  const reason = String(body.reason ?? "").trim().slice(0, 1000) || null;
  // 숨김은 구매자 리뷰를 내리는 L2 조치 — 사유 필수 (복구는 선택).
  if (status === "hidden" && (reason ?? "").length < 2) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: prev } = await sb.from("store_reviews").select("status").eq("id", rid).maybeSingle();

  const { error } = await sb.from("store_reviews").update({ status }).eq("id", rid);
  if (error) {
    console.error("[admin store-reviews PATCH]", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  const actorId = await getRouteUserId();
  const rm = getAuditRequestMeta(req);
  void appendAuditLog(sb, {
    actor_type: "admin",
    actor_id: actorId,
    target_type: "store_review",
    target_id: rid,
    action: "store_review.status",
    before_json: prev ? { status: prev.status } : null,
    after_json: { status, reason },
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  return NextResponse.json({ ok: true, status });
}
