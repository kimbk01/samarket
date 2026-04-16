import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { getCommunityMessengerSingleRoomSummaryForViewer } from "@/lib/community-messenger/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:room-home-summary:${getRateLimitKey(_req, auth.userId)}`,
    limit: 120,
    windowMs: 60_000,
    message: "대화방 요약 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_room_home_summary_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await params;
  const summary = await getCommunityMessengerSingleRoomSummaryForViewer(auth.userId, roomId);
  if (!summary) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, room: summary });
}
