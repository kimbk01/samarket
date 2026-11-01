import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { cancelCommunityMessengerCallAttempt } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 발신 시도 취소 — android-caller-stuck-after-remote-missed-design §15-4.
 * 연결 전에 그만둔 발신 시도를 서버에 알린다. 이미 만든 통화가 울리는 중이면 취소하고, 아직 없으면 이후 생성이
 * 통화를 만들지 않는다. 멱등 — Android 네이티브(준비 화면 종료·렌더러 종료)와 웹(생성 실패·재로드)이 같은 시도에
 * 여러 번 불러도 결과는 같다.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-attempt-cancel:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "통화 취소 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_attempt_cancel_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { attemptId } = await params;
  try {
    const result = await cancelCommunityMessengerCallAttempt({
      userId: auth.userId,
      clientAttemptId: String(attemptId ?? ""),
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    console.error("[call-attempt-cancel] failed", {
      userId: auth.userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
