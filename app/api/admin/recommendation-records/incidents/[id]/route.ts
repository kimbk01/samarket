import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  loadAdminNickname,
  updateRecommendationIncidentStatus,
} from "@/lib/recommendation-ops/recommendation-records-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/recommendation-records/incidents/[id] — body { action: "acknowledge" | "resolve" }
 * 건별 조건부 UPDATE (확인 = open 만 · 해결 = open/acknowledged 만). 확인자 = 로그인 관리자.
 */
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
  const action = body.action;
  if (action !== "acknowledge" && action !== "resolve") {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }
  if (!id || id.length > 200) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  try {
    const sb = getSupabaseServer();
    const nickname = action === "acknowledge" ? await loadAdminNickname(sb, admin.userId) : null;
    const r = await updateRecommendationIncidentStatus(sb, id, action, { id: admin.userId, nickname });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "recommendation_incident",
      targetId: id,
      action: `recommendation_incident.${action}`,
      after: { status: r.value.status },
    });
    return NextResponse.json({ ok: true, id: r.value.id, status: r.value.status });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}
