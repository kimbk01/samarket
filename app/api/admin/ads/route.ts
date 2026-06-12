import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchAllPostAdsForAdminFromDb } from "@/lib/ads/post-ads-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads
 * 관리자: 전체 게시글 광고(`post_ads`) 목록.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({
      ok: true,
      ads: [],
      meta: { source: "unavailable" as const },
    });
  }

  const db = await fetchAllPostAdsForAdminFromDb(svc);
  if (!db.ok) {
    if (db.reason === "missing_table") {
      return NextResponse.json({
        ok: true,
        ads: [],
        meta: { source: "missing_table" as const },
      });
    }
    console.warn("[api/admin/ads] db:", db.message);
    return NextResponse.json({ ok: false, error: db.message ?? "db_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ads: db.rows,
    meta: { source: "supabase" as const },
  });
}
