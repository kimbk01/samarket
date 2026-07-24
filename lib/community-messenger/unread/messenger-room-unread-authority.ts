/**
 * Live unread room fact — list surfaces + Projection Authority CM room-fact input.
 *
 * P0-2 LOCK:
 * - DO NOT call applyHubBadgeCmUnreadRoomCountAbsolute / Hub snapshot ±1.
 * - Hub/Bottom CM totals come only from Projection Authority (room fact → Builder).
 * - Trade/store_order room facts may still update list caches; Authority rejects them.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";
import { getDomainListProjection } from "@/lib/chat-domain/list/domain-list-writers";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import {
  resolveBottomChatRoomEligible,
  roomSummaryCountsForBottomChat,
} from "@/lib/community-messenger/notifications/bottom-chat-live-room-count";
import {
  clearLocalReadGuard,
  normalizeLocalReadGuardRoomId,
  resolveUnreadWithLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { isCommunityMessengerGroupRoomType } from "@/lib/community-messenger/types";
import {
  commitCmRoomUnreadFactEvent,
  type CmRoomUnreadFactSource,
} from "@/lib/notifications/projection-authority";

export type MessengerRoomUnreadFact = {
  roomId: string;
  unreadCount: number;
  lastMessageAt: string;
  versionMs: number;
};

export type MessengerRoomUnreadFactSource = "default" | "participant_rt";

type RecountRow = {
  roomId: string;
  unreadCount: number;
  lastMessageAt: string;
  summary: Pick<
    CommunityMessengerRoomSummary,
    "chatDomain" | "roomType" | "messengerDirectKey" | "contextMeta"
  > | null;
  projectionDomain: ChatDomain | null;
};

const facts = new Map<string, MessengerRoomUnreadFact>();

const BOTTOM_CHAT_DOMAINS: ReadonlySet<ChatDomain> = new Set(["general_direct", "group"]);

export function applyMessengerRoomUnreadFact(input: {
  roomId: string;
  unreadCount: number;
  lastMessageAt?: string | null;
  versionMs?: number;
  /** participant RT unread_count is authoritative; empty LMA must not zero-out. */
  source?: MessengerRoomUnreadFactSource;
}): { unreadCount: number; suppressed: boolean; allowedNewMessage: boolean } {
  const rid = normalizeLocalReadGuardRoomId(input.roomId);
  if (!rid) {
    return { unreadCount: 0, suppressed: false, allowedNewMessage: false };
  }
  const lastMessageAt =
    typeof input.lastMessageAt === "string" ? input.lastMessageAt.trim() : "";
  const unreadIn = Math.max(0, Math.floor(Number(input.unreadCount) || 0));
  const source = input.source ?? "default";

  let guarded: { unreadCount: number; suppressed: boolean; allowedNewMessage: boolean };

  if (source === "participant_rt") {
    /** Server participant unread is live truth — do not suppress on missing lastMessageAt. */
    if (unreadIn > 0) {
      clearLocalReadGuard(rid);
    }
    guarded = {
      unreadCount: unreadIn,
      suppressed: false,
      allowedNewMessage: unreadIn > 0,
    };
  } else if (!lastMessageAt) {
    guarded = {
      unreadCount: unreadIn,
      suppressed: false,
      allowedNewMessage: false,
    };
  } else {
    guarded = resolveUnreadWithLocalReadGuard({
      roomId: rid,
      incomingUnread: unreadIn,
      incomingLastMessageAt: lastMessageAt,
    });
  }

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

/**
 * Resolve chat domain for Authority input. Returns trade/store_order so Authority can reject.
 */
export function resolveMessengerRoomChatDomain(
  roomId: string,
  viewerUserId: string
): ChatDomain | null {
  const rid = normalizeLocalReadGuardRoomId(roomId);
  const viewer = String(viewerUserId ?? "").trim();
  if (!rid) return null;

  const snap = viewer ? peekRoomSnapshot(rid, viewer)?.room : null;
  if (snap?.chatDomain === "general_direct" || snap?.chatDomain === "group") return snap.chatDomain;
  if (snap?.chatDomain === "trade" || snap?.chatDomain === "store_order") return snap.chatDomain;

  const home = findHomeListRoomRow(peekBootstrapCache(), rid);
  if (home?.chatDomain === "general_direct" || home?.chatDomain === "group") return home.chatDomain;
  if (home?.chatDomain === "trade" || home?.chatDomain === "store_order") return home.chatDomain;
  if (home && roomSummaryCountsForBottomChat(home)) {
    return isCommunityMessengerGroupRoomType(home.roomType) ? "group" : "general_direct";
  }

  for (const d of ["general_direct", "group", "trade", "store_order"] as const) {
    const proj = getDomainListProjection(d);
    const hit = proj?.items.some(
      (i) => normalizeLocalReadGuardRoomId(i.roomId) === rid
    );
    if (hit) return d;
  }

  if (snap && roomSummaryCountsForBottomChat(snap)) {
    return isCommunityMessengerGroupRoomType(snap.roomType) ? "group" : "general_direct";
  }
  return null;
}

/**
 * Merge bootstrap + domain projections + room snapshots + live facts, then count
 * GD+group rooms with unread>0. Domain-unknown rooms are excluded from Bottom.
 * Diagnostic / tests only — Hub surfaces must not use this as a writer.
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
          (i) => normalizeLocalReadGuardRoomId(i.roomId) === rid
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

function mapFactSource(
  source: MessengerRoomUnreadFactSource | undefined,
  authoritySource?: CmRoomUnreadFactSource
): CmRoomUnreadFactSource {
  if (authoritySource) return authoritySource;
  if (source === "participant_rt") return "participant_realtime";
  return "message_insert";
}

/**
 * Apply local room fact, then feed Projection Authority (no Hub direct write).
 */
export function applyMessengerRoomUnreadFactAndSyncBottom(input: {
  roomId: string;
  viewerUserId: string;
  unreadCount: number;
  /** RT payload.old unread — contribution baseline when Authority room is UNKNOWN. */
  prevUnreadHint?: number;
  lastMessageAt?: string | null;
  versionMs?: number;
  source?: MessengerRoomUnreadFactSource;
  /** Optional Authority event identity (defaults to room+version+unread). */
  eventIdentity?: string;
  authoritySource?: CmRoomUnreadFactSource;
}): {
  unreadCount: number;
  suppressed: boolean;
  bottomRoomCount: number;
  hubSynced: boolean;
  authorityApplied: boolean;
} {
  const rid = normalizeLocalReadGuardRoomId(input.roomId);
  const prevUnread =
    typeof input.prevUnreadHint === "number" && Number.isFinite(input.prevUnreadHint)
      ? Math.max(0, Math.floor(input.prevUnreadHint))
      : rid
        ? (facts.get(rid)?.unreadCount ?? 0)
        : 0;
  const guarded = applyMessengerRoomUnreadFact(input);
  const bottomRoomCount = recountBottomChatUnreadRoomCount(input.viewerUserId);

  const domain = resolveMessengerRoomChatDomain(input.roomId, input.viewerUserId);
  if (!domain) {
    return {
      unreadCount: guarded.unreadCount,
      suppressed: guarded.suppressed,
      bottomRoomCount,
      hubSynced: false,
      authorityApplied: false,
    };
  }

  const eventVersion =
    typeof input.versionMs === "number" && Number.isFinite(input.versionMs) && input.versionMs > 0
      ? Math.floor(input.versionMs)
      : Date.now();
  const eventIdentity =
    String(input.eventIdentity ?? "").trim() ||
    `cm-room-fact:${rid}:${eventVersion}:${guarded.unreadCount}:${mapFactSource(
      input.source,
      input.authoritySource
    )}`;

  const authorityApplied = commitCmRoomUnreadFactEvent({
    roomId: input.roomId,
    domain,
    unread: {
      kind: "absolute",
      unreadCount: guarded.unreadCount,
      previousUnreadCount: prevUnread,
    },
    source: mapFactSource(input.source, input.authoritySource),
    eventIdentity,
    eventVersion,
    occurredAt: Date.now(),
  });

  return {
    unreadCount: guarded.unreadCount,
    suppressed: guarded.suppressed,
    bottomRoomCount,
    hubSynced: authorityApplied,
    authorityApplied,
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
