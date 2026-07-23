/**
 * StoreOrder Owner Header — general/trade/group/customer-store header 금지.
 */
import type { DomainHeaderKind, MessengerHeaderPort } from "@/lib/messenger/contracts/ports";
import { assertStoreOrderOwnedRoom } from "@/lib/messenger/store-order/identity";
import { resolveStoreOrderOwnerPresentationFromListItem } from "@/lib/messenger/store-order/owner-presentation-resolver";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
import type { StoreOrderListItem } from "@/lib/messenger/store-order/types";
import type { StoreOrderOwnerHeaderViewModel } from "@/lib/messenger/store-order/ux-contract";
import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { processStatusLabel } from "@/lib/stores/store-order-process-model";

export function resolveStoreOrderOwnerHeaderKind(input: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): DomainHeaderKind {
  if (input.chatDomain !== STORE_ORDER_DOMAIN) {
    throw new Error(`dibay_store_order_owner_header_rejects:${input.chatDomain}`);
  }
  assertStoreOrderOwnedRoom({
    roomId: input.roomId,
    chatDomain: STORE_ORDER_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return "owner_buyer_peer";
}

export function buildStoreOrderOwnerHeaderModel(
  item: StoreOrderListItem,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): StoreOrderOwnerHeaderViewModel {
  const kind = resolveStoreOrderOwnerHeaderKind(item);
  if (kind === "buyer_store" || kind === "general_peer" || kind === "trade" || kind === "group") {
    throw new Error("dibay_store_order_owner_header_foreign_kind");
  }
  const p = resolveStoreOrderOwnerPresentationFromListItem(item);
  const status = item.orderStatusLabel?.trim() || null;
  return {
    kind: "owner_buyer_peer",
    customerName: p.surface.customerName,
    customerAvatarUrl: p.surface.customerAvatarUrl,
    orderId: item.orderId?.trim() || null,
    orderStatusLabel: status
      ? processStatusLabel(status, item.fulfillmentType ?? "", "owner_badge", lang)
      : null,
    forbidsGeneralDirectHeader: true,
    forbidsTradeHeader: true,
    forbidsCustomerStoreHeader: true,
  };
}

export const storeOrderOwnerHeaderPort: MessengerHeaderPort = {
  domain: STORE_ORDER_DOMAIN,
  resolveHeaderKind: (input) =>
    resolveStoreOrderOwnerHeaderKind({
      roomId: input.roomId,
      chatDomain: input.chatDomain,
      domainIdentityKey: input.domainIdentityKey,
    }),
};
