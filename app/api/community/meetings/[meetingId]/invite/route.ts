import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

async function requireMeetingManager(meetingId: string, userId: string) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { ok: false as const, error: "server_config", sb: null, hostUserId: "" };
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id")
    .eq("id", meetingId)
    .maybeSingle();
  const m = meeting as { id?: string; created_by?: string | null; host_user_id?: string | null } | null;
  if (!m?.id) return { ok: false as const, error: "not_found", sb, hostUserId: "" };

  const hostUserId = String(m.host_user_id ?? m.created_by ?? "").trim();
  const { data: coHost } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .eq("status", "joined")
    .eq("role", "co_host")
    .maybeSingle();
  if (hostUserId !== userId && !(coHost as { id?: string } | null)?.id) {
    return { ok: false as const, error: "forbidden", sb, hostUserId };
  }

  return { ok: true as const, sb, hostUserId };
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

  const gate = await requireMeetingManager(id, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.error === "forbidden" ? 403 : 404 });
  }

  const { data: existing } = await gate.sb
    .from("meeting_members")
    .select("id, status")
    .eq("meeting_id", id)
    .eq("user_id", target)
    .maybeSingle();
  const ex = existing as { id?: string; status?: string } | null;

  if (ex?.status === "joined") {
    return NextResponse.json({ ok: true, alreadyJoined: true });
  }

  if (ex?.id) {
    const { error } = await gate.sb
      .from("meeting_members")
      .update({
        status: "pending",
        status_reason: "host_invited",
        requested_at: new Date().toISOString(),
      })
      .eq("id", ex.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } else {
    const { error } = await gate.sb.from("meeting_members").insert({
      meeting_id: id,
      user_id: target,
      role: "member",
      status: "pending",
      status_reason: "host_invited",
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

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

  const gate = await requireMeetingManager(id, auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.error === "forbidden" ? 403 : 404 });
  }

  const { error } = await gate.sb
    .from("meeting_members")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      rejected_by: auth.userId,
      status_reason: "host_invite_revoked",
    })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .eq("status", "pending")
    .eq("status_reason", "host_invited");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
