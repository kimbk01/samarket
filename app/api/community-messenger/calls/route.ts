import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId, requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {

  createCommunityMessengerCallLog,
  listCommunityMessengerCallLogs,
} from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:calls-list:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "통화 기록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_calls_list_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const calls = await listCommunityMessengerCallLogs(auth.userId);
  return NextResponse.json({ ok: true, calls });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;

  let body: {
    roomId?: string | null;
    peerUserId?: string | null;
    callKind?: "voice" | "video";
    status?: "dialing" | "incoming" | "missed" | "cancelled" | "rejected" | "ended";
    durationSeconds?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.callKind !== "voice" && body.callKind !== "video") {
    return NextResponse.json({ ok: false, error: "bad_call_kind" }, { status: 400 });
  }
  if (
    body.status !== "dialing" &&
    body.status !== "incoming" &&
    body.status !== "missed" &&
    body.status !== "cancelled" &&
    body.status !== "rejected" &&
    body.status !== "ended"
  ) {
    return NextResponse.json({ ok: false, error: "bad_status" }, { status: 400 });
  }

  const result = await createCommunityMessengerCallLog({
    userId: auth.userId,
    roomId: body.roomId,
    peerUserId: body.peerUserId,
    callKind: body.callKind,
    status: body.status,
    durationSeconds: Number(body.durationSeconds ?? 0),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
