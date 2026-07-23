/**
 * StoreOrder Customer Header — general/trade/group/owner header 금지.
 */
import type { DomainHeaderKind, MessengerHeaderPort } from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom } from "@/lib/messenger/store-order/identity";
import { resolveStoreOrderCustomerPresentationFromListItem } from "@/lib/messenger/store-order/customer-presentation-resolver";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type { StoreOrderCustomerHeaderViewModel } from "@/lib/messenger/store-order/ux-contract";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { processStatusLabel } from "@/lib/stores/store-order-process-model";

export function resolveStoreOrderCustomerHeaderKind(input: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): DomainHeaderKind {
  if (input.chatDomain !== STORE_ORDER_DOMAIN) {
    throw new Error(`dibay_store_order_customer_header_rejects:${input.chatDomain}`);
  }
  assertStoreOrderOwnedRoom({
    roomId: input.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return "buyer_store";
}

export function buildStoreOrderCustomerHeaderModel(
  item: StoreOrderListItem,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): StoreOrderCustomerHeaderViewModel {
  const kind = resolveStoreOrderCustomerHeaderKind(item);
  if (kind === "general_peer" || kind === "trade" || kind === "group") {
    throw new Error("dibay_store_order_customer_header_foreign_kind");
  }
  const p = resolveStoreOrderCustomerPresentationFromListItem(item);
  const status = item.orderStatusLabel?.trim() || null;
  return {
    kind: "buyer_store",
    storeName: p.surface.storeName,
    storeImageUrl: p.surface.storeImageUrl,
    orderId: item.orderId?.trim() || null,
    orderStatusLabel: status
      ? processStatusLabel(status, item.fulfillmentType ?? "", "buyer", lang)
      : null,
    forbidsGeneralDirectHeader: true,
    forbidsTradeHeader: true,
  };
}

export const storeOrderCustomerHeaderPort: MessengerHeaderPort = {
  domain: STORE_ORDER_DOMAIN,
  resolveHeaderKind: (input) =>
    resolveStoreOrderCustomerHeaderKind({
      roomId: input.roomId,
      chatDomain: input.chatDomain,
      domainIdentityKey: input.domainIdentityKey,
    }),
};
