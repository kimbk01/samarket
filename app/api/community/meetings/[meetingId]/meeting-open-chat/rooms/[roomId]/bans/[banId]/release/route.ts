import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { releaseMeetingOpenChatBan } from "@/lib/meeting-open-chat/ops-service";
import type { MeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; banId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, banId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const bid = banId?.trim() ?? "";
  if (!mid || !rid || !bid) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  const result = await releaseMeetingOpenChatBan(loaded.ctx.sb, {
    roomId: rid,
    banId: bid,
    actorUserId: auth.userId,
    actorRole: role,
  });

  if (!result.ok) {
    const st =
      result.status === 403 ? 403 : result.status === 404 ? 404 : result.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
