import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listMeetingNotices } from "@/lib/neighborhood/queries";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const notices = await listMeetingNotices(id, 5);
  return NextResponse.json({ ok: true, notices });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { title?: string; body?: string; visibility?: string; isPinned?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim().slice(0, 120);
  const content = String(body.body ?? "").trim().slice(0, 2000);
  const visibility = body.visibility === "public" ? "public" : "members";
  const isPinned = body.isPinned !== false;

  if (!title && !content) {
    return NextResponse.json({ ok: false, error: "empty_notice" }, { status: 400 });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id")
    .eq("id", id)
    .maybeSingle();
  const m = meeting as { id?: string; created_by?: string | null; host_user_id?: string | null } | null;
  if (!m?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { data: coHost } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .eq("status", "joined")
    .eq("role", "co_host")
    .maybeSingle();

  const canManage =
    String(m.host_user_id ?? m.created_by ?? "").trim() === auth.userId || !!(coHost as { id?: string } | null)?.id;
  if (!canManage) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: created, error } = await sb
    .from("meeting_notices")
    .insert({
      meeting_id: id,
      author_user_id: auth.userId,
      title,
      body: content,
      visibility,
      is_pinned: isPinned,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, noticeId: (created as { id?: string } | null)?.id ?? null });
}
