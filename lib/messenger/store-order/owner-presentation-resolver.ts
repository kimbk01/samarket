/**
 * StoreOrder OwnerPresentationResolver — 오너 화면 전용.
 * Customer resolver 와 내부 함수·import 공유 금지.
 */
import type { DomainDisplayIdentity, MessengerPresentationPort } from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom } from "@/lib/messenger/store-order/identity";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import {
  STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
  type StoreOrderListItem,
} from "@/lib/messenger/store-order/types";
import type { StoreOrderOwnerSurface } from "@/lib/messenger/store-order/owner-surface";

export type StoreOrderOwnerPresentationInput = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  customerUserId?: string | null;
  customerName: string | null | undefined;
  customerAvatarUrl: string | null | undefined;
  storeId?: string | null;
  /** 금지 — 매장명으로 오너 타이틀 대체 */
  storeNameAsTitle?: string | null;
  storeImageAsAvatar?: string | null;
}>;

export type StoreOrderOwnerPresentationResult = Readonly<{
  surface: StoreOrderOwnerSurface;
  display: DomainDisplayIdentity;
}>;

function rejectOwnerStoreIdentityAsTitle(input: StoreOrderOwnerPresentationInput): void {
  if (input.storeNameAsTitle?.trim()) {
    throw new Error("dibay_store_order_owner_store_title_forbidden");
  }
  if (input.storeImageAsAvatar?.trim()) {
    throw new Error("dibay_store_order_owner_store_avatar_forbidden");
  }
}

/** Owner Surface resolver — Customer 모듈에서 import 금지 */
export function resolveStoreOrderOwnerPresentation(
  input: StoreOrderOwnerPresentationInput
): StoreOrderOwnerPresentationResult {
  assertStoreOrderOwnedRoom({
    roomId: input.roomId,
    chatDomain: input.chatDomain as "store_order",
    domainIdentityKey: input.domainIdentityKey,
  });
  rejectOwnerStoreIdentityAsTitle(input);
  const customerName = input.customerName?.trim() || STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER;
  const customerAvatarUrl = input.customerAvatarUrl?.trim() || null;
  const surface: StoreOrderOwnerSurface = {
    kind: "owner_buyer_peer",
    customerUserId: input.customerUserId?.trim() || null,
    customerName,
    customerAvatarUrl,
    storeId: input.storeId?.trim() || null,
  };
  return {
    surface,
    display: {
      title: customerName,
      avatarUrl: customerAvatarUrl,
      usedPeerUserFallback: false,
    },
  };
}

export function resolveStoreOrderOwnerPresentationFromListItem(
  item: StoreOrderListItem
): StoreOrderOwnerPresentationResult {
  return resolveStoreOrderOwnerPresentation({
    roomId: item.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    customerUserId: item.customerUserId,
    customerName: item.customerName,
    customerAvatarUrl: item.customerAvatarUrl,
    storeId: item.storeId,
  });
}

export const storeOrderOwnerPresentationPort: MessengerPresentationPort = {
  domain: STORE_ORDER_DOMAIN,
  resolveDisplayIdentity: (room) =>
    resolveStoreOrderOwnerPresentation({
      roomId: room.roomId,
      chatDomain: room.chatDomain,
      domainIdentityKey: room.domainIdentityKey,
      customerName: null,
      customerAvatarUrl: null,
    }).display,
};
