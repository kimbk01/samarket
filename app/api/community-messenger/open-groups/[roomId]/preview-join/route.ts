import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { getOpenGroupJoinPreview } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:open-group-preview:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "오픈채팅 미리보기 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_open_group_preview_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await context.params;
  const result = await getOpenGroupJoinPreview(auth.userId, roomId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
