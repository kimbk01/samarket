import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUserId,
  requireAuthenticatedUserIdStrict,
} from "@/lib/auth/api-session";
import {
  downgradeCommunityMessengerCallSessionToVoice,
  getCommunityMessengerCallSessionById,
  reconcileUserLiveCallSessions,
  updateCommunityMessengerCallSession,
  upgradeCommunityMessengerCallSessionToVideo,
} from "@/lib/community-messenger/service";
import { isIdempotentCallSessionPatch } from "@/lib/community-messenger/server/call-session-transitions";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_GET_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
} as const;

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
  if (req.nextUrl.searchParams.get("reconcile") === "1") {
    await reconcileUserLiveCallSessions(auth.userId, "session_get");
  }
  const session = await getCommunityMessengerCallSessionById(auth.userId, sessionId);
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404, headers: SESSION_GET_CACHE_HEADERS }
    );
  }
  return NextResponse.json({ ok: true, session }, { headers: SESSION_GET_CACHE_HEADERS });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
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
      action?:
        | "accept"
        | "reject"
        | "cancel"
        | "end"
        | "leave"
        | "missed"
        | "upgrade_to_video"
        | "downgrade_to_voice"
        | "heartbeat";
      durationSeconds?: number;
      clientEndedReason?: string;
      reconnecting?: boolean;
      deviceId?: string;
      answeredDeviceId?: string;
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

    if (body.action === "downgrade_to_voice") {
      const result = await downgradeCommunityMessengerCallSessionToVoice({
        userId: auth.userId,
        sessionId,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (body.action === "heartbeat") {
      const { heartbeatCommunityMessengerCallSession } = await import(
        "@/lib/community-messenger/call-session-heartbeat"
      );
      const result = await heartbeatCommunityMessengerCallSession({
        userId: auth.userId,
        sessionId,
        reconnecting: body.reconnecting === true,
      });
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (
      body.action !== "accept" &&
      body.action !== "reject" &&
      body.action !== "cancel" &&
      body.action !== "end" &&
      body.action !== "leave" &&
      body.action !== "missed"
    ) {
      return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
    }

    let existing: Awaited<ReturnType<typeof getCommunityMessengerCallSessionById>> = null;
    try {
      existing = await getCommunityMessengerCallSessionById(auth.userId, sessionId);
    } catch (prefetchErr) {
      console.error("[call-session-patch] idempotent prefetch failed", {
        sessionId,
        action: body.action,
        userId: auth.userId,
        error: prefetchErr instanceof Error ? prefetchErr.message : String(prefetchErr),
      });
    }
    if (
      existing &&
      isIdempotentCallSessionPatch(
        existing.status,
        body.action as "accept" | "reject" | "cancel" | "end" | "missed" | "leave"
      )
    ) {
      return NextResponse.json({ ok: true, session: existing, idempotent: true });
    }

    const result = await updateCommunityMessengerCallSession({
      userId: auth.userId,
      sessionId,
      action: body.action,
      durationSeconds: Number(body.durationSeconds ?? 0),
      clientEndedReason:
        typeof body.clientEndedReason === "string" ? body.clientEndedReason : undefined,
      answeredDeviceId:
        typeof body.answeredDeviceId === "string"
          ? body.answeredDeviceId
          : typeof body.deviceId === "string"
            ? body.deviceId
            : undefined,
    });
    if (!result.ok) {
      console.error("[call-session-patch] failed", {
        sessionId,
        action: body.action,
        userId: auth.userId,
        error: result.error,
      });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[call-session-patch] unhandled", { error: message });
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
