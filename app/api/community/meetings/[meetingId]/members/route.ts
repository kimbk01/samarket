import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  getNeighborhoodDevSampleMeeting,
  getNeighborhoodDevSampleMeetingMembers,
} from "@/lib/neighborhood/dev-sample-data";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

/** 참여자 목록 (JOINED) */
export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  if (process.env.NODE_ENV !== "production") {
    const sampleMeeting = getNeighborhoodDevSampleMeeting(id);
    if (sampleMeeting) {
      const sampleMembers = getNeighborhoodDevSampleMeetingMembers(id);
      const isHost =
        String(sampleMeeting.host_user_id ?? "").trim() === auth.userId ||
        String(sampleMeeting.created_by ?? "").trim() === auth.userId;
      const viewerJoined = sampleMembers.some(
        (member) => member.user_id === auth.userId && member.status === "joined"
      );
      if (!isHost && !viewerJoined) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      return NextResponse.json({
        ok: true,
        members: sampleMembers
          .filter((member) => member.status === "joined")
          .map((member, index) => ({
            id: `${id}:${member.user_id}:${index}`,
            user_id: member.user_id,
            status: member.status,
            created_at: null,
            label: member.label,
            role: member.role,
          })),
        fallback: "dev_samples",
      });
    }
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { data: meeting } = await sb
    .from("meetings")
    .select("id, host_user_id, created_by")
    .eq("id", id)
    .maybeSingle();
  const m = meeting as { id?: string; host_user_id?: string; created_by?: string } | null;
  if (!m?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const isHost =
    String(m.host_user_id ?? "").trim() === auth.userId ||
    String(m.created_by ?? "").trim() === auth.userId;

  if (!isHost) {
    const { data: me } = await sb
      .from("meeting_members")
      .select("id")
      .eq("meeting_id", id)
      .eq("user_id", auth.userId)
      .eq("status", "joined")
      .maybeSingle();
    if (!(me as { id?: string } | null)?.id) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await sb
    .from("meeting_members")
    .select("id, user_id, status, created_at")
    .eq("meeting_id", id)
    .eq("status", "joined")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, members: data ?? [] });
}
