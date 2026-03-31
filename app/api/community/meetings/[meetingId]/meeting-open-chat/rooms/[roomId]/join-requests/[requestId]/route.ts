import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { resolveMeetingOpenChatJoinRequest } from "@/lib/meeting-open-chat/ops-service";
import type { MeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; requestId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, requestId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const reqId = requestId?.trim() ?? "";
  if (!mid || !rid || !reqId) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  if (!decision) {
    return NextResponse.json({ ok: false, error: "decision_invalid" }, { status: 400 });
  }

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  const result = await resolveMeetingOpenChatJoinRequest(loaded.ctx.sb, {
    roomId: rid,
    meetingId: mid,
    requestId: reqId,
    decision,
    actorUserId: auth.userId,
    actorRole: role,
  });

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 404
            ? 404
            : result.status === 409
              ? 409
              : result.status === 503
                ? 503
                : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
