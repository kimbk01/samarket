import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { blindCommunityChatMessage } from "@/lib/community-meeting-open-chat/moderation-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; messageId: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, messageId } = await ctx.params;
  const mid = messageId?.trim() ?? "";
  if (!mid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  let body: { reason?: string };
  try {
    body = (await req.json().catch(() => ({}))) as { reason?: string };
  } catch {
    body = {};
  }

  const result = await blindCommunityChatMessage(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    mid,
    auth.userId,
    loaded.ctx.member.role,
    typeof body.reason === "string" ? body.reason : ""
  );

  if (!result.ok) {
    const st =
      result.status === 403
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
