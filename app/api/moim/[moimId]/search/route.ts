import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { guardMoimRead, moimBadRequest, moimNotFound, requireUuid } from "@/lib/moim/server/moim-route-guard.server";
import { loadMoimAccess, moimSearchPattern, searchMoimPosts } from "@/lib/moim/server/moim-queries.server";
import { searchMoimSchedules } from "@/lib/moim/server/moim-schedule-queries.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ moimId: string }> };

/**
 * 모임 안 검색 (시안 U4 머리글 ⌕ · 감사 F11) — ?q= 2~40자. 멤버만.
 * 게시글(제목·본문, 숨김·삭제 제외) 20개 + 일정(제목) 20개, 최신순.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  const moimId = requireUuid((await params).moimId);
  if (!moimId) return moimNotFound();
  const g = await guardMoimRead(req, { rateKey: "search", limit: 30 });
  if (!g.ok) return g.response;
  const pattern = moimSearchPattern(req.nextUrl.searchParams.get("q"));
  if (!pattern) return moimBadRequest();
  const access = await loadMoimAccess(g.sb, moimId, g.userId);
  if (!access) return moimNotFound();
  if (!access.role) return NextResponse.json({ ok: false, error: "moim_not_member" }, { status: 403 });
  const [posts, schedules] = await Promise.all([
    searchMoimPosts(g.sb, access, g.userId, pattern),
    searchMoimSchedules(g.sb, access, g.userId, pattern),
  ]);
  return NextResponse.json({ ok: true, posts: posts ?? [], schedules: schedules ?? [] });
}
