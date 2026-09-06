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

  const slots = await loadHeroPlacementSlots(sb);
  return NextResponse.json({
    ok: true,
    capacity: DELIVERY_HERO_CAPACITY,
    slots,
  });
}
