/**
 * Phase 2-2 — Badge Writer Authority SSOT
 *
 * Goal: one Authority Writer per Domain Badge surface (not fewer files).
 * Bootstrap / Realtime / Poll / Reconnect MAY trigger rebuild, but FINAL COMMIT
 * must pass the same Projection Apply.
 *
 * DO NOT: Bell rewrite · RoomUnread · Native Badge impl change · Legacy delete · Heal
 *
 * Pipeline (locked):
 *   RoomUnread facts → Builder (+ Explain Matrix) → Projection Authority
 *     → applyNotificationBadgeProjection → surface stores / push payload
 */

import type { BadgeExplainMatrix } from "@/lib/notifications/badge-explain-matrix";
import { assertBadgeExplainMatrix } from "@/lib/notifications/badge-explain-matrix";

export const BADGE_WRITER_AUTHORITY = "domain_badge_writer_ssot_v1" as const;

export type BadgeWriterSurfaceId =
  | "app_icon"
  | "bottom"
  | "trade"
  | "customer"
  | "owner"
  | "native_badge"
  | "launcher_badge"
  | "fcm_badge_count"
  | "apns_badge";

export type BadgeSurfaceWriterInventory = Readonly<{
  surface: BadgeWriterSurfaceId;
  /** Authority writers that decide the digit (must be 1). */
  authorityWriterCount: 1;
  primaryAuthorityWriter: string;
  /** Triggers that may request rebuild — not separate authority. */
  bootstrap: string;
  realtime: string;
  poll: string;
  /** Platform / shell emitters (must echo Authority, not invent). */
  secondaryEmitter: string | null;
  legacyWriter: string | null;
  fallbackWriter: string | null;
  /** Final commit entry (single). */
  commitEntry: string;
}>;

/**
 * Locked inventory — product tree (2026-08-01 Phase 2-2).
 * Legacy helpers may still exist on disk (Phase 4 delete) but MUST NOT be product commit.
 */
