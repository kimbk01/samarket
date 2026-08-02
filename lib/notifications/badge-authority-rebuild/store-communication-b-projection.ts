/**
 * Slice 2-4 — Store Communication B_store projection (pure).
 *
 * B_store = OwnerChatUnreadRoomCount(storeId)
 * identity = store:{storeId}
 *
 * DO NOT sum all stores.
 * DO NOT use owner userId as store identity.
 * DO NOT include customer rooms, C_store ops, Bell, Member App Icon, Bottom, Customer Hub.
 * Native / FCM = Slice 2-6 — do not import android/ios/push here.
 */
import { storeBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";
import {
  asUnreadRoomCount,
  asUnreadMessageCount,
  type UnreadRoomCount,
  type UnreadMessageCount,
} from "@/lib/notifications/badge-authority-rebuild/badge-count-units";
import { authorityAllowsSurface } from "@/lib/notifications/badge-authority-rebuild/badge-surface-eligibility";

export const STORE_COMMUNICATION_B_PROJECTION =
  "store_communication_b_projection_v1" as const;

export type StoreCommunicationStoreBucket = Readonly<{
  storeId: string;
  identityKey: `store:${string}`;
  /** Unread order-chat rooms for this store only. */
  unreadRoomCount: UnreadRoomCount;
  /** roomId → unread message count (row badge). */
  roomUnreadMessageCounts: Readonly<Record<string, number>>;
}>;

export type StoreCommunicationBProjection = Readonly<{
  authority: typeof STORE_COMMUNICATION_B_PROJECTION;
  byStoreId: Readonly<Record<string, StoreCommunicationStoreBucket>>;
}>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Resolve Hub/FAB digit for one active store.
 * Missing / empty activeStoreId → 0 (never invent another store).
 */
export function resolveOwnerChatUnreadRoomCountForStore(
  byStoreId: Readonly<Record<string, number>> | null | undefined,
  activeStoreId: string | null | undefined
): UnreadRoomCount {
  const sid = trim(activeStoreId);
  if (!sid) return asUnreadRoomCount(0);
  const id = storeBadgeIdentity(sid);
  if (!id.ok || id.identity.scope !== "store") return asUnreadRoomCount(0);
  const raw = byStoreId?.[id.identity.storeId];
  return asUnreadRoomCount(nonNeg(raw));
}

/** Row badge — unread messages in one owner order-chat room. */
export function resolveOwnerRoomUnreadMessageCount(
  roomUnreadMessageCounts: Readonly<Record<string, number>> | null | undefined,
  roomId: string
): UnreadMessageCount {
  const rid = trim(roomId);
  if (!rid) return asUnreadMessageCount(0);
  return asUnreadMessageCount(nonNeg(roomUnreadMessageCounts?.[rid]));
}

/**
 * Forbid all-store sum as Hub/FAB authority.
 * Returns null when callers must not use a total; use per-store resolve instead.
 */
export function forbidAllStoreOwnerChatSum(_byStoreId: Readonly<Record<string, number>>): null {
  return null;
}

/**
 * Build per-store B_store bags from participant facts.
 *
 * - `ownerOrderUnreadByStoreId` values must be unread **room** counts (KEEP from partition).
 * - `ownerRoomIdsByStoreId` + `rowUnreadByRoomId` optional for row message maps.
 * - Customer rooms must not appear in owner room maps.
 */
export function deriveStoreCommunicationProjection(input: {
  ownerOrderUnreadByStoreId: Readonly<Record<string, number>>;
  /** Optional: storeId → canonical owner room ids (deduped). */
  ownerRoomIdsByStoreId?: Readonly<Record<string, readonly string[]>>;
  /** Optional: roomId → message unread (owner rows only). */
  rowUnreadByRoomId?: Readonly<Record<string, number>>;
}): StoreCommunicationBProjection {
  const byStoreId: Record<string, StoreCommunicationStoreBucket> = {};
  const roomMap = input.rowUnreadByRoomId ?? {};
  const roomsByStore = input.ownerRoomIdsByStoreId ?? {};

  for (const [rawStoreId, roomCount] of Object.entries(input.ownerOrderUnreadByStoreId ?? {})) {
    const id = storeBadgeIdentity(rawStoreId);
    if (!id.ok || id.identity.scope !== "store") continue;
    const storeId = id.identity.storeId;
    const identityKey = id.identity.key;
    const roomIds = roomsByStore[storeId] ?? roomsByStore[rawStoreId] ?? [];
    const seen = new Set<string>();
    const roomUnreadMessageCounts: Record<string, number> = {};
    for (const roomId of roomIds) {
      const rid = trim(roomId);
      if (!rid || seen.has(rid)) continue;
      seen.add(rid);
      const msg = nonNeg(roomMap[rid]);
      if (msg > 0) roomUnreadMessageCounts[rid] = msg;
    }
    byStoreId[storeId] = {
      storeId,
      identityKey,
      unreadRoomCount: asUnreadRoomCount(nonNeg(roomCount)),
      roomUnreadMessageCounts,
    };
  }

  return {
    authority: STORE_COMMUNICATION_B_PROJECTION,
    byStoreId,
  };
}

/** Active-store Hub/FAB digit from full projection. */
export function resolveOwnerHubFabChatBadgeFromProjection(
  projection: StoreCommunicationBProjection,
  activeStoreId: string | null | undefined
): UnreadRoomCount {
  const sid = trim(activeStoreId);
  if (!sid) return asUnreadRoomCount(0);
  const bucket = projection.byStoreId[sid] ?? projection.byStoreId[trim(activeStoreId)];
  if (!bucket) return asUnreadRoomCount(0);
  return bucket.unreadRoomCount;
}

/** Static gate helper — B_store must not be eligible for member surfaces. */
export function assertBStoreExcludedFromMemberSurfaces(): boolean {
  return (
    !authorityAllowsSurface("B_STORE_COMMUNICATION", "MEMBER_BELL") &&
    !authorityAllowsSurface("B_STORE_COMMUNICATION", "MEMBER_APP_ICON") &&
    !authorityAllowsSurface("B_STORE_COMMUNICATION", "BOTTOM_CHAT") &&
    !authorityAllowsSurface("B_STORE_COMMUNICATION", "CUSTOMER_ORDER_HUB") &&
    !authorityAllowsSurface("B_STORE_COMMUNICATION", "NATIVE_MEMBER_APP_ICON") &&
    authorityAllowsSurface("B_STORE_COMMUNICATION", "OWNER_CHAT_SURFACE") &&
    authorityAllowsSurface("B_STORE_COMMUNICATION", "OWNER_STORE_ORDER_ROW")
  );
}
