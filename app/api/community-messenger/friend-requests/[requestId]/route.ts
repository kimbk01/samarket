import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { respondCommunityMessengerFriendRequest } from "@/lib/community-messenger/service";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Accept / reject / cancel friend request. */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-respond:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_respond_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { requestId } = await ctx.params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const actionRaw = String(body.action ?? "").trim();
  if (actionRaw !== "accept" && actionRaw !== "reject" && actionRaw !== "cancel") {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  /** 섞인 경로(설계 2026-11-21 §4 C) — 새 행동 분기만 가입(전화 + 대표 주소) 확인, 거절·해제는 가입 없이 */
  if (actionRaw === "accept") {
    const registrationGate = await requireRegistrationForAction(auth.userId);
    if (registrationGate) return registrationGate;
  }

  const result = await respondCommunityMessengerFriendRequest(auth.userId, requestId, actionRaw);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

/** Cancel outgoing request by id (requester only). */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ requestId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-cancel:${getRateLimitKey(req, auth.userId)}`,
    limit: 45,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_cancel_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { requestId } = await ctx.params;
  const result = await respondCommunityMessengerFriendRequest(auth.userId, requestId, "cancel");
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
