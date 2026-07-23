import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainBootstrapRoom = Readonly<{
  id: string;
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
}>;

export type ChatDomainBootstrapPort = Readonly<{
  domain: ChatDomain;
  accept: <T extends ChatDomainBootstrapRoom>(room: T) => T;
}>;
