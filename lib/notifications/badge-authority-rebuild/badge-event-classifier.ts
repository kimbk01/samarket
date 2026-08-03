/**
 * Slice 2-1 — Central event classifier (pure).
 * Does not write events or mutate product projections.
 */

import type {
  BadgeAuthority,
  BadgeAuthorityClassification,
} from "./badge-authority-types";
import {
  assertAuthorityIdentityCompatible,
  type BadgeAssertionResult,
} from "./badge-authority-assertions";
import {
  memberBadgeIdentity,
  storeBadgeIdentity,
  type BadgeRecipientIdentity,
} from "./badge-recipient-identity";
import {
  isOwnerIntakeAttentionKey,
  isOwnerStoreOperationMetaKind,
  OWNER_STORE_OPERATION_META_KINDS,
} from "./phase1-authority-contract";

export type BadgeClassifyEventInput = Readonly<{
  /** High-level kind hint from Phase 1 taxonomy or adapters. */
  kind?: string | null;
  type?: string | null;
  category?: string | null;
  metaKind?: string | null;
  attentionKey?: string | null;
  chatDomain?: string | null;
  /** buyer | owner | member | store | unknown */
  recipientRole?: string | null;
  userId?: string | null;
  storeId?: string | null;
  pushKind?: string | null;
  persistsInInbox?: boolean | null;
  isSelfSent?: boolean | null;
  isDuplicate?: boolean | null;
  callOutcome?: "missed" | "completed" | "other" | null;
}>;

