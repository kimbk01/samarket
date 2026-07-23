/**
 * Phase D — Domain list item DTO (contract).
 * Surface writers (Phase H) consume this shape; CM home still uses mixed chats until cutover.
 */

import type { ChatDomain, StoreOrderRole } from "@/lib/chat-domain/four-domain-freeze";

export type DomainListItemDto = {
  roomId: string;
  chatDomain: ChatDomain;
  domainIdentity: string;
  /** Present when chatDomain === store_order and role known. */
  storeOrderRole?: StoreOrderRole | null;
  unreadCount: number;
  lastMessageAt: string | null;
  title: string;
  /** Opaque preview — Domain UI may ignore. */
  lastMessagePreview?: string | null;
};

export type DomainListBootstrapStatus =
  | "ok"
  | "not_wired"
  | "migration_pending"
  | "error";

export type DomainListBootstrapResult = {
  status: DomainListBootstrapStatus;
  chatDomain: ChatDomain;
  items: DomainListItemDto[];
  error?: string;
};
