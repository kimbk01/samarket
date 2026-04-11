import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  listCommunityMessengerFriendRequests,
  sendCommunityMessengerFriendRequest,
} from "@/lib/community-messenger/service";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-requests:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "친구 요청 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_requests_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const requests = await listCommunityMessengerFriendRequests(auth.userId);
  return NextResponse.json({ ok: true, requests });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-send:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "친구 요청 보내기가 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_send_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { targetUserId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await sendCommunityMessengerFriendRequest(
    auth.userId,
    String(body.targetUserId ?? ""),
    body.note
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
