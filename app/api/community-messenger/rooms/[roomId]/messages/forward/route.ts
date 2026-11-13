import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { forwardCommunityMessengerMessage } from "@/lib/community-messenger/service";
import { keepMessengerNotifyAliveAfterAck } from "@/lib/community-messenger/server/keep-messenger-notify-alive-after-ack";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/community-messenger/rooms/{대상 방}/messages/forward — 메시지 「전달하기」 (통합 공유 S6 · G-4).
 * body: { sourceRoomId, sourceMessageId, clientMessageId("fwd:{요청}:{대상 방}") }
 * 대상 방마다 1회 호출. 같은 clientMessageId 재시도 = DB 고유 인덱스로 deduped(알림 재발송 없음).
 * 검사·저장 규칙은 `forwardCommunityMessengerMessage` (service.ts) 한 곳.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:forward:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "community_messenger_forward_rate_limited",
    code: "community_messenger_forward_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{
    sourceRoomId?: string;
    sourceMessageId?: string;
    clientMessageId?: string;
  }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;
  const canonicalRoomId = canon.canonicalRoomId;

  const result = await forwardCommunityMessengerMessage({
    userId: auth.userId,
    roomId: canonicalRoomId,
    sourceRoomId: String(parsed.value.sourceRoomId ?? "").trim(),
    sourceMessageId: String(parsed.value.sourceMessageId ?? "").trim(),
    clientMessageId: String(parsed.value.clientMessageId ?? "").trim(),
    onNotifyScheduled: keepMessengerNotifyAliveAfterAck,
  });

  if (result.ok && !result.deduped) {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: canon.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: auth.userId,
      messageId: result.message?.id,
      messageCreatedAt: result.message?.createdAt,
      messageForBump: result.message ?? null,
    });
  }
  const errorCode = result.error ?? "message_send_failed";
  return result.ok ? jsonOk(result) : jsonError(errorCode, { status: 400, code: errorCode }, result);
}
