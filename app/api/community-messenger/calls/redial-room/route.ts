import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requirePhoneVerified } from "@/lib/auth/server-guards";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { enforceRateLimit, getRateLimitKey } from "@/lib/http/api-route";
import { resolveCommunityMessengerRedialRoom } from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 통화 기록 재발신 방 해석 (서버 권위) — `call-redial-room-authority`.
 * body: { peerUserId?, roomId? } → { ok, roomId, source: "historic_room" | "canonical_direct" }
 * 클라이언트는 이 roomId 로만 `launchOutgoingDirectCall` (네이티브 레인 포함) 한다.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const phone = await requirePhoneVerified(auth.userId);
  if (!phone.ok) return phone.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:call-redial-room:${getRateLimitKey(req, auth.userId)}`,
    limit: 20,
    windowMs: 60_000,
    message: "통화 시작 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_call_redial_room_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  let body: { peerUserId?: unknown; roomId?: unknown };
  try {
    body = (await req.json()) as { peerUserId?: unknown; roomId?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const peerUserId = trimText(body.peerUserId) || null;
  const historicRoomId = trimText(body.roomId) || null;
  if (!peerUserId && !historicRoomId) {
    return NextResponse.json({ ok: false, error: "missing_room" }, { status: 400 });
  }

  /** canonical 방 생성·재입장은 `POST /rooms {roomType:"direct"}` 와 같은 가입·프로필 게이트. */
  const gate: { response: NextResponse | null } = { response: null };
  const result = await resolveCommunityMessengerRedialRoom({
    userId: auth.userId,
    peerUserId,
    historicRoomId,
    beforeEnsureCanonical: async () => {
      let sb: SupabaseClient;
      try {
        sb = getSupabaseServer() as unknown as SupabaseClient;
      } catch {
        return { ok: false, error: "server_config" };
      }
      const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
      if (!signupGate.ok) {
        gate.response = signupGate.response;
        return { ok: false, error: "signup_incomplete" };
      }
      const profileGate = await requireProfileFieldsForAction(sb, auth.userId, "messenger_new_chat");
      if (!profileGate.ok) {
        gate.response = profileGate.response;
        return { ok: false, error: "profile_incomplete" };
      }
      return { ok: true };
    },
  });
  if (gate.response) return gate.response;
  if (!result.ok) {
    const status =
      result.error === "blocked_target" || result.error === "cannot_start_chat" ? 403 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result);
}
