import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildCommunityPostShareCardData, buildCommunityPostShareMessageMetadata } from "@/lib/community/share/community-share-payload";
import { resolveCommunityPostDetailAccess } from "@/lib/community/share/community-post-access";
import { isBlockedEitherWay } from "@/lib/community-messenger/social-relations";
import {
  sendCommunityPostShareMessage,
  startCommunityMessengerDirectChat,
} from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpBounded } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";
import { isUuidString } from "@/lib/shared/uuid-string";
import { keepMessengerNotifyAliveAfterAck } from "@/lib/community-messenger/server/keep-messenger-notify-alive-after-ack";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community:share-internal:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "공유 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_share_internal_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { postId: rawPostId } = await params;
  const postId = String(rawPostId ?? "").trim();
  if (!isUuidString(postId)) return jsonError("invalid_post_id", 400);

  const parsed = await parseJsonBody<{ roomId?: string; targetUserId?: string; clientMessageId?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const roomIdInput = String(parsed.value.roomId ?? "").trim();
  const targetUserId = String(parsed.value.targetUserId ?? "").trim();
  if (!roomIdInput && !targetUserId) return jsonError("target_required", 400);
  if (roomIdInput && targetUserId) return jsonError("target_ambiguous", 400);

  const access = await resolveCommunityPostDetailAccess(postId, auth.userId);
  if (access.reason !== "ok" || !access.post) {
    const status =
      access.reason === "not_found" || access.reason === "deleted" ? 404
      : access.reason === "login_required" ? 401
      : 403;
    return jsonError(access.reason, status);
  }

  const post = access.post;
  if (post.author_id && (await isBlockedEitherWay(auth.userId, post.author_id))) {
    return jsonError("blocked", 403);
  }

  let roomId = roomIdInput;
  if (!roomId && targetUserId) {
    if (targetUserId === auth.userId) return jsonError("invalid_target", 400);
    if (await isBlockedEitherWay(auth.userId, targetUserId)) return jsonError("blocked_target", 403);
    const direct = await startCommunityMessengerDirectChat(auth.userId, { targetUserId });
    if (!direct.ok || !direct.roomId) {
      const status = direct.error === "blocked_target" ? 403 : 400;
      return jsonError(direct.error ?? "cannot_start_chat", status);
    }
    roomId = direct.roomId;
  }

  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, roomId);
  if (!canon.ok) return canon.response;
  roomId = canon.canonicalRoomId;

  const card = buildCommunityPostShareCardData(post);
  const metadata = buildCommunityPostShareMessageMetadata(card);
  const previewContent = card.title.trim() || card.excerpt.trim() || card.categoryName.trim() || "DIBAY";

  /** M-14: 재시도 중복 방지 — 서비스는 cid 를 지원(DB UNIQUE), 라우트가 넘기지 않던 문제 */
  const shareClientMessageId = String(parsed.value.clientMessageId ?? "").trim().slice(0, 128);
  const result = await sendCommunityPostShareMessage({
    userId: auth.userId,
    roomId,
    content: previewContent,
    metadata,
    clientMessageId: shareClientMessageId || undefined,
    onNotifyScheduled: keepMessengerNotifyAliveAfterAck,
  });

  if (!result.ok) {
    const status = result.error === "room_not_found" ? 404 : result.error === "room_blocked" ? 403 : 400;
    return jsonError(result.error ?? "share_failed", status);
  }

  /** M-13: 저장 성공 뒤 bump 오류가 500 으로 새지 않게 bounded(throw 없음) */
  if (result.message) {
    await publishMessengerRoomBumpBounded({
      rawRouteRoomId: roomId,
      canonicalRoomId: roomId,
      fromUserId: auth.userId,
      messageId: result.message.id,
      messageCreatedAt: result.message.createdAt,
      messageForBump: result.message,
    });
  }

  return jsonOk({ ok: true, roomId, messageId: result.message?.id ?? null });
}
