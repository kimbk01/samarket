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

export const MESSENGER_STORE_ORDER_FEATURE_POLICY_ERROR = {
  voiceMessageDisabled: "store_order_voice_messages_disabled",
  voiceCallDisabled: "store_order_voice_calls_disabled",
  videoCallDisabled: "store_order_video_calls_disabled",
} as const;

export type MessengerRoomCommunicationFeature = "voice_message" | "voice_call" | "video_call";

type MessengerTradeDirectRoomPolicyContext = {
  policy: ReturnType<typeof normalizeTradeChatCallPolicy>;
  postStatus: string;
  listingState: string;
  sellerId: string;
  buyerId: string;
};

type MessengerStoreOrderFeaturePolicy = {
  allowVoiceMessage: boolean;
  allowVoiceCall: boolean;
  allowVideoCall: boolean;
};

function getServiceClientOrNull(): SupabaseClient<any> | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

function storeOrderIdFromDirectKey(directKey: string): string {
  const dk = directKey.trim();
  if (dk.startsWith("store_order:")) return dk.slice("store_order:".length).trim();
  if (dk.startsWith("trade_order:")) return dk.slice("trade_order:".length).trim();
  return "";
}

async function resolveMessengerStoreOrderFeaturePolicy(input: {
  supabase: SupabaseClient<any>;
  roomId: string;
}): Promise<MessengerStoreOrderFeaturePolicy | null> {
  const roomId = input.roomId.trim();
  if (!roomId) return null;

  const { data: roomRow } = await input.supabase
    .from("community_messenger_rooms")
    .select("summary, direct_key")
    .eq("id", roomId)
    .maybeSingle();

  const summaryRaw =
    roomRow && typeof (roomRow as { summary?: unknown }).summary === "string"
      ? String((roomRow as { summary: string }).summary)
      : "";
  const directKey =
    roomRow && typeof (roomRow as { direct_key?: unknown }).direct_key === "string"
      ? String((roomRow as { direct_key: string }).direct_key).trim()
      : "";
  const ctx = parseCommunityMessengerRoomContextMeta(summaryRaw);
  const storeOrderId =
    ctx?.kind === "delivery" && typeof ctx.storeOrderId === "string" && ctx.storeOrderId.trim()
      ? ctx.storeOrderId.trim()
      : storeOrderIdFromDirectKey(directKey);
  let storeId =
    ctx?.kind === "delivery" && typeof ctx.storeId === "string" && ctx.storeId.trim() ? ctx.storeId.trim() : "";

  if (!storeOrderId && !storeId) return null;

  if (!storeId && storeOrderId) {
    const { data: orderRow } = await input.supabase
      .from("store_orders")
      .select("store_id")
      .eq("id", storeOrderId)
      .maybeSingle();
    storeId =
      orderRow && typeof (orderRow as { store_id?: unknown }).store_id === "string"
        ? String((orderRow as { store_id: string }).store_id).trim()
        : "";
  }
  if (!storeId) return null;

  const { data: storeRow, error } = await input.supabase
    .from("stores")
    .select("messenger_voice_messages_enabled, messenger_voice_calls_enabled, messenger_video_calls_enabled")
    .eq("id", storeId)
    .maybeSingle();

  if (error) {
    const msg = String((error as { message?: unknown }).message ?? "");
    if (
      /messenger_voice_messages_enabled|messenger_voice_calls_enabled|messenger_video_calls_enabled/i.test(msg) &&
      /does not exist/i.test(msg)
    ) {
      return { allowVoiceMessage: true, allowVoiceCall: true, allowVideoCall: true };
    }
    return null;
  }
  if (!storeRow) return null;

  return {
    allowVoiceMessage: (storeRow as { messenger_voice_messages_enabled?: unknown }).messenger_voice_messages_enabled !== false,
    allowVoiceCall: (storeRow as { messenger_voice_calls_enabled?: unknown }).messenger_voice_calls_enabled !== false,
    allowVideoCall: (storeRow as { messenger_video_calls_enabled?: unknown }).messenger_video_calls_enabled !== false,
  };
}

