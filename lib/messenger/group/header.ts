/**
 * group HeaderPort — group 전용. general/trade/store_order Header 거부.
 */
import type { DomainHeaderKind, MessengerHeaderPort } from "@/lib/messenger/contracts/ports";
import { assertGroupOwnedRoom } from "@/lib/messenger/group/identity";
import { resolveGroupPresentationFromListItem } from "@/lib/messenger/group/presentation";
import { GROUP_DOMAIN, type GroupHeaderModel, type GroupListItem } from "@/lib/messenger/group/types";

export function resolveGroupHeaderKind(input: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): DomainHeaderKind {
  if (input.chatDomain !== GROUP_DOMAIN) {
    throw new Error(`dibay_group_header_rejects:${input.chatDomain}`);
  }
  assertGroupOwnedRoom({
    roomId: input.roomId,
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return "group";
}

export function buildGroupHeaderModel(item: GroupListItem): GroupHeaderModel {
  const kind = resolveGroupHeaderKind(item);
  if (kind !== "group") throw new Error("dibay_group_header_kind_required");
  const p = resolveGroupPresentationFromListItem(item);
  return {
    kind: "group",
    groupName: p.title,
    groupImageUrl: p.avatarUrl,
    memberCount: item.memberCount,
    subtype: item.groupSubtype,
    forbidsGeneralDirectHeader: true,
    forbidsTradeHeader: true,
    forbidsStoreOrderHeader: true,
  };
}

export const groupHeaderPort: MessengerHeaderPort = {
  domain: GROUP_DOMAIN,
  resolveHeaderKind: (input) =>
    resolveGroupHeaderKind({
      roomId: input.roomId,
      chatDomain: input.chatDomain,
      domainIdentityKey: input.domainIdentityKey,
    }),
};
