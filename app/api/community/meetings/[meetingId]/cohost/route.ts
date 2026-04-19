import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

async function requireMeetingHost(meetingId: string, userId: string) {
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

  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  if (host !== userId) return { ok: false as const, error: "forbidden", sb };

  return { ok: true as const, sb, hostUserId: host };
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
  if (!target || target === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  const gate = await requireMeetingHost(id, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.error === "forbidden" ? 403 : 404 });
  }

  const { error } = await gate.sb
    .from("meeting_members")
    .update({ role: "co_host", status_reason: "host_promoted_co_host" })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .eq("status", "joined")
    .eq("role", "member");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
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

  const gate = await requireMeetingHost(id, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.error === "forbidden" ? 403 : 404 });
  }

  if (target === gate.hostUserId) {
    return NextResponse.json({ ok: false, error: "cannot_demote_host" }, { status: 400 });
  }

  const { error } = await gate.sb
    .from("meeting_members")
    .update({ role: "member", status_reason: "host_revoked_co_host" })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .eq("status", "joined")
    .eq("role", "co_host");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
