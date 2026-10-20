import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { acknowledgeRecommendationAlertEventInDb } from "@/lib/recommendation-ops/recommendation-records-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/admin/recommendation-records/alert-events/[id] — body { action: "acknowledge" } · 미확인 1건만 UPDATE. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (body.action !== "acknowledge") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  if (!id || id.length > 200) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  try {
    const sb = getSupabaseServer();
    const r = await acknowledgeRecommendationAlertEventInDb(sb, id, admin.userId);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "recommendation_alert_event",
      targetId: id,
      action: "recommendation_alert_event.acknowledge",
    });
    return NextResponse.json({ ok: true, id: r.value.id });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}
