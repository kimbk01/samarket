import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getMeetingDetail } from "@/lib/neighborhood/queries";
import { hashMeetingPassword } from "@/lib/neighborhood/meeting-password";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const detail = await getMeetingDetail(id);
  if (!detail) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  return NextResponse.json({ ok: true, meeting: detail });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: {
    entryPolicy?: string;
    password?: string;
    welcome_message?: string | null;
    allow_feed?: boolean;
    allow_album_upload?: boolean;
    title?: string;
    description?: string;
    max_members?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const entryPolicy =
    body.entryPolicy === "approve" || body.entryPolicy === "password" || body.entryPolicy === "invite_only"
      ? body.entryPolicy
      : "open";
  const password = String(body.password ?? "").trim();

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id, password_hash")
    .eq("id", id)
    .maybeSingle();
  const m = meeting as {
    id?: string;
    created_by?: string | null;
    host_user_id?: string | null;
    password_hash?: string | null;
  } | null;
  if (!m?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  if (host !== auth.userId) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  if (entryPolicy === "password" && !password && !String(m.password_hash ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "password_required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    entry_policy: entryPolicy,
    requires_approval: entryPolicy === "approve" || entryPolicy === "invite_only",
  };

  if (entryPolicy === "password") {
    if (password) patch.password_hash = hashMeetingPassword(password);
  } else {
    patch.password_hash = null;
  }

  // 추가 설정 필드
  if ("welcome_message" in body) {
    const wm = body.welcome_message == null ? null : String(body.welcome_message).trim().slice(0, 500);
    patch.welcome_message = wm || null;
  }
  if (typeof body.allow_feed === "boolean") patch.allow_feed = body.allow_feed;
  if (typeof body.allow_album_upload === "boolean") patch.allow_album_upload = body.allow_album_upload;
  if (body.title != null) {
    const t = String(body.title).trim().slice(0, 100);
    if (t) patch.title = t;
  }
  if (body.description != null) {
    patch.description = String(body.description).trim().slice(0, 2000);
  }
  if (body.max_members != null) {
    const mm = Math.min(Math.max(Number(body.max_members) || 0, 2), 500);
    if (mm > 0) patch.max_members = mm;
  }

  const { error } = await sb.from("meetings").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
