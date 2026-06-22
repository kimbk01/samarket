import type { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonOk } from "@/lib/http/api-route";
import { getActiveDirectCallSessionForUser, reconcileUserLiveCallSessions } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 본인 active 1:1 통화 — 앱 부팅·새로고침 복구용 */
export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:active-call:${getRateLimitKey(request, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "통화 상태 확인이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_active_call_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  await reconcileUserLiveCallSessions(auth.userId, "active_route");
  const session = await getActiveDirectCallSessionForUser(auth.userId);
  return jsonOk({ session });
}
