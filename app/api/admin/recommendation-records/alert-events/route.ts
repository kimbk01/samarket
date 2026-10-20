import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseAdminListPage } from "@/lib/admin/pagination/parse-admin-list-page";
import { loadRecommendationAlertEventsPage } from "@/lib/recommendation-ops/recommendation-records-db";
import {
  RECOMMENDATION_RECORDS_MAX_PAGE_SIZE,
  isRecommendationSurface,
} from "@/lib/recommendation-ops/recommendation-records-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/recommendation-records/alert-events?status=ack|unack&surface=&limit=&offset= — 서버 페이지 + total. */
export async function GET(req: NextRequest) {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sp = req.nextUrl.searchParams;
  const page = parseAdminListPage(sp, { defaultLimit: 20, maxLimit: RECOMMENDATION_RECORDS_MAX_PAGE_SIZE });
  const status = sp.get("status");
  const surface = sp.get("surface");
  try {
    const r = await loadRecommendationAlertEventsPage(getSupabaseServer(), {
      ...page,
      acknowledged: status === "ack" ? true : status === "unack" ? false : null,
      surface: isRecommendationSurface(surface) ? surface : null,
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, total: r.value.total, rows: r.value.rows, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 503 });
  }
}
