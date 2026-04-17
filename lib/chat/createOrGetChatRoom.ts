"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import {
  PHONE_VERIFICATION_REQUIRED_MESSAGE,
  bypassesPhilippinePhoneVerificationGate,
} from "@/lib/auth/member-access";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import type { ChatRoomSource } from "@/lib/types/chat";

const CHAT_ROOM_CACHE_TTL_MS = 60_000;
const itemRoomCache = new Map<
  string,
  { roomId: string; messengerRoomId?: string; source: ChatRoomSource; expiresAt: number }
>();

/** 동일 상품·동일 사용자에 대한 진행 중 요청 — 탭·선행 준비가 같은 Promise 를 공유 */
const inflightByUserProduct = new Map<string, Promise<CreateOrGetChatRoomResult>>();

export type CreateOrGetChatRoomResult =
  | { ok: true; roomId: string; roomSource: ChatRoomSource; messengerRoomId?: string }
  | { ok: false; error: string };

function inflightKey(userId: string, productId: string, forceNewThread?: boolean): string {
  return `${userId}:${productId.trim()}:${forceNewThread ? "new" : "reuse"}`;
}

/**
 * 채팅 버튼에 포인터가 잠시 머물 때 선행 호출 — 실제 탭 시 같은 요청(inflight)을 재사용해 체감 지연을 줄인다.
 * (짧은 호버만으로는 타이머로 실행하지 않음 — PostDetailView 쪽에서 디바운스)
 */
export function prepareTradeChatRoom(productId: string): void {
  const user = getCurrentUser();
  if (!user?.id) return;
  if (user.phone_verified === false) {
    if (
      !bypassesPhilippinePhoneVerificationGate({
        role: user.role,
        phone_verified: false,
        auth_provider: user.auth_provider,
        email: user.email,
      })
    ) {
      return;
    }
  }
  const key = inflightKey(user.id, productId);
  for (const [k, entry] of itemRoomCache) {
    if (entry.expiresAt <= Date.now()) itemRoomCache.delete(k);
  }
  if (itemRoomCache.get(key) && itemRoomCache.get(key)!.expiresAt > Date.now()) return;
  if (inflightByUserProduct.has(key)) return;
  void createOrGetChatRoom(productId);
}

/**
 * 당근형 거래 채팅: 채팅방 생성 또는 기존 방 반환
 * - 동일 **상품(post id)** + 판매자 + 구매자 → 기본은 최근 `item_trade` 방 재사용(reopen)
 * - `forceNewThread: true` → 동일 쌍이라도 **새 `item_trade` 행** (추가 문의 스레드)
 * - 상품이 바뀌면 다른 방(친구 관계와 무관)
 * - POST /api/trade/chat/entry/resolve 단일 계약 → 서버가 item/start + 레거시 product_chats 폴백 처리
 */
export async function createOrGetChatRoom(
  productId: string,
  opts?: { forceNewThread?: boolean }
): Promise<CreateOrGetChatRoomResult> {
  const user = getCurrentUser();
  if (!user?.id) return { ok: false, error: "로그인이 필요합니다." };
  if (user.phone_verified === false) {
    if (
      !bypassesPhilippinePhoneVerificationGate({
        role: user.role,
        phone_verified: false,
        auth_provider: user.auth_provider,
        email: user.email,
      })
    ) {
      return { ok: false, error: PHONE_VERIFICATION_REQUIRED_MESSAGE };
    }
  }

  const forceNewThread = opts?.forceNewThread === true;
  const key = inflightKey(user.id, productId, forceNewThread);
  for (const [k, entry] of itemRoomCache) {
    if (entry.expiresAt <= Date.now()) {
      itemRoomCache.delete(k);
    }
  }
  const cached = itemRoomCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    warmChatRoomEntryById(cached.roomId, cached.source);
    return {
      ok: true,
      roomId: cached.roomId,
      roomSource: cached.source,
      ...(cached.messengerRoomId ? { messengerRoomId: cached.messengerRoomId } : {}),
    };
  }

  const running = inflightByUserProduct.get(key);
  if (running) return running;

  const p = executeTradeChatStart(productId, key, forceNewThread).finally(() => {
    inflightByUserProduct.delete(key);
  });
  inflightByUserProduct.set(key, p);
  return p;
}

async function executeTradeChatStart(
  productId: string,
  cacheKey: string,
  forceNewThread?: boolean
): Promise<CreateOrGetChatRoomResult> {
  try {
    const res = await fetch("/api/trade/chat/entry/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        ...(forceNewThread ? { forceNewThread: true } : {}),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      roomId?: string;
      messengerRoomId?: string;
      roomSource?: ChatRoomSource;
      error?: string;
    };
    if (data.ok && data.roomId) {
      const chatRoomId = data.roomId;
      const messengerId =
        typeof data.messengerRoomId === "string" && data.messengerRoomId.trim()
          ? data.messengerRoomId.trim()
          : undefined;
      const source = data.roomSource === "product_chat" ? "product_chat" : "chat_room";
      itemRoomCache.set(cacheKey, {
        roomId: chatRoomId,
        ...(messengerId ? { messengerRoomId: messengerId } : {}),
        source,
        expiresAt: Date.now() + CHAT_ROOM_CACHE_TTL_MS,
      });
      warmChatRoomEntryById(chatRoomId, source);
      return {
        ok: true,
        roomId: chatRoomId,
        roomSource: source,
        ...(messengerId ? { messengerRoomId: messengerId } : {}),
      };
    }
    return { ok: false, error: data.error || "채팅방 생성에 실패했습니다." };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? "채팅방 생성에 실패했습니다." };
  }
}
