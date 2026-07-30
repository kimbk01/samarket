import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Friend request accept/reject retired — Telegram Contact LOCK. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-respond:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_respond_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  return NextResponse.json(
    { ok: false, error: "friend_request_retired" },
    { status: 410 }
  );
}

/** Friend request cancel retired — Telegram Contact LOCK. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-cancel:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_cancel_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  return NextResponse.json(
    { ok: false, error: "friend_request_retired" },
    { status: 410 }
  );
}
