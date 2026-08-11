"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { PHONE_VERIFICATION_REQUIRED_MESSAGE } from "@/lib/auth/member-access";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import { warmChatRoomEntryById } from "@/lib/chats/prewarm-chat-room-route";
import { scheduleTradeHubRoomRoutePrefetch } from "@/lib/chats/trade-chat-room-route-prefetch";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  recordTradeChatDuplicateRoomGuardMs,
  recordTradeChatRouteCompileMs,
  recordTradeC2CMetricMs,
} from "@/lib/trade/trade-c2c-perf-metrics";
import { noteTradeChatEntryJourneyMilestone } from "@/lib/trade/trade-chat-entry-journey-perf";
import type { ChatRoomSource } from "@/lib/types/chat";

const CHAT_ROOM_CACHE_TTL_MS = 60_000;
const ITEM_ROOM_CACHE_MAX_KEYS = 80;
const itemRoomCache = new Map<
  string,
  { roomId: string; messengerRoomId?: string; source: ChatRoomSource; expiresAt: number }
>();

/** 동일 상품·동일 사용자에 대한 진행 중 요청 — 탭·선행 준비가 같은 Promise 를 공유 */
const inflightByUserProduct = new Map<string, Promise<CreateOrGetChatRoomResult>>();

export type CreateOrGetChatRoomResult =
  | { ok: true; roomId: string; roomSource: ChatRoomSource; messengerRoomId?: string }
  | { ok: false; error: string };

function inflightKey(userId: string, productId: string): string {
  return `${userId}:${productId.trim()}:reuse`;
}

/**
 * 채팅 버튼에 포인터가 잠시 머물 때 선행 호출 — 실제 탭 시 같은 요청(inflight)을 재사용해 체감 지연을 줄인다.
 * (짧은 호버만으로는 타이머로 실행하지 않음 — PostDetailView 쪽에서 디바운스)
 */
export function prepareTradeChatRoom(productId: string): void {
  const user = getCurrentUser();
  if (!user?.id) return;
  if (!hasVerifiedPhone(user)) {
    return;
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
 * - 상품이 바뀌면 다른 방(친구 관계와 무관)
 * - POST /api/trade/chat/entry/resolve 단일 계약 → 서버가 item/start + 레거시 product_chats 폴백 처리
 */
function tClient(key: Parameters<typeof safeTranslate>[1], fallbacks?: { fallbackKo?: string; fallbackEn?: string }): string {
  return safeTranslate(getRuntimeAppLanguage(), key, fallbacks);
}

export async function createOrGetChatRoom(
  productId: string
): Promise<CreateOrGetChatRoomResult> {
  const user = getCurrentUser();
  if (!user?.id) {
    return { ok: false, error: tClient("common_login_required") };
  }
  if (!hasVerifiedPhone(user)) {
    return {
      ok: false,
      error: tClient("auth_phone_gate_requirement", {
        fallbackKo: PHONE_VERIFICATION_REQUIRED_MESSAGE,
        fallbackEn: PHONE_VERIFICATION_REQUIRED_MESSAGE,
      }),
    };
  }

  const key = inflightKey(user.id, productId);
  pruneByExpiresAtAndMaxSize(itemRoomCache, Date.now(), ITEM_ROOM_CACHE_MAX_KEYS);
  const cached = itemRoomCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
    const guardT0 = performance.now();
    warmChatRoomEntryById(cached.roomId, cached.source);
    scheduleTradeHubRoomRoutePrefetch({
      roomId: cached.roomId,
      messengerRoomId: cached.messengerRoomId,
      roomSource: cached.source,
    });
    recordTradeChatDuplicateRoomGuardMs(performance.now() - guardT0);
    return {
      ok: true,
      roomId: cached.roomId,
      roomSource: cached.source,
      ...(cached.messengerRoomId ? { messengerRoomId: cached.messengerRoomId } : {}),
    };
  }

  const running = inflightByUserProduct.get(key);
  if (running) {
    recordTradeChatDuplicateRoomGuardMs(0);
    return running;
  }

  const p = executeTradeChatStart(productId, key).finally(() => {
    inflightByUserProduct.delete(key);
  });
  inflightByUserProduct.set(key, p);
  return p;
}

async function executeTradeChatStart(
  productId: string,
  cacheKey: string
): Promise<CreateOrGetChatRoomResult> {
  try {
    noteTradeChatEntryJourneyMilestone("resolve_fetch_start");
    const tResolve0 = performance.now();
    const res = await fetch("/api/trade/chat/entry/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
      }),
    });
    const resolveMs = Math.round(performance.now() - tResolve0);
    noteTradeChatEntryJourneyMilestone("resolve_fetch_done");
    recordTradeC2CMetricMs("trade_chat_resolve_fetch_ms", resolveMs);
    const compileHdr = res.headers.get("x-samarket-dev-compile-ms") ?? res.headers.get("x-samarket-compile-ms");
    const compileMs = compileHdr != null ? Number(compileHdr) : NaN;
    if (Number.isFinite(compileMs) && compileMs >= 0) {
      recordTradeChatRouteCompileMs(compileMs);
    }
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
      pruneByExpiresAtAndMaxSize(itemRoomCache, Date.now(), ITEM_ROOM_CACHE_MAX_KEYS);
      warmChatRoomEntryById(chatRoomId, source);
      scheduleTradeHubRoomRoutePrefetch({
        roomId: chatRoomId,
        messengerRoomId: messengerId,
        roomSource: source,
      });
      return {
        ok: true,
        roomId: chatRoomId,
        roomSource: source,
        ...(messengerId ? { messengerRoomId: messengerId } : {}),
      };
    }
    const fallback = tClient("chats_compose_create_failed");
    return { ok: false, error: data.error?.trim() || fallback };
  } catch (e) {
    const msg = (e as Error)?.message?.trim();
    return { ok: false, error: msg || tClient("chats_compose_create_failed") };
  }
}

/** 로그아웃·계정 전환 — 거래 채팅방 클라이언트 캐시·inflight 제거 */
export function clearTradeChatRoomClientCache(): void {
  itemRoomCache.clear();
  inflightByUserProduct.clear();
}
