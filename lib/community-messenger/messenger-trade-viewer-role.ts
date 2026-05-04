import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/**
 * 거래 방 목록·방 UI 에서 조회자 역할(판매/구매) 표면색 분기용.
 * `roleLabel` 은 부트스트랩 시 조회자 기준으로 채워진다.
 */
export function messengerTradeViewerRoleFromContextMeta(
  meta: CommunityMessengerRoomContextMetaV1 | null | undefined
): "seller" | "buyer" | null {
  if (!meta || meta.kind !== "trade") return null;
  const r = meta.roleLabel?.trim();
  if (r === "판매자") return "seller";
  if (r === "구매자") return "buyer";
  return null;
}
