import { NextRequest, NextResponse } from "next/server";
import { getActiveAdFeedPosts } from "@/lib/ads/mock-ad-data";
import type { ActiveAdsResponse } from "@/lib/ads/types";

/**
 * GET /api/ads/active?boardKey=plife
 * 특정 게시판의 현재 노출 중인 광고(top_fixed) 목록을 반환한다.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const boardKey = req.nextUrl.searchParams.get("boardKey") ?? "plife";
  const ads = getActiveAdFeedPosts(boardKey);
  const res: ActiveAdsResponse = { ok: true, ads };
  return NextResponse.json(res);
}
