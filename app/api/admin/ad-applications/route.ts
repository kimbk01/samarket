import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { fetchAllPostAdsForAdminFromDb } from "@/lib/ads/post-ads-supabase";
import { mapPostAdRowToApplication } from "@/lib/ads/post-ad-application-adapter";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ad-applications
 * 관리자: 게시글 광고 신청 목록 (`post_ads` → 레거시 AdApplication 형태)
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: true, applications: [], meta: { source: "unavailable" as const } });
  }

  const db = await fetchAllPostAdsForAdminFromDb(svc);
  if (!db.ok) {
    if (db.reason === "missing_table") {
      return NextResponse.json({ ok: true, applications: [], meta: { source: "missing_table" as const } });
    }
    return NextResponse.json({ ok: false, error: db.message ?? "db_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    applications: db.rows.map((row) => mapPostAdRowToApplication(row)),
    meta: { source: "supabase" as const },
  });
}
