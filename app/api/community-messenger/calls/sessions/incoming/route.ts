import type { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { listIncomingCommunityMessengerCallSessionsResult } = await import("@/lib/community-messenger/service");
  const result = await listIncomingCommunityMessengerCallSessionsResult(auth.userId, { directOnly });
  if (!result.ok) {
    /**
     * D1 (Owner 승인 2026-11-09): DB 조회 오류를 「수신 없음(200 + [])」으로 숨기지 않는다.
     * V4 웹(F1)은 5xx 를 서버 오류로 분류해 4→8초 백오프·T2 생략. 발생 건수 집계용 로그(개인정보 없음).
     */
    console.warn("[incoming-calls] unavailable", { reason: result.reason, directOnly });
    return jsonError("수신 통화 목록을 잠시 불러올 수 없습니다.", {
      status: 503,
      code: "community_messenger_incoming_calls_unavailable",
    });
  }
  return jsonOk({ sessions: result.sessions });
}
