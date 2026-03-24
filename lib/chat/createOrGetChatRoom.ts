"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import type { CreateOrJoinRoomResult } from "./createOrJoinRoom";

/**
 * 당근형 거래 채팅: 채팅방 생성 또는 기존 방 반환 (같은 item + 판매자/구매자 → 재사용·reopen)
 * - POST /api/chat/item/start 우선 (chat_rooms 기반)
 * - 404 또는 "상품을 찾을 수 없습니다" 시 기존 create-room으로 폴백 (product_chats)
 */
export async function createOrGetChatRoom(productId: string): Promise<CreateOrJoinRoomResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };

  try {
    const res = await fetch("/api/chat/item/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: productId }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.roomId) return { ok: true, roomId: data.roomId };
    const errMsg = data.error ?? "";
    const isProductNotFound = res.status === 404 || errMsg.includes("상품을 찾을 수 없습니다");
    if (isProductNotFound) {
      const fallback = await fetch("/api/chat/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const fallbackData = await fallback.json().catch(() => ({}));
      if (fallbackData.ok && fallbackData.roomId) return { ok: true, roomId: fallbackData.roomId };
      return { ok: false, error: (fallbackData.error ?? errMsg) || "채팅방 생성에 실패했습니다." };
    }
    return { ok: false, error: errMsg || "채팅방 생성에 실패했습니다." };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방 생성에 실패했습니다." };
  }
}
