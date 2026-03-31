import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  listMeetingOpenChatMessages,
  postMeetingOpenChatTextMessage,
} from "@/lib/meeting-open-chat/messages-service";
import { loadMeetingOpenChatRoomContext } from "@/lib/meeting-open-chat/api-context";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const loaded = await loadMeetingOpenChatRoomContext(mid, rid, auth.userId);
  if (!loaded.ok) return loaded.response;

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const before = req.nextUrl.searchParams.get("before")?.trim() || null;
  const q = req.nextUrl.searchParams.get("q")?.trim() || null;
  const limit = limitRaw ? Number(limitRaw) : 50;

  const list = await listMeetingOpenChatMessages(loaded.ctx.sb, {
    roomId: rid,
    viewerRole: loaded.ctx.member.role,
    limit: Number.isFinite(limit) ? limit : 50,
    before,
    search: q,
  });
  if (!list.ok) {
    const st = list.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: list.error }, { status: st });
  }

  return NextResponse.json({ ok: true, messages: list.messages });
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

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text : "";
  const replyTo =
    body.replyToMessageId === null || body.replyToMessageId === undefined
      ? null
      : typeof body.replyToMessageId === "string"
        ? body.replyToMessageId
        : null;

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const imageFileName =
    typeof body.imageFileName === "string" ? body.imageFileName.trim().slice(0, 255) : undefined;
  const imageFileSizeRaw = body.imageFileSize;
  const imageFileSize =
    typeof imageFileSizeRaw === "number" && Number.isFinite(imageFileSizeRaw)
      ? Math.floor(imageFileSizeRaw)
      : undefined;

  const image =
    imageUrl.length > 0
      ? { url: imageUrl, fileName: imageFileName, fileSize: imageFileSize }
      : null;

  const posted = await postMeetingOpenChatTextMessage(loaded.ctx.sb, {
    roomId: rid,
    userId: auth.userId,
    memberId: loaded.ctx.member.memberId,
    memberRole: loaded.ctx.member.role,
    body: text,
    replyToMessageId: replyTo,
    image,
  });

  if (!posted.ok) {
    const st =
      posted.status === 400
        ? 400
        : posted.status === 403
          ? 403
          : posted.status === 503
            ? 503
            : 500;
    return NextResponse.json({ ok: false, error: posted.error }, { status: st });
  }

  return NextResponse.json({ ok: true, message: posted.message });
}
