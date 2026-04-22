import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getNeighborhoodDevSampleMeeting } from "@/lib/neighborhood/dev-sample-data";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { removeMeetingMessengerParticipant } from "@/lib/community-messenger/meeting-chat-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

/** 강제 퇴장 — 개설자만, 본인은 불가 */
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
  if (process.env.NODE_ENV !== "production") {
    getNeighborhoodDevSampleMeeting(id);
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        meetings?: Array<{ id: string; host_user_id?: string; created_by?: string }>;
        meetingMembers?: Map<string, Array<{ user_id: string; status: "joined" | "left" | "kicked" }>>;
      };
    }).__samarketNeighborhoodDevSampleState;
    const meeting = state?.meetings?.find((item) => item.id === id);
    const hostId = meeting?.host_user_id ?? meeting?.created_by;
    const member = state?.meetingMembers?.get(id)?.find((item) => item.user_id === target);
    if (meeting && member && hostId === auth.userId && target !== hostId) {
      member.status = "kicked";
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
    .select("id, created_by, host_user_id, chat_room_id, community_messenger_room_id, title")
    .eq("id", id)
    .maybeSingle();
  const meeting = m as {
    id?: string;
    created_by?: string;
    host_user_id?: string;
    chat_room_id?: string | null;
    community_messenger_room_id?: string | null;
    title?: string;
  } | null;
  if (!meeting?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const host = meeting.host_user_id ?? meeting.created_by;
  if (host !== auth.userId) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (target === host) {
    return NextResponse.json({ ok: false, error: "cannot_kick_creator" }, { status: 400 });
  }

  const { error: upErr } = await sb
    .from("meeting_members")
    .update({
      status: "kicked",
      kicked_at: new Date().toISOString(),
      kicked_by: auth.userId,
      status_reason: "host_kicked",
    })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .eq("status", "joined");
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  // 강퇴 알림
  void appendUserNotification(sb, {
    user_id: target,
    notification_type: "status",
    title: `${String(meeting?.title ?? "모임")}에서 강퇴되었습니다`,
    body: "운영자에 의해 모임에서 강제 퇴장되었습니다.",
    link_url: `/philife`,
  });

  await removeMeetingMessengerParticipant({
    roomId: meeting.community_messenger_room_id,
    userId: target,
  });

  return NextResponse.json({ ok: true });
}
