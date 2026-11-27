import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { joinOpenGroupRoomWithPassword } from "@/lib/community-messenger/service";
import { OPEN_GROUP_JOIN_LOCK_MINUTES, openGroupJoinRetryAfterSec } from "@/lib/community-messenger/server/open-group-join-lock";
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
  /** 모임 감사 5번 묶음 P3 — 비밀번호 연속 실패 잠금은 429 + 남은 초 */
  if (!result.ok && result.error === "password_locked") {
    const retryAfterSec = result.lockedUntil
      ? openGroupJoinRetryAfterSec(result.lockedUntil)
      : OPEN_GROUP_JOIN_LOCK_MINUTES * 60;
    return NextResponse.json(
      { ok: false, error: "password_locked", retryAfterSec },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }
  return NextResponse.json({ ok: result.ok, roomId: result.roomId, error: result.error }, { status: result.ok ? 200 : 400 });
}
