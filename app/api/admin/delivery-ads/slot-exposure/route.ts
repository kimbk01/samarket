import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadBannerSlotExposureStatuses } from "@/lib/stores/advertising/banner-slot-exposure-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — H-05 배너 슬롯이 고객에게 열려 있는지 (읽기 전용, 고객 배너 API 와 같은 게이트).
 * 슬롯이 꺼져 있으면 승인·노출 중 캠페인도 고객에게 보이지 않는다.
 */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const slots = await loadBannerSlotExposureStatuses(sb);
    return NextResponse.json({ ok: true, slots }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("[admin delivery-ads slot-exposure GET]", e);
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 500 });
  }
}
