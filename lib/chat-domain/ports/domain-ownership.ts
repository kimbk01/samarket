import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export const CHAT_DOMAIN_OWNED_CAPABILITIES = [
  "router",
  "room_identity",
  "badge",
  "unread",
  "notification",
  "sound",
  "bootstrap",
  "refresh",
  "realtime",
  "cache",
  "read",
] as const;

export type ChatDomainOwnedCapability = (typeof CHAT_DOMAIN_OWNED_CAPABILITIES)[number];

export type ChatDomainOwnership = Readonly<{
  domain: ChatDomain;
  capability: ChatDomainOwnedCapability;
}>;

export function assertChatDomainOwnership(
  owner: ChatDomain,
  target: ChatDomain,
  capability: ChatDomainOwnedCapability
): ChatDomainOwnership {
  if (owner !== target) {
    throw new Error(`dibay_cross_domain_write_forbidden:${owner}:${target}:${capability}`);
  }
  return { domain: owner, capability };
}
