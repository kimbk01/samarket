import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { listDiscoverableOpenGroupRooms } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:open-groups:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    code: "community_messenger_open_groups_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const query = req.nextUrl.searchParams.get("q") ?? "";
  const groups = await listDiscoverableOpenGroupRooms(auth.userId, query);
  return NextResponse.json({
    ok: true,
    groups,
  });
}
