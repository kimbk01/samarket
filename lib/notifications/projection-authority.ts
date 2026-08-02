/**
 * P0/P0-2 Projection Authority — the ONLY component allowed to commit a Badge Projection.
 *
 * CONTRACT:
 * - Surfaces are written exclusively through `applyNotificationBadgeProjection`
 *   called from this module.
 * - State machine: EMPTY → WAITING_COMPLETE → COMPLETE → (RT/room fact) → COMPLETE.
 * - CM Hub unread (General+Group) comes from room facts → Builder → Projection only.
 * - DO NOT accept aggregate surface totals (communityMessengerUnread / hubTotal / appIconTotal).
 * - eventIdentity AND room.lastAppliedVersion are both required to stop races.
 *
 * DO NOT:
 * - Treat DomainRoomState-only Facts as complete.
 * - Zero Bell / orphan / buyer / owner when merging room facts.
 * - Add a second Hub CM surface apply path alongside this Authority.
 */
"use client";

import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  buildNotificationBadgeProjection,
  EMPTY_BELL_BADGE_FACTS,
  type NotificationBadgeProjectionInput,
} from "@/lib/notifications/build-notification-badge-projection";
import type { NotificationBadgeCount } from "@/lib/notifications/core/notification-event-types";
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
  | "cm_room_fact"
  | "event_fact"
  | "test";

/** Projection lifecycle — RT / CM room facts are only legal in COMPLETE. */
export type ProjectionAuthorityState = "EMPTY" | "WAITING_COMPLETE" | "COMPLETE";

/** Per-room fact lifecycle for CM (General/Group) Authority input. */
export type RoomFactState = "UNKNOWN" | "KNOWN" | "READ";

export type CmRoomFactDomain = "general_direct" | "group";

export type CmRoomUnreadFactSource =
  | "participant_realtime"
  | "message_insert"
  | "optimistic_read"
  | "read_ack"
  | "multi_tab"
  | "reconnect"
  | "test";

export type ProjectionRejectReason =
  | "incomplete"
  | "stale"
  | "no_complete_snapshot"
  | "empty_domain_set"
  | "room_fact_baseline_missing"
  | "room_version_stale"
  | "domain_rejected"
  | "duplicate_event";

/** Commit metadata — required for later race forensics. */
export type ProjectionMetadata = Readonly<{
  projectionId: string;
  projectionGeneration: number;
  projectionSource: ProjectionAuthoritySource;
  projectionCompletedAt: number;
  /** Server snapshot ordering key (badge-count `projectionVersionMs`). */
  projectionFactsVersion: number;
}>;

/** Same-generation lineage: Room Fact → Builder → Projection → Hub → Bottom. */
export type ProjectionGenerationLineage = Readonly<{
  generation: number;
  roomFactCount: number;
  builderBottomChat: number;
  projectionBottomChat: number;
  hubCm: number;
  bottomChat: number;
  sameGeneration: true;
  source: ProjectionAuthoritySource;
  projectionId: string;
}>;

export type ProjectionAuthorityRoomFactDebug = Readonly<{
  roomId: string;
  domain: CmRoomFactDomain | null;
  unread: number;
  version: number;
  state: RoomFactState;
  lastSource: CmRoomUnreadFactSource | null;
  lastEventIdentity: string | null;
}>;

export type ProjectionAuthorityCounters = Readonly<{
  complete_snapshot_commit_ok: number;
  room_delta_commit_ok: number;
  room_fact_commit_ok: number;
  projection_commit_ok: number;
  incomplete_commit_rejected: number;
  stale_generation_rejected: number;
  room_delta_noop: number;
  room_fact_baseline_missing: number;
  room_version_stale: number;
  domain_rejected: number;
  duplicate_event: number;
  /** P0-3 — notification event read facts (admin_notice / orphan missed). */
  event_fact_commit_ok: number;
  event_fact_baseline_missing: number;
  event_version_stale: number;
  event_kind_rejected: number;
  event_fact_noop: number;
}>;

type MutableCounters = {
  -readonly [K in keyof ProjectionAuthorityCounters]: number;
};

type RoomFactRow = {
  roomId: string;
  domain: CmRoomFactDomain | null;
  unreadCount: number;
  lastAppliedVersion: number;
  state: RoomFactState;
  lastSource: CmRoomUnreadFactSource | null;
  lastEventIdentity: string | null;
};

