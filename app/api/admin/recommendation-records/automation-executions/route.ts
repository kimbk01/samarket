import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import {
  insertRecommendationAutomationExecution,
  loadRecommendationAutomationExecutionsPage,
} from "@/lib/recommendation-ops/recommendation-records-db";
import {
  RECOMMENDATION_AUTOMATION_ACTION_TYPES,
  RECOMMENDATION_RECORDS_MAX_PAGE_SIZE,
  isOneOf,
  isRecommendationSurface,
  parseRecommendationAutomationExecutionInput,
} from "@/lib/recommendation-ops/recommendation-records-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/recommendation-records/automation-executions?surface=&actionType=&limit=&offset= — 서버 페이지 + total. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sp = req.nextUrl.searchParams;
  const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: RECOMMENDATION_RECORDS_MAX_PAGE_SIZE });
  const surface = sp.get("surface");
  const actionType = sp.get("actionType");
  try {
    const r = await loadRecommendationAutomationExecutionsPage(getSupabaseServer(), {
      ...page,
      surface: isRecommendationSurface(surface) ? surface : null,
      actionType: isOneOf(RECOMMENDATION_AUTOMATION_ACTION_TYPES, actionType) ? actionType : null,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, total: r.value.total, rows: r.value.rows, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}

/** POST — 자동화 실행 1건 기록 (시뮬레이터 실행). body { execution: {...} } · 시각·실행자는 서버 기준. */
export async function POST(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  let body: { execution?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const input = parseRecommendationAutomationExecutionInput(body.execution);
  if (!input) return NextResponse.json({ ok: false, error: "invalid_execution" }, { status: 400 });
  try {
    const sb = getSupabaseServer();
    const r = await insertRecommendationAutomationExecution(sb, input, admin.userId);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    await appendAdminRouteAudit(sb, req, {
      actorId: admin.userId,
      targetType: "recommendation_automation_execution",
      targetId: r.value.id,
      action: "recommendation_automation_execution.create",
      after: { surface: input.surface, actionType: input.actionType, mode: input.executionMode, status: input.status },
    });
    return NextResponse.json({ ok: true, execution: r.value });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}
