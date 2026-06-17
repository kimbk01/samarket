import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { requireSignupCompleteForUser } from "@/lib/auth/require-signup-complete-api";
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
    message: "대화 시작 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_direct_start_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ publicId?: string; targetUserId?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;

  const result = await startCommunityMessengerDirectChat(auth.userId, {
    publicId: parsed.value.publicId,
    targetUserId: parsed.value.targetUserId,
  });

  if (!result.ok || !result.roomId) {
    const err = result.error ?? "cannot_start_chat";
    const status = err === "cannot_start_chat" || err === "blocked_target" ? 403 : 400;
    return jsonError(err, status, result);
  }

  const snapshot = await getCommunityMessengerRoomSnapshot(auth.userId, result.roomId);
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
