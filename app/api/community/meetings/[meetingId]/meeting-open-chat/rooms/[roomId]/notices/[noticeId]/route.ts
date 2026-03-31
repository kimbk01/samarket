import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { deleteMeetingOpenChatNotice, patchMeetingOpenChatNotice } from "@/lib/meeting-open-chat/notices-service";
import type { MeetingOpenChatMemberRole } from "@/lib/meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string; noticeId: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, noticeId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const nid = noticeId?.trim() ?? "";
  if (!mid || !rid || !nid) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  const result = await patchMeetingOpenChatNotice(loaded.ctx.sb, {
    roomId: rid,
    noticeId: nid,
    actorUserId: auth.userId,
    actorRole: role,
    title: typeof body.title === "string" ? body.title : undefined,
    content: typeof body.content === "string" ? body.content : undefined,
    isPinned: typeof body.isPinned === "boolean" ? body.isPinned : undefined,
  });

  if (!result.ok) {
    const st =
      result.status === 400
        ? 400
        : result.status === 403
          ? 403
          : result.status === 404
            ? 404
            : result.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true, notice: result.notice });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId, noticeId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  const nid = noticeId?.trim() ?? "";
  if (!mid || !rid || !nid) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  const result = await deleteMeetingOpenChatNotice(loaded.ctx.sb, {
    roomId: rid,
    noticeId: nid,
    actorUserId: auth.userId,
    actorRole: role,
  });

  if (!result.ok) {
    const st =
      result.status === 403 ? 403 : result.status === 404 ? 404 : result.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
