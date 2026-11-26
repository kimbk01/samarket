import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadPlacementInventory } from "@/lib/admin/ads-exposure/placement-inventory";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/advertising/placement-inventory — CUT R5 read model */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  try {
    const inventory = await loadPlacementInventory(sb);
    return NextResponse.json({ ok: true, inventory });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    /** R-68: 상단 배너 점유 조회 실패 = 일시 오류 503 · 보드는 「불러오지 못했어요」(저장 실패 문구 아님) */
    if (message === "capacity_check_failed") {
      return NextResponse.json({ ok: false, error: "load_failed" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
