import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";
import { listCommunityMessengerRoomMembersPage } from "@/lib/community-messenger/service";

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
    message: "참가자 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_members_page_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  if (!roomId?.trim()) {
    return jsonError("roomId가 필요합니다.", 400);
  }
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
      return jsonError("대화방을 찾을 수 없습니다.", 404, { code: result.error });
    }
    return jsonError("참가자 목록을 불러오지 못했습니다.", 400, { code: result.error });
  }
  return jsonOk({
    members: result.members,
    total: result.total,
    nextOffset: result.nextOffset,
  });
}
