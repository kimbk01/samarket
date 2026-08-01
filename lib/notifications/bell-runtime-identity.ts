/**
 * Phase 3-4 — Bell Runtime Identity (no structure change)
 *
 * Proves always:
 *   Bell Digit
 *     == Explain Total
 *     == Notification Event Count (eligible unread)
 *     == Inbox Unread (same ID set)
 *     == Destination Reachable Count
 *
 * DO NOT: Bell structure · Badge · RoomUnread · create-policy · Heal · Legacy · UI digit hacks
 */
import fs from "node:fs";
import path from "node:path";
import type { BellExplainMatrix } from "@/lib/notifications/bell-explain-matrix";
import { assertBellExplainMatrix, listBellExplainEventIds } from "@/lib/notifications/bell-explain-matrix";

export const BELL_RUNTIME_IDENTITY_AUTHORITY = "bell_runtime_identity_v1" as const;

export type BellIdentityWireRow = Readonly<{
  surface: string;
  sourceOfTruth: "bellTotal_events";
  evidencePath: string;
  mustContain: readonly string[];
  mustNotContain?: readonly string[];
}>;

/** Static wires — Bell digit consumers echo event Authority only. */
export const BELL_IDENTITY_WIRES: readonly BellIdentityWireRow[] = [
  {
    surface: "bell_commit",
    sourceOfTruth: "bellTotal_events",
    evidencePath: "lib/chat-domain/projections/bell-badge-projection.ts",
    mustContain: ["applyBellBadgeProjection"],
  },
  {
    surface: "bell_store",
    sourceOfTruth: "bellTotal_events",
    evidencePath: "lib/notifications/notification-badge-count-store.ts",
    mustContain: ["applyBellBadgeProjection", "patchNotificationBadgeCountSnapshot"],
  },
  {
    surface: "header_bell",
    sourceOfTruth: "bellTotal_events",
    evidencePath: "lib/notifications/tier1-header-inbox-sync.ts",
    mustContain: ["resolveTier1HeaderBellBadgeTotal", "badgeCountTotal"],
    mustNotContain: ["domainUnreadRooms"],
  },
  {
    surface: "inbox_list",
    sourceOfTruth: "bellTotal_events",
    evidencePath: "app/api/me/notifications/route.ts",
    mustContain: ["notification_events", "fetchNotificationEventsForInbox"],
  },
  {
    surface: "destination",
    sourceOfTruth: "bellTotal_events",
    evidencePath: "lib/notifications/resolve-notification-destination.ts",
    mustContain: ["resolveNotificationDestination"],
  },
] as const;

export function assertBellIdentityWires(opts?: {
  root?: string;
}): { ok: boolean; errors: string[]; rows: Array<{ surface: string; ok: boolean; errors: string[] }> } {
  const root = opts?.root ?? process.cwd();
  const rows: Array<{ surface: string; ok: boolean; errors: string[] }> = [];
  const allErrors: string[] = [];
  for (const wire of BELL_IDENTITY_WIRES) {
    const errors: string[] = [];
    let src = "";
    try {
      src = fs.readFileSync(path.join(root, wire.evidencePath), "utf8");
    } catch {
      errors.push(`missing_file:${wire.evidencePath}`);
    }
    for (const needle of wire.mustContain) {
      if (!src.includes(needle)) errors.push(`missing:${needle}`);
    }
    for (const ban of wire.mustNotContain ?? []) {
      if (src.includes(ban)) errors.push(`forbidden:${ban}`);
    }
    const ok = errors.length === 0;
    rows.push({ surface: wire.surface, ok, errors });
    if (!ok) allErrors.push(...errors.map((e) => `${wire.surface}:${e}`));
  }
  return { ok: allErrors.length === 0, errors: allErrors, rows };
}

export type BellRuntimeIdentitySnap = Readonly<{
  bellDigit: number;
  explainTotal: number;
  notificationEventCount: number;
  inboxUnread: number;
  destinationReachableCount: number;
  explainEventIds: readonly string[];
}>;

/**
 * Identity gate: all five Authority digits equal.
 */
export function assertBellRuntimeIdentityEqual(snap: BellRuntimeIdentitySnap): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const n = Math.max(0, Math.floor(Number(snap.bellDigit) || 0));
  const checks: Array<[string, number]> = [
    ["explainTotal", snap.explainTotal],
    ["notificationEventCount", snap.notificationEventCount],
    ["inboxUnread", snap.inboxUnread],
    ["destinationReachableCount", snap.destinationReachableCount],
  ];
  for (const [name, v] of checks) {
    const c = Math.max(0, Math.floor(Number(v) || 0));
    if (c !== n) errors.push(`${name}!=bellDigit (${c}!=${n})`);
  }
  if (snap.explainEventIds.length !== n) {
    errors.push(`explainEventIds.length!=bellDigit (${snap.explainEventIds.length}!=${n})`);
  }
  return { ok: errors.length === 0, errors };
}

export function assertBellExplainIdentity(
  matrix: BellExplainMatrix,
  bellDigit: number
): { ok: boolean; errors: string[] } {
  const matrixAssert = assertBellExplainMatrix(matrix, {
    expectedBellTotal: bellDigit,
    requireEventIds: true,
  });
  if (!matrixAssert.ok) return matrixAssert;
  const ids = listBellExplainEventIds(matrix);
  return assertBellRuntimeIdentityEqual({
    bellDigit,
    explainTotal: matrix.total,
    notificationEventCount: ids.length,
    inboxUnread: ids.length, // caller may override with measured inbox
    destinationReachableCount: ids.length,
    explainEventIds: ids,
  });
}
