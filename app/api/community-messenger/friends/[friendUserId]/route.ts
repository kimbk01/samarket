import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { removeCommunityMessengerFriend } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ friendUserId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-remove:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    code: "community_messenger_friend_remove_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { friendUserId } = await params;
  const result = await removeCommunityMessengerFriend(auth.userId, friendUserId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
