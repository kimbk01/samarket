/**
 * general_direct Domain — Phase 2 Port 집합 (런타임 홈 미연결 · cutover OFF).
 */
import type {
  DomainOwnedRoomRef,
  MessengerDomainPorts,
  MessengerPreviewPort,
  MessengerPresentationPort,
  MessengerHeaderPort,
} from "@/lib/messenger/contracts/ports";
import { generalDirectIdentityPort } from "@/lib/messenger/general-direct/identity";
import { generalDirectPermissionPort } from "@/lib/messenger/general-direct/permission";
import { generalDirectRouterPort } from "@/lib/messenger/general-direct/row-model";
import { resolveGeneralDirectDisplayIdentity } from "@/lib/messenger/general-direct/presentation";
import { resolveGeneralDirectHeaderKind } from "@/lib/messenger/general-direct/header";
import { resolveGeneralDirectPreview } from "@/lib/messenger/general-direct/preview";
import {
  generalDirectBadgePort,
  generalDirectReadPort,
  generalDirectUnreadPort,
} from "@/lib/messenger/general-direct/read-unread-badge";
import {
  generalDirectNotificationPort,
  generalDirectSoundPort,
} from "@/lib/messenger/general-direct/notification-sound";
import { GENERAL_DIRECT_DOMAIN } from "@/lib/messenger/general-direct/types";
import { cacheNamespacePrefix } from "@/lib/messenger/contracts/create-phase1-ports";

const presentationPort: MessengerPresentationPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  resolveDisplayIdentity: (room: DomainOwnedRoomRef) =>
    resolveGeneralDirectDisplayIdentity({
      roomId: room.roomId,
      chatDomain: room.chatDomain,
      domainIdentityKey: room.domainIdentityKey,
      peerDisplayName: null,
      peerAvatarUrl: null,
    }),
};

const headerPort: MessengerHeaderPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  resolveHeaderKind: (input) =>
    resolveGeneralDirectHeaderKind({
      roomId: input.roomId,
      chatDomain: input.chatDomain,
      domainIdentityKey: input.domainIdentityKey,
    }),
};

const previewPort: MessengerPreviewPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  resolvePreview: () => resolveGeneralDirectPreview(null),
};

export const generalDirectPorts: MessengerDomainPorts = {
  domain: GENERAL_DIRECT_DOMAIN,
  router: generalDirectRouterPort,
  identity: generalDirectIdentityPort,
  list: { domain: GENERAL_DIRECT_DOMAIN, listContract: { viewerUserId: "" } },
  rowModel: { domain: GENERAL_DIRECT_DOMAIN },
  presentation: presentationPort,
  header: headerPort,
  preview: previewPort,
  bootstrap: { domain: GENERAL_DIRECT_DOMAIN, acceptsOnlyOwnDomain: true },
  cache: {
    domain: GENERAL_DIRECT_DOMAIN,
    namespacePrefix: cacheNamespacePrefix(GENERAL_DIRECT_DOMAIN),
    readOnlyUntilCutover: true,
  },
  realtime: { domain: GENERAL_DIRECT_DOMAIN, requiresDomainTaggedPayload: true },
  read: generalDirectReadPort,
  unread: generalDirectUnreadPort,
  badge: generalDirectBadgePort,
  notification: generalDirectNotificationPort,
  sound: generalDirectSoundPort,
  permission: generalDirectPermissionPort,
};
