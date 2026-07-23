/**
 * Live unread single authority — room fact → list + Bottom Chat (GD+group room count).
 * Absolute recount (not ±1). DO NOT: revive messenger-realtime-store totalUnread · Bell/App · Native Call.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { getDomainListProjection } from "@/lib/chat-domain/list/domain-list-writers";
import { applyHubBadgeCmUnreadRoomCountAbsolute } from "@/lib/chats/owner-hub-badge-store";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import {
  resolveBottomChatRoomEligible,
  roomSummaryCountsForBottomChat,
} from "@/lib/community-messenger/notifications/bottom-chat-live-room-count";
import {
  normalizeLocalReadGuardRoomId,
  resolveUnreadWithLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type MessengerRoomUnreadFact = {
  roomId: string;
  unreadCount: number;
  lastMessageAt: string;
  versionMs: number;
};

type RecountRow = {
  roomId: string;
  unreadCount: number;
  lastMessageAt: string;
  summary: Pick<
    CommunityMessengerRoomSummary,
    "chatDomain" | "roomType" | "messengerDirectKey" | "contextMeta"
  > | null;
  /** When summary missing but Domain list projection hit — use this for eligibility. */
  projectionDomain: ChatDomain | null;
};

const facts = new Map<string, MessengerRoomUnreadFact>();

const BOTTOM_CHAT_DOMAINS: ReadonlySet<ChatDomain> = new Set(["general_direct", "group"]);

export function applyMessengerRoomUnreadFact(input: {
  roomId: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  versionMs?: number;
}): { unreadCount: number; suppressed: boolean; allowedNewMessage: boolean } {
  const rid = normalizeLocalReadGuardRoomId(input.roomId);
  if (!rid) {
    return { unreadCount: 0, suppressed: false, allowedNewMessage: false };
  }
  const lastMessageAt =
    typeof input.lastMessageAt === "string" ? input.lastMessageAt.trim() : "";
  const guarded = resolveUnreadWithLocalReadGuard({
    roomId: rid,
    incomingUnread: input.unreadCount,
    incomingLastMessageAt: lastMessageAt,
  });
  const prev = facts.get(rid);
  facts.set(rid, {
    roomId: rid,
    unreadCount: guarded.unreadCount,
    lastMessageAt: lastMessageAt || prev?.lastMessageAt || "",
    versionMs:
      typeof input.versionMs === "number" && Number.isFinite(input.versionMs)
        ? input.versionMs
        : Date.now(),
  });
  return guarded;
}

function upsertRecountRow(map: Map<string, RecountRow>, row: RecountRow): void {
  const rid = normalizeLocalReadGuardRoomId(row.roomId);
  if (!rid) return;
  const prev = map.get(rid);
  if (!prev) {
    map.set(rid, { ...row, roomId: rid });
    return;
  }
  map.set(rid, {
    roomId: rid,
    unreadCount: row.unreadCount,
    lastMessageAt: row.lastMessageAt || prev.lastMessageAt,
    summary: row.summary ?? prev.summary,
    projectionDomain: row.projectionDomain ?? prev.projectionDomain,
  });
}

function rowEligibleForBottom(row: RecountRow, viewerUserId: string): boolean {
  if (row.summary) {
    return roomSummaryCountsForBottomChat(row.summary);
  }
  if (row.projectionDomain) {
    return BOTTOM_CHAT_DOMAINS.has(row.projectionDomain);
  }
  const eligible = resolveBottomChatRoomEligible(row.roomId, viewerUserId);
  return eligible === true;
}

function hasBottomRecountSeed(viewerUserId: string): boolean {
  const boot = peekBootstrapCache();
  if (boot) {
    const rooms = [...(boot.chats ?? []), ...(boot.groups ?? [])];
    if (rooms.some((r) => roomSummaryCountsForBottomChat(r))) return true;
  }
  for (const d of ["general_direct", "group"] as const) {
    const proj = getDomainListProjection(d);
    if (proj && proj.items.length > 0) return true;
  }
  const viewer = String(viewerUserId ?? "").trim();
  for (const fact of facts.values()) {
    if (resolveBottomChatRoomEligible(fact.roomId, viewer) === true) return true;
  }
  return false;
}

/**
 * Merge bootstrap + domain projections + room snapshots + live facts, then count
 * GD+group rooms with unread>0. Domain-unknown rooms are excluded from Bottom
 * (no trade pollution) but facts/list still update separately.
 */
