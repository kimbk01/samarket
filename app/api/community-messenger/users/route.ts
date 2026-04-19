import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { searchCommunityMessengerUsers } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:users-search:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "친구 검색 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_users_search_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const query = req.nextUrl.searchParams.get("q") ?? "";
  const users = await searchCommunityMessengerUsers(auth.userId, query);
  return NextResponse.json({ ok: true, users });
}
