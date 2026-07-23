import type { CmScrollOwnerReason } from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export const MESSENGER_ROOM_ENTRY_QUERY = "entry";
export const MESSENGER_ROOM_ENTRY_PUSH = "push";

export type MessengerRoomEntryIntent = "push" | "default";

export type MessengerRoomEntryScrollPlan = {
  reason: CmScrollOwnerReason;
  clearPersist: boolean;
  forceBottom: boolean;
};

const PUSH_INTENT_STORAGE_KEY = "samarket:cm:push_entry_intent.v1";
const PUSH_INTENT_TTL_MS = 30_000;

const ROOM_ENTRY_INTENT_STORAGE_KEY = "samarket:cm:room_entry_intent.v1";
const ROOM_ENTRY_INTENT_TTL_MS = 20_000;

type PushIntentRow = { roomId: string; at: number };
type RoomEntryIntentRow = {
  roomId: string;
  at: number;
  seed?: {
    title?: string | null;
    avatarUrl?: string | null;
    expectedDomain?: ChatDomain;
    expectedIdentityKey?: string;
  };
};

function activeRoomEntryIntent(roomId?: string): RoomEntryIntentRow | null {
  if (typeof window === "undefined") return null;
  try {
    const row = JSON.parse(sessionStorage.getItem(ROOM_ENTRY_INTENT_STORAGE_KEY) || "null") as RoomEntryIntentRow | null;
    if (!row?.roomId || !Number.isFinite(row.at) || nowMs() - row.at > ROOM_ENTRY_INTENT_TTL_MS) return null;
    const id = roomId?.trim();
    return id && row.roomId !== id ? null : row;
  } catch {
    return null;
  }
}

export function markRoomEntryIntent(roomId: string, seed?: RoomEntryIntentRow["seed"]): void {
  if (typeof window === "undefined") return;
  const id = String(roomId ?? "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(ROOM_ENTRY_INTENT_STORAGE_KEY, JSON.stringify({ roomId: id, at: nowMs(), seed }));
  } catch {
    /* ignore */
  }
}

export const getRoomEntryIntent = activeRoomEntryIntent;

export function clearRoomEntryIntent(roomId?: string): void {
  if (typeof window === "undefined") return;
  const id = roomId?.trim();
  if (id && activeRoomEntryIntent(id)?.roomId !== id) return;
  try {
    sessionStorage.removeItem(ROOM_ENTRY_INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function isRoomEntryInFlight(roomId?: string): boolean {
  return activeRoomEntryIntent(roomId) !== null;
}

function nowMs(): number {
  return Date.now();
}

function safeParsePushIntent(raw: string | null): PushIntentRow | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const row = o as Record<string, unknown>;
    const roomId = typeof row.roomId === "string" ? row.roomId.trim() : "";
    const at = Number(row.at);
    if (!roomId || !Number.isFinite(at)) return null;
    return { roomId, at };
  } catch {
    return null;
  }
}

/** `/community-messenger/rooms/:id` · `/chats/:id` */
export function parseMessengerRoomIdFromAppPath(path: string | null | undefined): string | null {
  const raw = String(path ?? "").trim();
  if (!raw.startsWith("/")) return null;
  const pathname = raw.split("?")[0]?.split("#")[0]?.trim() ?? "";
  const cm = /^\/community-messenger\/rooms\/([^/]+)/.exec(pathname);
  if (cm?.[1]) return decodeURIComponent(cm[1]).trim() || null;
  const trade = /^\/chats\/([^/]+)/.exec(pathname);
  if (trade?.[1]) return decodeURIComponent(trade[1]).trim() || null;
  return null;
}

export function isMessengerPushEntryQuery(search: string | URLSearchParams | null | undefined): boolean {
  if (!search) return false;
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : search;
  return params.get(MESSENGER_ROOM_ENTRY_QUERY)?.trim() === MESSENGER_ROOM_ENTRY_PUSH;
}

/** FCM / deeplink / OS 알림 탭 직전 — scroll controller consume 전까지 유지 */
export function markMessengerPushEntryIntent(roomId: string): void {
  if (typeof window === "undefined") return;
  const id = String(roomId ?? "").trim();
  if (!id) return;
  const row: PushIntentRow = { roomId: id, at: nowMs() };
  try {
    sessionStorage.setItem(PUSH_INTENT_STORAGE_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

/**
 * 방 mount 시 1회 — session flag 또는 `?entry=push`.
 * consume 시 session row 제거( query 는 URL 에 남겨도 scroll SSOT 는 session 우선 ).
 */
export function consumeMessengerRoomEntryIntent(
  roomId: string,
  search?: string | URLSearchParams | null
): MessengerRoomEntryIntent {
  const id = String(roomId ?? "").trim();
  if (!id) return "default";

  if (isMessengerPushEntryQuery(search ?? (typeof window !== "undefined" ? window.location.search : null))) {
    clearMessengerPushEntryIntentStorage();
    return "push";
  }

  if (typeof window === "undefined") return "default";
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PUSH_INTENT_STORAGE_KEY);
  } catch {
    return "default";
  }
  const row = safeParsePushIntent(raw);
  if (!row || row.roomId !== id) return "default";
  if (nowMs() - row.at > PUSH_INTENT_TTL_MS) {
    clearMessengerPushEntryIntentStorage();
    return "default";
  }
  clearMessengerPushEntryIntentStorage();
  return "push";
}

export function clearMessengerPushEntryIntentStorage(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PUSH_INTENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveMessengerRoomEntryScrollPlan(input: {
  intent: MessengerRoomEntryIntent;
  hasPersisted: boolean;
}): MessengerRoomEntryScrollPlan {
  if (input.intent === "push") {
    return {
      reason: "push_entry_initial_load",
      clearPersist: true,
      forceBottom: true,
    };
  }
  if (input.hasPersisted) {
    return {
      reason: "room_entry_restore",
      clearPersist: false,
      forceBottom: false,
    };
  }
  return {
    reason: "initial_load",
    clearPersist: false,
    forceBottom: true,
  };
}

/** push / deeplink navigate path — `?entry=push` append (기존 query 보존) */
export function appendMessengerPushEntryQuery(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return trimmed;
  const hashIdx = trimmed.indexOf("#");
  const pathAndQuery = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const hash = hashIdx >= 0 ? trimmed.slice(hashIdx) : "";
  const u = new URL(pathAndQuery, "https://samarket.local");
  if (u.searchParams.get(MESSENGER_ROOM_ENTRY_QUERY) === MESSENGER_ROOM_ENTRY_PUSH) {
    return `${u.pathname}${u.search}${hash}`;
  }
  u.searchParams.set(MESSENGER_ROOM_ENTRY_QUERY, MESSENGER_ROOM_ENTRY_PUSH);
  return `${u.pathname}${u.search}${hash}`;
}

export function isMessengerEntryBottomLoadReason(reason: CmScrollOwnerReason): boolean {
  return reason === "initial_load" || reason === "push_entry_initial_load";
}

export function isMessengerEntryTailSettleReason(reason: CmScrollOwnerReason): boolean {
  return reason === "entry_tail_settle" || reason === "push_entry_tail_settle";
}

export function __resetMessengerPushEntryIntentForTest(): void {
  clearMessengerPushEntryIntentStorage();
}
