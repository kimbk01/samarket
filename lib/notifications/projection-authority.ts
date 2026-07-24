/**
 * P0 Projection Authority — single commit gate for Badge Projection surfaces.
 *
 * CONTRACT:
 * - Complete HTTP/bootstrap snapshots register here, then apply once.
 * - Realtime room unread may only merge into the last complete input.
 * - Incomplete Facts never call applyNotificationBadgeProjection.
 * - Stale generation never overwrites a newer committed generation.
 *
 * DO NOT:
 * - Treat DomainRoomState-only Facts as complete.
 * - Zero Bell / orphan / buyer / owner when merging room deltas.
 * - Add a second surface apply path alongside this Authority.
 */
"use client";

import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  buildNotificationBadgeProjection,
  type NotificationBadgeDomainFacts,
  type NotificationBadgeProjectionInput,
} from "@/lib/notifications/build-notification-badge-projection";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

/** Minimal room row — avoid community-messenger ↔ notifications cycles. */
export type ProjectionAuthorityRoomRow = Readonly<{
  roomId: string;
  chatDomain: ChatDomain;
  unreadCount: number;
}>;
export type ProjectionAuthoritySource =
  | "badge_count_http"
  | "room_unread_delta"
  | "test";

export type ProjectionAuthorityCounters = Readonly<{
  complete_snapshot_commit_ok: number;
  room_delta_commit_ok: number;
  projection_commit_ok: number;
  incomplete_commit_rejected: number;
  stale_generation_rejected: number;
  room_delta_noop: number;
}>;

type MutableCounters = {
  -readonly [K in keyof ProjectionAuthorityCounters]: number;
};

const counters: MutableCounters = {
  complete_snapshot_commit_ok: 0,
  room_delta_commit_ok: 0,
  projection_commit_ok: 0,
  incomplete_commit_rejected: 0,
  stale_generation_rejected: 0,
  room_delta_noop: 0,
};

let lastCompleteInput: NotificationBadgeProjectionInput | null = null;
let lastCommittedGenerationMs = 0;
let lastCommitSource: ProjectionAuthoritySource | null = null;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

/**
 * Complete gate — RT room-only objects fail (no approved Bell / buyer facts).
 */
export function isCompleteProjectionInput(
  input: NotificationBadgeProjectionInput | null | undefined
): input is NotificationBadgeProjectionInput {
  if (!input) return false;
  const d = input.domainUnreadRooms;
  if (!d || typeof d !== "object") return false;
  for (const key of ["general_direct", "group", "trade", "store_order"] as const) {
    if (!Number.isFinite(Number(d[key]))) return false;
  }
  if (!Number.isFinite(Number(input.orphanMissedCall))) return false;
  if (!input.nonChatEventAttention || typeof input.nonChatEventAttention !== "object") {
    return false;
  }
  if (input.storeOrderBuyerDeliveryUnread == null) return false;
  if (!Number.isFinite(Number(input.storeOrderBuyerDeliveryUnread))) return false;
  if (input.unreadApprovedNotificationEvents == null && input.bell == null) return false;
  if (
    input.unreadApprovedNotificationEvents != null &&
    !Number.isFinite(Number(input.unreadApprovedNotificationEvents))
  ) {
    return false;
  }
  return true;
}

export function getProjectionAuthorityCounters(): ProjectionAuthorityCounters {
  return { ...counters };
}

export function getLastCompleteProjectionInput(): NotificationBadgeProjectionInput | null {
  return lastCompleteInput;
}

export function getLastCommittedProjectionGenerationMs(): number {
  return lastCommittedGenerationMs;
}

export function resetProjectionAuthorityForTests(): void {
  lastCompleteInput = null;
  lastCommittedGenerationMs = 0;
  lastCommitSource = null;
  counters.complete_snapshot_commit_ok = 0;
  counters.room_delta_commit_ok = 0;
  counters.projection_commit_ok = 0;
  counters.incomplete_commit_rejected = 0;
  counters.stale_generation_rejected = 0;
  counters.room_delta_noop = 0;
}

