import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "./meeting-member-guard";
import {
  getCommunityChatRoomMeetingId,
  getJoinedCommunityChatMember,
  type CommunityChatMemberAccess,
} from "./room-access";

export type OpenChatRoomContext = {
  sb: SupabaseClient<any>;
  meetingId: string;
  roomId: string;
  userId: string;
  member: CommunityChatMemberAccess;
};

export async function loadOpenChatRoomContext(
  meetingId: string,
  roomId: string,
  userId: string
): Promise<{ ok: true; ctx: OpenChatRoomContext } | { ok: false; response: NextResponse }> {
  const mid = meetingId.trim();
  const rid = roomId.trim();
  if (!mid || !rid) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }),
    };
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "server_config" }, { status: 500 }),
    };
  }

  if (!(await isUserJoinedMeetingMember(sb, mid, userId))) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
    };
  }

  const roomMeta = await getCommunityChatRoomMeetingId(sb, rid);
  if (!roomMeta.ok) {
    const st = roomMeta.status === 404 ? 404 : roomMeta.status === 503 ? 503 : 500;
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: roomMeta.error }, { status: st }),
    };
  }
  if (roomMeta.meetingId !== mid) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }),
    };
  }

  const member = await getJoinedCommunityChatMember(sb, rid, userId);
  if (!member.ok) {
    const st = member.status === 403 ? 403 : member.status === 503 ? 503 : 500;
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: member.error }, { status: st }),
    };
  }

  return {
    ok: true,
    ctx: { sb, meetingId: mid, roomId: rid, userId, member: member.member },
  };
}
