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
    code: "gift_certificate_eligible_friends_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  try {
    const friends = await listGiftTransferEligibleFriends(auth.userId);
    return NextResponse.json({ ok: true, friends });
  } catch (e) {
    /** 차단 목록 등을 못 읽음 → 「보낼 친구 없음」이 아니라 오류(Owner 결정 1 — 차단한 사람이 섞이지 않게) */
    console.error("[gift-certificates/friends/eligible]", e);
    return NextResponse.json({ ok: false, error: "friends_unavailable" }, { status: 503 });
  }
}
