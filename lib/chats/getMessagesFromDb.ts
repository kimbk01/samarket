"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/types/chat";

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

  return rows
    .filter((m: Record<string, unknown>) => !(m.is_hidden === true))
    .map((m: Record<string, unknown>) => ({
      id: m.id as string,
      roomId: m.product_chat_id as string,
      senderId: m.sender_id as string,
      message: (m.content as string) ?? "",
      messageType: ((m.message_type as string) || "text") as "text" | "image" | "system",
      imageUrl: (m.image_url as string | null | undefined) ?? null,
      readAt: m.read_at as string | null,
      createdAt: (m.created_at as string) ?? "",
      isRead: !!m.read_at,
    })) as ChatMessage[];
}
