"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types/chat";
import { mapProductChatMessageRow } from "@/lib/chats/map-product-chat-message-row";

/**
 * 웹 채팅방 메시지 목록 — Supabase product_chat_messages
 */
export async function getMessagesFromDb(
  roomId: string,
  currentUserId: string
): Promise<ChatMessage[]> {
  const supabase = getSupabaseClient();
  if (!supabase || !currentUserId) return [];

  const sb = supabase as any;
  const { data: rows, error } = await sb
    .from("product_chat_messages")
    .select("*")
    .eq("product_chat_id", roomId)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) return [];

  return (rows as Record<string, unknown>[])
    .map((m) => mapProductChatMessageRow(m))
    .filter((m): m is ChatMessage => m != null);
}
