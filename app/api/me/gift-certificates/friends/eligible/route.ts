import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { listGiftTransferEligibleFriends } from "@/lib/gift-certificate/list-gift-transfer-eligible-friends";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `gift-certificates:eligible-friends:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "친구 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "gift_certificate_eligible_friends_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const friends = await listGiftTransferEligibleFriends(auth.userId);
  return NextResponse.json({ ok: true, friends });
}
