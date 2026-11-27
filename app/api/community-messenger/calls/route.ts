import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { listCommunityMessengerCallLogs } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET only. 통화 기록 생성은 서버 내부 터미널 경로(`ensureTerminalCallStub` 등)만 수행한다.
 * 과거 POST(임의 peer 에 대한 call log 삽입, service role)는 호출자가 없고 위조 경로라 제거했다.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:calls-list:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "통화 기록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_calls_list_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const cursorRaw = req.nextUrl.searchParams.get("cursor");
  /** `view=home` — 홈 최근 통화(관계 조회 없음·앞 `limit` 건). 없으면 지금과 같은 통화 탭 응답 */
  const homeView = req.nextUrl.searchParams.get("view") === "home";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit"));
  const listed = await listCommunityMessengerCallLogs(auth.userId, {
    cursor: homeView ? null : cursorRaw,
    ...(homeView ? { view: "home" as const, limit: Number.isFinite(limitRaw) ? limitRaw : undefined } : {}),
  });
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    calls: listed.calls,
    nextCursor: listed.nextCursor,
    hasMore: listed.hasMore,
  });
}
