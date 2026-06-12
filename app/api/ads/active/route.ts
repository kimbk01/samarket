import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { fetchActiveTopFixedAdFeedPostsFromDb } from "@/lib/ads/post-ads-supabase";
import type { ActiveAdsResponse } from "@/lib/ads/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ads/active?boardKey=plife
 * 노출 중인 상단고정(top_fixed) 광고
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const boardKey = req.nextUrl.searchParams.get("boardKey")?.trim() || "plife";

  try {
    const sb = getSupabaseServer();
    const db = await fetchActiveTopFixedAdFeedPostsFromDb(sb, boardKey);
    if (db.ok) {
      const res: ActiveAdsResponse = { ok: true, ads: db.ads, meta: { source: "supabase" } };
      return NextResponse.json(res, { headers: { "Cache-Control": "private, max-age=0, must-revalidate" } });
    }
    const res: ActiveAdsResponse = {
      ok: true,
      ads: [],
      meta: {
        source: "empty",
        hint:
          db.reason === "missing_table"
            ? "post_ads 스키마가 배포되지 않았습니다."
            : db.message ?? "광고 목록을 불러오지 못했습니다.",
      },
    };
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch {
    const res: ActiveAdsResponse = {
      ok: true,
      ads: [],
      meta: { source: "empty", hint: "서버 설정(Supabase)이 없어 광고를 조회하지 못했습니다." },
    };
    return NextResponse.json(res, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
