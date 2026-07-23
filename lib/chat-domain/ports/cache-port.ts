import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

export type ChatDomainCacheRoom = Readonly<{
  id: string;
  chatDomain?: ChatDomain;
  domainIdentityKey?: string;
}>;

export type ChatDomainCacheTier = "full" | "critical" | "minimal";

export type ChatDomainCachePort = Readonly<{
  domain: ChatDomain;
  namespace: string;
  acceptWrite: <T extends ChatDomainCacheRoom>(rooms: readonly T[]) => readonly T[];
  prime: <T>(
    tier: ChatDomainCacheTier,
    data: T,
    rooms: readonly ChatDomainCacheRoom[]
  ) => void;
  peek: <T>(tier: ChatDomainCacheTier) => Readonly<{ data: T; at: number }> | null;
  invalidate: () => void;
}>;
