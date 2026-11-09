import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  OWNER_ANNOUNCEMENTS_LIST_MAX,
  listOwnerAnnouncements,
  loadOwnerAnnouncementAccess,
} from "@/lib/notices/owner-announcements.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/stores/announcements — 매장 사장님 운영 공지 목록 (배달 오픈 4단계 · Owner 2026-11-10).
 * `?limit=1..50` (기본 50) · `?latest=1` 고정 무시 게시일 최신순(허브 카드).
 * 매장이 없는 사용자 = 403 `not_store_owner`. 실패를 빈 성공으로 응답하지 않는다.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });
  }

  const access = await loadOwnerAnnouncementAccess(sb, auth.userId);
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, error: access.error },
      { status: access.error === "not_store_owner" ? 403 : 500 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const limitRaw = Number(sp.get("limit"));
  const limit =
    Number.isFinite(limitRaw) && limitRaw >= 1
      ? Math.min(OWNER_ANNOUNCEMENTS_LIST_MAX, Math.floor(limitRaw))
      : OWNER_ANNOUNCEMENTS_LIST_MAX;

  try {
    const announcements = await listOwnerAnnouncements(sb, auth.userId, access.audiences, {
      limit,
      latestOnly: sp.get("latest") === "1",
    });
    return NextResponse.json({ ok: true, announcements });
  } catch {
    return NextResponse.json({ ok: false, error: "announcements_fetch_failed" }, { status: 500 });
  }
}
