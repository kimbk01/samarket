"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { AdminChatMessage, AdminChatMessageType } from "@/lib/types/admin-chat";

/**
 * 관리자 채팅방 메시지 목록 — Supabase product_chat_messages
 */
export async function getAdminMessagesFromDb(roomId: string): Promise<AdminChatMessage[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const sb = supabase as any;
  const { data: rows, error } = await sb
    .from("product_chat_messages")
    .select("id, product_chat_id, sender_id, message_type, content, is_hidden, created_at")
    .eq("product_chat_id", roomId)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) return [];

  return rows.map((m: {
    id: string;
    product_chat_id: string;
    sender_id: string;
    message_type: string;
    content: string;
    is_hidden: boolean;
    created_at: string;
  }) => ({
    id: m.id,
    roomId: m.product_chat_id,
    senderId: m.sender_id,
    senderNickname: m.sender_id.slice(0, 8),
    messageType: (m.message_type || "text") as AdminChatMessageType,
    message: m.content ?? "",
    createdAt: m.created_at,
    isHidden: m.is_hidden ?? false,
  })) as AdminChatMessage[];
}
