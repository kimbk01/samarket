/**
 * Phase 3-2 — Bell Writer Authority SSOT
 *
 * Goal: Bell Commit Point = 1 (surface digit).
 * Bootstrap / Realtime / Poll / Read MAY trigger rebuild; FINAL COMMIT must be
 * the same Bell Apply.
 *
 * Pipeline (locked):
 *   notification_events (eligible unread)
 *     → count / Bell Explain Matrix
 *     → Domain Projection.bell (+ bellTotal)
 *     → applyNotificationBadgeProjection / ACK Apply
 *     → patchNotificationBadgeCountSnapshot
 *     → applyBellBadgeProjection   ← THE Bell commit
 *     → notification-badge-count-store → Header Bell / Inbox digit consumer
 *
 * DO NOT: Badge reopen · RoomUnread · Event create-policy change · digit hacks ·
 *         Inbox UI · DeepLink · Legacy delete · Heal · Product PASS / LOCK
 */

import {
  assertBellExplainMatrix,
  type BellExplainMatrix,
} from "@/lib/notifications/bell-explain-matrix";

export const BELL_WRITER_AUTHORITY = "bell_writer_ssot_v1" as const;

/** THE client Bell digit commit. */
export const BELL_COMMIT_ENTRY = "applyBellBadgeProjection" as const;

/** Server insert SSOT for notification_events. */
export const BELL_EVENT_INSERT_SSOT = "createNotificationEvent" as const;

export type BellWriterTriggerId =
  | "bootstrap"
  | "realtime"
  | "poll"
  | "read"
  | "status"
  | "missed_call"
  | "system_admin"
  | "legacy"
  | "fallback";

export type BellWriterTriggerInventory = Readonly<{
  trigger: BellWriterTriggerId;
  /** May request rebuild / event write — not a second Bell digit Authority. */
  role: "rebuild_trigger" | "event_insert_pipeline" | "legacy_banned" | "authority_wipe";
  path: string;
  notes: string;
}>;

/**
 * Trigger inventory — product tree (2026-08-01 Phase 3-2).
 * Event insert pipelines write rows via createNotificationEvent only;
 * digit commit remains applyBellBadgeProjection after Projection/ACK.
 */
export const BELL_WRITER_TRIGGER_INVENTORY: readonly BellWriterTriggerInventory[] = [
  {
    trigger: "bootstrap",
    role: "rebuild_trigger",
    path: "ensureInitialBadgeSnapshotForBoot → badge-count → commitCompleteProjectionSnapshot → Apply (applyBell)",
    notes: "Boot owns first Generation; Bell store is consumer",
  },
  {
    trigger: "realtime",
    role: "rebuild_trigger",
    path: "NotificationsBadgeRealtimeBridge / room-fact dirty → resync → same Apply",
    notes: "RT must not invent Bell total outside Projection",
  },
  {
    trigger: "poll",
    role: "rebuild_trigger",
    path: "badge_count_poll_dirty → doFetch → applyAuthorityJsonAsProjection → same Apply",
    notes: "Dirty-gated poll; not a second writer",
  },
  {
    trigger: "read",
    role: "rebuild_trigger",
    path: "domain-badge-read-ack / applyNotificationBadgeCountAuthorityAck → same Apply",
    notes: "Read ACK Generation Owner; optimistic event facts then complete snapshot",
  },
  {
    trigger: "status",
    role: "event_insert_pipeline",
    path: "notify-store-commerce / appendUserNotification → createNotificationEvent (+ supersede mark-read)",
    notes: "Creates/ends events; digit via next Projection rebuild — not direct store write",
  },
  {
    trigger: "missed_call",
    role: "event_insert_pipeline",
    path: "room-bound: call_stub Conversation B; orphan-only A via createNotificationEvent",
    notes: "Room-bound missed must not write Member Bell A; digit via Projection",
  },
  {
    trigger: "system_admin",
    role: "event_insert_pipeline",
    path: "campaign-send-user / community in-app → createNotificationEvent",
    notes: "admin_marketing_banner excluded from digit; admin_notice included",
  },
  {
    trigger: "legacy",
    role: "legacy_banned",
    path: "legacy notifications table merge / dual-read",
    notes: "Phase 4 delete; must not write Bell digit (legacy_merge=false on Inbox)",
  },
  {
    trigger: "fallback",
    role: "authority_wipe",
    path: "resetNotificationBadgeCountForAuthEpoch → applyBellBadgeProjection(clear→0)",
    notes: "Logout wipe only — not a digit invent path",
  },
] as const;

