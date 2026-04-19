import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";
import { getMyPostAds } from "@/lib/ads/mock-ad-data";
import { fetchPostAdsForUserFromDb, postAdToAdminRow } from "@/lib/ads/post-ads-supabase";
import type { MePostAdsMeta } from "@/lib/ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/post-ads
 * 로그인 사용자의 게시글 광고(`post_ads`) 목록. DB 없으면 인메모리(mock) 폴백.
 */
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = await createSupabaseRouteHandlerClient();
  if (sb) {
    const db = await fetchPostAdsForUserFromDb(sb, auth.userId);
    if (db.ok) {
      return NextResponse.json({
        ok: true,
        ads: db.rows,
        meta: { source: "supabase" } satisfies MePostAdsMeta,
      });
    }
    if (db.reason === "error" && db.message) {
      console.warn("[api/me/post-ads] db:", db.message);
    }
  }

  const memoryRows = getMyPostAds(auth.userId).map(postAdToAdminRow);
  return NextResponse.json({
    ok: true,
    ads: memoryRows,
    meta: {
      source: "memory",
      hint:
        "Supabase에 post_ads 테이블이 없거나 조회에 실패했습니다. 로컬 개발용 인메모리 목록을 표시합니다.",
    } satisfies MePostAdsMeta,
  });
}
