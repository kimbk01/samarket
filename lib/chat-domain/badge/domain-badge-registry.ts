import { requireChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import type {
  ChatDomainBadgePort,
  ChatDomainBadgeRoom,
  ChatDomainBadgeTargetOwner,
} from "@/lib/chat-domain/ports/badge-port";
import { assertChatDomainOwnership } from "@/lib/chat-domain/ports/domain-ownership";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";

function badgePort(
  domain: ChatDomain,
  authority: ChatDomainBadgePort["authority"],
  targetOwner: ChatDomainBadgeTargetOwner
): ChatDomainBadgePort {
  return {
    domain,
    authority,
    targetOwner,
    acceptRoom: <T extends ChatDomainBadgeRoom>(room: T): T => {
      const target = requireChatDomain(room.chatDomain);
      assertChatDomainOwnership(domain, target, "badge");
      const identityKey = requireDomainIdentityKey(room.domainIdentityKey);
      if (!identityKey.startsWith(`${target}:`)) {
        throw new Error("dibay_badge_identity_mismatch");
      }
      if (!room.roomId.trim()) throw new Error("dibay_badge_room_id_required");
      return room;
    },
  };
}

export const CHAT_DOMAIN_BADGE_PORTS: Readonly<Record<ChatDomain, ChatDomainBadgePort>> = {
  general_direct: badgePort("general_direct", "community_messenger", "chat_room"),
  group: badgePort("group", "community_messenger", "chat_room"),
  trade: badgePort("trade", "trade_domain", "trade"),
  store_order: badgePort("store_order", "order_domain", "store_order"),
};

export function dispatchChatDomainBadge(domain: unknown): ChatDomainBadgePort {
  return CHAT_DOMAIN_BADGE_PORTS[requireChatDomain(domain)];
}
