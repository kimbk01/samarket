import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUserId,
  requireAuthenticatedUserIdStrict,
} from "@/lib/auth/api-session";
import {
  getCommunityMessengerCallSessionById,
  updateCommunityMessengerCallSession,
  upgradeCommunityMessengerCallSessionToVideo,
} from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-session-get:${getRateLimitKey(req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "통화 세션 조회 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_session_get_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { sessionId } = await params;
  const session = await getCommunityMessengerCallSessionById(auth.userId, sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, session });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-session-patch:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "통화 세션 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_session_patch_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: {
    action?: "accept" | "reject" | "cancel" | "end" | "missed" | "upgrade_to_video";
    durationSeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { sessionId } = await params;

  if (body.action === "upgrade_to_video") {
    const result = await upgradeCommunityMessengerCallSessionToVideo({
      userId: auth.userId,
      sessionId,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (
    body.action !== "accept" &&
    body.action !== "reject" &&
    body.action !== "cancel" &&
    body.action !== "end" &&
    body.action !== "missed"
  ) {
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  const result = await updateCommunityMessengerCallSession({
    userId: auth.userId,
    sessionId,
    action: body.action,
    durationSeconds: Number(body.durationSeconds ?? 0),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
