/**
 * group Domain — 입력/행 타입 (Phase 5).
 * Identity: group:{groupId}. general_direct RowModel 상속 금지.
 */
import type { DomainListSnapshot } from "@/lib/messenger/contracts/ports";
import {
  GROUP_DOMAIN,
  type GroupSubtype,
} from "@/lib/messenger/group/domain";

export { GROUP_DOMAIN, type GroupSubtype };
export { GROUP_NAME_PLACEHOLDER, GROUP_IMAGE_PLACEHOLDER_MARKER } from "@/lib/messenger/group/domain";

export type GroupRoomInput = Readonly<{
  roomId: string;
  chatDomain: string | null | undefined;
  domainIdentityKey: string | null | undefined;
  groupId: string | null | undefined;
  groupSubtype: GroupSubtype | string | null | undefined;
  groupName: string | null | undefined;
  groupImageUrl: string | null | undefined;
  memberCount: number | null | undefined;
  lastMessage: string | null | undefined;
  lastMessageAt: string | null | undefined;
  unreadCount: number | null | undefined;
  updatedAt?: string | null | undefined;
  /** 진단 — Domain 재판정 금지 */
  roomType?: string | null | undefined;
  directKey?: string | null | undefined;
  peerDisplayName?: string | null | undefined;
  peerAvatarUrl?: string | null | undefined;
}>;

export type GroupListItem = Readonly<{
  roomId: string;
  chatDomain: typeof GROUP_DOMAIN;
  domainIdentityKey: string;
  groupId: string;
  groupSubtype: GroupSubtype;
  groupName: string;
  groupImageUrl: string | null;
  memberCount: number;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  updatedAt: string;
  generation: string;
}>;

/** GroupRowModel — general_direct RowModel 과 타입 공유/상속 금지 */
export type GroupRowModel = Readonly<{
  roomId: string;
  chatDomain: typeof GROUP_DOMAIN;
  domainIdentityKey: string;
  groupId: string;
  subtype: GroupSubtype;
  title: string;
  avatarUrl: string | null;
  previewText: string;
  lastMessageAt: string;
  unreadCount: number;
  memberCount: number;
  href: string;
}>;

export type GroupHeaderModel = Readonly<{
  kind: "group";
  groupName: string;
  groupImageUrl: string | null;
  memberCount: number;
  subtype: GroupSubtype;
  forbidsGeneralDirectHeader: true;
  forbidsTradeHeader: true;
  forbidsStoreOrderHeader: true;
}>;

export type GroupDomainState = Readonly<{
  domain: typeof GROUP_DOMAIN;
  generation: string;
  rows: ReadonlyArray<GroupListItem>;
}>;

export const EMPTY_GROUP_STATE: GroupDomainState = {
  domain: GROUP_DOMAIN,
  generation: "0",
  rows: [],
};

export type GroupListSnapshot = DomainListSnapshot<GroupListItem>;
