import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { MYPAGE_LIST_PAGE_DEFAULT, parseMypageListCursor, parseMypageListLimit } from "@/lib/mypage/mypage-list-cursor";
import { loadMyReports } from "@/lib/reports/my-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — 내 신고 내역 (알림 최종 설계 §5-5 · D2). 4종 병합 최신순.
 * `?cursor=&limit=&filter=all|open|done`
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const sp = req.nextUrl.searchParams;
  const rawCursor = sp.get("cursor");
  const cursor = parseMypageListCursor(rawCursor);
  if (rawCursor && !cursor) return NextResponse.json({ ok: false, error: "invalid_cursor" }, { status: 400 });
  const filterRaw = sp.get("filter");
  const filter = filterRaw === "open" || filterRaw === "done" ? filterRaw : "all";
  try {
    const page = await loadMyReports(sb, auth.userId, {
      cursor,
      limit: parseMypageListLimit(sp.get("limit")) ?? MYPAGE_LIST_PAGE_DEFAULT,
      filter,
    });
    return NextResponse.json({ ok: true, ...page });
  } catch {
    return NextResponse.json({ ok: false, error: "reports_fetch_failed" }, { status: 500 });
  }
}
