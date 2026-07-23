import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainReadRoom = Readonly<{
  roomId: string;
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
}>;

export type ChatDomainReadPort = Readonly<{
  domain: ChatDomain;
  authority: "community_messenger" | "order_domain";
  acceptRoom: <T extends ChatDomainReadRoom>(room: T) => T;
}>;
