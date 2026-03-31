import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { patchCommunityChatNotice } from "@/lib/community-meeting-open-chat/ops-service";
import { loadOpenChatRoomContext } from "@/lib/community-meeting-open-chat/open-chat-api-context";
import { communityChatRoleCanManage } from "@/lib/community-meeting-open-chat/room-access";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; noticeId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, noticeId } = await ctx.params;
  const nid = noticeId?.trim() ?? "";
  if (!nid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  if (!communityChatRoleCanManage(loaded.ctx.member.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: {
    title?: string;
    body?: string;
    isPinned?: boolean;
    pinOrder?: number;
    isActive?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await patchCommunityChatNotice(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    nid,
    auth.userId,
    loaded.ctx.member.role,
    {
      title: typeof body.title === "string" ? body.title : undefined,
      body: typeof body.body === "string" ? body.body : undefined,
      isPinned: typeof body.isPinned === "boolean" ? body.isPinned : undefined,
      pinOrder: typeof body.pinOrder === "number" ? body.pinOrder : undefined,
      isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
    }
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, noticeId } = await ctx.params;
  const nid = noticeId?.trim() ?? "";
  if (!nid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadOpenChatRoomContext(meetingId, roomId, auth.userId);
  if (!loaded.ok) return loaded.response;

  if (!communityChatRoleCanManage(loaded.ctx.member.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await patchCommunityChatNotice(
    loaded.ctx.sb,
    loaded.ctx.roomId,
    nid,
    auth.userId,
    loaded.ctx.member.role,
    { isActive: false }
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
