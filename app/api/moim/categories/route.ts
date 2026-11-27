import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead } from "@/lib/moim/server/moim-route-guard.server";
import { listMoimCategories, loadViewerMoimArea } from "@/lib/moim/server/moim-queries.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모임 카테고리. `?withArea=1`(만들기 화면만) 이면 개설자의 모임 동네(대표 주소 시/군)를 같은 응답에 담는다
 * — 만들기 화면이 요청을 하나 더 보내지 않게 (설계 P1 3단계 「활동 동네」 표시).
 */
export async function GET(req: NextRequest) {
  const g = await guardMoimRead(req, { rateKey: "categories" });
  if (!g.ok) return g.response;
  const withArea = req.nextUrl.searchParams.get("withArea") === "1";
  const [categories, area] = await Promise.all([
    listMoimCategories(g.sb),
    withArea ? loadViewerMoimArea(g.sb, g.userId) : Promise.resolve(null),
  ]);
  return NextResponse.json({ ok: true, categories, ...(withArea ? { viewerArea: area?.dto ?? { status: "no_address" } } : {}) });
}
