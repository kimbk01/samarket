import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  deleteCommunityMessengerVoiceMessage,
  getCommunityMessengerRoomMessageById,
} from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const { roomId: rawRoomId, messageId } = await params;
  if (!messageId?.trim()) {
    return jsonError("messageId가 필요합니다.", 400);
  }
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-by-id:${getRateLimitKey(_req, auth.userId)}:${canon.canonicalRoomId}`,
    limit: 72,
    windowMs: 60_000,
    message: "이 방의 메시지 조회가 너무 빈번합니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_by_id_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const result = await getCommunityMessengerRoomMessageById({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId: messageId.trim(),
  });
  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "room_not_found") {
      return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
    }
    return jsonError("메시지를 불러오지 못했습니다.", 400, { code: result.error });
  }
  return jsonOk({ message: result.message });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:voice-message-delete:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "메시지 삭제 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_voice_message_delete_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId, messageId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const result = await deleteCommunityMessengerVoiceMessage({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId,
  });

  if (!result.ok) {
    const status =
      result.error === "not_found"
        ? 404
        : result.error === "forbidden" || result.error === "unsupported_type"
          ? 403
          : result.error === "bad_request"
            ? 400
            : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
