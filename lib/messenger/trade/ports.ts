/**
 * trade Domain — Phase 3 Port 집합 (런타임 홈 미연결 · cutover OFF).
 */
import type {
  DomainOwnedRoomRef,
  MessengerDomainPorts,
  MessengerHeaderPort,
  MessengerPresentationPort,
  MessengerPreviewPort,
} from "@/lib/messenger/contracts/ports";
import { cacheNamespacePrefix } from "@/lib/messenger/contracts/create-phase1-ports";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
import { tradeIdentityPort } from "@/lib/messenger/trade/identity";
import { tradePermissionPort } from "@/lib/messenger/trade/permission";
import { tradeRouterPort } from "@/lib/messenger/trade/row-model";
import { resolveTradePresentation } from "@/lib/messenger/trade/presentation";
import { resolveTradeHeaderKind } from "@/lib/messenger/trade/header";
import { resolveTradePreview } from "@/lib/messenger/trade/preview";
import {
  tradeBadgePort,
  tradeReadPort,
  tradeUnreadPort,
} from "@/lib/messenger/trade/read-unread-badge";
import {
  tradeNotificationPort,
  tradeSoundPort,
} from "@/lib/messenger/trade/notification-sound";

const presentationPort: MessengerPresentationPort = {
  domain: TRADE_DOMAIN,
  resolveDisplayIdentity: (room: DomainOwnedRoomRef) =>
    resolveTradePresentation({
      roomId: room.roomId,
      chatDomain: room.chatDomain,
      domainIdentityKey: room.domainIdentityKey,
      itemTitle: null,
      itemImageUrl: null,
      peerDisplayName: null,
    }).display,
};

const headerPort: MessengerHeaderPort = {
  domain: TRADE_DOMAIN,
  resolveHeaderKind: (input) =>
    resolveTradeHeaderKind({
      roomId: input.roomId,
      chatDomain: input.chatDomain,
      domainIdentityKey: input.domainIdentityKey,
    }),
};

const previewPort: MessengerPreviewPort = {
  domain: TRADE_DOMAIN,
  resolvePreview: () => resolveTradePreview(null),
};

export const tradePorts: MessengerDomainPorts = {
  domain: TRADE_DOMAIN,
  router: tradeRouterPort,
  identity: tradeIdentityPort,
  list: { domain: TRADE_DOMAIN, listContract: { viewerUserId: "" } },
  rowModel: { domain: TRADE_DOMAIN },
  presentation: presentationPort,
  header: headerPort,
  preview: previewPort,
  bootstrap: { domain: TRADE_DOMAIN, acceptsOnlyOwnDomain: true },
  cache: {
    domain: TRADE_DOMAIN,
    namespacePrefix: cacheNamespacePrefix(TRADE_DOMAIN),
    readOnlyUntilCutover: true,
  },
  realtime: { domain: TRADE_DOMAIN, requiresDomainTaggedPayload: true },
  read: tradeReadPort,
  unread: tradeUnreadPort,
  badge: tradeBadgePort,
  notification: tradeNotificationPort,
  sound: tradeSoundPort,
  permission: tradePermissionPort,
};
