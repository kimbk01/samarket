"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type CreateOrJoinRoomResult =
  | { ok: true; roomId: string }
  | { ok: false; error: string };

/**
 * 게시글(제품) 기준 채팅방 생성 또는 기존 방으로 이동 (당근형)
 * - 채팅방 키: (post_id, seller_id, buyer_id) → product_chats.id
 * - 같은 글·같은 판매자·구매자 조합이면 항상 같은 방 1개만 사용 (중복 방 생성 방지)
 */
export async function createOrJoinRoom(
  postId: string,
  sellerId: string
): Promise<CreateOrJoinRoomResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  if (user.id === sellerId) return { ok: false, error: "본인 글에는 채팅할 수 없습니다." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "채팅 기능을 사용할 수 없습니다." };

  try {
    const { data: existing } = await (supabase as any)
      .from("product_chats")
      .select("id")
      .eq("post_id", postId)
      .eq("seller_id", sellerId)
      .eq("buyer_id", user.id)
      .maybeSingle();

    if (existing?.id) {
      return { ok: true, roomId: existing.id };
    }

    const { data: inserted, error } = await (supabase as any)
      .from("product_chats")
      .insert({
        post_id: postId,
        seller_id: sellerId,
        buyer_id: user.id,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message ?? "채팅방 생성에 실패했습니다." };
    return { ok: true, roomId: inserted?.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방 생성에 실패했습니다." };
  }
}
