import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { setCommunityChatMemberRole } from "@/lib/community-meeting-open-chat/admin-service";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import { getCommunityChatRoomMeetingId, getJoinedCommunityChatMember } from "@/lib/community-meeting-open-chat/room-access";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; userId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, userId: targetUserId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const tid = targetUserId?.trim() ?? "";
  if (!mid || !rid || !tid) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

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

  let body: { role?: string };
  try {
    body = (await req.json()) as { role?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const role = body.role === "sub_admin" || body.role === "member" ? body.role : null;
  if (!role) {
    return NextResponse.json({ ok: false, error: "role_invalid" }, { status: 400 });
  }

  const result = await setCommunityChatMemberRole(sb, rid, auth.userId, tid, role);
  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 404
            ? 404
            : result.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
