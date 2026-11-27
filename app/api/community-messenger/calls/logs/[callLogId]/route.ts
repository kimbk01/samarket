import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { deleteCommunityMessengerCallLog } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ callLogId: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:calls-delete:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    /** 문구는 클라이언트 카탈로그가 정한다(SSOT §3-3) — `error` = 코드 */
    message: "community_messenger_calls_delete_rate_limited",
    code: "community_messenger_calls_delete_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { callLogId } = await context.params;
  const result = await deleteCommunityMessengerCallLog(auth.userId, callLogId);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true });
}