async function resolveMessengerTradeDirectRoomPolicyContext(input: {
  supabase: SupabaseClient<any>;
  roomId: string;
}): Promise<MessengerTradeDirectRoomPolicyContext | null> {
  const roomId = input.roomId.trim();
  if (!roomId) return null;

  const { data: roomRow } = await input.supabase
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
    const { data: pcLink } = await input.supabase
      .from("product_chats")
      .select("id")
      .eq("community_messenger_room_id", roomId)
      .maybeSingle();
    const id =
      pcLink && typeof (pcLink as { id?: unknown }).id === "string" ? (pcLink as { id: string }).id.trim() : "";
    productChatId = id;
  }

  if (!productChatId) return null;

  const { data: pc } = await input.supabase
    .from("product_chats")
    .select("post_id, seller_id, buyer_id")
    .eq("id", productChatId)
    .maybeSingle();
  const postId =
    pc && typeof (pc as { post_id?: unknown }).post_id === "string"
      ? String((pc as { post_id: string }).post_id).trim()
      : "";
  if (!postId) {
    return {
      policy: "none",
      postStatus: "",
      listingState: "",
      sellerId: "",
      buyerId: "",
    };
  }

  const sellerId =
    pc && typeof (pc as { seller_id?: unknown }).seller_id === "string"
      ? String((pc as { seller_id: string }).seller_id).trim()
      : "";
  const buyerId =
    pc && typeof (pc as { buyer_id?: unknown }).buyer_id === "string"
      ? String((pc as { buyer_id: string }).buyer_id).trim()
      : "";

  const { data: post } = await input.supabase
    .from(POSTS_TABLE_READ)
    .select("meta, status, seller_listing_state")
    .eq("id", postId)
    .maybeSingle();
  const metaObj = post && typeof (post as { meta?: unknown }).meta === "object" && (post as { meta: unknown }).meta != null
    ? ((post as { meta: Record<string, unknown> }).meta as Record<string, unknown>)
    : null;
  const rawPolicy = metaObj && "trade_chat_call_policy" in metaObj ? metaObj.trade_chat_call_policy : undefined;
  const postStatus =
    typeof (post as { status?: unknown } | null)?.status === "string"
      ? String((post as { status: string }).status).trim().toLowerCase()
      : "";
  const listingState =
    typeof (post as { seller_listing_state?: unknown } | null)?.seller_listing_state === "string"
      ? String((post as { seller_listing_state: string }).seller_listing_state).trim().toLowerCase()
      : "";
  return {
    policy: normalizeTradeChatCallPolicy(rawPolicy),
    postStatus,
    listingState,
    sellerId,
    buyerId,
  };
}

export async function assertMessengerRoomAllowsCommunicationFeature(input: {
  supabase?: SupabaseClient<any> | null;
  roomId: string;
  feature: MessengerRoomCommunicationFeature;
  requesterUserId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const roomId = typeof input.roomId === "string" ? input.roomId.trim() : "";
  if (!roomId) return { ok: true };

  const sb = input.supabase ?? getServiceClientOrNull();
  if (!sb) return { ok: true };

  const storePolicy = await resolveMessengerStoreOrderFeaturePolicy({ supabase: sb, roomId });
  if (storePolicy) {
    if (input.feature === "voice_message" && !storePolicy.allowVoiceMessage) {
      return { ok: false, error: MESSENGER_STORE_ORDER_FEATURE_POLICY_ERROR.voiceMessageDisabled };
    }
    if (input.feature === "voice_call" && !storePolicy.allowVoiceCall) {
      return { ok: false, error: MESSENGER_STORE_ORDER_FEATURE_POLICY_ERROR.voiceCallDisabled };
    }
    if (input.feature === "video_call" && !storePolicy.allowVideoCall) {
      return { ok: false, error: MESSENGER_STORE_ORDER_FEATURE_POLICY_ERROR.videoCallDisabled };
    }
    return { ok: true };
  }

  const tradePolicy = await resolveMessengerTradeDirectRoomPolicyContext({ supabase: sb, roomId });
  if (!tradePolicy) return { ok: true };

  if (!tradeChatCallPolicyAllowsVoice(tradePolicy.policy)) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.callsDisabled };
  }
  if (input.feature === "video_call" && !tradeChatCallPolicyAllowsVideo(tradePolicy.policy)) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.videoNotAllowed };
  }
  if (input.feature === "voice_call" || input.feature === "video_call") {
    return assertMessengerTradeDirectRoomAllowsCallKind({
      supabase: sb,
      roomId,
      callKind: input.feature === "video_call" ? "video" : "voice",
      requesterUserId: input.requesterUserId,
    });
  }
  return { ok: true };
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

  const tradePolicy = await resolveMessengerTradeDirectRoomPolicyContext({ supabase: sb, roomId });
  if (!tradePolicy) return { ok: true };

  if (!tradeChatCallPolicyAllowsVoice(tradePolicy.policy)) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.callsDisabled };
  }
  if (input.callKind === "video" && !tradeChatCallPolicyAllowsVideo(tradePolicy.policy)) {
    return { ok: false, error: MESSENGER_TRADE_CALL_POLICY_ERROR.videoNotAllowed };
  }

  return { ok: true };
}
