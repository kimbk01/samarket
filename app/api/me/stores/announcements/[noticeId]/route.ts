import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { customerCenterContentUnavailableFallback } from "@/lib/notices/customer-center-content";
import {
  loadOwnerAnnouncementAccess,
  loadOwnerAnnouncementDetail,
} from "@/lib/notices/owner-announcements.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

/**
 * GET /api/me/stores/announcements/[noticeId] — 운영 공지 상세 (배달 오픈 4단계).
 * 대상이 아닌 글 = 404 (제목도 노출하지 않음). 게시 종료 = `unavailable` 안내(알림 기록 진입).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const noticeId = String(raw ?? "").trim();
  if (!noticeId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

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

  try {
    const detail = await loadOwnerAnnouncementDetail(sb, auth.userId, access.audiences, noticeId);
    if (detail.kind === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (detail.kind === "unavailable") {
      return NextResponse.json({
        ok: true,
        unavailable: true,
        message: customerCenterContentUnavailableFallback("ko"),
        messageEn: customerCenterContentUnavailableFallback("en"),
        notice: { id: detail.id, title: detail.title },
      });
    }
    return NextResponse.json({ ok: true, unavailable: false, notice: detail.notice });
  } catch {
    return NextResponse.json({ ok: false, error: "announcement_fetch_failed" }, { status: 500 });
  }
}
