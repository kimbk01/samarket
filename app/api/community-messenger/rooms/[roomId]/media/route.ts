import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { listRoomMediaGallery } from "@/lib/community-messenger/media/room-media-gallery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 방 사진·음성 모음(서버 조회) — 설계 M4. 첫 페이지에 이 사람에게 보이는 서버 개수(counts)를 싣는다.
 * GET ?cursor=<createdAt|messageId>
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-media-gallery:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "Too many requests",
    code: "community_messenger_room_media_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) return canon.response;

  const cursor = req.nextUrl.searchParams.get("cursor");
  const result = await listRoomMediaGallery({ userId: auth.userId, roomId: canon.canonicalRoomId, cursor });
  if (!result.ok) {
    return jsonError(result.error, result.error === "forbidden" ? 403 : 400, { code: result.error });
  }
  return jsonOk({ ok: true, page: result.page });
}
