/**
 * Phase 3 S2-4 — in-memory + sessionStorage tombstone IDs for soft-deleted groups.
 * DO NOT import home-list-patch here (eviction / patch layers import this).
 */
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";

const STORAGE_KEY = "cm.group_deleted_room_ids.v1";
const remembered = new Set<string>();

function trimRoomId(roomId: string): string {
  return normalizeMessengerRealtimeRoomId(roomId) || roomId.trim();
}

function storage(): Storage | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readStorage(): void {
  const s = storage();
  if (!s) return;
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      if (typeof id === "string" && id.trim()) remembered.add(trimRoomId(id));
    }
  } catch {
    /* ignore */
  }
}

function writeStorage(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORAGE_KEY, JSON.stringify([...remembered].slice(-200)));
  } catch {
    /* ignore */
  }
}

let storageHydrated = false;
function ensureHydrated(): void {
  if (storageHydrated) return;
  storageHydrated = true;
  readStorage();
}

export function rememberDeletedGroupRoomId(roomId: string): void {
  ensureHydrated();
  const rid = trimRoomId(roomId);
  if (!rid) return;
  if (remembered.has(rid)) return;
  remembered.add(rid);
  writeStorage();
}

export function isRememberedDeletedGroupRoomId(roomId: string): boolean {
  ensureHydrated();
  const rid = trimRoomId(roomId);
  if (!rid) return false;
  return remembered.has(rid);
}

export function clearDeletedGroupRoomTombstonesForTests(): void {
  remembered.clear();
  storageHydrated = true;
  const s = storage();
  if (s) {
    try {
      s.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** Strip remembered deleted rooms from bootstrap lists (merge re-insert guard). */
export function stripRememberedDeletedGroupRoomsFromBootstrap(
  bootstrap: CommunityMessengerBootstrap
): CommunityMessengerBootstrap {
  ensureHydrated();
  if (remembered.size === 0) return bootstrap;
  const drop = (rooms: CommunityMessengerBootstrap["chats"]) =>
    rooms.filter((room) => !isRememberedDeletedGroupRoomId(room.id));
  const chats = drop(bootstrap.chats ?? []);
  const groups = drop(bootstrap.groups ?? []);
  if (chats.length === (bootstrap.chats ?? []).length && groups.length === (bootstrap.groups ?? []).length) {
    return bootstrap;
  }
  return {
    ...bootstrap,
    chats,
    groups,
    tabs: {
      ...bootstrap.tabs,
      chats: chats.length,
      groups: groups.length,
    },
  };
}
