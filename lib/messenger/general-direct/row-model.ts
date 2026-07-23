/**
 * general_direct RowModelPort + RouterPort.
 */
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveGeneralDirectPreview } from "@/lib/messenger/general-direct/preview";
import { resolveGeneralDirectDisplayFromListItem } from "@/lib/messenger/general-direct/presentation";
import {
  GENERAL_DIRECT_DOMAIN,
  type GeneralDirectListItem,
  type GeneralDirectRowModel,
} from "@/lib/messenger/general-direct/types";

export const generalDirectRouterPort: MessengerRouterPort = {
  domain: GENERAL_DIRECT_DOMAIN,
  buildRoomHref: ({ roomId, identityKey, returnHref }) =>
    buildChatDomainRoomHref(GENERAL_DIRECT_DOMAIN, {
      roomId,
      domain: GENERAL_DIRECT_DOMAIN,
      identityKey,
      from: "community",
      returnHref,
    }),
};

export function buildGeneralDirectRowModel(item: GeneralDirectListItem): GeneralDirectRowModel {
  const identity = resolveGeneralDirectDisplayFromListItem(item);
  const preview = resolveGeneralDirectPreview({
    content: item.lastMessage,
    messageType: "text",
    isSystemAllowed: true,
  });
  return {
    roomId: item.roomId,
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    title: identity.title,
    avatarUrl: identity.avatarUrl,
    previewText: preview.text,
    unreadCount: item.unreadCount,
    href: generalDirectRouterPort.buildRoomHref({
      roomId: item.roomId,
      identityKey: item.domainIdentityKey,
    }),
    lastMessageAt: item.lastMessageAt,
  };
}
