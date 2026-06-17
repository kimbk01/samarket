import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { dismissUnknownPeerNotice } from "@/lib/community-messenger/peer-notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:peer-notice-dismiss:${getRateLimitKey(req, auth.userId)}`,
    limit: 40,
    windowMs: 60_000,
    message: "요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_peer_notice_dismiss_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { roomId?: string; peerUserId?: string; noticeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const roomId = String(body.roomId ?? "").trim();
  const peerUserId = String(body.peerUserId ?? "").trim();
  const noticeType = String(body.noticeType ?? "unknown_peer").trim() as "unknown_peer";

  if (!roomId || !peerUserId || peerUserId === auth.userId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }
  if (noticeType !== "unknown_peer") {
    return NextResponse.json({ ok: false, error: "bad_notice_type" }, { status: 400 });
  }

  const result = await dismissUnknownPeerNotice({
    viewerUserId: auth.userId,
    peerUserId,
    roomId,
    noticeType,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
