import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { requireChatDomain } from "@/lib/chat-domain/chat-domain";
import type {
  DomainOwnedRoomRef,
  MessengerDomainPorts,
  MessengerIdentityPort,
} from "@/lib/messenger/contracts/ports";

function assertOwnRoom(domain: ChatDomain, room: DomainOwnedRoomRef): DomainOwnedRoomRef {
  const d = requireChatDomain(room.chatDomain);
  if (d !== domain) throw new Error(`dibay_identity_domain_mismatch:${domain}:${d}`);
  if (!room.domainIdentityKey.startsWith(`${domain}:`)) {
    throw new Error(`dibay_identity_key_prefix_mismatch:${domain}`);
  }
  if (!room.roomId.trim()) throw new Error("dibay_identity_room_id_required");
  return room;
}

export function createIdentityPort(domain: ChatDomain): MessengerIdentityPort {
  return {
    domain,
    assertMatches: (room) => assertOwnRoom(domain, room),
  };
}

export function cacheNamespacePrefix(domain: ChatDomain): string {
  const map: Record<ChatDomain, string> = {
    general_direct: "chat.general",
    group: "chat.group",
    trade: "chat.trade",
    store_order: "chat.store_order",
  };
  return map[domain];
}

/** Phase 1 stub ports — 런타임 홈/API 에 연결하지 않음 (cutover OFF). */
export function createPhase1DomainPorts(
  domain: ChatDomain,
  extras: {
    badgeContributesTo: MessengerDomainPorts["badge"]["contributesTo"];
    readAuthority: MessengerDomainPorts["read"]["authority"];
    soundKeyContract: string;
    resolveDisplayIdentity: MessengerDomainPorts["presentation"]["resolveDisplayIdentity"];
    resolveHeaderKind: MessengerDomainPorts["header"]["resolveHeaderKind"];
    resolvePreview: MessengerDomainPorts["preview"]["resolvePreview"];
  }
): MessengerDomainPorts {
  return {
    domain,
    router: {
      domain,
      buildRoomHref: ({ roomId, identityKey }) => {
        assertOwnRoom(domain, { roomId, chatDomain: domain, domainIdentityKey: identityKey });
        return `/community-messenger/rooms/${encodeURIComponent(roomId.trim())}`;
      },
    },
    identity: createIdentityPort(domain),
    list: { domain, listContract: { viewerUserId: "" } },
    rowModel: { domain },
    presentation: {
      domain,
      resolveDisplayIdentity: extras.resolveDisplayIdentity,
    },
    header: {
      domain,
      resolveHeaderKind: extras.resolveHeaderKind,
    },
    preview: {
      domain,
      resolvePreview: extras.resolvePreview,
    },
    bootstrap: { domain, acceptsOnlyOwnDomain: true },
    cache: {
      domain,
      namespacePrefix: cacheNamespacePrefix(domain),
      readOnlyUntilCutover: true,
    },
    realtime: { domain, requiresDomainTaggedPayload: true },
    read: { domain, authority: extras.readAuthority },
    unread: { domain, exclusiveOwnership: true },
    badge: { domain, contributesTo: extras.badgeContributesTo },
    notification: { domain, requiresStoredChatDomain: true },
    sound: { domain, soundKeyContract: extras.soundKeyContract },
    permission: { domain, serverAuthoritative: true },
  };
}
