import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import {
  normalizeTradeChatCallPolicy,
  tradeChatCallPolicyAllowsVideo,
  tradeChatCallPolicyAllowsVoice,
} from "@/lib/trade/trade-chat-call-policy";

/** `POST …/rooms/:id/calls` · 음성→영상 업그레이드 시 클라·로그용 코드 */
export const MESSENGER_TRADE_CALL_POLICY_ERROR = {
  callsDisabled: "trade_chat_calls_disabled",
  videoNotAllowed: "trade_chat_video_not_allowed",
} as const;

function getServiceClientOrNull(): SupabaseClient<any> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

/**
 * `product_chats` ↔ 메신저로 브리지된 **1:1 직통방**에서만 글의 `trade_chat_call_policy` 를 적용한다.
 * 일반 DM·그룹방은 `productChatId` / 역조회 매칭이 없으면 통과(`ok: true`).
 */
export async function assertMessengerTradeDirectRoomAllowsCallKind(input: {
  /** 호출부에서 이미 `getSupabaseOrNull()` 등으로 구한 클라이언트 — 없으면 내부에서 한 번 시도 */
  supabase?: SupabaseClient<any> | null;
  roomId: string;
  callKind: CommunityMessengerCallKind;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const roomId = typeof input.roomId === "string" ? input.roomId.trim() : "";
  if (!roomId) return { ok: true };

  const sb = input.supabase ?? getServiceClientOrNull();
  if (!sb) return { ok: true };

  const { data: roomRow } = await sb
    .from("community_messenger_rooms")
    .select("summary")
    .eq("id", roomId)
    .maybeSingle();
  const summaryRaw =
    roomRow && typeof (roomRow as { summary?: unknown }).summary === "string"
      ? String((roomRow as { summary: string }).summary)
      : "";

  const ctx = parseCommunityMessengerRoomContextMeta(summaryRaw);
  let productChatId =
    ctx?.kind === "trade" && typeof ctx.productChatId === "string" ? ctx.productChatId.trim() : "";

  if (!productChatId) {
    const { data: pcLink } = await sb
      .from("product_chats")
      .select("id")
      .eq("community_messenger_room_id", roomId)
      .maybeSingle();
    const id = pcLink && typeof (pcLink as { id?: unknown }).id === "string" ? (pcLink as { id: string }).id.trim() : "";
    productChatId = id;
  }

  if (!productChatId) return { ok: true };

  const { data: pc } = await sb
    .from("product_chats")
    .select("post_id")
    .eq("id", productChatId)
    .maybeSingle();
  const postId =
    pc && typeof (pc as { post_id?: unknown }).post_id === "string"
      ? String((pc as { post_id: string }).post_id).trim()
      : "";
  if (!postId) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.callsDisabled };
  }

  const { data: post } = await sb.from(POSTS_TABLE_READ).select("meta").eq("id", postId).maybeSingle();
  const metaObj = post && typeof (post as { meta?: unknown }).meta === "object" && (post as { meta: unknown }).meta != null
    ? ((post as { meta: Record<string, unknown> }).meta as Record<string, unknown>)
    : null;
  const rawPolicy = metaObj && "trade_chat_call_policy" in metaObj ? metaObj.trade_chat_call_policy : undefined;
  const policy = normalizeTradeChatCallPolicy(rawPolicy);

  if (!tradeChatCallPolicyAllowsVoice(policy)) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.callsDisabled };
  }
  if (input.callKind === "video" && !tradeChatCallPolicyAllowsVideo(policy)) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.videoNotAllowed };
  }
  return { ok: true };
}
