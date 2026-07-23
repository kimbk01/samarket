/**
 * StoreOrder CustomerPresentationResolver — 고객 화면 전용.
 * Owner resolver / trade / general 과 내부 함수 공유 금지.
 */
import type { DomainDisplayIdentity, MessengerPresentationPort } from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom } from "@/lib/messenger/store-order/identity";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import {
  STORE_ORDER_STORE_NAME_PLACEHOLDER,
  type StoreOrderListItem,
} from "@/lib/messenger/store-order/types";
import type { StoreOrderCustomerSurface } from "@/lib/messenger/store-order/customer-surface";

export type StoreOrderCustomerPresentationInput = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  storeId?: string | null;
  storeName: string | null | undefined;
  storeImageUrl: string | null | undefined;
  /** 금지 — 회원명 */
  memberDisplayName?: string | null;
  /** 금지 — 회원 avatar */
  memberAvatarUrl?: string | null;
  peerUserName?: string | null;
  peerAvatarUrl?: string | null;
  roomTitleFallback?: string | null;
}>;

export type StoreOrderCustomerPresentationResult = Readonly<{
  surface: StoreOrderCustomerSurface;
  display: DomainDisplayIdentity;
}>;

function rejectCustomerMemberIdentity(input: StoreOrderCustomerPresentationInput): void {
  if (input.memberDisplayName?.trim() || input.peerUserName?.trim()) {
    throw new Error("dibay_store_order_customer_member_name_forbidden");
  }
  if (input.memberAvatarUrl?.trim() || input.peerAvatarUrl?.trim()) {
    throw new Error("dibay_store_order_customer_member_avatar_forbidden");
  }
  if (input.roomTitleFallback?.trim()) {
    throw new Error("dibay_store_order_customer_peer_fallback_forbidden");
  }
}

function rejectPeerAvatarWhenStoreImageMissing(input: StoreOrderCustomerPresentationInput): void {
  const storeImage = input.storeImageUrl?.trim() || null;
  const peerAvatar = input.peerAvatarUrl?.trim() || input.memberAvatarUrl?.trim() || null;
  if (!storeImage && peerAvatar) {
    throw new Error("dibay_store_order_customer_peer_avatar_without_store_image_forbidden");
  }
}

/** Customer Surface resolver — Owner 모듈에서 import 금지 */
export function resolveStoreOrderCustomerPresentation(
  input: StoreOrderCustomerPresentationInput
): StoreOrderCustomerPresentationResult {
  assertStoreOrderOwnedRoom({
    roomId: input.roomId,
    chatDomain: input.chatDomain as "store_order",
    domainIdentityKey: input.domainIdentityKey,
  });
  rejectCustomerMemberIdentity(input);
  rejectPeerAvatarWhenStoreImageMissing(input);
  const storeName = input.storeName?.trim() || STORE_ORDER_STORE_NAME_PLACEHOLDER;
  const storeImageUrl = input.storeImageUrl?.trim() || null;
  const surface: StoreOrderCustomerSurface = {
    kind: "buyer_store",
    storeId: input.storeId?.trim() || null,
    storeName,
    storeImageUrl,
  };
  return {
    surface,
    display: {
      title: storeName,
      avatarUrl: storeImageUrl,
      usedPeerUserFallback: false,
    },
  };
}

export function resolveStoreOrderCustomerPresentationFromListItem(
  item: StoreOrderListItem
): StoreOrderCustomerPresentationResult {
  return resolveStoreOrderCustomerPresentation({
    roomId: item.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    storeId: item.storeId,
    storeName: item.storeName,
    storeImageUrl: item.storeImageUrl,
  });
}

export const storeOrderCustomerPresentationPort: MessengerPresentationPort = {
  domain: STORE_ORDER_DOMAIN,
  resolveDisplayIdentity: (room) =>
    resolveStoreOrderCustomerPresentation({
      roomId: room.roomId,
      chatDomain: room.chatDomain,
      domainIdentityKey: room.domainIdentityKey,
      storeName: null,
      storeImageUrl: null,
    }).display,
};
