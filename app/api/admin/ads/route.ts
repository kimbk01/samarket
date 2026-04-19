import { NextResponse } from "next/server";
import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { getPostAdsForAdmin } from "@/lib/ads/mock-ad-data";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchAllPostAdsForAdminFromDb } from "@/lib/ads/post-ads-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/ads
 * 관리자: 전체 게시글 광고(`post_ads`) 목록. 서비스 롤 + 테이블 있으면 DB, 아니면 인메모리.
 */
export async function GET(): Promise<NextResponse> {
  const admin = await requireAdminApiUser();
  if (!admin.ok) return admin.response;

  const svc = tryCreateSupabaseServiceClient();
  if (svc) {
    const db = await fetchAllPostAdsForAdminFromDb(svc);
    if (db.ok) {
      return NextResponse.json({
        ok: true,
        ads: db.rows,
        meta: { source: "supabase" as const },
      });
    }
    if (db.reason === "error" && db.message) {
      console.warn("[api/admin/ads] db:", db.message);
    }
  }

  return NextResponse.json({
    ok: true,
    ads: getPostAdsForAdmin(),
    meta: { source: "memory" as const },
  });
}