const counters: MutableCounters = {
  complete_snapshot_commit_ok: 0,
  room_delta_commit_ok: 0,
  room_fact_commit_ok: 0,
  projection_commit_ok: 0,
  incomplete_commit_rejected: 0,
  stale_generation_rejected: 0,
  room_delta_noop: 0,
  room_fact_baseline_missing: 0,
  room_version_stale: 0,
  domain_rejected: 0,
  duplicate_event: 0,
  event_fact_commit_ok: 0,
  event_fact_baseline_missing: 0,
  event_version_stale: 0,
  event_kind_rejected: 0,
  event_fact_noop: 0,
};

const CM_DOMAINS = new Set<CmRoomFactDomain>(["general_direct", "group"]);
const processedEventIdentities = new Set<string>();
const MAX_EVENT_IDENTITY_CACHE = 2_000;
const roomFacts = new Map<string, RoomFactRow>();
/** Per-axis last applied event-fact version (admin_notice / orphan_missed). */
const eventFactVersions = new Map<string, number>();

let state: ProjectionAuthorityState = "EMPTY";
let lastCompleteInput: NotificationBadgeProjectionInput | null = null;
let lastMetadata: ProjectionMetadata | null = null;
let lastLineage: ProjectionGenerationLineage | null = null;
/** Monotonic internal generation — +1 per committed projection. */
let generation = 0;
/** Server snapshot ordering — only complete snapshots advance this. */
let factsVersion = 0;
/** Monotonic ms handed to surfaces so a newer delta is never dropped downstream. */
let surfaceVersionMs = 0;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function normalizeRoomId(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}

function nextProjectionId(gen: number): string {
  return `proj-${gen}-${Date.now().toString(36)}`;
}

