import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";
import { markMeetingOpenChatRoomRead } from "@/lib/meeting-open-chat/read-service";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

/** POST — 읽음 처리. Body: { messageId?: string } (없으면 방 최신 메시지 기준) */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text?.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const messageId =
    body.messageId === null || body.messageId === undefined
      ? null
      : typeof body.messageId === "string"
        ? body.messageId.trim() || null
        : null;

  const done = await markMeetingOpenChatRoomRead(loaded.ctx.sb, {
    roomId: rid,
    userId: auth.userId,
    memberId: loaded.ctx.member.memberId,
    messageId,
  });

  if (!done.ok) {
    const st =
      done.status === 400
        ? 400
        : done.status === 403
          ? 403
          : done.status === 404
            ? 404
            : done.status === 503
              ? 503
              : 500;
    return NextResponse.json({ ok: false, error: done.error }, { status: st });
  }

  return NextResponse.json({ ok: true });
}
