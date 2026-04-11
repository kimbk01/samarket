import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { toggleCommunityMessengerFavoriteFriend } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ friendUserId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-favorite-toggle:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "즐겨찾기 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_favorite_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { friendUserId } = await params;
  const result = await toggleCommunityMessengerFavoriteFriend(auth.userId, friendUserId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
