"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";
import { isMissingPostRowChatProductTitle } from "@/lib/chats/chat-product-from-post";
import type { ChatRoom } from "@/lib/types/chat";

type FetchRoomResult =
  | { ok: true; room: ChatRoom; cache: "memory" | "network" }
  | { ok: false; status: number; code: "not_found" | "auth" | "load_failed" | "network" };

/** 상품 카드 API 보정 후에도 이전 빈 응답이 남지 않도록 과도하게 길지 않게 */
const ROOM_DETAIL_TTL_MS = 12_000;
const roomDetailCache = new Map<string, { at: number; room: ChatRoom }>();

function isChatRoomPayload(j: unknown): j is ChatRoom {
  if (!j || typeof j !== "object") return false;
  const o = j as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.buyerId === "string" &&
    typeof o.sellerId === "string" &&
    !("error" in o && o.error != null)
  );
}

export async function fetchChatRoomDetailApi(roomId: string): Promise<FetchRoomResult> {
  const key = roomId.trim();
  if (!key) return { ok: false, status: 400, code: "load_failed" };

  const now = Date.now();
  const cached = roomDetailCache.get(key);
  if (cached && now - cached.at < ROOM_DETAIL_TTL_MS) {
    const p = cached.room.product;
    if (
      p &&
      typeof p.title === "string" &&
      typeof p.id === "string" &&
      isMissingPostRowChatProductTitle(p.title, p.id)
    ) {
      roomDetailCache.delete(key);
    } else {
      return { ok: true, room: cached.room, cache: "memory" };
    }
  }

  return runSingleFlight(`chat:room-detail:${key}`, async () => {
    try {
      const res = await fetch(`/api/chat/room/${encodeURIComponent(key)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j: unknown = await res.json().catch(() => null);
      if (res.status === 404) return { ok: false, status: 404, code: "not_found" as const };
      if (res.status === 401 || res.status === 403) return { ok: false, status: res.status, code: "auth" as const };
      if (!res.ok || !isChatRoomPayload(j)) return { ok: false, status: res.status, code: "load_failed" as const };
      const room = j as ChatRoom;
      const p = room.product;
      const isDegradedCard =
        p &&
        typeof p.title === "string" &&
        typeof p.id === "string" &&
        isMissingPostRowChatProductTitle(p.title, p.id);
      if (!isDegradedCard) {
        roomDetailCache.set(key, { at: Date.now(), room: j });
      }
      return { ok: true, room: j, cache: "network" } as const;
    } catch {
      return { ok: false, status: 0, code: "network" as const };
    }
  });
}
