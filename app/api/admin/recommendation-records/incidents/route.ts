import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { loadRecommendationIncidentsPage } from "@/lib/recommendation-ops/recommendation-records-db";
import {
  RECOMMENDATION_INCIDENT_STATUSES,
  RECOMMENDATION_RECORDS_MAX_PAGE_SIZE,
  isOneOf,
  isRecommendationSurface,
} from "@/lib/recommendation-ops/recommendation-records-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/recommendation-records/incidents?status=&surface=&limit=&offset= — 서버 페이지 + 정확한 total. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sp = req.nextUrl.searchParams;
  const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: RECOMMENDATION_RECORDS_MAX_PAGE_SIZE });
  const status = sp.get("status");
  const surface = sp.get("surface");
  try {
    const r = await loadRecommendationIncidentsPage(getSupabaseServer(), {
      ...page,
      status: isOneOf(RECOMMENDATION_INCIDENT_STATUSES, status) ? status : null,
      surface: isRecommendationSurface(surface) ? surface : null,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, total: r.value.total, rows: r.value.rows, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}
