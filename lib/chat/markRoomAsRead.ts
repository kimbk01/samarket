"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getTestAuth } from "@/lib/auth/test-auth-store";

export type MarkRoomAsReadResult = { ok: true } | { ok: false; error: string };

/**
 * 당근형: 채팅방 읽음 처리
 * - 테스트 로그인 시 Supabase 직접 호출 생략(406 방지)
 */
export async function markRoomAsRead(roomId: string): Promise<MarkRoomAsReadResult> {
  try {
    const user = getCurrentUser();
    if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

    if (getTestAuth()) {
      return { ok: false, error: "테스트 로그인에서는 읽음 처리 생략" };
    }

    const supabase = getSupabaseClient();
    if (!supabase) return { ok: false, error: "채팅 기능을 사용할 수 없습니다." };

    const sb = supabase as any;
    const { data: room } = await sb
      .from("product_chats")
      .select("*")
      .eq("id", roomId)
      .single();

    if (!room || (room.seller_id !== user.id && room.buyer_id !== user.id))
      return { ok: false, error: "채팅방을 찾을 수 없습니다." };

    const now = new Date().toISOString();
    const isSeller = room.seller_id === user.id;
    const updates: Record<string, unknown> = { updated_at: now };
    if (isSeller) updates.unread_count_seller = 0;
    else updates.unread_count_buyer = 0;
    await sb.from("product_chats").update(updates).eq("id", roomId);

    const { data: messages } = await sb
      .from("product_chat_messages")
      .select("*")
      .eq("product_chat_id", roomId);

    const toMark = (messages ?? []).filter((m: Record<string, unknown>) => m.sender_id !== user.id && m.read_at == null);
    for (const m of toMark) {
      await sb.from("product_chat_messages").update({ read_at: now }).eq("id", m.id);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "읽음 처리 실패" };
  }
}
