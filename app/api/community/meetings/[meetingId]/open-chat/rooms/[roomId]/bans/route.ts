import { NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listActiveCommunityChatBans } from "@/lib/community-meeting-open-chat/ops-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import { communityChatRoleCanManage } from "@/lib/community-meeting-open-chat/room-access";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  if (!communityChatRoleCanManage(loaded.ctx.member.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const list = await listActiveCommunityChatBans(loaded.ctx.sb, loaded.ctx.roomId);
  if (!list.ok) {
    const st = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status: st });
  }

  return NextResponse.json({ ok: true, bans: list.bans });
}
