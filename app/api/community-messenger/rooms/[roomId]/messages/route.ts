import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import {
  listCommunityMessengerRoomMessagesBefore,
  sendCommunityMessengerMessage,
} from "@/lib/community-messenger/service";

/** 이전 메시지 페이지 (스크롤 업) — 읽기 폭주 완화 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "이전 대화를 불러오는 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_page_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonError("roomId가 필요합니다.", 400);
  }
  const before = req.nextUrl.searchParams.get("before")?.trim() ?? "";
  if (!before) {
    return jsonError("before(메시지 id)가 필요합니다.", 400);
  }
  const rawLimit = req.nextUrl.searchParams.get("limit");
  const limit = rawLimit ? Math.floor(Number(rawLimit)) : undefined;
  const result = await listCommunityMessengerRoomMessagesBefore({
    userId: auth.userId,
    roomId,
    beforeMessageId: before,
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "room_not_found") {
      return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
    }
    return jsonError("이전 메시지를 불러오지 못했습니다.", 400, { code: result.error });
  }
  return jsonOk({ messages: result.messages, hasMore: result.hasMore });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-send:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "메신저 전송 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ content?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonError("roomId가 필요합니다.", 400);
  }
  const result = await sendCommunityMessengerMessage({
    userId: auth.userId,
    roomId,
    content: String(body.content ?? ""),
  });
  return result.ok
    ? jsonOk(result)
    : jsonError(result.error ?? "메시지 전송에 실패했습니다.", 400, result);
}
