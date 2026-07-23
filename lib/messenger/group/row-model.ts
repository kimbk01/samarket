/**
 * group RowModel + RouterPort — general_direct RowModel 상속 금지.
 */
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveGroupPreview } from "@/lib/messenger/group/preview";
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
    message: { content: item.lastMessage, messageType: "text", isSystemAllowed: true },
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
