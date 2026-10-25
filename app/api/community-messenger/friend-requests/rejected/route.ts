import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  listCommunityMessengerRejectedIncomingFriendRequests,
  releaseCommunityMessengerRejectedFriendRequest,
} from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** §14-5: 내가 거절한 받은 친구 요청 목록 (보관함 「거절한 요청」). */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-requests-rejected:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_requests_rejected_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const requests = await listCommunityMessengerRejectedIncomingFriendRequests(auth.userId);
  return NextResponse.json({ ok: true, requests });
}

/** §14-5: 거절 해제 — 요청자의 대화·통화·재요청 제한을 푼다. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-release:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_release_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { requestId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const result = await releaseCommunityMessengerRejectedFriendRequest(auth.userId, String(body.requestId ?? ""));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
