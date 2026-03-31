import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { getActiveMeetingOpenChatMemberById } from "@/lib/meeting-open-chat/members-service";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; memberId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, memberId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const memId = memberId?.trim() ?? "";
  if (!mid || !rid || !memId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const one = await getActiveMeetingOpenChatMemberById(loaded.ctx.sb, rid, memId);
  if (!one.ok) {
    const st = one.status === 404 ? 404 : one.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: one.error }, { status: st });
  }

  return NextResponse.json({ ok: true, member: one.member });
}
