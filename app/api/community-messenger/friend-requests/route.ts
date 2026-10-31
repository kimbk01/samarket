import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import {
  requireMessengerOpenAccess,
  requireProfileFieldsForAction,
} from "@/lib/profile/require-profile-completion.server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  listCommunityMessengerFriendRequests,
  sendCommunityMessengerFriendRequest,
} from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

/** Pending friend requests for viewer (incoming + outgoing). */
export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  /**
   * 순서 6 (docs/audit/supabase-request-fanout-full-root-cause-2026-11-01.md §13): 목록 읽기는 본인 요청만 돌려주는 읽기 —
   * 약관 확인(`requireSignupCompleteForUser`)은 mutation 계약(`dibay-signup-status.ts`)이고 표시명 확인은 친구 **추가** 조건이라
   * POST 에만 둔다. 읽기는 다른 메신저 읽기(bootstrap·home-sync·방 목록)와 같은 열람 확인.
   */
  const openGate = await requireMessengerOpenAccess(auth.userId);
  if (!openGate.ok) return openGate.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-requests:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "친구 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_requests_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const requests = await listCommunityMessengerFriendRequests(auth.userId);
  return NextResponse.json({ ok: true, requests });
}

/** Send mutual friend request (pending only until accept). */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const signupGate = await gateFriendAddProfile(auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:friend-request-send:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "친구 추가 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_friend_request_send_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { targetUserId?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await sendCommunityMessengerFriendRequest(
    auth.userId,
    String(body.targetUserId ?? ""),
    typeof body.note === "string" ? body.note : undefined
  );
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
