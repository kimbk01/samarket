import type { CmScrollOwnerReason } from "@/lib/community-messenger/room/messenger-room-entry-scroll-owner";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export const MESSENGER_ROOM_ENTRY_QUERY = "entry";
export const MESSENGER_ROOM_ENTRY_PUSH = "push";

export type MessengerRoomEntryIntent = "push" | "default";

export type MessengerRoomEntryScrollPlan = {
  reason: CmScrollOwnerReason;
  clearPersist: boolean;
  forceBottom: boolean;
  /** unread boundary / last-read — restoreSnapshot firstVisibleMessageId */
  anchorMessageId?: string | null;
};

const PUSH_INTENT_STORAGE_KEY = "samarket:cm:push_entry_intent.v1";
const PUSH_INTENT_TTL_MS = 30_000;

const ROOM_ENTRY_INTENT_STORAGE_KEY = "samarket:cm:room_entry_intent.v1";
const ROOM_ENTRY_INTENT_TTL_MS = 20_000;

/** Tip already landed (latest entry / leave-at-bottom) — survives hard re-entry via sessionStorage */
const ROOM_TIP_ENTRY_CONSUMED_KEY = "samarket:cm:room_tip_entry_consumed.v1";
const ROOM_TIP_ENTRY_CONSUMED_TTL_MS = 10 * 60_000;

type TipEntryConsumedRow = { roomId: string; tipMessageId: string; at: number };

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

function readTipEntryConsumedRow(): TipEntryConsumedRow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ROOM_TIP_ENTRY_CONSUMED_KEY);
    if (!raw) return null;
    const row = JSON.parse(raw) as TipEntryConsumedRow;
    const roomId = typeof row?.roomId === "string" ? row.roomId.trim() : "";
    const tipMessageId = typeof row?.tipMessageId === "string" ? row.tipMessageId.trim() : "";
    const at = Number(row?.at);
    if (!roomId || !tipMessageId || !Number.isFinite(at)) return null;
    if (nowMs() - at > ROOM_TIP_ENTRY_CONSUMED_TTL_MS) {
      sessionStorage.removeItem(ROOM_TIP_ENTRY_CONSUMED_KEY);
      return null;
    }
    return { roomId, tipMessageId, at };
  } catch {
    return null;
  }
}

/**
 * Mark timeline tip as already consumed by an entry/leave-at-latest session.
 * Survives hard navigation (sessionStorage) so re-entry does not revive stale first-unread.
 */
export function markMessengerRoomTimelineTipEntryConsumed(
  roomId: string,
  tipMessageId: string
): void {
  if (typeof window === "undefined") return;
  const rid = String(roomId ?? "").trim();
  const tip = String(tipMessageId ?? "").trim();
  if (!rid || !tip) return;
  const row: TipEntryConsumedRow = { roomId: rid, tipMessageId: tip, at: nowMs() };
  try {
    sessionStorage.setItem(ROOM_TIP_ENTRY_CONSUMED_KEY, JSON.stringify(row));
  } catch {
    /* ignore */
  }
}

/** True when this room's current tip was already landed in a prior visit this tab session. */
export function isMessengerRoomTimelineTipEntryConsumed(
  roomId: string,
  tipMessageId: string | null | undefined
): boolean {
  const rid = String(roomId ?? "").trim();
  const tip = typeof tipMessageId === "string" ? tipMessageId.trim() : "";
  if (!rid || !tip) return false;
  const row = readTipEntryConsumedRow();
  return Boolean(row && row.roomId === rid && row.tipMessageId === tip);
}

export function clearMessengerRoomTimelineTipEntryConsumed(roomId?: string): void {
  if (typeof window === "undefined") return;
  const id = roomId?.trim();
  if (id) {
    const row = readTipEntryConsumedRow();
    if (!row || row.roomId !== id) return;
  }
  try {
    sessionStorage.removeItem(ROOM_TIP_ENTRY_CONSUMED_KEY);
  } catch {
    /* ignore */
  }
}

export type MessengerRoomEntryScrollPlanInput = {
  intent: MessengerRoomEntryIntent;
  /**
   * Legacy peek flag — **ignored for default list-tap re-entry**.
   * Persist restore must not override Enter policy (latest / first-unread).
   */
  hasPersisted: boolean;
  unreadCount?: number;
  lastReadMessageId?: string | null;
  /** Resolved first unread id (message after lastRead). Prefer over lastRead. */
  firstUnreadMessageId?: string | null;
  /**
   * Newest timeline row is a peer `gift_certificate` tip.
   * When that tip is not yet consumed this tab session, land latest so the gift card is
   * in viewport (cold load has no tip-consumed; first-unread must not win over the tip).
   * Not a permanent gift-only hack: tipEntryConsumed clears this path.
   */
  newestPeerGiftCertificate?: boolean;
  /**
   * Timeline tip was already consumed (prior latest entry / leave-at-bottom).
   * Stale unread/first-unread must not win over latest on same-tip re-entry.
   */
  tipEntryConsumed?: boolean;
};

/**
 * Enter = sole scroll policy decision (Telegram benchmark contract):
 * - push → latest above composer
 * - tip already consumed → latest (ignore stale unread/first-unread)
 * - unconsumed newest peer gift_certificate tip → latest (cold / gift delivery land)
 * - unread + firstUnread → first-unread boundary (not force bottom, not lastRead itself)
 * - else → latest above composer
 */
export function resolveMessengerRoomEntryScrollPlan(
  input: MessengerRoomEntryScrollPlanInput
): MessengerRoomEntryScrollPlan {
  void input.hasPersisted;
  if (input.intent === "push") {
    return {
      reason: "push_entry_initial_load",
      clearPersist: true,
      forceBottom: true,
    };
  }
  const unreadRaw = Math.max(0, Number(input.unreadCount) || 0);
  /** Same tip already seen this session — do not revive stale first-unread restore. */
  const unread = input.tipEntryConsumed ? 0 : unreadRaw;
  /**
   * Unconsumed peer gift tip (cold session has no tip-consumed): land latest.
   * Consumed tip falls through — normal unread / latest policy applies.
   */
  if (!input.tipEntryConsumed && input.newestPeerGiftCertificate) {
    return {
      reason: "initial_load",
      clearPersist: true,
      forceBottom: true,
      anchorMessageId: null,
    };
  }
  const firstUnread =
    typeof input.firstUnreadMessageId === "string" ? input.firstUnreadMessageId.trim() : "";
  if (unread > 0 && firstUnread) {
    return {
      reason: "room_entry_restore",
      clearPersist: true,
      forceBottom: false,
      anchorMessageId: firstUnread,
    };
  }
  /** unread>0 but firstUnread unresolved — do not force latest bottom; wait/correct without faking lastRead */
  if (unread > 0) {
    return {
      reason: "room_entry_restore",
      clearPersist: true,
      forceBottom: false,
      anchorMessageId: null,
    };
  }
  return {
    reason: "initial_load",
    clearPersist: true,
    forceBottom: true,
    anchorMessageId: null,
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
  clearMessengerRoomTimelineTipEntryConsumed();
}
