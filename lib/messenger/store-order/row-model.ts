/**
 * StoreOrder Customer / Owner RowModel — 파이프라인 분리.
 * Messenger 일반 목록 RowModel 사용 금지.
 */
import { buildChatDomainRoomHref } from "@/lib/chat-domain/ports/router-port";
import type { MessengerRouterPort } from "@/lib/messenger/contracts/ports";
import { resolveStoreOrderCustomerPresentationFromListItem } from "@/lib/messenger/store-order/customer-presentation-resolver";
import { resolveStoreOrderOwnerPresentationFromListItem } from "@/lib/messenger/store-order/owner-presentation-resolver";
import { resolveStoreOrderPreview } from "@/lib/messenger/store-order/preview";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type {
  StoreOrderCustomerListViewModel,
  StoreOrderOwnerListViewModel,
} from "@/lib/messenger/store-order/ux-contract";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { processStatusLabel } from "@/lib/stores/store-order-process-model";

/** raw `order_status`(pending 등) → SSOT 한글/영문 라벨. 미인식 값은 그대로 통과. */
function resolveOrderStatusBadge(
  item: StoreOrderListItem,
  audience: "buyer" | "owner_badge",
  lang: AppLanguageCode
): string | null {
  const status = item.orderStatusLabel?.trim();
  if (!status) return null;
  return processStatusLabel(status, item.fulfillmentType ?? "", audience, lang);
}

export const storeOrderRouterPort: MessengerRouterPort = {
  domain: STORE_ORDER_DOMAIN,
  buildRoomHref: ({ roomId, identityKey, returnHref }) =>
    buildChatDomainRoomHref(STORE_ORDER_DOMAIN, {
      roomId,
      domain: STORE_ORDER_DOMAIN,
      identityKey,
      from: "delivery",
      returnHref,
    }),
};

function previewFromItem(item: StoreOrderListItem): string {
  return resolveStoreOrderPreview({
    chatDomain: STORE_ORDER_DOMAIN,
    latestChatMessage: {
      text: item.latestChatMessageText,
      messageType: item.latestChatMessageType,
    },
  }).text;
}

export function buildStoreOrderCustomerListViewModel(
  item: StoreOrderListItem,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): StoreOrderCustomerListViewModel {
  const presentation = resolveStoreOrderCustomerPresentationFromListItem(item);
  return {
    roomId: item.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    orderId: item.orderId,
    storeName: presentation.surface.storeName,
    storeImageUrl: presentation.surface.storeImageUrl,
    previewText: previewFromItem(item),
    unreadCount: item.unreadCount,
    lastMessageAt: item.latestChatMessageAt,
    href: storeOrderRouterPort.buildRoomHref({
      roomId: item.roomId,
      identityKey: item.domainIdentityKey,
    }),
    statusBadge: resolveOrderStatusBadge(item, "buyer", lang),
  };
}

export function buildStoreOrderOwnerListViewModel(
  item: StoreOrderListItem,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): StoreOrderOwnerListViewModel {
  const presentation = resolveStoreOrderOwnerPresentationFromListItem(item);
  return {
    roomId: item.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    orderId: item.orderId,
    customerName: presentation.surface.customerName,
    customerAvatarUrl: presentation.surface.customerAvatarUrl,
    previewText: previewFromItem(item),
    unreadCount: item.unreadCount,
    lastMessageAt: item.latestChatMessageAt,
    href: storeOrderRouterPort.buildRoomHref({
      roomId: item.roomId,
      identityKey: item.domainIdentityKey,
    }),
    statusBadge: resolveOrderStatusBadge(item, "owner_badge", lang),
  };
}

/** statusBadge 는 preview 와 분리 */
export function storeOrderStatusBadgeSeparated(item: StoreOrderListItem): string | null {
  return item.orderStatusLabel;
}