function rejectIncomplete(reason: string): false {
  counters.incomplete_commit_rejected += 1;
  logNotifyBadge("ui_set", {
    projection_authority: "incomplete_commit_rejected",
    reason,
    incomplete_commit_rejected: counters.incomplete_commit_rejected,
  });
  return false;
}

function rejectStale(versionMs: number): false {
  counters.stale_generation_rejected += 1;
  logNotifyBadge("ui_set", {
    projection_authority: "stale_generation_rejected",
    versionMs,
    lastCommittedGenerationMs,
    stale_generation_rejected: counters.stale_generation_rejected,
  });
  return false;
}

function commitApply(
  input: NotificationBadgeProjectionInput,
  versionMs: number,
  source: ProjectionAuthoritySource,
  applyBell: boolean
): true {
  const projection = buildNotificationBadgeProjection(input);
  applyNotificationBadgeProjection(projection, {
    applyBell,
    projectionVersionMs: versionMs,
  });
  lastCompleteInput = input;
  lastCommittedGenerationMs = versionMs;
  lastCommitSource = source;
  counters.projection_commit_ok += 1;
  logNotifyBadge("ui_set", {
    projection_authority: "commit_ok",
    source,
    versionMs,
    projection_commit_ok: counters.projection_commit_ok,
  });
  return true;
}

/**
 * Register a complete server/bootstrap snapshot and apply surfaces exactly once.
 */
export function commitCompleteProjectionSnapshot(
  input: NotificationBadgeProjectionInput,
  opts?: {
    projectionVersionMs?: number;
    source?: ProjectionAuthoritySource;
    applyBell?: boolean;
  }
): boolean {
  if (!isCompleteProjectionInput(input)) {
    return rejectIncomplete("complete_snapshot_missing_required_facts");
  }
  const versionMs = Math.max(
    0,
    Math.floor(Number(opts?.projectionVersionMs) || Date.now())
  );
  if (versionMs < lastCommittedGenerationMs) {
    return rejectStale(versionMs);
  }
  if (versionMs === lastCommittedGenerationMs && lastCompleteInput != null) {
    // Idempotent same-generation replay — refresh stored input, no second surface apply.
    lastCompleteInput = input;
    return true;
  }
  const source = opts?.source ?? "badge_count_http";
  const ok = commitApply(input, versionMs, source, opts?.applyBell !== false);
  if (ok) counters.complete_snapshot_commit_ok += 1;
  return ok;
}

function mergeRowUnreadForDomains(args: {
  prev: Readonly<Record<string, number>> | undefined;
  rooms: ReadonlyMap<string, ProjectionAuthorityRoomRow>;
  domainsToUpdate: ReadonlyArray<ChatDomain>;
}): Record<string, number> {
  const domainSet = new Set(args.domainsToUpdate);
  const next: Record<string, number> = { ...(args.prev ?? {}) };
  for (const room of args.rooms.values()) {
    if (!domainSet.has(room.chatDomain)) continue;
    const u = nonNeg(room.unreadCount);
    const id = String(room.roomId ?? "").trim();
    if (!id) continue;
    if (u > 0) next[id] = u;
    else delete next[id];
  }
  return next;
}

function domainFactsEqual(
  a: NotificationBadgeDomainFacts,
  b: NotificationBadgeDomainFacts
): boolean {
  return (
    nonNeg(a.general_direct) === nonNeg(b.general_direct) &&
    nonNeg(a.group) === nonNeg(b.group) &&
    nonNeg(a.trade) === nonNeg(b.trade) &&
    nonNeg(a.store_order) === nonNeg(b.store_order)
  );
}

/**
 * Merge RT room unread into the last complete snapshot.
 * Without a prior complete snapshot, refuse to invent a Projection.
 */
