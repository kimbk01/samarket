"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";

export type BlockUserResult = { ok: true } | { ok: false; error: string };

/**
 * 당근형: 사용자 차단 (프로필/채팅방 점3개)
 * - user_blocks 저장, 해당 채팅방 room_status 재계산(blocked)
 */
export async function blockUserDaangn(
  targetUserId: string,
  options?: { reason?: string; roomId?: string }
): Promise<BlockUserResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };
  if (user.id === targetUserId) return { ok: false, error: "자기 자신은 차단할 수 없습니다." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "기능을 사용할 수 없습니다." };

  const sb = supabase as any;

  const { data: existing } = await sb
    .from("user_blocks")
    .select("id")
    .eq("user_id", user.id)
    .eq("blocked_user_id", targetUserId)
    .maybeSingle();
  if (existing) return { ok: true };

  await sb.from("user_blocks").insert({
    user_id: user.id,
    blocked_user_id: targetUserId,
    reason: options?.reason ?? null,
  });

  // room_status 컬럼이 있을 때만 채팅방 상태를 blocked로 갱신 (없으면 스키마 캐시 오류 방지)
  try {
    if (options?.roomId) {
      await sb
        .from("product_chats")
        .update({ room_status: "blocked", updated_at: new Date().toISOString() })
        .eq("id", options.roomId);
    } else {
      const { data: roomsA } = await sb
        .from("product_chats")
        .select("id")
        .eq("seller_id", user.id)
        .eq("buyer_id", targetUserId);
      const { data: roomsB } = await sb
        .from("product_chats")
        .select("id")
        .eq("seller_id", targetUserId)
        .eq("buyer_id", user.id);
      const rooms = [...(roomsA ?? []), ...(roomsB ?? [])];
      for (const r of rooms) {
        await sb
          .from("product_chats")
          .update({ room_status: "blocked", updated_at: new Date().toISOString() })
          .eq("id", r.id);
      }
    }
  } catch {
    // room_status 컬럼이 없으면 무시 (user_blocks만으로도 차단 동작)
  }

  return { ok: true };
}
