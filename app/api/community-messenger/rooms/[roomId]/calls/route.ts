import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { startCommunityMessengerCallSession } from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-call-start:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "통화 시작 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_call_start_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { callKind?: "voice" | "video"; dialIntent?: "fresh" | "recover" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.callKind !== "voice" && body.callKind !== "video") {
    return NextResponse.json({ ok: false, error: "bad_call_kind" }, { status: 400 });
  }

  const { roomId: rawRoomId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }
  const result = await startCommunityMessengerCallSession({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    callKind: body.callKind,
    dialIntent: body.dialIntent === "fresh" ? "fresh" : undefined,
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  const session = result.session;
  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "session_missing" }, { status: 500 });
  }
  return NextResponse.json(
    {
      ok: true,
      reused: result.reused === true,
      callId: session.id,
      status: session.status,
      session,
      ...(result._callStartTimingsMs ? { _callStartTimingsMs: result._callStartTimingsMs } : {}),
    },
    { status: 200 },
  );
}
