import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { listPendingMeetingOpenChatReports } from "@/lib/meeting-open-chat/ops-service";
import { meetingOpenChatRoleCanManage } from "@/lib/meeting-open-chat/permissions";
import type { MeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  if (!meetingOpenChatRoleCanManage(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const list = await listPendingMeetingOpenChatReports(loaded.ctx.sb, rid);
  if (!list.ok) {
    const st = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status: st });
  }

  return NextResponse.json({ ok: true, reports: list.reports });
}
