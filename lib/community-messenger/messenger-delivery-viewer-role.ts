import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/**
 * 배달·매장 주문 방 — 조회자가 사장님(owner)인지 구매자인지.
 * `snapshot.myRole === "owner"` 와 함께 쓰되, meta 만으로는 알 수 없으므로 호출부에서 role 을 넘긴다.
 */
export function messengerDeliveryViewerRole(
  meta: CommunityMessengerRoomContextMetaV1 | null | undefined,
  myRole: string | null | undefined
): "seller" | "buyer" | null {
  if (!meta || meta.kind !== "delivery") return null;
  const r = (myRole ?? "").trim().toLowerCase();
  if (r === "owner") return "seller";
  return "buyer";
}
