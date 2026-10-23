import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { respondIncomingCommunityMessengerFriendRequestByRequester } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept/reject incoming request by requester user id. */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-respond-incoming:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_respond_incoming_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { requesterId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actionRaw = String(body.action ?? "").trim();
  if (actionRaw !== "accept" && actionRaw !== "reject") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const result = await respondIncomingCommunityMessengerFriendRequestByRequester(
    auth.userId,
    String(body.requesterId ?? ""),
    actionRaw
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
