/**
 * DIBAY DATA RESET — Chat destructive boundary (B4).
 * Product delete ≠ Data Reset hard delete. Four-domain freeze remains SSOT for domain ids.
 *
 * DO NOT invent a second ChatDomain union — re-export from four-domain-freeze.
 */

import {
  CHAT_DOMAINS,
  type ChatDomain,
} from "@/lib/chat-domain/four-domain-freeze";

export { CHAT_DOMAINS, type ChatDomain };

/**
 * soft — product/user/admin default: tombstone / leave / archive row kept
 * detach — Market/Delivery may null bridge FK; room history stays Chat-owned
 * hard-reset-only — physical DELETE only via future explicit HIGH-RISK reset mode (not Prelaunch default)
 */
export type ChatResetDeleteMode = "soft" | "detach" | "hard-reset-only";

export type ChatDomainResetPolicy = {
  domain: ChatDomain;
  productDelete: ChatResetDeleteMode;
  /** Prelaunch / domain reset default path (must not contradict product soft for group). */
  dataResetDefault: ChatResetDeleteMode;
  listingOrOrderDeleteImpliesRoomDelete: false;
  notes: string;
};

export const CHAT_DOMAIN_RESET_POLICY: Record<ChatDomain, ChatDomainResetPolicy> = {
  general_direct: {
    domain: "general_direct",
    productDelete: "soft",
    dataResetDefault: "soft",
    listingOrOrderDeleteImpliesRoomDelete: false,
    notes: "1:1 — soft tombstone; hard DELETE only hard-reset-only future mode",
  },
  group: {
    domain: "group",
    productDelete: "soft",
    dataResetDefault: "soft",
    listingOrOrderDeleteImpliesRoomDelete: false,
    notes: "HARD LOCK soft deleted_at via community_messenger_delete_private_group",
  },
  trade: {
    domain: "trade",
    productDelete: "detach",
    dataResetDefault: "detach",
    listingOrOrderDeleteImpliesRoomDelete: false,
    notes: "Market listing delete ≠ room delete; bridge SET NULL / preserve room",
  },
  store_order: {
    domain: "store_order",
    productDelete: "detach",
    dataResetDefault: "detach",
    listingOrOrderDeleteImpliesRoomDelete: false,
    notes: "Delivery order delete ≠ room delete; bridge SET NULL / preserve room",
  },
};

export function chatDomainResetPolicy(domain: string): ChatDomainResetPolicy | null {
  const d = domain.trim() as ChatDomain;
  if (!(CHAT_DOMAINS as readonly string[]).includes(d)) return null;
  return CHAT_DOMAIN_RESET_POLICY[d];
}

/** Prelaunch / admin CM wipe must use soft for these domains (never hard DELETE by default). */
export function chatDataResetUsesSoftTombstone(domain: string): boolean {
  const p = chatDomainResetPolicy(domain);
  return p?.dataResetDefault === "soft";
}

export function chatDataResetIsDetachOnly(domain: string): boolean {
  const p = chatDomainResetPolicy(domain);
  return p?.dataResetDefault === "detach";
}

/** Explicit hard room wipe — not wired to Prelaunch default execute. */
export const CHAT_HARD_RESET_REQUIRES_EXPLICIT_MODE = true as const;
