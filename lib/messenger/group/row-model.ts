/**
 * group RowModel + RouterPort — general_direct RowModel 상속 금지.
 */
import { resolveRoomLastMessageForViewer } from "@/lib/community-messenger/call-stub-room-tip";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveGroupPreview } from "@/lib/messenger/group/preview";
import { resolveDomainListSystemPreviewText } from "@/lib/messenger/contracts/domain-list-system-preview";
import { resolveGroupPresentationFromListItem } from "@/lib/messenger/group/presentation";
import { GROUP_DOMAIN } from "@/lib/messenger/group/domain";
import type { GroupListItem, GroupRowModel } from "@/lib/messenger/group/types";

export const groupRouterPort: MessengerRouterPort = {
  domain: GROUP_DOMAIN,
  buildRoomHref: ({ roomId, identityKey, returnHref }) =>
    buildChatDomainRoomHref(GROUP_DOMAIN, {
      roomId,
      domain: GROUP_DOMAIN,
      identityKey,
      from: "group",
      returnHref,
    }),
};

export function buildGroupRowModel(item: GroupListItem): GroupRowModel {
  const presentation = resolveGroupPresentationFromListItem(item);
  const preview = resolveGroupPreview({
    message: {
      /** 언어 SSOT B3 — 시스템 문장 종류 코드 메타가 맞으면 보는 사람 언어, 아니면 지금과 같음 */
      content:
        resolveDomainListSystemPreviewText({ lastMessage: item.lastMessage, meta: item.lastMessageMeta }) ??
        resolveRoomLastMessageForViewer(item.lastMessage, null, getRuntimeAppLanguage()),
      messageType: "text",
      isSystemAllowed: true,
    },
  });
  return {
    roomId: item.roomId,
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    groupId: item.groupId,
    subtype: item.groupSubtype,
    title: presentation.title,
    avatarUrl: presentation.avatarUrl,
    previewText: preview.text,
    lastMessageAt: item.lastMessageAt,
    unreadCount: item.unreadCount,
    memberCount: item.memberCount,
    href: groupRouterPort.buildRoomHref({
      roomId: item.roomId,
      identityKey: item.domainIdentityKey,
    }),
  };
}
