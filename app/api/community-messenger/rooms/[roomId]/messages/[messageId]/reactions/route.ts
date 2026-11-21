import { NextRequest } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import {
  listCommunityMessengerMessageReactionParticipants,
  toggleCommunityMessengerMessageReaction,
} from "@/lib/community-messenger/service";
import { enforceRateLimit, getRateLimitKey, jsonError, jsonOk, parseJsonBody } from "@/lib/http/api-route";
import { messengerRoomCanonicalOrJsonError } from "@/lib/community-messenger/server/messenger-room-canonical-resolve-api";
import { publishMessengerRoomBumpAfterMutation } from "@/lib/community-messenger/server/publish-messenger-room-bump";
import { requireRegistrationForAction } from "@/lib/auth/require-registration-for-action.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-reaction-roster:${getRateLimitKey(req, auth.userId)}`,
    limit: 90,
    windowMs: 60_000,
    message: "반응 목록 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_reaction_roster_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const reactionKey = req.nextUrl.searchParams.get("reactionKey")?.trim() ?? "";
  if (!reactionKey) {
    return jsonError("reactionKey가 필요합니다.", 400, { code: "bad_request" });
  }

  const { roomId: rawRoomId, messageId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  const result = await listCommunityMessengerMessageReactionParticipants({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId: String(messageId ?? "").trim(),
    reactionKey,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "forbidden") {
      return jsonError("반응 목록을 볼 수 없습니다.", 403, { code: result.error });
    }
    if (result.error === "bad_request") {
      return jsonError("잘못된 요청입니다.", 400, { code: result.error });
    }
    if (result.error === "messenger_storage_unavailable") {
      return jsonError("메신저를 사용할 수 없습니다.", 503, { code: result.error });
    }
    return jsonError("반응 목록을 불러오지 못했습니다.", 400, { code: result.error });
  }

  return jsonOk({ users: result.users });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `community-messenger:message-reaction:${getRateLimitKey(req, auth.userId)}`,
    limit: 60,
    windowMs: 60_000,
    message: "반응 요청이 너무 빠릅니다. 잠시 후 다시 시도해 주세요.",
    code: "community_messenger_message_reaction_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<{ reactionKey?: string }>(req, "invalid_json");
  if (!parsed.ok) return parsed.response;
  const reactionKey = String(parsed.value.reactionKey ?? "").trim();
  if (!reactionKey) {
    return jsonError("reactionKey가 필요합니다.", 400);
  }

  const { roomId: rawRoomId, messageId } = await params;
  const canon = await messengerRoomCanonicalOrJsonError(auth.userId, String(rawRoomId ?? "").trim());
  if (!canon.ok) {
    return canon.response;
  }

  /** 섞인 경로(설계 2026-11-21 §4 C, 재감사3 #2) — 추가만 가입 확인, 해제는 가입 없이 */
  const reactionSb = tryCreateSupabaseServiceClient();
  if (!reactionSb) return jsonError("supabase_unconfigured", 503);
  const { data: mineReaction, error: mineReactionErr } = await reactionSb
    .from("community_messenger_message_reactions")
    .select("reaction_key")
    .eq("message_id", String(messageId ?? "").trim())
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (mineReactionErr) return jsonError("reaction_failed", 500);
  const isRemovingSameReaction =
    String((mineReaction as { reaction_key?: string } | null)?.reaction_key ?? "").trim() === reactionKey;
  if (!isRemovingSameReaction) {
    const registrationGate = await requireRegistrationForAction(auth.userId);
    if (registrationGate) return registrationGate;
  }

  const result = await toggleCommunityMessengerMessageReaction({
    userId: auth.userId,
    roomId: canon.canonicalRoomId,
    messageId: String(messageId ?? "").trim(),
    reactionKey,
  });

  if (!result.ok) {
    if (result.error === "not_found") {
      return jsonError("메시지를 찾을 수 없습니다.", 404, { code: result.error });
    }
    if (result.error === "forbidden") {
      return jsonError("반응을 추가할 수 없습니다.", 403, { code: result.error });
    }
    if (result.error === "bad_request") {
      return jsonError("잘못된 요청입니다.", 400, { code: result.error });
    }
    if (result.error === "messenger_storage_unavailable") {
      return jsonError("메신저를 사용할 수 없습니다.", 503, { code: result.error });
    }
    return jsonError("반응을 저장하지 못했습니다.", 400, { code: result.error });
  }

  /**
   * Reactions follow the room message contract (docs/messenger-realtime-policy.md): the server publishes a bump
   * after the mutation, before the response. No snapshot — aggregates carry a per-viewer `mine` flag, so each
   * receiver reconciles via messages/{id}. No badge/notification bump: a reaction is not a new message.
   * Before this, peers saw reactions only after re-entering the room (device 2026-11-16).
   */
  try {
    await publishMessengerRoomBumpAfterMutation({
      rawRouteRoomId: String(rawRoomId ?? "").trim(),
      canonicalRoomId: canon.canonicalRoomId,
      fromUserId: auth.userId,
      messageId: String(messageId ?? "").trim(),
      skipBadgeTargetBump: true,
    });
  } catch {
    /* best-effort — reaction is saved; peers reconcile on next load */
  }

  return jsonOk({ ok: true, reactions: result.reactions });
}