export function recountBottomChatUnreadRoomCount(viewerUserId: string): number {
  const viewer = String(viewerUserId ?? "").trim();
  const byRoom = new Map<string, RecountRow>();

  const boot = peekBootstrapCache();
  if (boot) {
    for (const room of [...(boot.chats ?? []), ...(boot.groups ?? [])]) {
      upsertRecountRow(byRoom, {
        roomId: room.id,
        unreadCount: Math.max(0, Math.floor(Number(room.unreadCount) || 0)),
        lastMessageAt: String(room.lastMessageAt ?? ""),
        summary: room,
        projectionDomain: room.chatDomain ?? null,
      });
    }
  }

  for (const d of ["general_direct", "group", "trade", "store_order"] as const) {
    const proj = getDomainListProjection(d);
    if (!proj) continue;
    for (const item of proj.items) {
      upsertRecountRow(byRoom, {
        roomId: item.roomId,
        unreadCount: Math.max(0, Math.floor(Number(item.unreadCount) || 0)),
        lastMessageAt: String(item.lastMessageAt ?? ""),
        summary: null,
        projectionDomain: d,
      });
    }
  }

  if (viewer) {
    for (const [rid] of byRoom) {
      const snap = peekRoomSnapshot(rid, viewer);
      if (!snap?.room) continue;
      const existing = byRoom.get(rid);
      upsertRecountRow(byRoom, {
        roomId: rid,
        unreadCount:
          existing?.unreadCount ??
          Math.max(0, Math.floor(Number(snap.room.unreadCount) || 0)),
        lastMessageAt: String(snap.room.lastMessageAt ?? existing?.lastMessageAt ?? ""),
        summary: snap.room,
        projectionDomain: snap.room.chatDomain ?? existing?.projectionDomain ?? null,
      });
    }
  }

  for (const fact of facts.values()) {
    const rid = fact.roomId;
    const existing = byRoom.get(rid);
    let summary = existing?.summary ?? null;
    if (!summary && boot) {
      summary = findHomeListRoomRow(boot, rid);
    }
    if (!summary && viewer) {
      summary = peekRoomSnapshot(rid, viewer)?.room ?? null;
    }
    let projectionDomain = existing?.projectionDomain ?? summary?.chatDomain ?? null;
    if (!projectionDomain) {
      for (const d of ["general_direct", "group", "trade", "store_order"] as const) {
        const proj = getDomainListProjection(d);
        const hit = proj?.items.some(
          (i) => normalizeLocalReadGuardRoomId(i.roomId) === rid,
        );
        if (hit) {
          projectionDomain = d;
          break;
        }
      }
    }
    upsertRecountRow(byRoom, {
      roomId: rid,
      unreadCount: fact.unreadCount,
      lastMessageAt: fact.lastMessageAt || existing?.lastMessageAt || "",
      summary,
      projectionDomain,
    });
  }

  let count = 0;
  for (const row of byRoom.values()) {
    if (row.unreadCount <= 0) continue;
    if (!rowEligibleForBottom(row, viewer)) continue;
    count += 1;
  }
  return count;
}

/** Apply fact, then set hub Bottom Chat room-count absolute from recount when seeded. */
export function applyMessengerRoomUnreadFactAndSyncBottom(input: {
  roomId: string;
  viewerUserId: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  versionMs?: number;
}): { unreadCount: number; suppressed: boolean; bottomRoomCount: number; hubSynced: boolean } {
  const guarded = applyMessengerRoomUnreadFact(input);
  const bottomRoomCount = recountBottomChatUnreadRoomCount(input.viewerUserId);
  const hubSynced = hasBottomRecountSeed(input.viewerUserId);
  if (hubSynced) {
    applyHubBadgeCmUnreadRoomCountAbsolute(bottomRoomCount);
  }
  return {
    unreadCount: guarded.unreadCount,
    suppressed: guarded.suppressed,
    bottomRoomCount,
    hubSynced,
  };
}

export function peekMessengerRoomUnreadFact(roomId: string): MessengerRoomUnreadFact | null {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  if (!rid) return null;
  return facts.get(rid) ?? null;
}

/** Vitest only */
export function __resetMessengerRoomUnreadAuthorityForTest(): void {
  facts.clear();
}