export const BADGE_SURFACE_WRITER_INVENTORY: readonly BadgeSurfaceWriterInventory[] = [
  {
    surface: "app_icon",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "publishDomainAppIconCompleteSnapshot via applyNotificationBadgeProjection",
    bootstrap: "ensureInitialBadgeSnapshotForBoot → badge-count → Projection Authority COMPLETE",
    realtime: "commitCmRoomUnreadFactEvent → rebuild → same Apply",
    poll: "dirty poll / requestNotificationBadgeCountResync → same Apply",
    secondaryEmitter: "NativeBadgeSync / FCM / APNS (echo appIconTotal only)",
    legacyWriter: "publishDomainBadgeShellToSurfaceStore / publishMissedCallToDomainBadgeSurface (banned on product path)",
    fallbackWriter: null,
    commitEntry: "applyNotificationBadgeProjection",
  },
  {
    surface: "bottom",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "applyMessengerBottomChatUnread via applyDomainAuthorityHubBadgeOptimistic",
    bootstrap: "same COMPLETE Apply",
    realtime: "same Apply (room fact / badge-count)",
    poll: "same Apply",
    secondaryEmitter: null,
    legacyWriter: "Hub absolute CM writer (deleted P0-2; must not revive)",
    fallbackWriter: null,
    commitEntry: "applyNotificationBadgeProjection → applyDomainAuthorityHubBadgeOptimistic",
  },
  {
    surface: "trade",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "hub.chatUnread ← Domain tradeHub via applyDomainAuthorityHubBadgeOptimistic",
    bootstrap: "same COMPLETE Apply",
    realtime: "same Apply",
    poll: "Hub GET must preserve Trade axis (P1-c); Authority rewrite only via optimistic Apply",
    secondaryEmitter: null,
    legacyWriter: null,
    fallbackWriter: null,
    commitEntry: "applyNotificationBadgeProjection → applyDomainAuthorityHubBadgeOptimistic",
  },
  {
    surface: "customer",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "hub.buyerOrderAttention ← storeOrderCustomerUnreadRooms via optimistic Apply",
    bootstrap: "same COMPLETE Apply",
    realtime: "same Apply",
    poll: "Hub GET preserves buyer axis (P1-c)",
    secondaryEmitter: null,
    legacyWriter: null,
    fallbackWriter: null,
    commitEntry: "applyNotificationBadgeProjection → applyDomainAuthorityHubBadgeOptimistic",
  },
  {
    surface: "owner",
    authorityWriterCount: 1,
    primaryAuthorityWriter:
      "hub.storeOrderOwnerUnreadRooms ← Domain owner aggregate via optimistic Apply",
    bootstrap: "same COMPLETE Apply",
    realtime: "same Apply",
    poll: "Hub GET preserves owner aggregate (P1-c); FAB storeOrderChatUnread is store-scoped shell (Hub GET) — not App Icon axis",
    secondaryEmitter: "Owner FAB storeOrderChatUnread (Hub shell; store-scoped)",
    legacyWriter: null,
    fallbackWriter: null,
    commitEntry: "applyNotificationBadgeProjection → applyDomainAuthorityHubBadgeOptimistic",
  },
  {
    surface: "native_badge",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "domain-badge-surface-store.appIconTotal (Authority)",
    bootstrap: "NativeBadgeSync after COMPLETE",
    realtime: "NativeBadgeSync subscribe",
    poll: "NativeBadgeSync subscribe",
    secondaryEmitter: "syncNativeBadgeCount → Capawesome Badge.set (echo only)",
    legacyWriter: null,
    fallbackWriter: "logout badge clear durable tx (begin pending → execute/recover → Badge.get 0)",
    commitEntry: "applyNotificationBadgeProjection → surface store → NativeBadgeSync",
  },
  {
    surface: "launcher_badge",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "appIconTotal (same Domain Authority)",
    bootstrap: "Cap Badge / push after Apply",
    realtime: "Cap Badge via NativeBadgeSync",
    poll: "same",
    secondaryEmitter:
      "Android summary setNumber (dibay_app_icon_summary_v1) + Cap echo — domain child number=0",
    legacyWriter: null,
    fallbackWriter: null,
    commitEntry: "Domain appIconTotal only (no Bell)",
  },
  {
    surface: "fcm_badge_count",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "notify-push-dispatcher ← fetchDomainBadgeAuthorityPayload.projection.appIconTotal",
    bootstrap: "n/a (push path)",
    realtime: "n/a",
    poll: "n/a",
    secondaryEmitter: "DibayFirebaseMessagingService.setNumber (echo payload)",
    legacyWriter: null,
    fallbackWriter: null,
    commitEntry: "Domain Builder appIconTotal embedded in FCM data",
  },
  {
    surface: "apns_badge",
    authorityWriterCount: 1,
    primaryAuthorityWriter: "apns-sender-impl aps.badge ← same appIconTotal",
    bootstrap: "n/a",
    realtime: "n/a",
    poll: "n/a",
    secondaryEmitter: null,
    legacyWriter: null,
    fallbackWriter: null,
    commitEntry: "Domain Builder appIconTotal embedded in APNS",
  },
] as const;

export function listBadgeSurfaceWriterInventory(): readonly BadgeSurfaceWriterInventory[] {
  return BADGE_SURFACE_WRITER_INVENTORY;
}

export function assertBadgeWriterAuthorityInventory(): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const row of BADGE_SURFACE_WRITER_INVENTORY) {
    if (seen.has(row.surface)) errors.push(`duplicate_surface:${row.surface}`);
    seen.add(row.surface);
    if (row.authorityWriterCount !== 1) {
      errors.push(`${row.surface}:authorityWriterCount!=1`);
    }
    if (!row.primaryAuthorityWriter.trim()) {
      errors.push(`${row.surface}:missing_primary`);
    }
    if (!row.commitEntry.trim()) {
      errors.push(`${row.surface}:missing_commit`);
    }
  }
  const required: BadgeWriterSurfaceId[] = [
    "app_icon",
    "bottom",
    "trade",
    "customer",
    "owner",
    "native_badge",
    "launcher_badge",
    "fcm_badge_count",
    "apns_badge",
  ];
  for (const id of required) {
    if (!seen.has(id)) errors.push(`missing_surface:${id}`);
  }
  return { ok: errors.length === 0, errors };
}

