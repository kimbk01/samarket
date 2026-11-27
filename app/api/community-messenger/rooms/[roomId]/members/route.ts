import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";
import { listCommunityMessengerRoomMembersPage } from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 참가자 목록 페이지 — 부트스트랩과 동일 정렬 기준으로 offset 슬라이스 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-members-page:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    code: "community_messenger_room_members_page_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const roomId = canon.canonicalRoomId;
  const rawOffset = req.nextUrl.searchParams.get("offset");
  const rawLimit = req.nextUrl.searchParams.get("limit");
  const offset = rawOffset != null && rawOffset !== "" ? Math.floor(Number(rawOffset)) : 0;
  const limit = rawLimit != null && rawLimit !== "" ? Math.floor(Number(rawLimit)) : undefined;

  const result = await listCommunityMessengerRoomMembersPage({
    userId: auth.userId,
    roomId,
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit ?? NaN) ? limit : undefined,
  });
  if (!result.ok) {
    if (result.error === "room_not_found") {
      return jsonError(result.error, 404, { code: result.error });
    }
    return jsonError(result.error, 400, { code: result.error });
  }
  return jsonOk({
    members: result.members,
    total: result.total,
    nextOffset: result.nextOffset,
  });
}
