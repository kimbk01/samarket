import { requireChatDomain, type ChatDomain } from "@/lib/chat-domain/chat-domain";
import { assertChatDomainOwnership } from "@/lib/chat-domain/ports/domain-ownership";
import type {
  ChatDomainRealtimeEnvelope,
  ChatDomainRealtimePort,
} from "@/lib/chat-domain/ports/realtime-port";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";

function realtimePort(domain: ChatDomain): ChatDomainRealtimePort {
  return {
    domain,
    acceptEnvelope: <T>(
      envelope: ChatDomainRealtimeEnvelope<T>,
      expected?: Readonly<{ domain: ChatDomain; identityKey: string }> | null
    ): ChatDomainRealtimeEnvelope<T> => {
      const target = requireChatDomain(envelope.chatDomain);
      assertChatDomainOwnership(domain, target, "realtime");
      const identityKey = requireDomainIdentityKey(envelope.domainIdentityKey);
      if (!identityKey.startsWith(`${target}:`)) {
        throw new Error("dibay_realtime_identity_mismatch");
      }
      if (expected) {
        const expectedDomain = requireChatDomain(expected.domain);
        const expectedIdentityKey = requireDomainIdentityKey(expected.identityKey);
        if (expectedDomain !== target || expectedIdentityKey !== identityKey) {
          throw new Error("dibay_realtime_envelope_mismatch");
        }
      }
      return { ...envelope, chatDomain: target, domainIdentityKey: identityKey };
    },
  };
}

export const CHAT_DOMAIN_REALTIME_PORTS: Readonly<Record<ChatDomain, ChatDomainRealtimePort>> = {
  general_direct: realtimePort("general_direct"),
  group: realtimePort("group"),
  trade: realtimePort("trade"),
  store_order: realtimePort("store_order"),
};

export function dispatchChatDomainRealtime(domain: unknown): ChatDomainRealtimePort {
  return CHAT_DOMAIN_REALTIME_PORTS[requireChatDomain(domain)];
}

export function acceptChatDomainRealtimePayload<T extends Record<string, unknown>>(
  payload: T,
  expected?: Readonly<{ domain: ChatDomain; identityKey: string }> | null
): ChatDomainRealtimeEnvelope<T> {
  const domain = requireChatDomain(payload.chatDomain);
  return dispatchChatDomainRealtime(domain).acceptEnvelope(
    {
      chatDomain: domain,
      domainIdentityKey:
        typeof payload.domainIdentityKey === "string" ? payload.domainIdentityKey : undefined,
      payload,
    },
    expected
  );
}
