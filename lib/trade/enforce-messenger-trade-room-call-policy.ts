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
  friendRequiredAfterComplete: "trade_chat_call_friend_required_after_complete",
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
  requesterUserId?: string | null;
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
    .select("post_id, seller_id, buyer_id")
    .eq("id", productChatId)
    .maybeSingle();
  const postId =
    pc && typeof (pc as { post_id?: unknown }).post_id === "string"
      ? String((pc as { post_id: string }).post_id).trim()
      : "";
  if (!postId) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.callsDisabled };
  }

  const sellerId =
    pc && typeof (pc as { seller_id?: unknown }).seller_id === "string"
      ? String((pc as { seller_id: string }).seller_id).trim()
      : "";
  const buyerId =
    pc && typeof (pc as { buyer_id?: unknown }).buyer_id === "string"
      ? String((pc as { buyer_id: string }).buyer_id).trim()
      : "";

  const { data: post } = await sb
    .from(POSTS_TABLE_READ)
    .select("meta, status, seller_listing_state")
    .eq("id", postId)
    .maybeSingle();
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

  /**
   * 거래완료 후에는(특히 구매자 측) 친구 관계가 아니면 통화를 제한한다.
   * - 요구사항: "통화를 원하면 친구를 요청하세요"
   * - 서버에서 강제해 클라이언트 표면 차이로 인한 회귀를 방지한다.
   */
  const requesterUserId = typeof input.requesterUserId === "string" ? input.requesterUserId.trim() : "";
  const postStatus = typeof (post as { status?: unknown } | null)?.status === "string" ? String((post as { status: string }).status).trim().toLowerCase() : "";
  const listingState =
    typeof (post as { seller_listing_state?: unknown } | null)?.seller_listing_state === "string"
      ? String((post as { seller_listing_state: string }).seller_listing_state).trim().toLowerCase()
      : "";
  const isCompletedTrade = postStatus === "sold" || listingState === "completed";
  if (isCompletedTrade && requesterUserId && requesterUserId === buyerId && sellerId) {
    const { data: acceptedRows, error: friendRowsError } = await sb
      .from("community_friend_requests")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${requesterUserId},addressee_id.eq.${requesterUserId}`);
    /**
     * 스키마 미적용/일시 오류 환경에서 통화를 전면 차단하지 않도록 호환 가드.
     * (정상 환경에서는 아래 친구 판정이 그대로 강제된다.)
     */
    if (friendRowsError) {
      console.warn("[messenger-call-policy] friend lookup failed, skip completed trade gate", {
        roomId,
        requesterUserId,
      });
      return { ok: true };
    }
    const isFriend = (acceptedRows ?? []).some((row) => {
      const requesterId =
        row && typeof (row as { requester_id?: unknown }).requester_id === "string"
          ? String((row as { requester_id: string }).requester_id).trim()
          : "";
      const addresseeId =
        row && typeof (row as { addressee_id?: unknown }).addressee_id === "string"
          ? String((row as { addressee_id: string }).addressee_id).trim()
          : "";
      return (
        (requesterId === requesterUserId && addresseeId === sellerId) ||
        (requesterId === sellerId && addresseeId === requesterUserId)
      );
    });
    if (!isFriend) {
      return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.friendRequiredAfterComplete };
    }
  }
  return { ok: true };
}
