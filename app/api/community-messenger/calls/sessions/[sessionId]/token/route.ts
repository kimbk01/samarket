import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { buildCommunityMessengerManagedCallToken } from "@/lib/community-messenger/call-provider/server";
import { getCommunityMessengerCallSessionById } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = enforceRateLimit({
    key: `community-messenger:call-token:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "통화 토큰 요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_token_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { sessionId } = await params;
  const session = await getCommunityMessengerCallSessionById(auth.userId, sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (session.sessionMode !== "direct") {
    return NextResponse.json({ ok: false, error: "group_call_not_supported_yet" }, { status: 400 });
  }
  const connection = buildCommunityMessengerManagedCallToken(session, auth.userId);
  if (!connection) {
    return NextResponse.json({ ok: false, error: "call_provider_not_configured" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, connection });
}
