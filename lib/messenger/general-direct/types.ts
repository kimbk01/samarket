/**
 * general_direct Domain — 공용 입력/행 타입 (Phase 2).
 * 상품·주문·매장·그룹 context 필드 금지.
 */
import type { DomainListSnapshot } from "@/lib/messenger/contracts/ports";

export const GENERAL_DIRECT_DOMAIN = "general_direct" as const;

export type GeneralDirectRoomInput = Readonly<{
  roomId: string;
  chatDomain: string | null | undefined;
  domainIdentityKey: string | null | undefined;
  peerUserId: string | null | undefined;
  peerDisplayName: string | null | undefined;
  peerAvatarUrl: string | null | undefined;
  lastMessage: string | null | undefined;
  lastMessageAt: string | null | undefined;
  unreadCount: number | null | undefined;
  updatedAt?: string | null | undefined;
  /** 진단용 — ListPort 는 이 값으로 Domain 재판정하지 않음 */
  roomType?: string | null | undefined;
}>;

export type GeneralDirectListItem = Readonly<{
  roomId: string;
  chatDomain: typeof GENERAL_DIRECT_DOMAIN;
  domainIdentityKey: string;
  peerUserId: string;
  peerDisplayName: string;
  peerAvatarUrl: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  updatedAt: string;
  generation: string;
}>;

export type GeneralDirectRowModel = Readonly<{
  roomId: string;
  chatDomain: typeof GENERAL_DIRECT_DOMAIN;
  domainIdentityKey: string;
  title: string;
  avatarUrl: string | null;
  previewText: string;
  unreadCount: number;
  href: string;
  lastMessageAt: string;
}>;

export type GeneralDirectHeaderModel = Readonly<{
  kind: "general_peer";
  title: string;
  avatarUrl: string | null;
  surface: "general_direct_1to1";
}>;

export type GeneralDirectDomainState = Readonly<{
  domain: typeof GENERAL_DIRECT_DOMAIN;
  generation: string;
  rows: ReadonlyArray<GeneralDirectListItem>;
}>;

export const EMPTY_GENERAL_DIRECT_STATE: GeneralDirectDomainState = {
  domain: GENERAL_DIRECT_DOMAIN,
  generation: "0",
  rows: [],
};

export const GENERAL_DIRECT_PEER_PLACEHOLDER_NAME = "사용자";

export type GeneralDirectListSnapshot = DomainListSnapshot<GeneralDirectListItem>;
