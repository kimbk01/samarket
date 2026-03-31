import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { patchMeetingOpenChatReportStatus } from "@/lib/meeting-open-chat/ops-service";
import type { MeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; reportId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, reportId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const repId = reportId?.trim() ?? "";
  if (!mid || !rid || !repId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const status = body.status === "reviewed" || body.status === "rejected" ? body.status : null;
  if (!status) {
    return NextResponse.json({ ok: false, error: "status_invalid" }, { status: 400 });
  }
  const blindAssociatedMessage = body.blindAssociatedMessage === true;

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  const result = await patchMeetingOpenChatReportStatus(loaded.ctx.sb, {
    roomId: rid,
    reportId: repId,
    actorUserId: auth.userId,
    actorRole: role,
    status,
    blindAssociatedMessage,
  });

  if (!result.ok) {
    const st =
      result.status === 403 ? 403 : result.status === 404 ? 404 : result.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
