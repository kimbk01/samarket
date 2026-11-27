/**
 * GET /api/group-chat/rooms/:roomId/messages — 키셋 페이지
 * POST /api/group-chat/rooms/:roomId/messages — 메시지 전송 (seq 는 DB 트리거)
 *
 * CONTRACT: deprecated for user-facing; do not use from product UI.
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
import { notifyMessagePipeline } from "@/lib/notifications/pipeline/notify-message-pipeline";

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
    message: "group_chat_message_page_rate_limited",
    code: "group_chat_message_page_rate_limited",
  });
  if (!pageRateLimit.ok) return pageRateLimit.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return NextResponse.json({ error: "room_id_required", code: "room_id_required" }, { status: 400 });
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
    return NextResponse.json({ error: result.error, code: result.error }, { status: result.status });
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
    message: "group_chat_message_rate_limited",
    code: "group_chat_message_rate_limited",
  });
  if (!rate.ok) return rate.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonError("room_id_required", { status: 400, code: "room_id_required" });
  }

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return jsonError("server_config", { status: 500, code: "server_config" });
  }

  const parsed = await parseJsonBody<{ body?: string; messageType?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const bodyRaw = typeof parsed.value.body === "string" ? parsed.value.body.trim() : "";
  const messageType = (["text", "image", "system"] as const).includes(parsed.value.messageType as never)
    ? (parsed.value.messageType as "text" | "image" | "system")
    : "text";

  if (messageType === "text" && !bodyRaw) {
    return jsonError("group_chat_message_required", { status: 400, code: "group_chat_message_required" });
  }

  const mem = await getActiveGroupMembership(sb, roomId, auth.userId);
  if (!mem.ok) {
    return jsonError(mem.error, { status: mem.status, code: mem.error });
  }

  const { data: inserted, error: insErr } = await sb
    .from("group_messages")
    .insert({
      room_id: roomId,
      sender_id: auth.userId,
      message_type: messageType,
      /** 화면 문장 저장 금지 — 사진 여부는 message_type 으로 그린다 */
      body: bodyRaw,
      metadata: {},
    })
    .select("id, created_at, seq")
    .single();

  if (insErr) {
    console.error("[group-chat] message insert failed", safeErrorMessage(insErr, "insert_failed"));
    return jsonError("group_chat_message_insert_failed", { status: 500, code: "group_chat_message_insert_failed" });
  }

  const row = inserted as { id: string; created_at: string; seq: number };
  /** 알림 미리보기 — 글 외 종류는 빈 값(알림 표시가 받는 사람 언어 「새 메시지」 키로 그림) */
  const preview = messageType === "text" ? bodyRaw.slice(0, 120) : "";

  const { data: members } = await sb
    .from("group_room_members")
    .select("user_id")
    .eq("room_id", roomId);
  const recipientUserIds = ((members ?? []) as { user_id?: string }[])
    .map((m) => String(m.user_id ?? "").trim())
    .filter((uid) => uid && uid !== auth.userId);

  void notifyMessagePipeline(sb, {
    roomId,
    messageId: row.id,
    senderUserId: auth.userId,
    preview,
    recipientUserIds,
    roomKind: "group",
  }).catch(() => {});

  return jsonOk({
    message: {
      id: row.id,
      createdAt: row.created_at,
      seq: row.seq,
    },
  });
}
