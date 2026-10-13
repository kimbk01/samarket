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
  const listed = await listCommunityMessengerCallLogs(auth.userId, {
    cursor: cursorRaw,
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
