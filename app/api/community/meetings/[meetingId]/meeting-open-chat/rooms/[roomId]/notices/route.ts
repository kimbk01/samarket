import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { createMeetingOpenChatNotice, listMeetingOpenChatNotices } from "@/lib/meeting-open-chat/notices-service";
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

  const list = await listMeetingOpenChatNotices(loaded.ctx.sb, rid);
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
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const role = loaded.ctx.member.role as MeetingOpenChatMemberRole;
  if (!meetingOpenChatRoleCanManage(role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title : "";
  const content = typeof body.content === "string" ? body.content : "";
  const isPinned = body.isPinned === true;

  const created = await createMeetingOpenChatNotice(loaded.ctx.sb, {
    roomId: rid,
    createdByUserId: auth.userId,
    title,
    content,
    isPinned,
  });

  if (!created.ok) {
    const st = created.status === 400 ? 400 : created.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: created.error }, { status: st });
  }

  return NextResponse.json({ ok: true, notice: created.notice });
}
