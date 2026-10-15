import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { listCommunityMessengerPrivacyListProfiles } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 숨김·차단 목록 SSOT on-demand — 개인정보 시트·보관함 숨김/차단 섹션 진입, 차단/해제·숨김/해제 직후.
 * lite 부트스트랩은 이 목록을 unknown 으로 둘 수 있다(perf lock) — 여기서 authoritative 로 채운다.
 * 응답: `{ ok, blocked, hidden }` (blocked = by-me).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:privacy-lists:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "숨김·차단 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_privacy_lists_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const payload = await listCommunityMessengerPrivacyListProfiles(auth.userId);
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
