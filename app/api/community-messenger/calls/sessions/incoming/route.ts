import type { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonOk } from "@/lib/http/api-route";
import { listIncomingCommunityMessengerCallSessions } from "@/lib/community-messenger/service";

export async function GET(request: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  /**
   * 클라는 Realtime + Broadcast + (ringing 중) 백업 폴링을 병행하므로 분당 30회는 곧바로 429 가 난다.
   * 이 엔드포인트는 사용자별 가벼운 목록 조회만 하므로 상한을 넉넉히 둔다.
   */
  const rateLimit = await enforceRateLimit({
    key: `community-messenger:incoming-calls:${getRateLimitKey(request, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "수신 통화 상태를 너무 자주 확인하고 있습니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_incoming_call_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const directOnly = request.nextUrl.searchParams.get("directOnly") === "1";
  const sessions = await listIncomingCommunityMessengerCallSessions(auth.userId, { directOnly });
  return jsonOk({ sessions });
}
