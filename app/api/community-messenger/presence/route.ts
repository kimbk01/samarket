import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { upsertCommunityMessengerPresenceSnapshot } from "@/lib/community-messenger/service";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:presence:${getRateLimitKey(req, auth.userId)}`,
    limit: 180,
    windowMs: 60_000,
    message: "실시간 접속 상태 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_presence_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { lastSeenAt?: string | null } | null = null;
  try {
    body = (await req.json()) as { lastSeenAt?: string | null };
  } catch {
    body = null;
  }

  const result = await upsertCommunityMessengerPresenceSnapshot({
    userId: auth.userId,
    lastSeenAt: typeof body?.lastSeenAt === "string" ? body.lastSeenAt : null,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