export type DomainBadgeExplainProjectionMatchInput = Readonly<{
  explainMatrix: BadgeExplainMatrix;
  projection: Readonly<{
    appIconTotal: number;
    bottomChatTotal: number;
  }>;
  domainAppIcon: Readonly<{
    messenger: number;
    trade: number;
    storeOrder: number;
    missedCall: number;
  }>;
  storeOrderBuyerDeliveryUnread: number;
  storeOrderOwnerChatUnread: number;
  domainUnreadRooms: Readonly<{
    trade: number;
  }>;
}>;

/**
 * Explain Matrix == Projection (Authority digits).
 * Surface stores are client-side echoes of the same Apply — Phase 2-2 server/runtime gate.
 *
 * Member App Icon axes (approved formula):
 * - storeOrder = customer/buyer rooms only (Owner excluded from Member domainAppIcon.storeOrder)
 * - missedCall field (legacy name) = notificationAttention / Member A axis on App Icon
 *   = explain.appIcon.total − (GD+Group+Trade+Customer), NOT orphan event count alone
 * Owner rooms stay on explain.owner / expectedOwnerTotal — never folded into Member storeOrder.
 */
export function assertExplainMatchesProjection(
  input: DomainBadgeExplainProjectionMatchInput
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const matrixAssert = assertBadgeExplainMatrix(input.explainMatrix, {
    expectedAppIconTotal: input.projection.appIconTotal,
    expectedBottomTotal: input.projection.bottomChatTotal,
    expectedTradeTotal: input.domainUnreadRooms.trade,
    expectedCustomerTotal: input.storeOrderBuyerDeliveryUnread,
    expectedOwnerTotal: input.storeOrderOwnerChatUnread,
    requireMissedCallEventIds: input.explainMatrix.appIcon.missedCall.count > 0,
  });
  if (!matrixAssert.ok) errors.push(...matrixAssert.errors);

  const m = input.explainMatrix;
  const messenger = m.appIcon.general.count + m.appIcon.group.count;
  /** Member storeOrder axis — customer only; Owner must not be added here. */
  const storeCustomerOnly = m.appIcon.customerOrder.count;
  const memberRoomSum =
    m.appIcon.general.count +
    m.appIcon.group.count +
    m.appIcon.trade.count +
    m.appIcon.customerOrder.count;
  /** Canonical App Icon notification axis (A / notificationAttention); legacy field name missedCall. */
  const notificationAxis = Math.max(0, m.appIcon.total - memberRoomSum);
  if (input.domainAppIcon.messenger !== messenger) {
    errors.push(`domainAppIcon.messenger!=explain (${input.domainAppIcon.messenger}!=${messenger})`);
  }
  if (input.domainAppIcon.trade !== m.appIcon.trade.count) {
    errors.push(`domainAppIcon.trade!=explain`);
  }
  if (input.domainAppIcon.storeOrder !== storeCustomerOnly) {
    errors.push(
      `domainAppIcon.storeOrder!=explain.customer (${input.domainAppIcon.storeOrder}!=${storeCustomerOnly})`
    );
  }
  if (input.domainAppIcon.missedCall !== notificationAxis) {
    errors.push(
      `domainAppIcon.missedCall!=explain.notificationAxis (${input.domainAppIcon.missedCall}!=${notificationAxis})`
    );
  }
  if (m.appIcon.total !== input.projection.appIconTotal) {
    errors.push("explain.appIcon!=projection.appIconTotal");
  }
  if (m.bottom.total !== input.projection.bottomChatTotal) {
    errors.push("explain.bottom!=projection.bottomChatTotal");
  }

  return { ok: errors.length === 0, errors };
}
