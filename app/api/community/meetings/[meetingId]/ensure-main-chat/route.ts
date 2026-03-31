import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { addMeetingChatParticipant, ensureMeetingGroupChatRoomResult } from "@/lib/neighborhood/meeting-chat";
import { getNeighborhoodDevSampleMeeting } from "@/lib/neighborhood/dev-sample-data";

interface Ctx {
  params: Promise<{ meetingId: string }>;
}

/**
 * 모임 `meetings.chat_room_id` 가 비어 있을 때 메인 `chat_rooms` 생성·연결을 다시 시도 (멱등).
 * 참여 멤버 누구나 호출 가능 — 이미 연결돼 있으면 기존 id 만 반환.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId } = await ctx.params;
  const id = meetingId?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (process.env.NODE_ENV !== "production" && getNeighborhoodDevSampleMeeting(id)) {
    const { data: dbMeet } = await sb.from("meetings").select("id, chat_room_id").eq("id", id).maybeSingle();
    if (!dbMeet) {
      return NextResponse.json({ ok: false, error: "sample_readonly" }, { status: 400 });
    }
  }

  const { data: mm } = await sb
    .from("meeting_members")
    .select("id")
    .eq("meeting_id", id)
    .eq("user_id", auth.userId)
    .eq("status", "joined")
    .maybeSingle();
  if (!mm) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: meet } = await sb
    .from("meetings")
    .select("chat_room_id, title, host_user_id, created_by")
    .eq("id", id)
    .maybeSingle();
  const row = meet as {
    chat_room_id?: string | null;
    title?: string | null;
    host_user_id?: string | null;
    created_by?: string | null;
  } | null;

  let mainChatRoomId =
    row?.chat_room_id != null && String(row.chat_room_id).trim() !== ""
      ? String(row.chat_room_id)
      : null;

  if (!mainChatRoomId) {
    const meetTitle = String(row?.title ?? "").trim() || "모임";
    const organizer = String(row?.host_user_id ?? row?.created_by ?? auth.userId).trim();
    const ensured = await ensureMeetingGroupChatRoomResult(sb, id, organizer || auth.userId, meetTitle);
    if (ensured.ok) mainChatRoomId = ensured.roomId;
    else {
      return NextResponse.json(
        {
          ok: false,
          error: "ensure_failed",
          message: "메인 채팅방을 연결하지 못했습니다. 아래 detail을 확인하고 Supabase SQL을 점검하세요.",
          detail: ensured.error,
        },
        { status: 503 },
      );
    }
  }

  if (mainChatRoomId) {
    await addMeetingChatParticipant(sb, id, auth.userId);
  }

  if (!mainChatRoomId) {
    return NextResponse.json(
      {
        ok: false,
        error: "ensure_failed",
        message: "메인 채팅방 id를 확보하지 못했습니다.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true, mainChatRoomId });
}
