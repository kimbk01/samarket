import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { userId?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const target = String(body.userId ?? "").trim();
  const reason = String(body.reason ?? "").trim().slice(0, 500);
  if (!target || target === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id, title")
    .eq("id", id)
    .maybeSingle();
  const m = meeting as { id?: string; created_by?: string | null; host_user_id?: string | null; title?: string } | null;
  if (!m?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  if (host !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: existingBan } = await sb
    .from("meeting_member_bans")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", target)
    .is("released_at", null)
    .maybeSingle();
  if ((existingBan as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: true, already: true });
  }

  const { error: banErr } = await sb.from("meeting_member_bans").insert({
    meeting_id: id,
    user_id: target,
    blocked_by: auth.userId,
    reason,
  });
  if (banErr) return NextResponse.json({ ok: false, error: banErr.message }, { status: 500 });

  await sb
    .from("meeting_members")
    .update({
      status: "banned",
      kicked_at: new Date().toISOString(),
      kicked_by: auth.userId,
      status_reason: reason || "host_banned",
    })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .in("status", ["joined", "pending", "left", "kicked", "rejected"]);

  // 차단 알림
  void appendUserNotification(sb, {
    user_id: target,
    notification_type: "status",
    title: `${String(m?.title ?? "모임")}에서 차단되었습니다`,
    body: "운영자에 의해 이 모임의 접근이 차단되었습니다.",
    link_url: `/philife`,
  });

  return NextResponse.json({ ok: true });
}