export type BellSurfaceWriterInventory = Readonly<{
  surface: "header_bell" | "bell_store" | "inbox_digit_consumer" | "event_insert";
  authorityWriterCount: 1;
  primaryAuthorityWriter: string;
  commitEntry: string;
  legacyWriter: string | null;
  fallbackWriter: string | null;
}>;

export const BELL_SURFACE_WRITER_INVENTORY: readonly BellSurfaceWriterInventory[] = [
  {
    surface: "event_insert",
    authorityWriterCount: 1,
    primaryAuthorityWriter: BELL_EVENT_INSERT_SSOT,
    commitEntry: "lib/notifications/core/notification-event-repository.ts#createNotificationEvent",
    legacyWriter: "direct notification_events insert bypass (banned)",
    fallbackWriter: null,
  },
  {
    surface: "bell_store",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "notification-badge-count-store snap via Bell projection sink",
    commitEntry: BELL_COMMIT_ENTRY,
    legacyWriter: null,
    fallbackWriter: "resetNotificationBadgeCountForAuthEpoch → clear",
  },
  {
    surface: "header_bell",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "resolveTier1HeaderBellBadgeTotal(badgeCountTotal) ← store.total",
    commitEntry: `${BELL_COMMIT_ENTRY} → store.total → Header`,
    legacyWriter: "storeUnread / rowUnread / supplementalUnread (banned)",
    fallbackWriter: null,
  },
  {
    surface: "inbox_digit_consumer",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "same store.total / unread_total from notification_events Authority",
    commitEntry: `${BELL_COMMIT_ENTRY} (digit); list rows from events (Phase 3-4 identity)`,
    legacyWriter: "legacy notifications merge (banned)",
    fallbackWriter: null,
  },
] as const;

export function listBellWriterTriggerInventory(): readonly BellWriterTriggerInventory[] {
  return BELL_WRITER_TRIGGER_INVENTORY;
}

export function listBellSurfaceWriterInventory(): readonly BellSurfaceWriterInventory[] {
  return BELL_SURFACE_WRITER_INVENTORY;
}

export function assertBellWriterAuthorityInventory(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const triggers = new Set<string>();
  for (const row of BELL_WRITER_TRIGGER_INVENTORY) {
    if (triggers.has(row.trigger)) errors.push(`duplicate_trigger:${row.trigger}`);
    triggers.add(row.trigger);
  }
  for (const id of [
    "bootstrap",
    "realtime",
    "poll",
    "read",
    "status",
    "missed_call",
    "system_admin",
    "legacy",
    "fallback",
  ] as const) {
    if (!triggers.has(id)) errors.push(`missing_trigger:${id}`);
  }

  const surfaces = new Set<string>();
  for (const row of BELL_SURFACE_WRITER_INVENTORY) {
    if (surfaces.has(row.surface)) errors.push(`duplicate_surface:${row.surface}`);
    surfaces.add(row.surface);
    if (row.authorityWriterCount !== 1) {
      errors.push(`${row.surface}:authorityWriterCount!=1`);
    }
    if (!row.commitEntry.includes(BELL_COMMIT_ENTRY) && row.surface !== "event_insert") {
      errors.push(`${row.surface}:commit_not_${BELL_COMMIT_ENTRY}`);
    }
    if (row.surface === "event_insert" && !row.commitEntry.includes(BELL_EVENT_INSERT_SSOT)) {
      errors.push("event_insert:commit_not_createNotificationEvent");
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Explain Matrix == Bell digit (Authority) — Phase 3-2 Runtime gate with 3-1.
 */
export function assertBellExplainMatchesDigit(input: {
  bellExplainMatrix: BellExplainMatrix;
  bellTotal: number;
}): { ok: boolean; errors: string[] } {
  return assertBellExplainMatrix(input.bellExplainMatrix, {
    expectedBellTotal: input.bellTotal,
    requireEventIds: true,
  });
}
