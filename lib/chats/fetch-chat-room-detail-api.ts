"use client";

import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { ChatRoom } from "@/lib/types/chat";

type FetchRoomResult =
  | { ok: true; room: ChatRoom; cache: "memory" | "network" }
  | { ok: false; status: number; code: "not_found" | "auth" | "load_failed" | "network" };

/** 짧은 TTL은 재진입·탭 복귀 시 동일 방 중복 요청을 유발 — 체감 지연 완화를 위해 완화 */
const ROOM_DETAIL_TTL_MS = 30_000;
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
    return { ok: true, room: cached.room, cache: "memory" };
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
      roomDetailCache.set(key, { at: Date.now(), room: j });
      return { ok: true, room: j, cache: "network" } as const;
    } catch {
      return { ok: false, status: 0, code: "network" as const };
    }
  });
}
