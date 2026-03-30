import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

interface Ctx {
  params: Promise<{ meetingId: string; noticeId: string }>;
}

async function canManageMeetingNotice(meetingId: string, userId: string) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { ok: false as const, error: "server_config", sb: null };
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id")
    .eq("id", meetingId)
    .maybeSingle();
  const m = meeting as { id?: string; created_by?: string | null; host_user_id?: string | null } | null;
  if (!m?.id) return { ok: false as const, error: "not_found", sb };

  const { data: coHost } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("status", "joined")
    .eq("role", "co_host")
    .maybeSingle();

  const canManage =
    String(m.host_user_id ?? m.created_by ?? "").trim() === userId || !!(coHost as { id?: string } | null)?.id;
  if (!canManage) return { ok: false as const, error: "forbidden", sb };
  return { ok: true as const, sb };
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, noticeId } = await ctx.params;
  const meetingIdTrimmed = meetingId?.trim();
  const noticeIdTrimmed = noticeId?.trim();
  if (!meetingIdTrimmed || !noticeIdTrimmed) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const gate = await canManageMeetingNotice(meetingIdTrimmed, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.error === "forbidden" ? 403 : 404 });
  }

  let body: { title?: string; body?: string; visibility?: string; isPinned?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 120);
  if (typeof body.body === "string") patch.body = body.body.trim().slice(0, 2000);
  if (typeof body.isPinned === "boolean") patch.is_pinned = body.isPinned;
  if (typeof body.visibility === "string") patch.visibility = body.visibility === "public" ? "public" : "members";

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "no_updates" }, { status: 400 });
  }

  const { error } = await gate.sb
    .from("meeting_notices")
    .update(patch)
    .eq("meeting_id", meetingIdTrimmed)
    .eq("id", noticeIdTrimmed)
    .eq("is_active", true);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, noticeId } = await ctx.params;
  const meetingIdTrimmed = meetingId?.trim();
  const noticeIdTrimmed = noticeId?.trim();
  if (!meetingIdTrimmed || !noticeIdTrimmed) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const gate = await canManageMeetingNotice(meetingIdTrimmed, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.error === "forbidden" ? 403 : 404 });
  }

  const { error } = await gate.sb
    .from("meeting_notices")
    .update({ is_active: false })
    .eq("meeting_id", meetingIdTrimmed)
    .eq("id", noticeIdTrimmed)
    .eq("is_active", true);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