function rememberEventIdentity(id: string): void {
  processedEventIdentities.add(id);
  if (processedEventIdentities.size <= MAX_EVENT_IDENTITY_CACHE) return;
  const first = processedEventIdentities.values().next().value;
  if (typeof first === "string") processedEventIdentities.delete(first);
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

export function getProjectionGenerationLineage(): ProjectionGenerationLineage | null {
  return lastLineage;
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

export function listProjectionAuthorityRoomFacts(): ProjectionAuthorityRoomFactDebug[] {
  return [...roomFacts.values()]
    .map((row) => ({
      roomId: row.roomId,
      domain: row.domain,
      unread: row.unreadCount,
      version: row.lastAppliedVersion,
      state: row.state,
      lastSource: row.lastSource,
      lastEventIdentity: row.lastEventIdentity,
    }))
    .sort((a, b) => a.roomId.localeCompare(b.roomId));
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

function clearProjectionAuthorityState(): void {
  state = "EMPTY";
  lastCompleteInput = null;
  lastMetadata = null;
  lastLineage = null;
  generation = 0;
  factsVersion = 0;
  surfaceVersionMs = 0;
  roomFacts.clear();
  processedEventIdentities.clear();
  eventFactVersions.clear();
  counters.complete_snapshot_commit_ok = 0;
  counters.room_delta_commit_ok = 0;
  counters.room_fact_commit_ok = 0;
  counters.projection_commit_ok = 0;
  counters.incomplete_commit_rejected = 0;
  counters.stale_generation_rejected = 0;
  counters.room_delta_noop = 0;
  counters.room_fact_baseline_missing = 0;
  counters.room_version_stale = 0;
  counters.domain_rejected = 0;
  counters.duplicate_event = 0;
  counters.event_fact_commit_ok = 0;
  counters.event_fact_baseline_missing = 0;
  counters.event_version_stale = 0;
  counters.event_kind_rejected = 0;
  counters.event_fact_noop = 0;
}

/**
 * P3-b2 LOCK — Auth Epoch Reset for Projection Authority.
 * Clears all prior-user baseline/generation/roomFacts/event dedupe.
 * Does NOT change Builder formulas or COMPLETE state-machine semantics.
 * Next Boot owner must go EMPTY → WAITING_COMPLETE → COMPLETE generation=1.
 */
export function resetProjectionAuthorityForAuthEpoch(): void {
  clearProjectionAuthorityState();
  logNotifyBadge("projection_state", { state: "EMPTY", reason: "auth_epoch_reset" });
}

export function resetProjectionAuthorityForTests(): void {
  clearProjectionAuthorityState();
}

function reject(reason: ProjectionRejectReason, extra?: Record<string, unknown>): false {
  if (reason === "stale") counters.stale_generation_rejected += 1;
  else if (reason === "room_fact_baseline_missing") counters.room_fact_baseline_missing += 1;
  else if (reason === "room_version_stale") counters.room_version_stale += 1;
  else if (reason === "domain_rejected") counters.domain_rejected += 1;
  else if (reason === "duplicate_event") counters.duplicate_event += 1;
  else if (reason === "empty_domain_set") counters.room_delta_noop += 1;
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

function seedRoomFactsFromCompleteInput(input: NotificationBadgeProjectionInput): void {
  const rows = input.rowUnreadByRoomId ?? {};
  for (const [rawId, unreadRaw] of Object.entries(rows)) {
    const roomId = normalizeRoomId(rawId);
    if (!roomId) continue;
    const unreadCount = nonNeg(unreadRaw);
    const prev = roomFacts.get(roomId);
    roomFacts.set(roomId, {
      roomId,
      domain: prev?.domain ?? null,
      unreadCount,
      lastAppliedVersion: Math.max(prev?.lastAppliedVersion ?? 0, factsVersion),
      state: unreadCount > 0 ? "KNOWN" : "READ",
      lastSource: prev?.lastSource ?? null,
      lastEventIdentity: prev?.lastEventIdentity ?? null,
    });
  }
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
  const bottom = Math.max(0, projection.bottomChat);
  lastLineage = {
    generation,
    roomFactCount: [...roomFacts.values()].filter((r) => r.unreadCount > 0 && r.domain != null).length,
    builderBottomChat: bottom,
    projectionBottomChat: bottom,
    hubCm: bottom,
    bottomChat: bottom,
    sameGeneration: true,
    source,
    projectionId: lastMetadata.projectionId,
  };
  counters.projection_commit_ok += 1;
  logNotifyBadge(source === "badge_count_http" ? "projection_commit" : "projection_delta", {
    generation,
    source,
    factsVersion,
    surfaceVersionMs,
    projectionId: lastMetadata.projectionId,
    projection_commit_ok: counters.projection_commit_ok,
  });
  logNotifyBadge("projection_generation_lineage", { ...lastLineage });
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
    lastCompleteInput = input;
    seedRoomFactsFromCompleteInput(input);
    logNotifyBadge("projection_commit_skipped_same_facts", {
      generation,
      factsVersion,
    });
    return true;
  }
  const source = opts?.source ?? "badge_count_http";
  const ok = commitApply(input, source, nextFactsVersion, opts?.applyBell !== false);
  if (ok) {
    counters.complete_snapshot_commit_ok += 1;
    seedRoomFactsFromCompleteInput(input);
  }
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
 * Merge RT DomainRoomState unread into the last complete snapshot.
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

  for (const room of args.rooms.values()) {
    if (!CM_DOMAINS.has(room.chatDomain as CmRoomFactDomain)) continue;
    const roomId = normalizeRoomId(room.roomId);
    if (!roomId) continue;
    const unreadCount = nonNeg(room.unreadCount);
    const prev = roomFacts.get(roomId);
    roomFacts.set(roomId, {
      roomId,
      domain: room.chatDomain as CmRoomFactDomain,
      unreadCount,
      lastAppliedVersion: Math.max(prev?.lastAppliedVersion ?? 0, Date.now()),
      state: unreadCount > 0 ? "KNOWN" : "READ",
      lastSource: prev?.lastSource ?? null,
      lastEventIdentity: prev?.lastEventIdentity ?? null,
    });
  }

  const merged: NotificationBadgeProjectionInput = {
    ...lastCompleteInput,
    domainUnreadRooms: nextRooms,
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

  const ok = commitApply(merged, "room_unread_delta", factsVersion, args.applyBell !== false);
  if (ok) counters.room_delta_commit_ok += 1;
  return ok;
}

export type CmRoomUnreadFactEvent = Readonly<{
  roomId: string;
  /** Only General/Group are legal. Trade/Store-order must be rejected. */
  domain: ChatDomain;
  unread:
    | {
        kind: "absolute";
        unreadCount: number;
        /** Required when room fact is UNKNOWN — contribution baseline. */
        previousUnreadCount?: number;
      }
    | { kind: "delta"; delta: number };
  source: CmRoomUnreadFactSource;
  eventIdentity: string;
  eventVersion: number;
  occurredAt?: number;
  applyBell?: boolean;
}>;

/**
 * P0-2 — CM room fact → Fact Merge → Builder → Projection Commit.
 * Accepts room facts only (never Hub/App Icon aggregates).
 */
export function commitCmRoomUnreadFactEvent(event: CmRoomUnreadFactEvent): boolean {
  if (state !== "COMPLETE" || !isCompleteProjectionInput(lastCompleteInput)) {
    markProjectionAuthorityWaitingComplete("cm_room_fact_before_complete");
    return reject("no_complete_snapshot", { at: "cm_room_fact" });
  }

  const roomId = normalizeRoomId(event.roomId);
  const eventIdentity = String(event.eventIdentity ?? "").trim();
  const eventVersion = nonNeg(event.eventVersion);
  if (!roomId || !eventIdentity || eventVersion <= 0) {
    return reject("incomplete", { at: "cm_room_fact_identity" });
  }

  if (processedEventIdentities.has(eventIdentity)) {
    return reject("duplicate_event", { eventIdentity, roomId });
  }

  if (event.domain !== "general_direct" && event.domain !== "group") {
    return reject("domain_rejected", { domain: event.domain, roomId });
  }
  const domain = event.domain;

  const prev = roomFacts.get(roomId);
  if (prev && eventVersion < prev.lastAppliedVersion) {
    return reject("room_version_stale", {
      roomId,
      eventVersion,
      lastAppliedVersion: prev.lastAppliedVersion,
    });
  }
  if (
    prev &&
    eventVersion === prev.lastAppliedVersion &&
    event.unread.kind === "absolute" &&
    nonNeg(event.unread.unreadCount) === prev.unreadCount
  ) {
    rememberEventIdentity(eventIdentity);
    counters.room_delta_noop += 1;
    logNotifyBadge("room_delta_noop", {
      roomId,
      eventVersion,
      reason: "same_absolute",
    });
    return true;
  }

  let previousUnread: number | null = null;
  if (prev && prev.state !== "UNKNOWN") {
    previousUnread = prev.unreadCount;
  } else if (event.unread.kind === "absolute" && event.unread.previousUnreadCount != null) {
    previousUnread = nonNeg(event.unread.previousUnreadCount);
  } else if (event.unread.kind === "delta") {
    // Delta without a known room requires an explicit previous baseline.
    return reject("room_fact_baseline_missing", {
      roomId,
      state: prev?.state ?? "UNKNOWN",
      kind: "delta",
    });
  } else {
    return reject("room_fact_baseline_missing", {
      roomId,
      state: prev?.state ?? "UNKNOWN",
      kind: "absolute",
    });
  }

  const nextUnread =
    event.unread.kind === "absolute"
      ? nonNeg(event.unread.unreadCount)
      : Math.max(0, nonNeg(previousUnread) + Math.trunc(Number(event.unread.delta) || 0));

  const prevCounted = nonNeg(previousUnread) > 0;
  const nextCounted = nextUnread > 0;
  const domainDelta = (nextCounted ? 1 : 0) - (prevCounted ? 1 : 0);

  const base = lastCompleteInput.domainUnreadRooms;
  const nextRooms = {
    general_direct: nonNeg(base.general_direct),
    group: nonNeg(base.group),
    trade: nonNeg(base.trade),
    store_order: nonNeg(base.store_order),
  };
  nextRooms[domain] = Math.max(0, nonNeg(nextRooms[domain]) + domainDelta);

  const nextRows: Record<string, number> = {
    ...(lastCompleteInput.rowUnreadByRoomId ?? {}),
  };
  if (nextUnread > 0) nextRows[roomId] = nextUnread;
  else delete nextRows[roomId];

  roomFacts.set(roomId, {
    roomId,
    domain,
    unreadCount: nextUnread,
    lastAppliedVersion: eventVersion,
    state: nextUnread > 0 ? "KNOWN" : "READ",
    lastSource: event.source,
    lastEventIdentity: eventIdentity,
  });
  rememberEventIdentity(eventIdentity);

  if (
    domainDelta === 0 &&
    JSON.stringify(lastCompleteInput.rowUnreadByRoomId ?? {}) === JSON.stringify(nextRows)
  ) {
    counters.room_delta_noop += 1;
    logNotifyBadge("room_delta_noop", {
      roomId,
      eventVersion,
      reason: "no_domain_change",
    });
    return true;
  }

  const merged: NotificationBadgeProjectionInput = {
    ...lastCompleteInput,
    domainUnreadRooms: nextRooms,
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

  const ok = commitApply(merged, "cm_room_fact", factsVersion, event.applyBell !== false);
  if (ok) counters.room_fact_commit_ok += 1;
  return ok;
}

/**
 * P0-3 — notification event read fact (never an aggregate surface number).
 * Phase B: admin_notice / orphan_missed adjust NotificationAttentionTotal
 * (Bell digit + App Icon notification axis). Chat room axes stay untouched.
 */
export type NotificationEventReadFact =
  | { kind: "admin_notice_absolute"; absolute: number }
  | { kind: "orphan_missed_absolute"; absolute: number }
  | { kind: "orphan_missed_delta"; cleared: number };

export type NotificationEventFactEvent = Readonly<{
  fact: NotificationEventReadFact;
  eventIdentity: string;
  eventVersion: number;
  /** Explicit read origin — never inferred from a bare `cleared` count. */
  source: string;
  /** Optional scope identifier (call_logs / roomId / callSessionId). */
  scope?: string;
  applyBell?: boolean;
}>;

type EventFactAxis = "admin_notice" | "orphan_missed";

function eventFactAxis(kind: NotificationEventReadFact["kind"]): EventFactAxis {
  return kind === "admin_notice_absolute" ? "admin_notice" : "orphan_missed";
}

function rejectEventFact(
  reason:
    | "event_fact_baseline_missing"
    | "event_version_stale"
    | "event_kind_rejected"
    | "duplicate_event",
  extra?: Record<string, unknown>
): false {
  if (reason === "event_fact_baseline_missing") counters.event_fact_baseline_missing += 1;
  else if (reason === "event_version_stale") counters.event_version_stale += 1;
  else if (reason === "event_kind_rejected") counters.event_kind_rejected += 1;
  else if (reason === "duplicate_event") counters.duplicate_event += 1;
  logNotifyBadge(reason, { state, generation, factsVersion, ...extra });
  return false;
}

function buildEventFactMergedInput(
  base: NotificationBadgeProjectionInput,
  fact: NotificationEventReadFact
): { merged: NotificationBadgeProjectionInput; changed: boolean } {
  const bell: NotificationBadgeCount = base.bell ?? EMPTY_BELL_BADGE_FACTS;
  const prevApproved = nonNeg(base.unreadApprovedNotificationEvents ?? bell.total);
  const prevNotificationAttention = nonNeg(
    base.notificationAttentionTotal != null
      ? base.notificationAttentionTotal
      : base.orphanMissedCall
  );

  if (fact.kind === "admin_notice_absolute") {
    const prevAdmin = nonNeg(bell.adminNotice);
    const nextAdmin = nonNeg(fact.absolute);
    if (nextAdmin === prevAdmin) return { merged: base, changed: false };
    const cleared = Math.max(0, prevAdmin - nextAdmin);
    const nextApproved = Math.max(0, prevApproved - cleared);
    const nextNotificationAttention = Math.max(0, prevNotificationAttention - cleared);
    const nextBell: NotificationBadgeCount = {
      ...bell,
      adminNotice: nextAdmin,
      total: nextNotificationAttention,
    };
    const merged: NotificationBadgeProjectionInput = {
      ...base,
      // Chat room axes untouched — NotificationAttention / Bell digit decline together.
      bell: nextBell,
      unreadApprovedNotificationEvents: nextApproved,
      notificationAttentionTotal: nextNotificationAttention,
      nonChatEventAttention: { ...base.nonChatEventAttention, adminNotice: nextAdmin },
    };
    return { merged, changed: true };
  }

  // orphan_missed_absolute | orphan_missed_delta
  const prevOrphan = nonNeg(base.orphanMissedCall);
  const nextOrphan =
    fact.kind === "orphan_missed_absolute"
      ? nonNeg(fact.absolute)
      : Math.max(0, prevOrphan - nonNeg(fact.cleared));
  if (nextOrphan === prevOrphan) return { merged: base, changed: false };
  const cleared = Math.max(0, prevOrphan - nextOrphan);
  const nextApproved = Math.max(0, prevApproved - cleared);
  const nextNotificationAttention = Math.max(0, prevNotificationAttention - cleared);
  const nextBell: NotificationBadgeCount = {
    ...bell,
    missedCall: nextOrphan,
    total: nextNotificationAttention,
  };
  const merged: NotificationBadgeProjectionInput = {
    ...base,
    // Orphan missed axis only — never touches CM room facts or domainUnreadRooms.
    orphanMissedCall: nextOrphan,
    bell: nextBell,
    unreadApprovedNotificationEvents: nextApproved,
    notificationAttentionTotal: nextNotificationAttention,
  };
  return { merged, changed: true };
}

/**
 * Commit a notification event read fact through the sole Authority path.
 * Baseline (no complete snapshot) → reject + leave HTTP resync to reconcile.
 */
export function commitNotificationEventReadFact(event: NotificationEventFactEvent): boolean {
  const kind = event.fact?.kind;
  if (
    kind !== "admin_notice_absolute" &&
    kind !== "orphan_missed_absolute" &&
    kind !== "orphan_missed_delta"
  ) {
    return rejectEventFact("event_kind_rejected", { at: "event_fact_kind", kind });
  }

  if (state !== "COMPLETE" || !isCompleteProjectionInput(lastCompleteInput)) {
    markProjectionAuthorityWaitingComplete("event_fact_before_complete");
    return rejectEventFact("event_fact_baseline_missing", { at: "event_fact", kind });
  }

  const eventIdentity = String(event.eventIdentity ?? "").trim();
  const eventVersion = nonNeg(event.eventVersion);
  if (!eventIdentity || eventVersion <= 0) {
    return rejectEventFact("event_kind_rejected", { at: "event_fact_identity", kind });
  }

  if (processedEventIdentities.has(eventIdentity)) {
    return rejectEventFact("duplicate_event", { eventIdentity, kind });
  }

  const axis = eventFactAxis(kind);
  const lastVersion = eventFactVersions.get(axis) ?? 0;
  if (eventVersion < lastVersion) {
    return rejectEventFact("event_version_stale", { axis, eventVersion, lastVersion });
  }

  const { merged, changed } = buildEventFactMergedInput(lastCompleteInput, event.fact);

  rememberEventIdentity(eventIdentity);
  eventFactVersions.set(axis, Math.max(lastVersion, eventVersion));

  if (!changed) {
    counters.event_fact_noop += 1;
    logNotifyBadge("event_fact_noop", { kind, axis, eventVersion, source: event.source });
    return true;
  }

  const ok = commitApply(merged, "event_fact", factsVersion, event.applyBell !== false);
  if (ok) {
    counters.event_fact_commit_ok += 1;
    logNotifyBadge("event_fact_commit", {
      kind,
      axis,
      eventVersion,
      source: event.source,
      scope: event.scope ?? null,
      generation,
      event_fact_commit_ok: counters.event_fact_commit_ok,
    });
  }
  return ok;
}

/** Harness / QA — full Authority state for CDP and device evidence. */
export function getProjectionAuthorityDebugState(): {
  state: ProjectionAuthorityState;
  hasComplete: boolean;
  metadata: ProjectionMetadata | null;
  lineage: ProjectionGenerationLineage | null;
  generation: number;
  factsVersion: number;
  lastCommittedGenerationMs: number;
  lastCommitSource: ProjectionAuthoritySource | null;
  counters: ProjectionAuthorityCounters;
  rooms: ProjectionAuthorityRoomFactDebug[];
} {
  return {
    state,
    hasComplete: lastCompleteInput != null,
    metadata: lastMetadata,
    lineage: lastLineage,
    generation,
    factsVersion,
    lastCommittedGenerationMs: surfaceVersionMs,
    lastCommitSource: lastMetadata?.projectionSource ?? null,
    counters: getProjectionAuthorityCounters(),
    rooms: listProjectionAuthorityRoomFacts(),
  };
}

declare global {
  interface Window {
    __dibayProjectionAuthority?: {
      getDebugState: typeof getProjectionAuthorityDebugState;
      getCounters: typeof getProjectionAuthorityCounters;
      getState: typeof getProjectionAuthorityState;
      getMetadata: typeof getProjectionMetadata;
      getLineage: typeof getProjectionGenerationLineage;
      listRooms: typeof listProjectionAuthorityRoomFacts;
    };
  }
}

if (typeof window !== "undefined") {
  window.__dibayProjectionAuthority = {
    getDebugState: getProjectionAuthorityDebugState,
    getCounters: getProjectionAuthorityCounters,
    getState: getProjectionAuthorityState,
    getMetadata: getProjectionMetadata,
    getLineage: getProjectionGenerationLineage,
    listRooms: listProjectionAuthorityRoomFacts,
  };
}
