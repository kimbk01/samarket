/**
 * Phase G — ChatDomain → existing notification sound eventKey (read-only map).
 * DO NOT modify notification-sound SSOT registry/resolver (Phase 1 LOCK).
 * docs/community-messenger/2026-07-23-four-domain-phase-g.md
 */

import type { ChatDomain, StoreOrderRole } from "@/lib/chat-domain/four-domain-freeze";

/** Keys already present in notification-sound SSOT / event map. */
export type DomainMessageSoundEventKey =
  | "messenger_direct_message_received"
  | "messenger_group_message_received"
  | "trade_chat_message_received"
  | "delivery_chat_message_received_user"
  | "delivery_chat_message_received_owner";

/**
 * Map freeze ChatDomain → sound eventKey.
 * store_order uses role when known; defaults to user (customer) key.
 */
export function soundEventKeyForChatDomain(
  chatDomain: ChatDomain,
  opts?: { storeOrderRole?: StoreOrderRole | null },
): DomainMessageSoundEventKey {
  switch (chatDomain) {
    case "general_direct":
      return "messenger_direct_message_received";
    case "group":
      return "messenger_group_message_received";
    case "trade":
      return "trade_chat_message_received";
    case "store_order":
      return opts?.storeOrderRole === "owner"
        ? "delivery_chat_message_received_owner"
        : "delivery_chat_message_received_user";
    default:
      return "messenger_direct_message_received";
  }
}
