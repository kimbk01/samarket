import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { resolveCommunityChatJoinRequest } from "@/lib/community-meeting-open-chat/ops-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import { communityChatRoleCanManage } from "@/lib/community-meeting-open-chat/room-access";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; requestId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, requestId } = await ctx.params;
  const reqId = requestId?.trim() ?? "";
  if (!reqId) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  if (!communityChatRoleCanManage(loaded.ctx.member.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { decision?: string; rejectReason?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const d = body.decision === "approve" || body.decision === "reject" ? body.decision : null;
  if (!d) {
    return NextResponse.json({ ok: false, error: "decision_invalid" }, { status: 400 });
  }

  const result = await resolveCommunityChatJoinRequest(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    reqId,
    auth.userId,
    loaded.ctx.member.role,
    d,
    typeof body.rejectReason === "string" ? body.rejectReason : null
  );

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
