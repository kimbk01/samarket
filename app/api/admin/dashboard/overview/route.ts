import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiActor } from "@/lib/admin/require-admin-permission";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { parseAdminDashboardTab } from "@/lib/admin/metrics/registry";
import { parseAdminDashboardParts } from "@/lib/admin/metrics/dashboard-overview-contract";
import { parseAdminDashboardPeriod, resolveAdminDashboardPeriod } from "@/lib/admin/metrics/dashboard-period";
import { buildAdminDashboardOverview } from "@/lib/admin/metrics/build-admin-dashboard-overview";
import { createAdminDashboardSources } from "@/lib/admin/metrics/load-admin-dashboard-sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/overview?tab=&parts=band,metrics,trend,pending,recent&period=today|yesterday|7d|30d
 * 통합 대시보드 (설계 v4 §3) — 읽기 조합만. 지표마다 { value|null, error? } (실패를 0 으로 바꾸지 않는다).
 * 기간 = PHT 날짜. 기간 지표 값·링크·추세 일수가 같은 기간을 쓴다.
 * 권한: 활성 관리자 + 접근표로 열 수 없는 지표·링크·처리 대기 카테고리는 응답에서 뺀다.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdminApiActor();
  if (!gate.ok) return gate.response;

  const sp = req.nextUrl.searchParams;
  const scope = { isSuperAdmin: gate.actor.isSuperAdmin, permissions: gate.actor.permissions };
  const now = new Date();
  const range = resolveAdminDashboardPeriod(parseAdminDashboardPeriod(sp.get("period")), now);
  try {
    const payload = await buildAdminDashboardOverview({
      tab: parseAdminDashboardTab(sp.get("tab")),
      parts: parseAdminDashboardParts(sp.get("parts")),
      range,
      now,
      actor: { role: gate.actor.role, permissions: gate.actor.permissions },
      sources: createAdminDashboardSources({
        sb: gate.sb,
        storesSb: tryGetSupabaseForStores(),
        notesSb: tryCreateSupabaseServiceClient(),
        scope,
        range,
        now,
      }),
    });
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "dashboard_failed" }, { status: 500 });
  }
}
