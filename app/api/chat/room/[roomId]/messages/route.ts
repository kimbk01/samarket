/**
 * 채팅방 메시지 목록 (서비스 롤)
 * GET /api/chat/room/[roomId]/messages (세션)
 *
 * 쿼리: `limit`(기본 50), 과거 페이지 `before` + `beforeCreatedAt` (키셋) — 통합 `GET .../chat/rooms/.../messages` 와 동형.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  LEGACY_PRODUCT_CHAT_MESSAGES_PAGE_MAX,
  loadLegacyProductChatMessagesPageForUser,
} from "@/lib/chats/server/load-chat-room-messages";
import {
  enforceRateLimit,
  getRateLimitKey,
} from "@/lib/http/api-route";
import { parseRoomId } from "@/lib/validate-params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const pageRateLimit = await enforceRateLimit({
    key: `legacy-product-chat:message-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "메시지 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "legacy_product_chat_message_page_rate_limited",
  });
  if (!pageRateLimit.ok) return pageRateLimit.response;

  const { roomId: raw } = await params;
  const roomId = parseRoomId(raw);
  if (!roomId) {
    return NextResponse.json({ error: "roomId 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limitUsed = Math.min(
    Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 50, 1),
    LEGACY_PRODUCT_CHAT_MESSAGES_PAGE_MAX
  );
  const before = req.nextUrl.searchParams.get("before");
  const beforeCreatedAt = req.nextUrl.searchParams.get("beforeCreatedAt");

  const result = await loadLegacyProductChatMessagesPageForUser(roomId, auth.userId, {
    limit: limitUsed,
    before: before?.trim() || null,
    beforeCreatedAt: beforeCreatedAt?.trim() || null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { messages, hasMore, nextCursor } = result.value;
  return NextResponse.json({ messages, hasMore, nextCursor });
}
