"use client";

import { create } from "zustand";

type TypingEntry = {
  roomId: string;
  userId: string;
  expiresAt: number;
};

type TypingState = {
  byRoomId: Record<string, Record<string, TypingEntry>>;
  setTyping: (roomId: string, userId: string, ttlMs: number) => void;
  clearTyping: (roomId: string, userId: string) => void;
  clearExpired: (now?: number) => void;
};

/**
 * 만료 항목 제거 — **바뀐 것이 없으면 같은 state 객체를 그대로 반환**한다(P-1).
 * zustand `set` 은 같은 참조를 받으면 구독자에게 알리지 않으므로 1.5초 prune 이 렌더를 만들지 않는다.
 * 바뀐 방만 새 객체로 교체하고 나머지 방 버킷은 참조를 유지한다.
 */
export function pruneExpiredTypingState<S extends { byRoomId: TypingState["byRoomId"] }>(state: S, now: number): S {
  let next: TypingState["byRoomId"] | null = null;
  for (const [roomId, entries] of Object.entries(state.byRoomId)) {
    let kept: Record<string, TypingEntry> | null = null;
    for (const [uid, entry] of Object.entries(entries)) {
      if (entry.expiresAt > now) {
        if (kept) kept[uid] = entry;
        continue;
      }
      if (!kept) {
        kept = {};
        for (const [prevUid, prevEntry] of Object.entries(entries)) {
          if (prevUid === uid) break;
          kept[prevUid] = prevEntry;
        }
      }
    }
    if (kept) {
      if (!next) next = { ...state.byRoomId };
      next[roomId] = kept;
    }
  }
  return next ? { ...state, byRoomId: next } : state;
}

/**
 * 현재 방의 타이핑 중인 상대 id 목록을 **원시 문자열 키**로 반환 — selector 로 쓰면 다른 방·무변경 갱신에 렌더하지 않는다.
 * `peerUserId` 가 있으면(1:1) 그 사람만, 없으면 viewer 를 뺀 전원. 구분자는 `\n`.
 */
export const TYPING_PEER_IDS_KEY_SEPARATOR = "\n";

export function selectTypingPeerIdsKey(
  byRoomId: TypingState["byRoomId"],
  args: { roomId: string; viewerUserId: string; peerUserId?: string | null; now?: number }
): string {
  const roomId = String(args.roomId ?? "").trim().toLowerCase();
  const viewerId = String(args.viewerUserId ?? "").trim();
  if (!roomId || !viewerId) return "";
  const now = args.now ?? Date.now();
  const bucket = byRoomId[roomId];
  if (!bucket) return "";
  const peerUserId = String(args.peerUserId ?? "").trim();
  if (peerUserId) {
    const entry = bucket[peerUserId];
    return entry && entry.expiresAt > now ? peerUserId : "";
  }
  const ids: string[] = [];
  for (const [userId, entry] of Object.entries(bucket)) {
    if (userId === viewerId) continue;
    if (entry.expiresAt > now) ids.push(userId);
  }
  return ids.join(TYPING_PEER_IDS_KEY_SEPARATOR);
}

export const useMessengerTypingStore = create<TypingState>((set) => ({
  byRoomId: {},
  setTyping: (roomId, userId, ttlMs) =>
    set((state) => {
      const rid = String(roomId ?? "").trim().toLowerCase();
      const uid = String(userId ?? "").trim();
      if (!rid || !uid) return state;
      const room = state.byRoomId[rid] ?? {};
      return {
        byRoomId: {
          ...state.byRoomId,
          [rid]: {
            ...room,
            [uid]: {
              roomId: rid,
              userId: uid,
              expiresAt: Date.now() + Math.max(500, ttlMs),
            },
          },
        },
      };
    }),
  clearTyping: (roomId, userId) =>
    set((state) => {
      const rid = String(roomId ?? "").trim().toLowerCase();
      const uid = String(userId ?? "").trim();
      if (!rid || !uid) return state;
      const current = state.byRoomId[rid];
      if (!current || !(uid in current)) return state;
      const room = { ...current };
      delete room[uid];
      return {
        byRoomId: {
          ...state.byRoomId,
          [rid]: room,
        },
      };
    }),
  clearExpired: (now = Date.now()) => set((state) => pruneExpiredTypingState(state, now)),
}));

export function resetMessengerTypingStore(): void {
  useMessengerTypingStore.setState({ byRoomId: {} });
}
