/**
 * GET /api/group-chat/rooms/:roomId/messages — 키셋 페이지
 * POST /api/group-chat/rooms/:roomId/messages — 메시지 전송 (seq 는 DB 트리거)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
  safeErrorMessage,
} from "@/lib/http/api-route";
import { loadGroupRoomMessageRowsForUser } from "@/lib/group-chat/server/load-group-room-messages";
import { getActiveGroupMembership } from "@/lib/group-chat/server/assert-group-member";
import { notifyGroupChatMessageRecipients } from "@/lib/notifications/group-chat-inapp-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const pageRateLimit = await enforceRateLimit({
    key: `group-chat:message-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메시지 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "group_chat_message_page_rate_limited",
  });
  if (!pageRateLimit.ok) return pageRateLimit.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return NextResponse.json({ error: "roomId 필요" }, { status: 400 });
  }

  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limitUsed = Math.min(
    Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 1),
    100
  );

  const result = await loadGroupRoomMessageRowsForUser({
    roomId,
    userId: auth.userId,
    before: req.nextUrl.searchParams.get("before"),
    beforeCreatedAt: req.nextUrl.searchParams.get("beforeCreatedAt"),
    limit: limitUsed,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const messages = result.value;
  const hasMore = messages.length === limitUsed && messages.length > 0;
  const oldest = messages[0] as { id?: unknown; created_at?: unknown } | undefined;
  const nextCursor =
    hasMore && typeof oldest?.id === "string" && typeof oldest?.created_at === "string"
      ? { before: oldest.id, beforeCreatedAt: oldest.created_at }
      : null;

  return NextResponse.json({ messages, hasMore, nextCursor });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rate = await enforceRateLimit({
    key: `group-chat:send:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "메시지 전송이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "group_chat_message_rate_limited",
  });
  if (!rate.ok) return rate.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonError("roomId 필요", 400);
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("서버 설정 필요", 500);
  }

  const parsed = await parseJsonBody<{ body?: string; messageType?: string }>(req, "body 필요");
  if (!parsed.ok) return parsed.response;
  const bodyRaw = typeof parsed.value.body === "string" ? parsed.value.body.trim() : "";
  const messageType = (["text", "image", "system"] as const).includes(parsed.value.messageType as never)
    ? (parsed.value.messageType as "text" | "image" | "system")
    : "text";

  if (messageType === "text" && !bodyRaw) {
    return jsonError("메시지를 입력하세요", 400);
  }

  const mem = await getActiveGroupMembership(sb, roomId, auth.userId);
  if (!mem.ok) {
    return jsonError(mem.error, mem.status);
  }

  const { data: inserted, error: insErr } = await sb
    .from("group_messages")
    .insert({
      room_id: roomId,
      sender_id: auth.userId,
      message_type: messageType,
      body: bodyRaw || (messageType === "image" ? "(이미지)" : ""),
      metadata: {},
    })
    .select("id, created_at, seq")
    .single();

  if (insErr) {
    return jsonError(safeErrorMessage(insErr, "전송에 실패했습니다."), 500, {
      code: "group_chat_message_insert_failed",
    });
  }

  const row = inserted as { id: string; created_at: string; seq: number };
  const preview =
    messageType === "text"
      ? bodyRaw.slice(0, 120)
      : messageType === "image"
        ? "사진"
        : "(메시지)";

  void notifyGroupChatMessageRecipients(sb, {
    roomId,
    senderUserId: auth.userId,
    preview,
  });

  return jsonOk({
    message: {
      id: row.id,
      createdAt: row.created_at,
      seq: row.seq,
    },
  });
}
