/**
 * general_direct RowModelPort + RouterPort.
 */
import { resolveRoomLastMessageForViewer } from "@/lib/community-messenger/call-stub-room-tip";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveGeneralDirectPreview } from "@/lib/messenger/general-direct/preview";
import { resolveDomainListSystemPreviewText } from "@/lib/messenger/contracts/domain-list-system-preview";
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
    /** 언어 SSOT B3 — 시스템 문장 종류 코드 메타가 맞으면 보는 사람 언어, 아니면 지금과 같음 */
    content:
      resolveDomainListSystemPreviewText({ lastMessage: item.lastMessage, meta: item.lastMessageMeta }) ??
      resolveRoomLastMessageForViewer(item.lastMessage, null, getRuntimeAppLanguage()),
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
