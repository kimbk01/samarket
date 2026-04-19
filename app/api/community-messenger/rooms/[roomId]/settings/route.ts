import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { updateOpenGroupRoomSettings } from "@/lib/community-messenger/service";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ roomId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:open-group-settings:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "오픈채팅 설정 변경 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_open_group_settings_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const { roomId: rawRoomId } = await context.params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  let body: {
    title?: string;
    summary?: string;
    password?: string;
    memberLimit?: number;
    isDiscoverable?: boolean;
    joinPolicy?: "password" | "free";
    identityPolicy?: "real_name" | "alias_allowed";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await updateOpenGroupRoomSettings({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    title: typeof body.title === "string" ? body.title : undefined,
    summary: typeof body.summary === "string" ? body.summary : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    memberLimit: typeof body.memberLimit === "number" ? body.memberLimit : undefined,
    isDiscoverable: typeof body.isDiscoverable === "boolean" ? body.isDiscoverable : undefined,
    joinPolicy: body.joinPolicy === "free" ? "free" : body.joinPolicy === "password" ? "password" : undefined,
    identityPolicy:
      body.identityPolicy === "real_name" || body.identityPolicy === "alias_allowed" ? body.identityPolicy : undefined,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
