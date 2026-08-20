import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchAdminTradeOverviewCounts } from "@/lib/admin-products/admin-trade-overview-counts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/trade/overview
 * Lightweight KPI counts for Trade Hub (no list preload).
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정 필요" }, { status: 500 });
  }

  const counts = await fetchAdminTradeOverviewCounts(sb);
  return NextResponse.json({ ok: true, counts });
}
