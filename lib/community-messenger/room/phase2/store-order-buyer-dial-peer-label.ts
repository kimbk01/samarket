import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import { messengerDeliveryViewerRole } from "@/lib/community-messenger/messenger-delivery-viewer-role";
import { messengerRoomShowsConfirmedDeliveryPresentation } from "@/lib/community-messenger/messenger-room-domain";
import {
  resolveStoreOrderBuyerVoicePeerLabel,
  roomShowsStoreOrderWindowHeader,
} from "@/lib/store-order-chat/messenger-delivery-room-header";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * F3 (2026-11-09 감사): 매장 주문방 **구매자**의 발신 확인창·발신 화면 이름 — 매장명(없으면 「매장」).
 * 계약 `resolveStoreOrderBuyerVoicePeerLabel` 「매장명만, room.title(사장님 개인 닉네임) 금지」.
 * 방 헤더와 같은 구매자 판정(`CommunityMessengerRoomPhase2Header` isDeliveryBuyer)을 방 정보(context meta)만으로 —
 * 추가 서버 조회 없음. 매장 주문방 구매자가 아니면 null(호출처의 기존 이름 사용).
 */
export function resolveStoreOrderBuyerDialPeerLabel(
  snapshot: Pick<CommunityMessengerRoomSnapshot, "room" | "viewerUserId" | "myRole"> | null | undefined,
): string | null {
  if (!snapshot?.room) return null;
  const room = snapshot.room;
  const windowStoreOrder =
    roomShowsStoreOrderWindowHeader(room) ||
    messengerRoomShowsConfirmedDeliveryPresentation(room, snapshot.viewerUserId);
  if (!windowStoreOrder) return null;
  const meta = resolveCommunityMessengerDeliveryContextMeta(room);
  const storeOrderId = typeof meta?.storeOrderId === "string" ? meta.storeOrderId.trim() : "";
  if (!meta || !storeOrderId) return null;
  if (messengerDeliveryViewerRole(meta, snapshot.myRole) !== "buyer") return null;
  return resolveStoreOrderBuyerVoicePeerLabel({
    headerMode: "buyer_store",
    storeDisplayName: typeof meta.storeDisplayName === "string" ? meta.storeDisplayName : "",
  });
}
