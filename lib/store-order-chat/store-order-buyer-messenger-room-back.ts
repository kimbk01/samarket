import {
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY,
} from "@/lib/community-messenger/messenger-entry-origin";
import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { resolveStoreBrowseListHref } from "@/lib/stores/resolve-store-browse-list-href";

export type StoreOrderBuyerMessengerRoomBackInput = {
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
  storeSlug?: string | null | undefined;
  storeCategorySlug?: string | null | undefined;
  businessType?: string | null | undefined;
  fromQuery?: string | null | undefined;
};

/**
 * 배달·매장 주문 메신저 방 — **구매자(주문자)** 뒤로가기 목적지.
 * 해당 주문 매장 업종의 browse 전체 목록 (`/stores/browse/{primary}?sub=all`).
 */
export function resolveStoreOrderBuyerMessengerRoomBackHref(
  input: StoreOrderBuyerMessengerRoomBackInput
): string | null {
  if (messengerDeliveryViewerRole(input.contextMeta, input.myRole) !== "buyer") {
    return null;
  }
  return resolveStoreBrowseListHref({
    storeSlug: input.storeSlug,
    storeCategorySlug: input.storeCategorySlug,
    businessType: input.businessType,
  });
}

export function shouldForceDirectStoreOrderBuyerMessengerRoomBack(
  input: StoreOrderBuyerMessengerRoomBackInput
): boolean {
  return resolveStoreOrderBuyerMessengerRoomBackHref(input) != null;
}

export function parseMessengerRoomBackQueryKeys(searchParams: {
  get: (key: string) => string | null;
}): { fromQuery: string | null; cmListQuery: string | null } {
  return {
    fromQuery: searchParams.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY),
    cmListQuery: searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY),
  };
}
