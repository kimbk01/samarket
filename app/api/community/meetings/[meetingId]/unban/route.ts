import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const target = String(body.userId ?? "").trim();
  if (!target) return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });

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

  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  if (host !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error } = await sb
    .from("meeting_member_bans")
    .update({ released_at: new Date().toISOString() })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .is("released_at", null);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
