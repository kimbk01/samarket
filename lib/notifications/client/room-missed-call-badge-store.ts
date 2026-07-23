/**
 * Client map: roomId → unread missed_call event count (room-attached only).
 * Fed from badge-count `missedCallByRoom`; cleared on room mark_read / missed-call-read.
 */
"use client";

let byRoom: Readonly<Record<string, number>> = Object.freeze({});
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getRoomMissedCallBadgeCount(roomId: string | null | undefined): number {
  const id = roomId?.trim();
  if (!id) return 0;
  return Math.max(0, Math.floor(Number(byRoom[id]) || 0));
}

export function getRoomMissedCallBadgeByRoomSnapshot(): Readonly<Record<string, number>> {
  return byRoom;
}

export function publishRoomMissedCallBadgeByRoom(next: Record<string, number> | null | undefined): void {
  const normalized: Record<string, number> = {};
  if (next && typeof next === "object") {
    for (const [k, v] of Object.entries(next)) {
      const id = k.trim();
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (id && n > 0) normalized[id] = n;
    }
  }
  const prevKeys = Object.keys(byRoom);
  const nextKeys = Object.keys(normalized);
  if (
    prevKeys.length === nextKeys.length &&
    nextKeys.every((k) => byRoom[k] === normalized[k])
  ) {
    return;
  }
  byRoom = Object.freeze(normalized);
  emit();
}

/** Optimistic clear after room Atomic Read / missed-call-read success. */
export function clearRoomMissedCallBadge(roomId: string | null | undefined): void {
  const id = roomId?.trim();
  if (!id || !(id in byRoom)) return;
  const next = { ...byRoom };
  delete next[id];
  byRoom = Object.freeze(next);
  emit();
}

export function subscribeRoomMissedCallBadge(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Test helper */
export function __resetRoomMissedCallBadgeStoreForTests(): void {
  byRoom = Object.freeze({});
  listeners.clear();
}
