/**
 * P0 Projection Authority — the ONLY component allowed to commit a Badge Projection.
 *
 * CONTRACT (Authority, not "writer removal"):
 * - Surfaces are written exclusively through `applyNotificationBadgeProjection`
 *   called from this module. No other module may call it.
 * - State machine: EMPTY → WAITING_COMPLETE → COMPLETE → (RT delta) → COMPLETE.
 *   Realtime may NEVER produce a Projection in EMPTY / WAITING_COMPLETE.
 * - Every commit carries metadata (id / generation / source / completedAt / factsVersion).
 * - `factsVersion` orders server snapshots; an older server snapshot never overwrites
 *   a newer one, even after Realtime deltas bumped the generation.
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
  type NotificationBadgeProjectionInput,
} from "@/lib/notifications/build-notification-badge-projection";
import { applyNotificationBadgeProjection } from "@/lib/messenger/contracts/domain-badge-authority-product-bridge";
import { logNotifyBadge } from "@/lib/notifications/core/notification-logs";

/** Minimal room row — avoid community-messenger ↔ notifications type cycles. */
export type ProjectionAuthorityRoomRow = Readonly<{
  roomId: string;
  chatDomain: ChatDomain;
  unreadCount: number;
}>;

export type ProjectionAuthoritySource =
  | "badge_count_http"
  | "room_unread_delta"
  | "test";

/** Projection lifecycle — RT is only legal in COMPLETE. */
export type ProjectionAuthorityState = "EMPTY" | "WAITING_COMPLETE" | "COMPLETE";

export type ProjectionRejectReason =
  | "incomplete"
  | "stale"
  | "no_complete_snapshot"
  | "empty_domain_set";

/** Commit metadata — required for later race forensics. */
export type ProjectionMetadata = Readonly<{
  projectionId: string;
  projectionGeneration: number;
  projectionSource: ProjectionAuthoritySource;
  projectionCompletedAt: number;
  /** Server snapshot ordering key (badge-count `projectionVersionMs`). */
  projectionFactsVersion: number;
}>;

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

