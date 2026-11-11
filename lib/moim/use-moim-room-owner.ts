"use client";

import { useEffect, useState } from "react";

/**
 * 메신저 방이 모임 방인지 (GET /api/moim/rooms). 세션 동안 방별로 한 번만 묻고(없음도 기억), 여러 방은 한 요청으로 묶는다.
 * 채팅 목록 핫 경로를 막지 않도록 화면이 그려진 뒤 조용히 채운다.
 */
export type MoimRoomOwner = { moimId: string; kind: "moim" | "schedule"; moimName: string };

const cache = new Map<string, MoimRoomOwner | null>();
const listeners = new Set<() => void>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const ids = [...pending].filter((id) => !cache.has(id));
  pending = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    void fetch(`/api/moim/rooms?ids=${chunk.join(",")}`, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ok?: boolean; owners?: Record<string, MoimRoomOwner> } | null) => {
        if (!data?.ok) return;
        for (const id of chunk) cache.set(id, data.owners?.[id] ?? null);
        listeners.forEach((l) => l());
      })
      .catch(() => undefined);
  }
}

function request(ids: string[]) {
  let added = false;
  for (const id of ids) {
    if (id && !cache.has(id) && !pending.has(id)) {
      pending.add(id);
      added = true;
    }
  }
  if (added && !timer) timer = setTimeout(flush, 120);
}

export function peekMoimRoomOwner(roomId: string | null | undefined): MoimRoomOwner | null {
  return roomId ? cache.get(roomId) ?? null : null;
}

export function useMoimRoomOwners(roomIds: readonly string[]): Record<string, MoimRoomOwner> {
  const [, setTick] = useState(0);
  const key = roomIds.join(",");
  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    request(key ? key.split(",") : []);
    return () => {
      listeners.delete(l);
    };
  }, [key]);
  const out: Record<string, MoimRoomOwner> = {};
  for (const id of roomIds) {
    const v = cache.get(id);
    if (v) out[id] = v;
  }
  return out;
}

export function useMoimRoomOwner(roomId: string | null | undefined): MoimRoomOwner | null {
  const owners = useMoimRoomOwners(roomId ? [roomId] : []);
  return roomId ? owners[roomId] ?? null : null;
}
