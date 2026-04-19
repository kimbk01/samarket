import { NextRequest, NextResponse } from "next/server";
import {
  requireAuthenticatedUserId,
  requireAuthenticatedUserIdStrict,
} from "@/lib/auth/api-session";
import {
  createCommunityMessengerCallSignal,
  listCommunityMessengerCallSignals,
} from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-signals:get:${getRateLimitKey(req, auth.userId)}`,
    limit: 240,
    windowMs: 60_000,
    message: "통화 시그널 조회가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_signals_get_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { sessionId } = await params;
  const signals = await listCommunityMessengerCallSignals(auth.userId, sessionId);
  return NextResponse.json({ ok: true, signals });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-signals:post:${getRateLimitKey(req, auth.userId)}`,
    limit: 600,
    windowMs: 60_000,
    message: "통화 시그널 전송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_signals_post_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: {
    toUserId?: string;
    signalType?: "offer" | "answer" | "ice-candidate" | "hangup";
    payload?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (
    body.signalType !== "offer" &&
    body.signalType !== "answer" &&
    body.signalType !== "ice-candidate" &&
    body.signalType !== "hangup"
  ) {
    return NextResponse.json({ ok: false, error: "bad_signal_type" }, { status: 400 });
  }

  const { sessionId } = await params;
  const result = await createCommunityMessengerCallSignal({
    userId: auth.userId,
    sessionId,
    toUserId: String(body.toUserId ?? ""),
    signalType: body.signalType,
    payload: body.payload && typeof body.payload === "object" ? body.payload : {},
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
