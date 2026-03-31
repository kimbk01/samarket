import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { isUserJoinedMeetingMember } from "@/lib/community-meeting-open-chat/meeting-member-guard";
import {
  listCommunityChatMessages,
  postCommunityChatMessage,
} from "@/lib/community-meeting-open-chat/messages-service";
import {
  getCommunityChatRoomMeetingId,
  getJoinedCommunityChatMember,
} from "@/lib/community-meeting-open-chat/room-access";
import type { CommunityChatMessageType } from "@/lib/community-meeting-open-chat/types";

type Ctx = { params: Promise<{ meetingId: string; roomId: string }> };

const CLIENT_TYPES = new Set(["text", "image", "file", "reply"]);

function messageTypeFromBody(v: unknown): CommunityChatMessageType {
  if (typeof v === "string" && CLIENT_TYPES.has(v)) return v as CommunityChatMessageType;
  return "text";
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { meetingId, roomId } = await ctx.params;
  const mid = meetingId?.trim() ?? "";
  const rid = roomId?.trim() ?? "";
  if (!mid || !rid) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (!(await isUserJoinedMeetingMember(sb, mid, auth.userId))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const roomMeta = await getCommunityChatRoomMeetingId(sb, rid);
  if (!roomMeta.ok) {
    const st = roomMeta.status === 404 ? 404 : roomMeta.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: roomMeta.error }, { status: st });
  }
  if (roomMeta.meetingId !== mid) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const member = await getJoinedCommunityChatMember(sb, rid, auth.userId);
  if (!member.ok) {
    const st = member.status === 403 ? 403 : member.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: member.error }, { status: st });
  }

  const before = req.nextUrl.searchParams.get("before")?.trim() ?? null;
  const limit = req.nextUrl.searchParams.get("limit");
  const list = await listCommunityChatMessages(sb, rid, auth.userId, member.member, {
    before,
    limit: limit != null ? Number(limit) : undefined,
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

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  if (!(await isUserJoinedMeetingMember(sb, mid, auth.userId))) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const roomMeta = await getCommunityChatRoomMeetingId(sb, rid);
  if (!roomMeta.ok) {
    const st = roomMeta.status === 404 ? 404 : roomMeta.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: roomMeta.error }, { status: st });
  }
  if (roomMeta.meetingId !== mid) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const member = await getJoinedCommunityChatMember(sb, rid, auth.userId);
  if (!member.ok) {
    const st = member.status === 403 ? 403 : member.status === 503 ? 503 : 500;
    return NextResponse.json({ ok: false, error: member.error }, { status: st });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const attachmentsRaw = body.attachments;
  const attachments = Array.isArray(attachmentsRaw)
    ? attachmentsRaw
        .map((a) => {
          if (!a || typeof a !== "object") return null;
          const o = a as Record<string, unknown>;
          const kind = o.kind === "image" || o.kind === "file" ? o.kind : null;
          const storage_path = typeof o.storage_path === "string" ? o.storage_path : "";
          if (!kind || !storage_path.trim()) return null;
          return {
            kind: kind as "image" | "file",
            storage_path,
            original_filename: typeof o.original_filename === "string" ? o.original_filename : null,
            mime_type: typeof o.mime_type === "string" ? o.mime_type : null,
            byte_size: typeof o.byte_size === "number" ? o.byte_size : null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : undefined;

  const posted = await postCommunityChatMessage(sb, {
    roomId: rid,
    senderUserId: auth.userId,
    senderMember: member.member,
    body: typeof body.body === "string" ? body.body : "",
    messageType: messageTypeFromBody(body.messageType),
    replyToMessageId: typeof body.replyToMessageId === "string" ? body.replyToMessageId : null,
    imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null,
    imageUrls: body.imageUrls,
    attachments,
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
