import { requireChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertChatDomainOwnership } from "@/lib/chat-domain/ports/domain-ownership";
import type {
  ChatDomainReadPort,
  ChatDomainReadRoom,
} from "@/lib/chat-domain/ports/read-port";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";

function readPort(
  domain: ChatDomain,
  authority: ChatDomainReadPort["authority"]
): ChatDomainReadPort {
  return {
    domain,
    authority,
    acceptRoom: <T extends ChatDomainReadRoom>(room: T): T => {
      const target = requireChatDomain(room.chatDomain);
      assertChatDomainOwnership(domain, target, "read");
      const identityKey = requireDomainIdentityKey(room.domainIdentityKey);
      if (!identityKey.startsWith(`${target}:`)) {
        throw new Error("dibay_read_identity_mismatch");
      }
      if (!room.roomId.trim()) throw new Error("dibay_read_room_id_required");
      return room;
    },
  };
}

export const CHAT_DOMAIN_READ_PORTS: Readonly<Record<ChatDomain, ChatDomainReadPort>> = {
  general_direct: readPort("general_direct", "community_messenger"),
  group: readPort("group", "community_messenger"),
  trade: readPort("trade", "community_messenger"),
  store_order: readPort("store_order", "order_domain"),
};

export function dispatchChatDomainRead(domain: unknown): ChatDomainReadPort {
  return CHAT_DOMAIN_READ_PORTS[requireChatDomain(domain)];
}

export function storeOrderIdFromDomainIdentityKey(identityKey: unknown): string {
  const key = requireDomainIdentityKey(identityKey);
  if (!key.startsWith("store_order:")) throw new Error("dibay_read_identity_mismatch");
  const orderId = key.slice("store_order:".length).trim();
  if (!orderId) throw new Error("dibay_store_order_read_order_id_required");
  return orderId;
}
