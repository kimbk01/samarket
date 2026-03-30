"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getUserProfile } from "@/lib/users/getUserProfile";
import type { ChatRoom } from "@/lib/types/chat";
import { chatProductSummaryFromPostRow } from "@/lib/chats/chat-product-from-post";
import { fetchPostRowsForChatIn } from "@/lib/chats/post-select-compat";
import {
  enrichPostWithAuthorNickname,
  fetchNicknamesForUserIds,
  postAuthorUserId,
} from "@/lib/chats/resolve-author-nickname";
import { CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT } from "@/lib/chats/chat-list-limits";

/**
 * 웹 채팅 목록 — Supabase product_chats (본인 참여 방만, 로그인 사용자)
 */
export async function getChatRoomsFromDb(currentUserId: string): Promise<ChatRoom[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !currentUserId) return [];

  const sb = supabase as any;
  const { data: rooms, error } = await sb
    .from("product_chats")
    .select(`
      id,
      post_id,
      seller_id,
      buyer_id,
      last_message_at,
      last_message_preview,
      unread_count_seller,
      unread_count_buyer,
      created_at
    `)
    .or(`seller_id.eq.${currentUserId},buyer_id.eq.${currentUserId}`)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(CHAT_ROOM_LIST_PRODUCT_CHATS_LIMIT);

  if (error || !rooms?.length) return [];

  const postIds: string[] = [
    ...new Set(
      (rooms as { post_id: unknown }[])
        .map((r) => String(r.post_id ?? "").trim())
        .filter((id) => id.length > 0)
    ),
  ];
  const posts = await fetchPostRowsForChatIn(sb as SupabaseClient, postIds);
  const postMap = new Map(posts.map((p: Record<string, unknown>) => [p.id as string, p]));

  const partnerIds = [...new Set(rooms.map((r: { seller_id: string; buyer_id: string }) => (r.seller_id === currentUserId ? r.buyer_id : r.seller_id)))];
  const authorIds = [...new Set(
    (posts ?? [])
      .map((p: Record<string, unknown>) => postAuthorUserId(p))
      .filter((id: string | undefined): id is string => !!id)
  )];
  const nickIds = [...new Set([...partnerIds, ...authorIds])] as string[];
  const nicknameByUserId = await fetchNicknamesForUserIds(sb, nickIds);

  return rooms.map((r: {
    id: string;
    post_id: string;
    seller_id: string;
    buyer_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    unread_count_seller: number;
    unread_count_buyer: number;
    created_at: string;
  }) => {
    const post = postMap.get(r.post_id) as Record<string, unknown> | undefined;
    const product = chatProductSummaryFromPostRow(
      enrichPostWithAuthorNickname(post, nicknameByUserId),
      r.post_id
    );
    const amISeller = r.seller_id === currentUserId;
    const unreadCount = amISeller ? (r.unread_count_seller ?? 0) : (r.unread_count_buyer ?? 0);
    const partnerId = amISeller ? r.buyer_id : r.seller_id;
    const partnerNickname = nicknameByUserId.get(partnerId)?.trim() || partnerId.slice(0, 8);
    return {
      id: r.id,
      productId: r.post_id,
      buyerId: r.buyer_id,
      sellerId: r.seller_id,
      partnerNickname,
      partnerAvatar: "",
      lastMessage: r.last_message_preview ?? "",
      lastMessageAt: r.last_message_at ?? r.created_at,
      unreadCount,
      product,
    } as ChatRoom;
  });
}

/**
 * 웹 채팅방 1건 조회 (참여자만)
 */
export async function getRoomByIdFromDb(
  roomId: string,
  currentUserId: string
): Promise<ChatRoom | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !currentUserId) return null;

  const sb = supabase as any;
  const { data: r, error } = await sb
    .from("product_chats")
    .select("*")
    .eq("id", roomId)
    .single();

  if (error || !r) return null;
  if (r.seller_id !== currentUserId && r.buyer_id !== currentUserId) return null;

  const postRows = await fetchPostRowsForChatIn(sb as SupabaseClient, [String(r.post_id)]);
  const post = (postRows[0] as Record<string, unknown> | undefined) ?? null;
  const row = r as Record<string, unknown>;
  const amISeller = r.seller_id === currentUserId;
  const partnerId = amISeller ? r.buyer_id : r.seller_id;
  const authorId = post ? postAuthorUserId(post) : undefined;
  const nicknameByUserId = await fetchNicknamesForUserIds(sb, [
    partnerId,
    ...(authorId ? [authorId] : []),
  ]);
  const product = chatProductSummaryFromPostRow(
    enrichPostWithAuthorNickname(post ?? undefined, nicknameByUserId),
    r.post_id
  );
  const unreadCount = amISeller ? (row.unread_count_seller ?? 0) : (row.unread_count_buyer ?? 0);
  const partnerProfile = await getUserProfile(partnerId);
  const partnerNickname =
    nicknameByUserId.get(partnerId)?.trim() ||
    partnerProfile?.nickname?.trim() ||
    partnerId.slice(0, 8);

  return {
    id: r.id,
    productId: r.post_id,
    buyerId: r.buyer_id,
    sellerId: r.seller_id,
    partnerNickname,
    partnerAvatar: "",
    lastMessage: (row.last_message_preview as string) ?? "",
    lastMessageAt: (row.last_message_at as string) ?? r.created_at,
    unreadCount: Number(unreadCount),
    product,
  } as ChatRoom;
}
