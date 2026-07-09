import {
  MESSENGER_ENTRY_ORIGIN_QUERY_KEY,
  MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY,
} from "@/lib/community-messenger/messenger-entry-origin";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

export type StoreOrderBuyerMessengerRoomBackInput = {
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined;
  myRole: string | null | undefined;
  storeSlug?: string | null | undefined;
  storeCategorySlug?: string | null | undefined;
  businessType?: string | null | undefined;
  fromQuery?: string | null | undefined;
};

/**
 * 배달·매장 주문 메신저 방 — 구매자 browse 직행 override 제거.
 * 뒤로가기는 `cm_return` → history back → delivery-chats (`resolveMessengerRoomBackNavigation`).
 */
export function resolveStoreOrderBuyerMessengerRoomBackHref(
  _input: StoreOrderBuyerMessengerRoomBackInput
): string | null {
  return null;
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
