import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getNeighborhoodDevSampleMeeting } from "@/lib/neighborhood/dev-sample-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

/** 모임 종료 — 개설자만 */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (process.env.NODE_ENV !== "production") {
    getNeighborhoodDevSampleMeeting(id);
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        meetings?: Array<{ id: string; status: string; is_closed?: boolean; host_user_id?: string; created_by?: string }>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const meeting = state?.meetings?.find((item) => item.id === id);
    const hostId = meeting?.host_user_id ?? meeting?.created_by;
    if (meeting && hostId === auth.userId) {
      meeting.status = "ended";
      meeting.is_closed = true;
      return NextResponse.json({ ok: true, fallback: "dev_samples" });
    }
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: m } = await sb
    .from("meetings")
    .select("id, created_by, host_user_id, chat_room_id")
    .eq("id", id)
    .maybeSingle();
  const meeting = m as { id?: string; created_by?: string; host_user_id?: string; chat_room_id?: string | null } | null;
  if (!meeting?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const host = meeting.host_user_id ?? meeting.created_by;
  if (host !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const roomId = meeting.chat_room_id ?? null;

  const { error } = await sb.from("meetings").update({ status: "ended" }).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  if (roomId) {
    await sb.from("chat_rooms").update({ is_readonly: true }).eq("id", roomId);
  }

  return NextResponse.json({ ok: true });
}
