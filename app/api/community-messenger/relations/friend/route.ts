import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import {
  removeCommunityMessengerFriend,
  addCommunityMessengerFriendContact,
} from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseTargetUserId(req: NextRequest): Promise<string | null> {
  if (req.method === "DELETE") {
    let body: { targetUserId?: string };
    try {
      body = await req.json();
    } catch {
      return null;
    }
    return String(body.targetUserId ?? "").trim() || null;
  }
  let body: { targetUserId?: string };
  try {
    body = await req.json();
  } catch {
    return null;
  }
  return String(body.targetUserId ?? "").trim() || null;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:relation-friend-add:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "친구 추가 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_relation_friend_add_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const targetUserId = await parseTargetUserId(req);
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  const result = await addCommunityMessengerFriendContact(auth.userId, targetUserId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:relation-friend-remove:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "친구 삭제 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_relation_friend_remove_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const targetUserId = await parseTargetUserId(req);
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "bad_target" }, { status: 400 });
  }

  const result = await removeCommunityMessengerFriend(auth.userId, targetUserId);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
