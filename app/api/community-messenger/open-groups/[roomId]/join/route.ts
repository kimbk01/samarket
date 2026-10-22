import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { joinOpenGroupRoomWithPassword } from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:open-group-join:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "오픈채팅 입장 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_open_group_join_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId } = await context.params;

  let body: {
    password?: string;
    identityMode?: "real_name" | "alias";
    aliasProfile?: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
    };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await joinOpenGroupRoomWithPassword({
    userId: auth.userId,
    roomId,
    password: String(body.password ?? ""),
    identityMode: body.identityMode === "alias" ? "alias" : "real_name",
    aliasProfile: body.aliasProfile,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
