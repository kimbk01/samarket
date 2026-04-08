import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/http/api-route";
import { sendCommunityMessengerMessage } from "@/lib/community-messenger/service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = enforceRateLimit({
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
