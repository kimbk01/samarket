"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { PostStatus } from "@/lib/posts/schema";

export type UpdateProductStatusResult = { ok: true } | { ok: false; error: string };

const ALLOWED_TRANSITIONS: Record<string, PostStatus[]> = {
  active: ["reserved", "sold", "hidden"],
  reserved: ["active", "sold", "hidden"],
  sold: ["active", "reserved", "hidden"],
  hidden: ["active", "reserved", "sold"],
};

/**
 * 당근형: 상품 상태 변경 (판매자만) + 시스템 메시지 + 상대방 알림
 */
export async function updateProductStatusWithNotify(
  productId: string,
  nextStatus: PostStatus
): Promise<UpdateProductStatusResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "기능을 사용할 수 없습니다." };

  const sb = supabase as any;

  const { data: post } = await sb.from("posts").select("id, user_id, status").eq("id", productId).single();
  if (!post || post.user_id !== user.id) return { ok: false, error: "판매자만 상태를 변경할 수 있습니다." };

  const allowed = ALLOWED_TRANSITIONS[post.status] ?? [];
  if (!allowed.includes(nextStatus)) return { ok: false, error: "허용되지 않은 상태 변경입니다." };

  await sb.from("posts").update({ status: nextStatus, updated_at: new Date().toISOString() }).eq("id", productId);

  const statusLabel = { active: "판매중", reserved: "예약중", sold: "거래완료", hidden: "숨김" }[nextStatus];

  // 해당 상품 채팅방들에 시스템 메시지 + 알림
  const { data: rooms } = await sb
    .from("product_chats")
    .select("id, seller_id, buyer_id")
    .eq("post_id", productId);

  for (const room of rooms ?? []) {
    const otherId = room.seller_id === user.id ? room.buyer_id : room.seller_id;
    await sb.from("product_chat_messages").insert({
      product_chat_id: room.id,
      sender_id: user.id,
      message_type: "system",
      content: `판매자가 상태를 ${statusLabel}(으)로 변경했습니다.`,
    });
    await sb.from("notifications").insert({
      user_id: otherId,
      notification_type: "status",
      title: "거래 상태 변경",
      body: statusLabel,
      link_url: `/chats/${room.id}`,
      is_read: false,
    });
  }

  return { ok: true };
}
