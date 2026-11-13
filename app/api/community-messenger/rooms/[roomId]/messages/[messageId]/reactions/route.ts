import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  listCommunityMessengerMessageReactionParticipants,
  toggleCommunityMessengerMessageReaction,
} from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-reaction-roster:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "반응 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_reaction_roster_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const reactionKey = req.nextUrl.searchParams.get("reactionKey")?.trim() ?? "";
  if (!reactionKey) {
    return jsonError("reactionKey가 필요합니다.", 400, { code: "bad_request" });
  }

  const { roomId: rawRoomId, messageId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  const result = await listCommunityMessengerMessageReactionParticipants({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId: String(messageId ?? "").trim(),
    reactionKey,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "forbidden") {
      return jsonError("반응 목록을 볼 수 없습니다.", 403, { code: result.error });
    }
    if (result.error === "bad_request") {
      return jsonError("잘못된 요청입니다.", 400, { code: result.error });
    }
    if (result.error === "messenger_storage_unavailable") {
      return jsonError("메신저를 사용할 수 없습니다.", 503, { code: result.error });
    }
    return jsonError("반응 목록을 불러오지 못했습니다.", 400, { code: result.error });
  }

  return jsonOk({ users: result.users });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-reaction:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "반응 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_reaction_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ reactionKey?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const reactionKey = String(parsed.value.reactionKey ?? "").trim();
  if (!reactionKey) {
    return jsonError("reactionKey가 필요합니다.", 400);
  }

  const { roomId: rawRoomId, messageId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  const result = await toggleCommunityMessengerMessageReaction({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId: String(messageId ?? "").trim(),
    reactionKey,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "forbidden") {
      return jsonError("반응을 추가할 수 없습니다.", 403, { code: result.error });
    }
    if (result.error === "bad_request") {
      return jsonError("잘못된 요청입니다.", 400, { code: result.error });
    }
    if (result.error === "messenger_storage_unavailable") {
      return jsonError("메신저를 사용할 수 없습니다.", 503, { code: result.error });
    }
    return jsonError("반응을 저장하지 못했습니다.", 400, { code: result.error });
  }

  return jsonOk({ ok: true, reactions: result.reactions });
}