export type BadgeClassifyResult = Readonly<{
  classification: BadgeAuthorityClassification;
  identity: BadgeRecipientIdentity | null;
  identityError: BadgeAssertionResult | null;
  /** Future Slice 2-5: current owner writer uses user_id — must REWRITE. */
  documentedRewriteTarget: "notifyStoreOwnerNewOrder_user_id_writer" | null;
}>;

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function raw(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const CHAT_TYPES = new Set([
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
  "general_message",
  "group_message",
]);

const A_KINDS = new Set([
  "trade_status",
  "customer_order_status",
  "order_status",
  "delivery_status",
  "service_notice",
  "security_alert",
  "admin_notice",
  "system_persistent",
  "notice_persistent",
  "admin_marketing_banner",
]);

const MARKETING = new Set([
  "marketing_ephemeral",
  "admin_test",
]);

function isOwnerIntakeInput(input: BadgeClassifyEventInput): boolean {
  const attention = raw(input.attentionKey);
  if (attention && isOwnerIntakeAttentionKey(attention)) return true;
  const meta = raw(input.metaKind);
  if (meta && isOwnerStoreOperationMetaKind(meta)) return true;
  const kind = norm(input.kind) || norm(input.type);
  if (kind === "store_new_order" || kind === "store_action_required") return true;
  if (kind === "owner_intake") return true;
  return false;
}

function resolveMemberIdentity(userId: string | null | undefined): {
  identity: BadgeRecipientIdentity | null;
  identityError: BadgeAssertionResult | null;
} {
  const id = raw(userId);
  if (!id) return { identity: null, identityError: { ok: false, reason: "RAW_UUID_IS_NOT_A_BADGE_IDENTITY" } };
  const parsed = memberBadgeIdentity(id);
  if (!parsed.ok) {
    return {
      identity: null,
      identityError: { ok: false, reason: "RAW_UUID_IS_NOT_A_BADGE_IDENTITY" },
    };
  }
  return { identity: parsed.identity, identityError: null };
}

function resolveStoreIdentity(storeId: string | null | undefined): {
  identity: BadgeRecipientIdentity | null;
  identityError: BadgeAssertionResult | null;
} {
  const id = raw(storeId);
  if (!id) {
    return {
      identity: null,
      identityError: { ok: false, reason: "STORE_ID_REQUIRED_FOR_OWNER_INTAKE" },
    };
  }
  const parsed = storeBadgeIdentity(id);
  if (!parsed.ok) {
    return {
      identity: null,
      identityError: { ok: false, reason: "STORE_ID_REQUIRED_FOR_OWNER_INTAKE" },
    };
  }
  return { identity: parsed.identity, identityError: null };
}

function withAuthority(
  authority: BadgeAuthority,
  identity: BadgeRecipientIdentity | null,
  identityError: BadgeAssertionResult | null,
  rewrite: BadgeClassifyResult["documentedRewriteTarget"] = null
): BadgeClassifyResult {
  if (identity) {
    const compat = assertAuthorityIdentityCompatible(authority, identity);
    if (!compat.ok) {
      return {
        classification: "UNKNOWN_BLOCKED",
        identity: null,
        identityError: compat,
        documentedRewriteTarget: rewrite,
      };
    }
  }
  return {
    classification: authority,
    identity,
    identityError,
    documentedRewriteTarget: rewrite,
  };
}

/**
 * Classify a badge-relevant event. Never invents storeId from owner userId.
 */
export function classifyBadgeAuthority(
  input: BadgeClassifyEventInput
): BadgeClassifyResult {
  if (input.isDuplicate) {
    return {
      classification: "EPHEMERAL_NO_BADGE",
      identity: null,
      identityError: null,
      documentedRewriteTarget: null,
    };
  }
  if (input.isSelfSent) {
    return {
      classification: "EPHEMERAL_NO_BADGE",
      identity: null,
      identityError: null,
      documentedRewriteTarget: null,
    };
  }

  const kind = norm(input.kind) || norm(input.type);
  const category = norm(input.category);
  const pushKind = norm(input.pushKind);
  const chatDomain = norm(input.chatDomain);
  const role = norm(input.recipientRole);
  const meta = raw(input.metaKind);

  if (
    MARKETING.has(kind) ||
    MARKETING.has(category) ||
    pushKind === "marketing_ephemeral" ||
    kind === "delivery_receipt" ||
    input.callOutcome === "completed"
  ) {
    return {
      classification: "EPHEMERAL_NO_BADGE",
      identity: null,
      identityError: null,
      documentedRewriteTarget: null,
    };
  }

  // C_store — owner intake / ops (explicit before chat)
  if (isOwnerIntakeInput(input) || (OWNER_STORE_OPERATION_META_KINDS as readonly string[]).includes(meta)) {
    const store = resolveStoreIdentity(input.storeId);
    if (!store.identity) {
      return {
        classification: "UNKNOWN_BLOCKED",
        identity: null,
        identityError: store.identityError ?? {
          ok: false,
          reason: "STORE_ID_REQUIRED_FOR_OWNER_INTAKE",
        },
        documentedRewriteTarget: "notifyStoreOwnerNewOrder_user_id_writer",
      };
    }
    return withAuthority(
      "C_STORE_OPERATION",
      store.identity,
      null,
      "notifyStoreOwnerNewOrder_user_id_writer"
    );
  }

  // Store order chat
  if (
    chatDomain === "store_order" ||
    kind === "store_order_message" ||
    kind === "customer_to_store_message" ||
    kind === "store_to_customer_message"
  ) {
    if (
      kind === "customer_to_store_message" ||
      role === "owner" ||
      role === "store"
    ) {
      const store = resolveStoreIdentity(input.storeId);
      if (!store.identity) {
        return {
          classification: "UNKNOWN_BLOCKED",
          identity: null,
          identityError: store.identityError,
          documentedRewriteTarget: null,
        };
      }
      return withAuthority("B_STORE_COMMUNICATION", store.identity, null);
    }
    if (
      kind === "store_to_customer_message" ||
      role === "buyer" ||
      role === "member" ||
      role === "customer"
    ) {
      const member = resolveMemberIdentity(input.userId);
      if (!member.identity) {
        return {
          classification: "UNKNOWN_BLOCKED",
          identity: null,
          identityError: member.identityError,
          documentedRewriteTarget: null,
        };
      }
      return withAuthority("B_MEMBER_COMMUNICATION", member.identity, null);
    }
    // store_order without role → blocked (do not guess)
    return {
      classification: "UNKNOWN_BLOCKED",
      identity: null,
      identityError: { ok: false, reason: "UNKNOWN_AUTHORITY_IS_BLOCKED" },
      documentedRewriteTarget: null,
    };
  }

  // Missed call
  if (kind === "missed_call" || category === "missed_call" || input.callOutcome === "missed") {
    if (raw(input.storeId)) {
      const store = resolveStoreIdentity(input.storeId);
      if (store.identity) {
        return withAuthority("B_STORE_COMMUNICATION", store.identity, null);
      }
    }
    const member = resolveMemberIdentity(input.userId);
    if (!member.identity) {
      return {
        classification: "UNKNOWN_BLOCKED",
        identity: null,
        identityError: member.identityError,
        documentedRewriteTarget: null,
      };
    }
    return withAuthority("B_MEMBER_COMMUNICATION", member.identity, null);
  }

  // Member chat
  if (
    CHAT_TYPES.has(kind) ||
    kind === "general_message" ||
    kind === "group_message" ||
    kind === "trade_message" ||
    chatDomain === "general_direct" ||
    chatDomain === "group" ||
    chatDomain === "trade"
  ) {
    const member = resolveMemberIdentity(input.userId);
    if (!member.identity) {
      return {
        classification: "UNKNOWN_BLOCKED",
        identity: null,
        identityError: member.identityError,
        documentedRewriteTarget: null,
      };
    }
    return withAuthority("B_MEMBER_COMMUNICATION", member.identity, null);
  }

  // A_member persistent
  if (
    A_KINDS.has(kind) ||
    A_KINDS.has(category) ||
    pushKind === "system_persistent" ||
    pushKind === "notice_persistent" ||
    (input.persistsInInbox === true &&
      !CHAT_TYPES.has(kind) &&
      kind !== "missed_call")
  ) {
    // Buyer order status — not owner meta
    if (meta && isOwnerStoreOperationMetaKind(meta)) {
      const store = resolveStoreIdentity(input.storeId);
      if (!store.identity) {
        return {
          classification: "UNKNOWN_BLOCKED",
          identity: null,
          identityError: {
            ok: false,
            reason: "STORE_ID_REQUIRED_FOR_OWNER_INTAKE",
          },
          documentedRewriteTarget: "notifyStoreOwnerNewOrder_user_id_writer",
        };
      }
      return withAuthority(
        "C_STORE_OPERATION",
        store.identity,
        null,
        "notifyStoreOwnerNewOrder_user_id_writer"
      );
    }
    const member = resolveMemberIdentity(input.userId);
    if (!member.identity) {
      return {
        classification: "UNKNOWN_BLOCKED",
        identity: null,
        identityError: member.identityError,
        documentedRewriteTarget: null,
      };
    }
    return withAuthority("A_MEMBER_NOTIFICATION", member.identity, null);
  }

  return {
    classification: "UNKNOWN_BLOCKED",
    identity: null,
    identityError: { ok: false, reason: "UNKNOWN_AUTHORITY_IS_BLOCKED" },
    documentedRewriteTarget: null,
  };
}

export function resolveBadgeRecipientIdentity(
  input: BadgeClassifyEventInput
): BadgeRecipientIdentity | null {
  return classifyBadgeAuthority(input).identity;
}
