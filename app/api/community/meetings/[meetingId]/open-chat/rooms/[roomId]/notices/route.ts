import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createCommunityChatNotice, listCommunityChatNotices } from "@/lib/community-meeting-open-chat/ops-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import { communityChatRoleCanManage } from "@/lib/community-meeting-open-chat/room-access";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  const includeInactive =
    communityChatRoleCanManage(loaded.ctx.member.role) &&
    req.nextUrl.searchParams.get("includeInactive") === "true";

  const list = await listCommunityChatNotices(loaded.ctx.sb, loaded.ctx.roomId, includeInactive);
  if (!list.ok) {
    const st = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status: st });
  }

  return NextResponse.json({ ok: true, notices: list.notices });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  if (!communityChatRoleCanManage(loaded.ctx.member.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { title?: string; body?: string; isPinned?: boolean; pinOrder?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const created = await createCommunityChatNotice(loaded.ctx.sb, loaded.ctx.roomId, auth.userId, loaded.ctx.member.role, {
    title: typeof body.title === "string" ? body.title : "",
    body: typeof body.body === "string" ? body.body : "",
    isPinned: body.isPinned === true,
    pinOrder: typeof body.pinOrder === "number" ? body.pinOrder : undefined,
  });

  if (!created.ok) {
    const st =
      created.status === 400
        ? 400
        : created.status === 403
          ? 403
          : created.status === 503
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: created.error }, { status: st });
  }

  return NextResponse.json({ ok: true, noticeId: created.notice.id });
}
