import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { loadAdsControlPlane } from "@/lib/admin/ads-control-plane/load-ads-control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/ads-control-plane — read-only Ads/Exposure composition. */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    const model = await loadAdsControlPlane(sb);
    return NextResponse.json({ ok: true, plane: model });
  } catch (e) {
    console.error("[ads-control-plane]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "load_failed" },
      { status: 500 }
    );
  }
}
