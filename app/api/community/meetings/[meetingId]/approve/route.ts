import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { isSameUserId } from "@/lib/auth/same-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { getNeighborhoodDevSampleMeeting } from "@/lib/neighborhood/dev-sample-data";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { ensureMeetingMessengerParticipant } from "@/lib/community-messenger/meeting-chat-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  // 개발 샘플 데이터 경로
  if (process.env.NODE_ENV !== "production") {
    const sampleMeeting = getNeighborhoodDevSampleMeeting(id);
    type SampleMember = { user_id: string; label: string; role: "host" | "member"; status: string };
    const state = (globalThis as {
      __samarketNeighborhoodDevSampleState?: {
        meetingMembers?: Map<string, SampleMember[]>;
      };
    }).__samarketNeighborhoodDevSampleState;
    if (sampleMeeting && state?.meetingMembers) {
      const hostId = String(sampleMeeting.host_user_id || sampleMeeting.created_by || "").trim();
      if (hostId !== auth.userId) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      }
      const members = state.meetingMembers.get(id) ?? [];
      const targetMember = members.find((m) => m.user_id === target);
      if (!targetMember || targetMember.status !== "pending") {
        return NextResponse.json({ ok: false, error: "not_pending" }, { status: 404 });
      }
      targetMember.status = "joined";
      state.meetingMembers.set(id, members);
      return NextResponse.json({ ok: true, fallback: "dev_samples" });
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
    .select("id, created_by, host_user_id, title, community_messenger_room_id")
    .eq("id", id)
    .maybeSingle();
  const m = meeting as {
    id?: string;
    created_by?: string;
    host_user_id?: string;
    title?: string;
    community_messenger_room_id?: string | null;
  } | null;
  if (!m?.id) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const host = String(m.host_user_id ?? m.created_by ?? "").trim();
  const { data: coHost } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .eq("status", "joined")
    .eq("role", "co_host")
    .maybeSingle();
  if (host !== auth.userId && !(coHost as { id?: string } | null)?.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { error: memberErr } = await sb
    .from("meeting_members")
    .update({
      status: "joined",
      approved_at: now,
      approved_by: auth.userId,
      status_reason: "host_approved",
    })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .eq("status", "pending");
  if (memberErr) return NextResponse.json({ ok: false, error: memberErr.message }, { status: 500 });

  await sb
    .from("meeting_join_requests")
    .update({
      status: "approved",
      reviewed_at: now,
      reviewed_by: auth.userId,
      review_reason: "host_approved",
    })
    .eq("meeting_id", id)
    .eq("user_id", target)
    .eq("status", "pending");

  // 승인 알림 발송 (실패해도 응답에 영향 없음)
  void appendUserNotification(sb, {
    user_id: target,
    notification_type: "status",
    title: `${String(m?.title ?? "모임")}에 승인되었습니다`,
    body: "채팅·피드·앨범 탭을 이용할 수 있습니다.",
    link_url: `/philife?category=meetup&meetingId=${encodeURIComponent(id)}`,
  });

  await ensureMeetingMessengerParticipant({
    roomId: m.community_messenger_room_id,
    userId: target,
    role: "member",
  });

  return NextResponse.json({ ok: true });
}
