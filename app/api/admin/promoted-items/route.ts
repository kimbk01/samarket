import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { fetchAllPostAdsForAdminFromDb } from "@/lib/ads/post-ads-supabase";
import { mapPostAdRowToPromotedItem } from "@/lib/ads/post-ad-application-adapter";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/promoted-items
 * 관리자: 노출 중·예정 유료 광고 (`post_ads` active/approved)
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: true, items: [], meta: { source: "unavailable" as const } });
  }

  const db = await fetchAllPostAdsForAdminFromDb(svc);
  if (!db.ok) {
    if (db.reason === "missing_table") {
      return NextResponse.json({ ok: true, items: [], meta: { source: "missing_table" as const } });
    }
    return NextResponse.json({ ok: false, error: db.message ?? "db_failed" }, { status: 500 });
  }

  const items = db.rows
    .map((row) => mapPostAdRowToPromotedItem(row))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return NextResponse.json({
    ok: true,
    items,
    meta: { source: "supabase" as const },
  });
}
