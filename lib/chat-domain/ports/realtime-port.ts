import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainRealtimeEnvelope<T = unknown> = Readonly<{
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
  payload: T;
}>;

export type ChatDomainRealtimePort = Readonly<{
  domain: ChatDomain;
  acceptEnvelope: <T>(
    envelope: ChatDomainRealtimeEnvelope<T>,
    expected?: Readonly<{ domain: ChatDomain; identityKey: string }> | null
  ) => ChatDomainRealtimeEnvelope<T>;
}>;