export function commitRoomUnreadDeltaFromDomainSpine(args: {
  domainsToUpdate: ReadonlyArray<ChatDomain>;
  spineDomainCounts: NotificationBadgeDomainFacts;
  rooms: ReadonlyMap<string, ProjectionAuthorityRoomRow>;
  applyBell?: boolean;
}): boolean {
  if (!lastCompleteInput || !isCompleteProjectionInput(lastCompleteInput)) {
    return rejectIncomplete("room_delta_without_complete_snapshot");
  }
  const domains = [...new Set(args.domainsToUpdate)].filter(Boolean);
  if (domains.length === 0) {
    counters.room_delta_noop += 1;
    return false;
  }

  const base = lastCompleteInput.domainUnreadRooms;
  const nextRooms = {
    general_direct: nonNeg(base.general_direct),
    group: nonNeg(base.group),
    trade: nonNeg(base.trade),
    store_order: nonNeg(base.store_order),
  };
  for (const d of domains) {
    nextRooms[d] = nonNeg(args.spineDomainCounts[d]);
  }

  const nextRows = mergeRowUnreadForDomains({
    prev: lastCompleteInput.rowUnreadByRoomId,
    rooms: args.rooms,
    domainsToUpdate: domains,
  });

  const merged: NotificationBadgeProjectionInput = {
    ...lastCompleteInput,
    domainUnreadRooms: nextRooms,
    // Preserve Bell / orphan / buyer / owner / non-chat — never rewrite from RT spine.
    orphanMissedCall: lastCompleteInput.orphanMissedCall,
    nonChatEventAttention: lastCompleteInput.nonChatEventAttention,
    unreadApprovedNotificationEvents: lastCompleteInput.unreadApprovedNotificationEvents,
    bell: lastCompleteInput.bell,
    storeOrderBuyerDeliveryUnread: lastCompleteInput.storeOrderBuyerDeliveryUnread,
    storeOrderOwnerChatUnread: lastCompleteInput.storeOrderOwnerChatUnread,
    storeOrderOwnerUnreadByStoreId: lastCompleteInput.storeOrderOwnerUnreadByStoreId,
    philifeChatUnread: lastCompleteInput.philifeChatUnread,
    rowUnreadByRoomId: nextRows,
    osNotificationRemove: lastCompleteInput.osNotificationRemove,
  };

  if (
    domainFactsEqual(lastCompleteInput.domainUnreadRooms, nextRooms) &&
    JSON.stringify(lastCompleteInput.rowUnreadByRoomId ?? {}) === JSON.stringify(nextRows)
  ) {
    counters.room_delta_noop += 1;
    return true;
  }

  const versionMs = Math.max(Date.now(), lastCommittedGenerationMs + 1);
  const ok = commitApply(
    merged,
    versionMs,
    "room_unread_delta",
    args.applyBell !== false
  );
  if (ok) counters.room_delta_commit_ok += 1;
  return ok;
}

/** Test/harness — last commit metadata + counters for CDP/runtime QA. */
export function getProjectionAuthorityDebugState(): {
  hasComplete: boolean;
  lastCommittedGenerationMs: number;
  lastCommitSource: ProjectionAuthoritySource | null;
  counters: ProjectionAuthorityCounters;
} {
  return {
    hasComplete: lastCompleteInput != null,
    lastCommittedGenerationMs,
    lastCommitSource,
    counters: getProjectionAuthorityCounters(),
  };
}

declare global {
  interface Window {
    __dibayProjectionAuthority?: {
      getDebugState: typeof getProjectionAuthorityDebugState;
      getCounters: typeof getProjectionAuthorityCounters;
    };
  }
}

if (typeof window !== "undefined") {
  window.__dibayProjectionAuthority = {
    getDebugState: getProjectionAuthorityDebugState,
    getCounters: getProjectionAuthorityCounters,
  };
}
