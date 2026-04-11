import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { respondCommunityMessengerFriendRequest } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-respond:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "친구 요청 처리 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_respond_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { action?: "accept" | "reject" | "cancel" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { requestId } = await params;
  const action = body.action;
  if (action !== "accept" && action !== "reject" && action !== "cancel") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }
  const result = await respondCommunityMessengerFriendRequest(auth.userId, requestId, action);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
