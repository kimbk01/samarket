import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isCustomerCenterContentPublishedNow } from "@/lib/notices/customer-center-content";
import { markNotificationsReadForContents } from "@/lib/notices/customer-center-read-state";
import { isAppNoticeVisibleToMembers } from "@/lib/notices/app-notice-audience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

/** POST — record 1 view / member / content / Seoul-day + 이 글을 가리키는 내 알림 읽음 (알림 최종 설계 §5). */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { noticeId: raw } = await ctx.params;
  const contentId = String(raw ?? "").trim();
  if (!contentId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const { data: row } = await sb
    .from("app_notices")
    .select("id, is_active, starts_at, ends_at, archived_at, deleted_at, view_count, audience")
    .eq("id", contentId)
    .maybeSingle();

  // 배달 오픈 4단계 — 사장님 전용 운영 공지는 회원 열람 경로로 기록하지 않는다(사장님 경로가 따로 기록)
  if (!row || !isAppNoticeVisibleToMembers(row) || !isCustomerCenterContentPublishedNow(row)) {
    return NextResponse.json({ ok: true, recorded: false, viewCount: Number(row?.view_count) || 0 });
  }

  const { data, error } = await sb.rpc("record_customer_center_content_view", {
    p_content_id: contentId,
    p_user_id: auth.userId,
  });
  // 알림 최종 설계 §5 — 글을 읽으면 그 글을 가리키는 내 알림도 읽음(같은 읽음 함수). 실패해도 열람 결과는 그대로.
  const notificationsRead = await markNotificationsReadForContents(sb, auth.userId, [contentId]).catch(() => 0);

  if (error) {
    // Migration not applied yet — soft fail; do not invent client-side views.
    return NextResponse.json({
      ok: true,
      recorded: false,
      viewCount: Number(row.view_count) || 0,
      notificationsRead,
      hint: error.message,
    });
  }

  const first = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({
    ok: true,
    recorded: Boolean(first?.recorded),
    viewCount: Number(first?.view_count ?? row.view_count) || 0,
    notificationsRead,
  });
}
