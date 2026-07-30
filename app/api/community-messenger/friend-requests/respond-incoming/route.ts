import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Incoming friend-request respond retired — Telegram Contact LOCK. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-respond-incoming:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_respond_incoming_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  return NextResponse.json(
    { ok: false, error: "friend_request_retired" },
    { status: 410 }
  );
}
