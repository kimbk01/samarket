import { requireChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import type {
  ChatDomainRouterPort,
} from "@/lib/chat-domain/ports/router-port";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";
import { generalDirectRouter } from "@/lib/chat-domain/routers/general-direct-router";
import { groupRouter } from "@/lib/chat-domain/routers/group-router";
import { storeOrderRouter } from "@/lib/chat-domain/routers/store-order-router";
import { tradeRouter } from "@/lib/chat-domain/routers/trade-router";

const ROUTERS: Readonly<Record<ChatDomain, ChatDomainRouterPort>> = {
  general_direct: generalDirectRouter,
  group: groupRouter,
  trade: tradeRouter,
  store_order: storeOrderRouter,
};

export function dispatchChatDomainRouter(domain: unknown): ChatDomainRouterPort {
  return ROUTERS[requireChatDomain(domain)];
}

export function assertMessengerRoomEntryContract(
  stored: { chatDomain?: unknown; domainIdentityKey?: unknown },
  expected?: { domain: ChatDomain; identityKey: string } | null
): Readonly<{ domain: ChatDomain; identityKey: string }> {
  const domain = requireChatDomain(stored.chatDomain);
  const identityKey = requireDomainIdentityKey(stored.domainIdentityKey);
  if (!identityKey.startsWith(`${domain}:`)) {
    throw new Error("dibay_chat_domain_router_identity_mismatch");
  }
  if (expected) {
    if (
      requireChatDomain(expected.domain) !== domain ||
      requireDomainIdentityKey(expected.identityKey) !== identityKey
    ) {
      throw new Error("dibay_chat_domain_router_entry_mismatch");
    }
  }
  return { domain, identityKey };
}