let state: ProjectionAuthorityState = "EMPTY";
let lastCompleteInput: NotificationBadgeProjectionInput | null = null;
let lastMetadata: ProjectionMetadata | null = null;
/** Monotonic internal generation — +1 per committed projection. */
let generation = 0;
/** Server snapshot ordering — only complete snapshots advance this. */
let factsVersion = 0;
/** Monotonic ms handed to surfaces so a newer delta is never dropped downstream. */
let surfaceVersionMs = 0;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function nextProjectionId(gen: number): string {
  return `proj-${gen}-${Date.now().toString(36)}`;
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

export function getProjectionAuthorityState(): ProjectionAuthorityState {
  return state;
}

export function getProjectionMetadata(): ProjectionMetadata | null {
  return lastMetadata;
}

export function getProjectionAuthorityCounters(): ProjectionAuthorityCounters {
  return { ...counters };
}

export function getLastCompleteProjectionInput(): NotificationBadgeProjectionInput | null {
  return lastCompleteInput;
}

export function getLastCommittedProjectionGenerationMs(): number {
  return surfaceVersionMs;
}

/**
 * A complete snapshot has been requested (fetch start / reconnect catch-up).
 * EMPTY → WAITING_COMPLETE. COMPLETE stays COMPLETE (surfaces keep last truth).
 */
export function markProjectionAuthorityWaitingComplete(reason: string): ProjectionAuthorityState {
  if (state === "EMPTY") {
    state = "WAITING_COMPLETE";
    logNotifyBadge("projection_state", { state, reason });
  }
  return state;
}

export function resetProjectionAuthorityForTests(): void {
  state = "EMPTY";
  lastCompleteInput = null;
  lastMetadata = null;
  generation = 0;
  factsVersion = 0;
  surfaceVersionMs = 0;
  counters.complete_snapshot_commit_ok = 0;
  counters.room_delta_commit_ok = 0;
  counters.projection_commit_ok = 0;
  counters.incomplete_commit_rejected = 0;
  counters.stale_generation_rejected = 0;
  counters.room_delta_noop = 0;
}

function reject(reason: ProjectionRejectReason, extra?: Record<string, unknown>): false {
  if (reason === "stale") counters.stale_generation_rejected += 1;
  else counters.incomplete_commit_rejected += 1;
  logNotifyBadge("projection_reject", {
    reason,
    state,
    generation,
    factsVersion,
    ...extra,
  });
  return false;
}

function commitApply(
  input: NotificationBadgeProjectionInput,
  source: ProjectionAuthoritySource,
  nextFactsVersion: number,
  applyBell: boolean
): true {
  const projection = buildNotificationBadgeProjection(input);
  surfaceVersionMs = Math.max(Date.now(), surfaceVersionMs + 1);
  applyNotificationBadgeProjection(projection, {
    applyBell,
    projectionVersionMs: surfaceVersionMs,
  });
  generation += 1;
  factsVersion = nextFactsVersion;
  lastCompleteInput = input;
  state = "COMPLETE";
  lastMetadata = {
    projectionId: nextProjectionId(generation),
    projectionGeneration: generation,
    projectionSource: source,
    projectionCompletedAt: Date.now(),
    projectionFactsVersion: factsVersion,
  };
  counters.projection_commit_ok += 1;
  logNotifyBadge(source === "room_unread_delta" ? "projection_delta" : "projection_commit", {
    generation,
    source,
    factsVersion,
    surfaceVersionMs,
    projectionId: lastMetadata.projectionId,
    projection_commit_ok: counters.projection_commit_ok,
  });
  return true;
}

/**
 * Register a complete server/bootstrap snapshot and apply surfaces exactly once.
 * An older `projectionVersionMs` is rejected even after Realtime deltas.
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
    markProjectionAuthorityWaitingComplete("incomplete_snapshot");
    return reject("incomplete", { at: "complete_snapshot" });
  }
  const nextFactsVersion = nonNeg(opts?.projectionVersionMs) || Date.now();
  if (state === "COMPLETE" && nextFactsVersion < factsVersion) {
    return reject("stale", { incomingFactsVersion: nextFactsVersion });
  }
  if (state === "COMPLETE" && nextFactsVersion === factsVersion) {
    // Same server truth replayed — refresh stored Facts, never re-apply surfaces.
    lastCompleteInput = input;
    logNotifyBadge("projection_commit_skipped_same_facts", {
      generation,
      factsVersion,
    });
    return true;
  }
  const source = opts?.source ?? "badge_count_http";
  const ok = commitApply(input, source, nextFactsVersion, opts?.applyBell !== false);
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

/**
 * Merge RT room unread into the last complete snapshot.
 * Legal only in COMPLETE — EMPTY / WAITING_COMPLETE must never invent a Projection.
 */
export function commitRoomUnreadDeltaFromDomainSpine(args: {
  domainsToUpdate: ReadonlyArray<ChatDomain>;
  spineDomainCounts: Readonly<Record<ChatDomain, number>>;
  rooms: ReadonlyMap<string, ProjectionAuthorityRoomRow>;
  applyBell?: boolean;
}): boolean {
  if (state !== "COMPLETE" || !isCompleteProjectionInput(lastCompleteInput)) {
    markProjectionAuthorityWaitingComplete("room_delta_before_complete");
    return reject("no_complete_snapshot", { at: "room_delta" });
  }
  const domains = [...new Set(args.domainsToUpdate)].filter(Boolean);
  if (domains.length === 0) {
    counters.room_delta_noop += 1;
    return reject("empty_domain_set", { at: "room_delta" });
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

  const sameDomains =
    nonNeg(base.general_direct) === nextRooms.general_direct &&
    nonNeg(base.group) === nextRooms.group &&
    nonNeg(base.trade) === nextRooms.trade &&
    nonNeg(base.store_order) === nextRooms.store_order;
  if (
    sameDomains &&
    JSON.stringify(lastCompleteInput.rowUnreadByRoomId ?? {}) === JSON.stringify(nextRows)
  ) {
    counters.room_delta_noop += 1;
    logNotifyBadge("projection_delta_noop", { generation, factsVersion });
    return true;
  }

  /** RT never advances server facts ordering — keeps old HTTP rejectable. */
  const ok = commitApply(merged, "room_unread_delta", factsVersion, args.applyBell !== false);
  if (ok) counters.room_delta_commit_ok += 1;
  return ok;
}

/** Harness / QA — full Authority state for CDP and device evidence. */
export function getProjectionAuthorityDebugState(): {
  state: ProjectionAuthorityState;
  hasComplete: boolean;
  metadata: ProjectionMetadata | null;
  generation: number;
  factsVersion: number;
  lastCommittedGenerationMs: number;
  lastCommitSource: ProjectionAuthoritySource | null;
  counters: ProjectionAuthorityCounters;
} {
  return {
    state,
    hasComplete: lastCompleteInput != null,
    metadata: lastMetadata,
    generation,
    factsVersion,
    lastCommittedGenerationMs: surfaceVersionMs,
    lastCommitSource: lastMetadata?.projectionSource ?? null,
    counters: getProjectionAuthorityCounters(),
  };
}

declare global {
  interface Window {
    __dibayProjectionAuthority?: {
      getDebugState: typeof getProjectionAuthorityDebugState;
      getCounters: typeof getProjectionAuthorityCounters;
      getState: typeof getProjectionAuthorityState;
      getMetadata: typeof getProjectionMetadata;
    };
  }
}

if (typeof window !== "undefined") {
  window.__dibayProjectionAuthority = {
    getDebugState: getProjectionAuthorityDebugState,
    getCounters: getProjectionAuthorityCounters,
    getState: getProjectionAuthorityState,
    getMetadata: getProjectionMetadata,
  };
}
