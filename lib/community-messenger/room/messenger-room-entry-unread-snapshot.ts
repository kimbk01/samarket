/**
 * Room-entry unread snapshot for initial anchor continuity.
 *
 * CONTRACT:
 * - Capture list `room.unreadCount` once per room entry session (before/despite optimistic list clear).
 * - `entryUnreadCount` is not the FAB/live unread authority.
 * - Clear when canonical remaining unread reaches zero or the session leaves.
 * - Never share across rooms; never recreate while active.
 */

import { create } from "zustand";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";

export type MessengerRoomEntryUnreadSnapshot = {
  roomId: string;
  entryUnreadCount: number;
  firstUnreadMessageId: string | null;
  cleared: boolean;
  capturedAt: number;
};

type State = {
  byRoom: Record<string, MessengerRoomEntryUnreadSnapshot>;
  /**
   * Capture once while unreadCount > 0. Ignores 0. Does not overwrite an active (uncleared) snapshot.
   */
  capture: (input: {
    roomId: string;
    unreadCount: number;
    firstUnreadMessageId?: string | null;
  }) => MessengerRoomEntryUnreadSnapshot | null;
  clear: (roomId: string, reason?: string) => void;
  clearRoom: (roomId: string) => void;
  getActive: (roomId: string) => MessengerRoomEntryUnreadSnapshot | null;
  getEntryUnreadCount: (roomId: string) => number;
  getFirstUnreadMessageId: (roomId: string) => string | null;
};

export const useMessengerRoomEntryUnreadStore = create<State>((set, get) => ({
  byRoom: {},

  capture: (input) => {
    const roomId = input.roomId.trim();
    if (!roomId) return null;
    const unread = Math.max(0, Math.floor(Number(input.unreadCount) || 0));
    const nextFirstRaw =
      typeof input.firstUnreadMessageId === "string" ? input.firstUnreadMessageId.trim() : "";
    const prev = get().byRoom[roomId];

    /** firstUnread-only patch when list unread already cleared but snapshot is active */
    if (unread <= 0) {
      if (prev && !prev.cleared && prev.entryUnreadCount > 0 && nextFirstRaw) {
        if (nextFirstRaw !== prev.firstUnreadMessageId) {
          const merged: MessengerRoomEntryUnreadSnapshot = {
            ...prev,
            firstUnreadMessageId: nextFirstRaw,
          };
          set((s) => ({ byRoom: { ...s.byRoom, [roomId]: merged } }));
          return merged;
        }
      }
      return null;
    }

    if (prev && !prev.cleared && prev.entryUnreadCount > 0) {
      /** Active session — keep first capture; optionally fill missing firstUnread id */
      if (nextFirstRaw && nextFirstRaw !== prev.firstUnreadMessageId) {
        const merged: MessengerRoomEntryUnreadSnapshot = {
          ...prev,
          firstUnreadMessageId: nextFirstRaw,
        };
        set((s) => ({ byRoom: { ...s.byRoom, [roomId]: merged } }));
        return merged;
      }
      return prev;
    }

    const snap: MessengerRoomEntryUnreadSnapshot = {
      roomId,
      entryUnreadCount: unread,
      firstUnreadMessageId: nextFirstRaw || null,
      cleared: false,
      capturedAt: Date.now(),
    };
    set((s) => ({ byRoom: { ...s.byRoom, [roomId]: snap } }));
    /**
     * Avoid stale at-bottom from a prior visit clearing the FAB on the same tick
     * as first-unread entry (before the user reaches latest).
     */
    useMessengerRoomReaderStateStore.getState().setScrollPosition(roomId, "reading-history");
    return snap;
  },

  clear: (roomId, _reason) => {
    const id = roomId.trim();
    if (!id) return;
    const prev = get().byRoom[id];
    if (!prev || prev.cleared) return;
    set((s) => ({
      byRoom: {
        ...s.byRoom,
        [id]: { ...prev, cleared: true, entryUnreadCount: 0 },
      },
    }));
  },

  clearRoom: (roomId) => {
    const id = roomId.trim();
    if (!id) return;
    set((s) => {
      if (!s.byRoom[id]) return s;
      const next = { ...s.byRoom };
      delete next[id];
      return { byRoom: next };
    });
  },

  getActive: (roomId) => {
    const id = roomId.trim();
    if (!id) return null;
    const snap = get().byRoom[id];
    if (!snap || snap.cleared || snap.entryUnreadCount <= 0) return null;
    return snap;
  },

  getEntryUnreadCount: (roomId) => get().getActive(roomId)?.entryUnreadCount ?? 0,

  getFirstUnreadMessageId: (roomId) => get().getActive(roomId)?.firstUnreadMessageId ?? null,
}));

export function captureMessengerRoomEntryUnread(input: {
  roomId: string;
  unreadCount: number;
  firstUnreadMessageId?: string | null;
}): MessengerRoomEntryUnreadSnapshot | null {
  return useMessengerRoomEntryUnreadStore.getState().capture(input);
}

export function clearMessengerRoomEntryUnread(roomId: string, reason?: string): void {
  useMessengerRoomEntryUnreadStore.getState().clear(roomId, reason);
}

export function clearMessengerRoomEntryUnreadSession(roomId: string): void {
  useMessengerRoomEntryUnreadStore.getState().clearRoom(roomId);
}

export function peekMessengerRoomEntryUnreadCount(roomId: string): number {
  return useMessengerRoomEntryUnreadStore.getState().getEntryUnreadCount(roomId);
}

export function peekMessengerRoomEntryFirstUnreadId(roomId: string): string | null {
  return useMessengerRoomEntryUnreadStore.getState().getFirstUnreadMessageId(roomId);
}

/** @internal tests */
export function __resetMessengerRoomEntryUnreadStoreForTest(): void {
  useMessengerRoomEntryUnreadStore.setState({ byRoom: {} });
}
