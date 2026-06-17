import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { cancelOutgoingCommunityMessengerFriendRequestByAddressee } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-cancel-outgoing:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "친구 요청 취소가 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_cancel_outgoing_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { addresseeId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const addresseeId = String(body.addresseeId ?? "").trim();
  if (!addresseeId) {
    return NextResponse.json({ ok: false, error: "bad_addressee" }, { status: 400 });
  }

  const result = await cancelOutgoingCommunityMessengerFriendRequestByAddressee(auth.userId, addresseeId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
