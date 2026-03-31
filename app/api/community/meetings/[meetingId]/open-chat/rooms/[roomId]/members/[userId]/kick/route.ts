import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { kickCommunityChatMember } from "@/lib/community-meeting-open-chat/moderation-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; userId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, userId: targetUserId } = await ctx.params;
  const tid = targetUserId?.trim() ?? "";
  if (!tid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  const result = await kickCommunityChatMember(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    tid,
    auth.userId,
    loaded.ctx.member.role
  );

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 503
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
