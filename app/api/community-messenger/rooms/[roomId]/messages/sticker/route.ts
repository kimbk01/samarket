import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { sendCommunityMessengerStickerMessage } from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:sticker-send:${getRateLimitKey(req, auth.userId)}`,
    limit: 40,
    windowMs: 60_000,
    message: "스티커 전송이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_sticker_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{
    content?: string;
    clientMessageId?: string;
    stickerItemId?: string;
  }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const canonicalRoomId = canon.canonicalRoomId;

  const content = String(parsed.value.content ?? "");
  const clientMessageId = String(parsed.value.clientMessageId ?? "").trim();
  const stickerItemId = String(parsed.value.stickerItemId ?? "").trim();

  const result = await sendCommunityMessengerStickerMessage({
    userId: auth.userId,
    roomId: canonicalRoomId,
    content,
    clientMessageId: clientMessageId || undefined,
    stickerItemId: stickerItemId || undefined,
  });

  if (result.ok) {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: canon.rawRouteRoomId,
      canonicalRoomId,
      fromUserId: auth.userId,
      messageId: result.message?.id,
      messageCreatedAt: result.message?.createdAt,
      messageForBump: result.message ?? null,
    });
  }
  return result.ok ? jsonOk(result) : jsonError(result.error ?? "스티커를 보내지 못했습니다.", 400, result);
}
