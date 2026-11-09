import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  loadOwnerAnnouncementAccess,
  loadOwnerAnnouncementDetail,
  markOwnerAnnouncementNotificationsRead,
} from "@/lib/notices/owner-announcements.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ noticeId: string }> };

/**
 * POST — 운영 공지 열람 1회 기록(회원 공지와 같은 표·RPC `record_customer_center_content_view`)
 * + 이 공지를 가리키는 내 운영 알림 읽음. 대상이 아니거나 게시 중이 아니면 기록하지 않는다.
 */
export async function POST(_req: Request, ctx: Ctx) {
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

  let detail;
  try {
    detail = await loadOwnerAnnouncementDetail(sb, auth.userId, access.audiences, noticeId);
  } catch {
    return NextResponse.json({ ok: false, error: "announcement_fetch_failed" }, { status: 500 });
  }
  if (detail.kind === "not_found") {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (detail.kind !== "ok") {
    return NextResponse.json({ ok: true, recorded: false });
  }

  const { data, error } = await sb.rpc("record_customer_center_content_view", {
    p_content_id: noticeId,
    p_user_id: auth.userId,
  });
  const notificationsRead = await markOwnerAnnouncementNotificationsRead(sb, auth.userId, noticeId).catch(
    () => 0
  );
  if (error) {
    return NextResponse.json({ ok: true, recorded: false, notificationsRead });
  }
  const first = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, recorded: Boolean(first?.recorded), notificationsRead });
}
