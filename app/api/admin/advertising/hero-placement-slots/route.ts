import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { DELIVERY_HERO_CAPACITY } from "@/lib/admin/ads-exposure/capacity-gate";
import { loadHeroPlacementSlots } from "@/lib/admin/ads-exposure/hero-placement-slots";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/advertising/hero-placement-slots */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  let slots: Awaited<ReturnType<typeof loadHeroPlacementSlots>>;
  try {
    slots = await loadHeroPlacementSlots(sb);
  } catch {
    /** R-68: 점유 조회 실패 = 503 (빈 자리로 응답하지 않음) */
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    capacity: DELIVERY_HERO_CAPACITY,
    slots,
  });
}
