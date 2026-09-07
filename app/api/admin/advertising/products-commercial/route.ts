import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { loadAdsCommercialControlModel } from "@/lib/admin/ads-commercial/products-control-model";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/advertising/products-commercial — CUT R6 read model */
export async function GET() {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  try {
    const model = await loadAdsCommercialControlModel(sb);
    return NextResponse.json({ ok: true, model });
  } catch (e) {
    const message = e instanceof Error ? e.message : "load_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
