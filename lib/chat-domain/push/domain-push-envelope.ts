/**
 * Phase G — Domain push presentation envelope (contract only — not wired to FCM yet).
 */

import type { ChatDomain, StoreOrderRole } from "@/lib/chat-domain/four-domain-freeze";
import { buildDomainRoomRoute } from "@/lib/chat-domain/push/domain-room-route";
import {
  soundEventKeyForChatDomain,
  type DomainMessageSoundEventKey,
} from "@/lib/chat-domain/push/domain-sound-event-key";

export type DomainPushEnvelope = {
  chatDomain: ChatDomain;
  domainIdentity: string;
  roomId: string;
  routeUrl: string;
  soundEventKey: DomainMessageSoundEventKey;
  storeOrderRole?: StoreOrderRole | null;
};

export function buildDomainPushEnvelope(input: {
  chatDomain: ChatDomain;
  domainIdentity: string;
  roomId: string;
  storeOrderRole?: StoreOrderRole | null;
}): DomainPushEnvelope | null {
  const domainIdentity = input.domainIdentity.trim();
  const roomId = input.roomId.trim();
  if (!domainIdentity || !roomId) return null;
  const routeUrl = buildDomainRoomRoute({
    chatDomain: input.chatDomain,
    roomId,
    storeOrderRole: input.storeOrderRole,
  });
  if (!routeUrl) return null;
  return {
    chatDomain: input.chatDomain,
    domainIdentity,
    roomId,
    routeUrl,
    soundEventKey: soundEventKeyForChatDomain(input.chatDomain, {
      storeOrderRole: input.storeOrderRole,
    }),
    storeOrderRole: input.storeOrderRole ?? null,
  };
}
