import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainBadgeRoom = Readonly<{
  roomId: string;
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
}>;

export type ChatDomainBadgeAuthority =
  | "community_messenger"
  | "trade_domain"
  | "order_domain";

export type ChatDomainBadgeTargetOwner =
  | "chat_room"
  | "trade"
  | "store_order";

export type ChatDomainBadgePort = Readonly<{
  domain: ChatDomain;
  authority: ChatDomainBadgeAuthority;
  targetOwner: ChatDomainBadgeTargetOwner;
  acceptRoom: <T extends ChatDomainBadgeRoom>(room: T) => T;
}>;
