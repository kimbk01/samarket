import { NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자: 최근 감사 로그 */
export async function GET(req: Request) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get("target_type")?.trim().slice(0, 120) || null;
  const limitRaw = parseInt(searchParams.get("limit") ?? "150", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(300, Math.max(1, limitRaw)) : 150;

  let q = sb
    .from("audit_logs")
    .select(
      "id, actor_type, actor_id, target_type, target_id, action, before_json, after_json, ip, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (targetType) q = q.eq("target_type", targetType);

  const { data: rows, error } = await q;

  if (error) {
    if (error.message?.includes("audit_logs") && error.message.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[admin/audit-logs]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, logs: rows ?? [] });
}
