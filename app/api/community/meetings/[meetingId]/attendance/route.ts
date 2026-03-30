import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

const STATUSES = new Set(["unknown", "attending", "absent", "excused"]);

async function requireMeetingManager(meetingId: string, userId: string) {
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
    return { ok: false as const, error: "forbidden", sb };
  }

  return { ok: true as const, sb };
}

/**
 * PATCH — 참석 상태 기록 (개설자·공동 운영자)
 * body: { userId: string, status: "unknown" | "attending" | "absent" | "excused" }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let body: { userId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const target = String(body.userId ?? "").trim();
  const status = String(body.status ?? "").trim();
  if (!target || !STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const gate = await requireMeetingManager(id, auth.userId);
  if (!gate.ok) {
    const st = gate.error === "forbidden" ? 403 : gate.error === "not_found" ? 404 : 500;
    return NextResponse.json({ ok: false, error: gate.error }, { status: st });
  }

  const { data: mem } = await gate.sb
    .from("meeting_members")
    .select("id, status")
    .eq("meeting_id", id)
    .eq("user_id", target)
    .maybeSingle();
  const row = mem as { id?: string; status?: string } | null;
  if (!row?.id || row.status !== "joined") {
    return NextResponse.json({ ok: false, error: "not_joined" }, { status: 400 });
  }

  const { error } = await gate.sb
    .from("meeting_members")
    .update({
      attendance_status: status,
      attendance_checked_at: new Date().toISOString(),
      attendance_checked_by: auth.userId,
    })
    .eq("id", row.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
