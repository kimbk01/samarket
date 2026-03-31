import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { listJoinedCommunityChatMembers } from "@/lib/community-meeting-open-chat/admin-service";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { getCommunityChatRoomMeetingId, getJoinedCommunityChatMember } from "@/lib/community-meeting-open-chat/room-access";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (!(await isUserJoinedMeetingMember(sb, mid, auth.userId))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const roomMeta = await getCommunityChatRoomMeetingId(sb, rid);
  if (!roomMeta.ok) {
    const st = roomMeta.status === 404 ? 404 : roomMeta.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: roomMeta.error }, { status: st });
  }
  if (roomMeta.meetingId !== mid) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const member = await getJoinedCommunityChatMember(sb, rid, auth.userId);
  if (!member.ok) {
    const st = member.status === 403 ? 403 : member.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: member.error }, { status: st });
  }

  const list = await listJoinedCommunityChatMembers(sb, rid);
  if (!list.ok) {
    const st = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status: st });
  }

  return NextResponse.json({ ok: true, members: list.members });
}
