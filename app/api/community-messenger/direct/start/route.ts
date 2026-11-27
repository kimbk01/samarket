import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
import {
  registrationGapResponse,
  resolveRegistrationGapForAction,
  type RegistrationGap,
} from "@/lib/auth/require-registration-for-action.server";
import { requireProfileFieldsForAction } from "@/lib/profile/require-profile-completion.server";
import { validateActiveSession } from "@/lib/auth/server-guards";
import {
  enforceRateLimit,
  getRateLimitKey,
  jsonError,
  jsonOkWithRequest,
  parseJsonBody,
} from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isGeneralFriendDirectRoom } from "@/lib/community-messenger/messenger-room-domain";
import {
  getCommunityMessengerRoomSnapshot,
  startCommunityMessengerDirectChat,
} from "@/lib/community-messenger/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const session = await validateActiveSession(auth.userId);
  if (!session.ok) return session.response;

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("server_config", 503);

  const signupGate = await requireSignupCompleteForUser(sb, auth.userId);
  if (!signupGate.ok) return signupGate.response;

  const profileGate = await requireProfileFieldsForAction(sb, auth.userId, "messenger_new_chat");
  if (!profileGate.ok) return profileGate.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:direct-start:${getRateLimitKey(req, auth.userId)}`,
    limit: 6,
    windowMs: 60_000,
    code: "community_messenger_direct_start_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ publicId?: string; targetUserId?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  /**
   * F1 (Owner 2026-11-27 「승인, 구현 진행」) — 새 1:1 방 만들기만 가입(전화 + 대표 주소) 필요, 기존 방 다시 열기는 가입 없이.
   * 규칙 표 `split` · 설계 `docs/audit/f1-registration-decisions-design-2026-11-27.md` §3-2.
   */
  let registrationGap: RegistrationGap | null = null;
  const result = await startCommunityMessengerDirectChat(
    auth.userId,
    {
      publicId: parsed.value.publicId,
      targetUserId: parsed.value.targetUserId,
    },
    {
      beforeCreate: async () => {
        registrationGap = await resolveRegistrationGapForAction(auth.userId);
        return registrationGap ? { error: "signup_incomplete" } : null;
      },
    },
  );
  const gap = registrationGap as RegistrationGap | null; // 콜백 안에서 채워짐 — TS 좁히기 방지
  if (gap) return registrationGapResponse(gap);

  if (!result.ok || !result.roomId) {
    const err = result.error ?? "cannot_start_chat";
    const status = err === "cannot_start_chat" || err === "blocked_target" ? 403 : 400;
    return jsonError(err, status, result);
  }

  const snapshot = await getCommunityMessengerRoomSnapshot(auth.userId, result.roomId);
  if (snapshot?.room && !isGeneralFriendDirectRoom(snapshot.room)) {
    return jsonError("cannot_start_chat", 403, { error: "cannot_start_chat" });
  }
  return jsonOkWithRequest(req, {
    roomId: result.roomId,
    created: result.created ?? false,
    targetProfile: result.targetProfile
      ? {
          id: result.targetProfile.id,
          display_name: result.targetProfile.label,
          avatar_url: result.targetProfile.avatarUrl,
          public_id: result.targetProfile.subtitle ?? null,
        }
      : null,
    snapshot,
  });
}
