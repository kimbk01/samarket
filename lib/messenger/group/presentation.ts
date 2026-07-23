/**
 * group Presentation — 그룹명·그룹 이미지. 회원/peer fallback 금지.
 */
import type { DomainDisplayIdentity, MessengerPresentationPort } from "@/lib/messenger/contracts/ports";
import { assertGroupOwnedRoom } from "@/lib/messenger/group/identity";
import {
  GROUP_DOMAIN,
  GROUP_NAME_PLACEHOLDER,
  type GroupListItem,
  type GroupSubtype,
} from "@/lib/messenger/group/types";

export type GroupPresentationInput = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  groupName: string | null | undefined;
  groupImageUrl: string | null | undefined;
  memberCount?: number | null;
  subtype?: GroupSubtype | null;
  /** 금지 */
  peerUserName?: string | null;
  peerAvatarUrl?: string | null;
  ownerAvatarUrl?: string | null;
  lastSenderAvatarUrl?: string | null;
  memberAvatarUrl?: string | null;
  roomTitleAsGroupName?: string | null;
  tradeImageUrl?: string | null;
  storeImageUrl?: string | null;
}>;

export function resolveGroupPresentation(input: GroupPresentationInput): DomainDisplayIdentity & {
  memberCount: number | null;
  subtype: GroupSubtype | null;
} {
  assertGroupOwnedRoom({
    roomId: input.roomId,
    chatDomain: input.chatDomain as "group",
    domainIdentityKey: input.domainIdentityKey,
  });
  if (
    input.peerUserName?.trim() ||
    input.peerAvatarUrl?.trim() ||
    input.ownerAvatarUrl?.trim() ||
    input.lastSenderAvatarUrl?.trim() ||
    input.memberAvatarUrl?.trim()
  ) {
    throw new Error("dibay_group_member_avatar_or_name_fallback_forbidden");
  }
  if (input.tradeImageUrl?.trim() || input.storeImageUrl?.trim()) {
    throw new Error("dibay_group_foreign_image_forbidden");
  }
  if (input.roomTitleAsGroupName?.trim()) {
    throw new Error("dibay_group_room_title_as_name_forbidden");
  }
  const title = input.groupName?.trim() || GROUP_NAME_PLACEHOLDER;
  if (!input.groupName?.trim()) {
    console.warn("[group-display-identity]", { reason: "missing_group_name", roomId: input.roomId });
  }
  const rawImage = input.groupImageUrl?.trim() || null;
  // Reject OAuth personal avatars that leaked into rooms.avatar_url as "group" images.
  const groupImage =
    rawImage &&
    !/googleusercontent\.com\/a\//i.test(rawImage) &&
    !( /lh[0-9]\.googleusercontent\.com/i.test(rawImage) && /[=/]s\d+-c\b/i.test(rawImage))
      ? rawImage
      : null;
  return {
    title,
    avatarUrl: groupImage,
    usedPeerUserFallback: false,
    memberCount: input.memberCount ?? null,
    subtype: input.subtype ?? null,
  };
}

export function resolveGroupPresentationFromListItem(item: GroupListItem) {
  return resolveGroupPresentation({
    roomId: item.roomId,
    chatDomain: GROUP_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    groupName: item.groupName,
    groupImageUrl: item.groupImageUrl,
    memberCount: item.memberCount,
    subtype: item.groupSubtype,
  });
}

export const groupPresentationPort: MessengerPresentationPort = {
  domain: GROUP_DOMAIN,
  resolveDisplayIdentity: (room) =>
    resolveGroupPresentation({
      roomId: room.roomId,
      chatDomain: room.chatDomain,
      domainIdentityKey: room.domainIdentityKey,
      groupName: null,
      groupImageUrl: null,
    }),
};
