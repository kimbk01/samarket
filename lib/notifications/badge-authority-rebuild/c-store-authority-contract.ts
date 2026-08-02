/**
 * Slice 2-5 — C_store Authority Contract (pure).
 *
 * C_store = count of unfinished store Action Required items for store:{storeId}.
 * Clear = Action Complete only (not open / not notification read / not refresh).
 *
 * DO NOT import product Hub / Bell / App Icon / FCM / Native / DB runtime.
 * DO NOT reopen A_member / B_member / B_store formulas.
 */

import { storeBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-recipient-identity";
import { authorityAllowsSurface } from "@/lib/notifications/badge-authority-rebuild/badge-surface-eligibility";
import type { BadgeSurface } from "@/lib/notifications/badge-authority-rebuild/badge-authority-types";

export const C_STORE_AUTHORITY_CONTRACT_VERSION =
  "badge_authority_rebuild_slice2_5_c_store_contract_v1" as const;

export const C_STORE_ONE_LINER =
  "C_store is unfinished store work count, not unread notification count" as const;

/** Confirmed Action Required types counted in C_store. */
export type StoreOperationActionType =
  | "NEW_ORDER_PENDING"
  | "REFUND_REQUESTED"
  | "CANCEL_REQUESTED"
  | "OPEN_STORE_INQUIRY";

/** Explicitly not C_store (or blocked until evidence). */
export type StoreOperationNonCType =
  | "OWNER_CHAT_UNREAD"
  | "OWNER_INTAKE_NOTIFICATION"
  | "COOKING_STAGE"
  | "DELIVERY_STAGE"
  | "REVIEW_ACTION"
  | "SCREEN_OPEN"
  | "NOTIFICATION_READ"
  | "NOTIFICATION_DISMISS"
  | "MEMBER_BELL_NOTICE";

export type StoreOperationActionStatus =
  | "CONFIRMED"
  | "GAP_ADD"
  | "VERIFY"
  | "EXCLUDED"
  | "REWRITE"
  | "OUT_OF_BADGE"
  | "UNKNOWN_BLOCKED";

export type StoreOperationAction = {
  actionId: string;
  storeId: string;
  authority: "C_STORE_OPERATION";
  actionType: StoreOperationActionType;
  sourceDomain: string;
  sourceEntityId: string;
  openedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

export type CStoreActionSsotRow = {
  actionType: StoreOperationActionType | StoreOperationNonCType;
  sourceState: string;
  authority: "C_store" | "B_store" | "notification_transport" | "CTA_only" | "UNKNOWN_BLOCKED";
  identity: "store:{storeId}" | "current_user_writer" | "unknown";
  increase: string;
  completeDecrease: string;
  surface: string;
  status: StoreOperationActionStatus;
};

/** Final Event SSOT (contract lock). */
export const C_STORE_ACTION_SSOT: readonly CStoreActionSsotRow[] = [
  {
    actionType: "NEW_ORDER_PENDING",
    sourceState: "pending",
    authority: "C_store",
    identity: "store:{storeId}",
    increase: "order enters pending accept/reject",
    completeDecrease: "accept or reject complete",
    surface: "Owner Ops",
    status: "CONFIRMED",
  },
  {
    actionType: "REFUND_REQUESTED",
    sourceState: "refund_requested",
    authority: "C_store",
    identity: "store:{storeId}",
    increase: "refund request opened",
    completeDecrease: "approve / deny / resolve complete",
    surface: "Owner Ops",
    status: "CONFIRMED",
  },
  {
    actionType: "CANCEL_REQUESTED",
    sourceState: "cancel_requested",
    authority: "C_store",
    identity: "store:{storeId}",
    increase: "cancel request opened (store action required)",
    completeDecrease: "approve / deny / resolve complete",
    surface: "Owner Ops",
    status: "GAP_ADD",
  },
  {
    actionType: "OPEN_STORE_INQUIRY",
    sourceState: "store_inquiries.status=open",
    authority: "C_store",
    identity: "store:{storeId}",
    increase: "inquiry ticket created needing store response",
    completeDecrease: "reply complete or inquiry closed",
    surface: "Owner Ops",
    status: "CONFIRMED",
  },
  {
    actionType: "OWNER_CHAT_UNREAD",
    sourceState: "chat unread",
    authority: "B_store",
    identity: "store:{storeId}",
    increase: "customer message received",
    completeDecrease: "room read",
    surface: "Owner Chat",
    status: "EXCLUDED",
  },
  {
    actionType: "OWNER_INTAKE_NOTIFICATION",
    sourceState: "notification row / owner_intake",
    authority: "notification_transport",
    identity: "current_user_writer",
    increase: "push/inbox row created",
    completeDecrease: "notification read (NOT C clear)",
    surface: "Owner Tier1 Inbox",
    status: "REWRITE",
  },
  {
    actionType: "COOKING_STAGE",
    sourceState: "accepted→preparing→ready…",
    authority: "CTA_only",
    identity: "store:{storeId}",
    increase: "workflow status transition",
    completeDecrease: "next workflow status",
    surface: "Dashboard",
    status: "OUT_OF_BADGE",
  },
  {
    actionType: "DELIVERY_STAGE",
    sourceState: "delivering→arrived→completed",
    authority: "CTA_only",
    identity: "store:{storeId}",
    increase: "workflow status transition",
    completeDecrease: "next workflow status",
    surface: "Dashboard",
    status: "OUT_OF_BADGE",
  },
  {
    actionType: "REVIEW_ACTION",
    sourceState: "unknown",
    authority: "UNKNOWN_BLOCKED",
    identity: "unknown",
    increase: "unknown",
    completeDecrease: "unknown",
    surface: "FAB",
    status: "UNKNOWN_BLOCKED",
  },
] as const;

export const C_STORE_CONFIRMED_ACTION_TYPES: readonly StoreOperationActionType[] = [
  "NEW_ORDER_PENDING",
  "REFUND_REQUESTED",
  "CANCEL_REQUESTED",
  "OPEN_STORE_INQUIRY",
];

/**
 * CANCEL_REQUESTED exclusion: no store Action Required (e.g. already terminal /
 * auto-resolved without owner decision). CODE must implement evidence; contract locks the rule.
 */
export function cancelRequestedRequiresStoreAction(input: {
  orderStatus: string;
  storeActionRequired: boolean;
}): boolean {
  if (String(input.orderStatus ?? "").trim() !== "cancel_requested") return false;
  return input.storeActionRequired === true;
}

export function buildCStoreActionId(input: {
  storeId: string;
  actionType: StoreOperationActionType;
  sourceEntityId: string;
}): string {
  const storeId = String(input.storeId ?? "").trim();
  const sourceEntityId = String(input.sourceEntityId ?? "").trim();
  if (!storeId) throw new Error("C_STORE_ACTION_REQUIRES_STORE_ID");
  if (!sourceEntityId) throw new Error("C_STORE_ACTION_REQUIRES_SOURCE_ENTITY_ID");
  const id = storeBadgeIdentity(storeId);
  if (!id.ok) throw new Error("C_STORE_ACTION_REQUIRES_STORE_IDENTITY");
  return `${id.identity.key}|${input.actionType}|${sourceEntityId}`;
}

export function assertCStoreIdentity(storeId: string): {
  ok: true;
  key: `store:${string}`;
  storeId: string;
} | { ok: false; reason: string } {
  const id = storeBadgeIdentity(String(storeId ?? "").trim());
  if (!id.ok) return { ok: false, reason: id.reason };
  if (id.identity.scope !== "store") {
    return { ok: false, reason: "C_STORE_REQUIRES_STORE_IDENTITY" };
  }
  return { ok: true, key: id.identity.key, storeId: id.identity.storeId };
}

/** Reject owner/user identity as C_store authority key. */
export function rejectUserIdentityForCStore(userId: string): {
  ok: false;
  reason: "C_STORE_FORBIDS_USER_IDENTITY";
} {
  void userId;
  return { ok: false, reason: "C_STORE_FORBIDS_USER_IDENTITY" };
}

export function isCStoreConfirmedActionType(
  actionType: string
): actionType is StoreOperationActionType {
  return (C_STORE_CONFIRMED_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function classifyStoreOperationEvent(
  actionType: StoreOperationActionType | StoreOperationNonCType
): CStoreActionSsotRow {
  const row = C_STORE_ACTION_SSOT.find((r) => r.actionType === actionType);
  if (!row) {
    return {
      actionType: "REVIEW_ACTION",
      sourceState: "unknown",
      authority: "UNKNOWN_BLOCKED",
      identity: "unknown",
      increase: "unknown",
      completeDecrease: "unknown",
      surface: "unknown",
      status: "UNKNOWN_BLOCKED",
    };
  }
  return row;
}

/** Forbidden decrease triggers (never Action Complete). */
export const C_STORE_FORBIDDEN_DECREASE_TRIGGERS = [
  "OWNER_HUB_OPEN",
  "ORDER_DETAIL_OPEN",
  "NOTIFICATION_READ",
  "NOTIFICATION_INBOX_DELETE",
  "FCM_SELECT",
  "SCREEN_REFRESH",
  "TAB_SWITCH",
  "CHAT_ROOM_READ",
] as const;

export type CStoreForbiddenDecreaseTrigger =
  (typeof C_STORE_FORBIDDEN_DECREASE_TRIGGERS)[number];

export const C_STORE_ALLOWED_COMPLETE_TRIGGERS = [
  "ORDER_ACCEPT_COMPLETE",
  "ORDER_REJECT_COMPLETE",
  "REFUND_RESOLVE_COMPLETE",
  "CANCEL_RESOLVE_COMPLETE",
  "INQUIRY_RESOLVE_COMPLETE",
  "ACTION_CANCELLED_NO_LONGER_REQUIRED",
] as const;

export type CStoreAllowedCompleteTrigger =
  (typeof C_STORE_ALLOWED_COMPLETE_TRIGGERS)[number];

export function isForbiddenCStoreDecrease(
  trigger: string
): trigger is CStoreForbiddenDecreaseTrigger {
  return (C_STORE_FORBIDDEN_DECREASE_TRIGGERS as readonly string[]).includes(trigger);
}

export function isAllowedCStoreComplete(
  trigger: string
): trigger is CStoreAllowedCompleteTrigger {
  return (C_STORE_ALLOWED_COMPLETE_TRIGGERS as readonly string[]).includes(trigger);
}

/**
 * Dual-source max() is forbidden as C_store authority.
 * Presentation may show two digits; authority must pick one truth source.
 */
export function forbidMaxAsCStoreAuthority(
  _stateCount: number,
  _fabOwnerOrders: number
): { ok: false; reason: "C_STORE_FORBIDS_MAX_DUAL_AUTHORITY" } {
  return { ok: false, reason: "C_STORE_FORBIDS_MAX_DUAL_AUTHORITY" };
}

/** Presentation-only sum — never API/DB/FCM/Native authority. */
export function ownerPresentationTotal(
  bStore: number,
  cStore: number
): { presentationOnly: true; total: number } {
  return {
    presentationOnly: true,
    total: Math.max(0, Math.floor(bStore)) + Math.max(0, Math.floor(cStore)),
  };
}

export function cStoreAllowsSurface(surface: BadgeSurface): boolean {
  return authorityAllowsSurface("C_STORE_OPERATION", surface);
}

export const C_STORE_FORBIDDEN_SURFACES: readonly BadgeSurface[] = [
  "MEMBER_BELL",
  "MEMBER_APP_ICON",
  "BOTTOM_CHAT",
  "CUSTOMER_ORDER_HUB",
  "OWNER_CHAT_SURFACE",
  "OWNER_STORE_ORDER_ROW",
  "NATIVE_MEMBER_APP_ICON",
  "MEMBER_CHAT_ROW",
];

export function assertCStoreSurfaceForbidden(surface: BadgeSurface): boolean {
  return C_STORE_FORBIDDEN_SURFACES.includes(surface);
}

/** Pure in-memory ledger for contract tests (not product runtime). */
export function createCStoreActionLedger() {
  const byId = new Map<string, StoreOperationAction>();

  function openAction(input: {
    storeId: string;
    actionType: StoreOperationActionType;
    sourceDomain: string;
    sourceEntityId: string;
    openedAt?: string;
  }): { opened: boolean; action: StoreOperationAction; delta: 0 | 1 } {
    const identity = assertCStoreIdentity(input.storeId);
    if (!identity.ok) {
      throw new Error(identity.reason);
    }
    const actionId = buildCStoreActionId({
      storeId: identity.storeId,
      actionType: input.actionType,
      sourceEntityId: input.sourceEntityId,
    });
    const existing = byId.get(actionId);
    if (existing && existing.completedAt == null && existing.cancelledAt == null) {
      return { opened: false, action: existing, delta: 0 };
    }
    const action: StoreOperationAction = {
      actionId,
      storeId: identity.storeId,
      authority: "C_STORE_OPERATION",
      actionType: input.actionType,
      sourceDomain: input.sourceDomain,
      sourceEntityId: String(input.sourceEntityId).trim(),
      openedAt: input.openedAt ?? new Date(0).toISOString(),
      completedAt: null,
      cancelledAt: null,
    };
    byId.set(actionId, action);
    return { opened: true, action, delta: 1 };
  }

  function completeAction(
    actionId: string,
    trigger: string,
    at?: string
  ): { completed: boolean; delta: 0 | -1; reason?: string } {
    if (isForbiddenCStoreDecrease(trigger)) {
      return { completed: false, delta: 0, reason: "FORBIDDEN_DECREASE_TRIGGER" };
    }
    if (!isAllowedCStoreComplete(trigger)) {
      return { completed: false, delta: 0, reason: "UNKNOWN_COMPLETE_TRIGGER" };
    }
    const action = byId.get(actionId);
    if (!action) return { completed: false, delta: 0, reason: "ACTION_NOT_FOUND" };
    if (action.completedAt != null || action.cancelledAt != null) {
      return { completed: false, delta: 0, reason: "ALREADY_INACTIVE" };
    }
    const next: StoreOperationAction = {
      ...action,
      completedAt: at ?? new Date(0).toISOString(),
    };
    byId.set(actionId, next);
    return { completed: true, delta: -1 };
  }

  function cancelActionNoLongerRequired(
    actionId: string,
    at?: string
  ): { cancelled: boolean; delta: 0 | -1 } {
    const action = byId.get(actionId);
    if (!action) return { cancelled: false, delta: 0 };
    if (action.completedAt != null || action.cancelledAt != null) {
      return { cancelled: false, delta: 0 };
    }
    byId.set(actionId, {
      ...action,
      cancelledAt: at ?? new Date(0).toISOString(),
    });
    return { cancelled: true, delta: -1 };
  }

  function countForStore(storeId: string): number {
    const identity = assertCStoreIdentity(storeId);
    if (!identity.ok) return 0;
    let n = 0;
    for (const a of byId.values()) {
      if (a.storeId !== identity.storeId) continue;
      if (a.completedAt != null || a.cancelledAt != null) continue;
      n += 1;
    }
    return n;
  }

  function applyForbiddenTrigger(trigger: string, storeId: string): number {
    void trigger;
    return countForStore(storeId);
  }

  return {
    openAction,
    completeAction,
    cancelActionNoLongerRequired,
    countForStore,
    applyForbiddenTrigger,
    getAction: (actionId: string) => byId.get(actionId) ?? null,
  };
}

/**
 * Contract Hub formula candidate (distinct actions — not dual max).
 * Live code may still omit CANCEL; contract requires GAP_ADD inclusion.
 */
export function cStoreHubFormulaCandidate(counts: {
  pendingOrderActions: number;
  refundActions: number;
  cancelActions: number;
  openInquiryActions: number;
}): number {
  return (
    Math.max(0, Math.floor(counts.pendingOrderActions)) +
    Math.max(0, Math.floor(counts.refundActions)) +
    Math.max(0, Math.floor(counts.cancelActions)) +
    Math.max(0, Math.floor(counts.openInquiryActions))
  );
}

/** owner_intake transport is never C truth by itself. */
export function ownerIntakeNotificationIsCTruth(): false {
  return false;
}

/** Notification read must not clear C. */
export function notificationReadClearsCStore(): false {
  return false;
}

/** Screen open must not clear C. */
export function screenOpenClearsCStore(): false {
  return false;
}
