/**
 * 메신저 방 나가기 — trade / direct / group 단일 진입점 (서버 전용).
 * `product_chats` 나가기 타임스탬프와 CM 참가자 행 삭제를 한 트랜잭션에 가깝게 처리한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { itemTradeChatRoomIdFromMessengerDirectKey } from "@/lib/trade/mirror-community-messenger-text-to-item-trade-ledger";
import { syncPostInquiryNegotiatingFromItemTradeChats } from "@/lib/trade/maybe-auto-promote-trade-listing-negotiating";
import { invalidateUserChatUnreadCache } from "@/lib/chat/user-chat-unread-parts";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";

export type LeaveMessengerRoomUnifiedSuccess = {
  ok: true;
  tradeProductChatId?: string;
  /**
   * item_trade `chat_rooms.id` — `direct_key` 미러 경로에서 참가자·잠금·이벤트 로그까지 unified 가 처리함.
   * 호출부(레거시 REST)는 동일 방에 대해 중복 `UPDATE chat_room_participants` / `chat_event_logs` 를 생략한다.
   */
  mirroredLegacyItemTradeRoomId?: string;
  /** `syncPostInquiryNegotiatingFromItemTradeChats` 가 unified 안에서 이미 호출됨 */
  tradeListingStateSyncStarted?: boolean;
};

export type LeaveMessengerRoomUnifiedResult = LeaveMessengerRoomUnifiedSuccess | { ok: false; error: string };

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * `quiet`: 그룹 나가기 시 (향후) 시스템 메시지 생략 플래그 — API 바디로 전달만 한다.
 */
export async function leaveMessengerRoomUnified(
  sb: SupabaseClient<any>,
  userId: string,
  canonicalMessengerRoomId: string,
  _options?: { quiet?: boolean }
): Promise<LeaveMessengerRoomUnifiedResult> {
  const roomId = trimId(canonicalMessengerRoomId);
  const uid = trimId(userId);
  if (!roomId || !uid) return { ok: false, error: "bad_request" };

  const { data: membership } = await sb
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!membership?.id) {
    return { ok: false, error: "room_not_found" };
  }

  const { data: roomRow, error: roomErr } = await sb
    .from("community_messenger_rooms")
    .select("id, room_type, summary, direct_key, owner_user_id")
    .eq("id", roomId)
    .maybeSingle();
  if (roomErr || !roomRow) {
    return { ok: false, error: "room_not_found" };
  }

  const summaryRaw = (roomRow as { summary?: unknown }).summary;
  const meta = parseCommunityMessengerRoomContextMeta(typeof summaryRaw === "string" ? summaryRaw : null);
  const directKey = trimId((roomRow as { direct_key?: unknown }).direct_key);

  let productChatId = "";
  if (meta?.kind === "trade") {
    productChatId = trimId(meta.productChatId);
    if (!productChatId) {
      const { data: pcRow } = await sb
        .from("product_chats")
        .select("id")
        .eq("community_messenger_room_id", roomId)
        .maybeSingle();
      productChatId = trimId((pcRow as { id?: unknown } | null)?.id);
    }
  }

  if (productChatId) {
    const { data: pc, error: pcErr } = await sb
      .from("product_chats")
      .select("id, post_id, seller_id, buyer_id, seller_left_at, buyer_left_at")
      .eq("id", productChatId)
      .maybeSingle();
    if (pcErr || !pc) {
      return { ok: false, error: "trade_room_not_found" };
    }
    const r = pc as {
      post_id?: string | null;
      seller_id?: string | null;
      buyer_id?: string | null;
      seller_left_at?: string | null;
      buyer_left_at?: string | null;
    };
    const sid = trimId(r.seller_id);
    const bid = trimId(r.buyer_id);
    if (sid !== uid && bid !== uid) {
      return { ok: false, error: "forbidden" };
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    if (sid === uid) {
      if (r.seller_left_at) {
        await sb.from("community_messenger_participants").delete().eq("room_id", roomId).eq("user_id", uid);
        invalidateUserChatUnreadCache(uid);
        invalidateOwnerHubBadgeCache(uid);
        return { ok: true, tradeProductChatId: productChatId, tradeListingStateSyncStarted: false };
      }
      patch.seller_left_at = now;
    } else {
      if (r.buyer_left_at) {
        await sb.from("community_messenger_participants").delete().eq("room_id", roomId).eq("user_id", uid);
        invalidateUserChatUnreadCache(uid);
        invalidateOwnerHubBadgeCache(uid);
        return { ok: true, tradeProductChatId: productChatId, tradeListingStateSyncStarted: false };
      }
      patch.buyer_left_at = now;
    }

    const { error: upErr } = await sb.from("product_chats").update(patch).eq("id", productChatId);
    if (upErr) {
      return { ok: false, error: "trade_leave_failed" };
    }

    const itemTradeRoomId = itemTradeChatRoomIdFromMessengerDirectKey(directKey);
    if (itemTradeRoomId) {
      await sb
        .from("chat_room_participants")
        .update({
          left_at: now,
          is_active: false,
          hidden: true,
          updated_at: now,
        })
        .eq("room_id", itemTradeRoomId)
        .eq("user_id", uid);
      const { data: stillRows } = await sb
        .from("chat_room_participants")
        .select("id, is_active")
        .eq("room_id", itemTradeRoomId)
        .eq("hidden", false)
        .is("left_at", null);
      const activeOthers = (stillRows ?? []).filter((row: { is_active?: boolean | null }) => row.is_active !== false);
      if (activeOthers.length === 0) {
        await sb
          .from("chat_rooms")
          .update({ is_locked: true, locked_at: now, updated_at: now })
          .eq("id", itemTradeRoomId);
      }
    }

    await sb.from("community_messenger_participants").delete().eq("room_id", roomId).eq("user_id", uid);

    const postId = trimId(r.post_id);
    let tradeListingStateSyncStarted = false;
    if (postId) {
      tradeListingStateSyncStarted = true;
      void syncPostInquiryNegotiatingFromItemTradeChats(sb, postId).catch(() => {});
    }
    if (itemTradeRoomId) {
      try {
        await sb.from("chat_event_logs").insert({
          room_id: itemTradeRoomId,
          event_type: "participant_left",
          actor_user_id: uid,
          metadata: { source: "messenger_unified_leave", product_chat_id: productChatId },
        });
      } catch {
        /* ignore */
      }
    }
    invalidateUserChatUnreadCache(uid);
    invalidateOwnerHubBadgeCache(uid);
    return {
      ok: true,
      tradeProductChatId: productChatId,
      ...(itemTradeRoomId ? { mirroredLegacyItemTradeRoomId: itemTradeRoomId } : {}),
      tradeListingStateSyncStarted,
    };
  }

  const ownerId = trimId((roomRow as { owner_user_id?: unknown }).owner_user_id);
  if (ownerId === uid) {
    return { ok: false, error: "owner_cannot_leave" };
  }
  const { error: delErr } = await sb.from("community_messenger_participants").delete().eq("room_id", roomId).eq("user_id", uid);
  if (delErr) {
    return { ok: false, error: "leave_failed" };
  }
  invalidateUserChatUnreadCache(uid);
  invalidateOwnerHubBadgeCache(uid);
  return { ok: true };
}
