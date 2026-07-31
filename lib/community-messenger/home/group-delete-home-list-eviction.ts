/**
 * Phase 3 S2-4 — Group Delete list eviction (client).
 *
 * CONTRACT:
 * - Soft-delete Hub eviction uses canonical `remove_room` only (no CSS hide, no reload).
 * - Session tombstone set blocks home_sync/bootstrap merge + tip projection from re-inserting
 *   rooms the server already excludes (partial snapshots keep previous-only rows by design).
 * - Leave ≠ Delete: leave must NOT write this tombstone set.
 * - Idempotent on roomId / eventId.
 */
"use client";

import {
  peekBootstrapCache,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapMinimal,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
  primeMessengerBootstrapMinimal,
} from "@/lib/community-messenger/bootstrap-cache";
import {
  rememberDeletedGroupRoomId,
  stripRememberedDeletedGroupRoomsFromBootstrap,
} from "@/lib/community-messenger/home/group-delete-list-tombstone";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { invalidateRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
} from "@/lib/community-messenger/types";
import { normalizeMessengerRealtimeRoomId } from "@/lib/community-messenger/stores/messenger-realtime-store";

const appliedEventIds = new Set<string>();

function trimRoomId(roomId: string): string {
  return normalizeMessengerRealtimeRoomId(roomId) || roomId.trim();
}

function removeRoomFromBootstrapSnapshot(
  snapshot: CommunityMessengerBootstrap | null,
  roomId: string
): CommunityMessengerBootstrap | null {
  if (!snapshot) return null;
  return applyHomeListPatch(snapshot, { kind: "remove_room", roomId }, "multi-tab");
}

function removeRoomFromCriticalSnapshot(
  snapshot: CommunityMessengerBootstrapCritical | null,
  roomId: string
): CommunityMessengerBootstrapCritical | null {
  if (!snapshot) return null;
  const drop = (rows: CommunityMessengerBootstrapCritical["chats"]) =>
    rows.filter((row) => trimRoomId(row.room_id) !== roomId && row.room_id !== roomId);
  const nextChats = drop(snapshot.chats);
  const nextGroups = drop(snapshot.groups);
  if (nextChats.length === snapshot.chats.length && nextGroups.length === snapshot.groups.length) {
    return snapshot;
  }
  return {
    ...snapshot,
    chats: nextChats,
    groups: nextGroups,
    tabs: { chats: nextChats.length, groups: nextGroups.length },
  };
}

/**
 * Canonical eviction after Group Delete (local UI, realtime deleted_at, or bus).
 * eventId optional for idempotent duplicate delivery.
 */
export function evictDeletedGroupRoomFromHomeLists(args: {
  roomId: string;
  eventId?: string | null;
  /** When false, skip bus (caller already applying React from bus). Default true. */
  postBus?: boolean;
}): { applied: boolean; roomId: string } {
  const rid = trimRoomId(args.roomId);
  if (!rid) return { applied: false, roomId: "" };

  const eventId = typeof args.eventId === "string" ? args.eventId.trim() : "";
  if (eventId) {
    if (appliedEventIds.has(eventId)) return { applied: false, roomId: rid };
    appliedEventIds.add(eventId);
    if (appliedEventIds.size > 500) {
      const first = appliedEventIds.values().next().value;
      if (first) appliedEventIds.delete(first);
    }
  }

  rememberDeletedGroupRoomId(rid);

  for (const [peek, prime] of [
    [peekBootstrapCache, primeBootstrapCache],
    [peekMessengerBootstrapMinimal, primeMessengerBootstrapMinimal],
  ] as const) {
    const cached = peek();
    const next = removeRoomFromBootstrapSnapshot(cached, rid);
    if (next && next !== cached) {
      prime(stripRememberedDeletedGroupRoomsFromBootstrap(next));
    } else if (cached) {
      const stripped = stripRememberedDeletedGroupRoomsFromBootstrap(cached);
      if (stripped !== cached) prime(stripped);
    }
  }

  const critical = peekMessengerBootstrapCritical();
  const nextCritical = removeRoomFromCriticalSnapshot(critical, rid);
  if (nextCritical && nextCritical !== critical) {
    primeMessengerBootstrapCritical(nextCritical);
  }

  invalidateRoomSnapshot(rid);

  if (args.postBus !== false) {
    postCommunityMessengerBusEvent({
      type: "cm.home.remove_room",
      roomId: rid,
      reason: "deleted",
      eventId: eventId || `group_deleted:${rid}`,
      at: Date.now(),
    });
  }

  requestMessengerHubBadgeResync("home_list_merge_summary");
  return { applied: true, roomId: rid };
}

/** Realtime rooms UPDATE when deleted_at becomes set. */
export function noteGroupRoomDeletedFromRealtime(args: {
  roomId: string;
  deletedAt?: string | null;
}): void {
  const rid = trimRoomId(args.roomId);
  if (!rid) return;
  const deletedAt = typeof args.deletedAt === "string" ? args.deletedAt.trim() : "";
  const eventId = deletedAt ? `group_deleted:${rid}:${deletedAt}` : `group_deleted:${rid}`;
  evictDeletedGroupRoomFromHomeLists({ roomId: rid, eventId });
}

export function clearDeletedGroupRoomEvictionEventsForTests(): void {
  appliedEventIds.clear();
}
