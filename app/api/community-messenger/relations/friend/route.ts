import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  removeCommunityMessengerFriend,
  sendCommunityMessengerFriendRequest,
} from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** F-6 — friend-requests POST 와 동일 가입·프로필 게이트 */
async function gateFriendAddProfile(userId: string) {
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "supabase_service_role_required" }, { status: 503 }),
    };
  }
  const termsGate = await requireSignupCompleteForUser(sb, userId);
  if (!termsGate.ok) return termsGate;
  return requireProfileFieldsForAction(sb, userId, "messenger_add_friend");
}

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

  const signupGate = await gateFriendAddProfile(auth.userId);
  if (!signupGate.ok) return signupGate.response;

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

  const result = await sendCommunityMessengerFriendRequest(auth.userId, targetUserId);
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
