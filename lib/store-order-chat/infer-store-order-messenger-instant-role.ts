import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

/**
 * `?cm_ctx=`·URL 진입 직후 instant shell — bootstrap 전 `myRole` 추정.
 * 오너가 `member` 로 고정되면 헤더·ensure API·입력 chrome 이 구매자 UI 로 깜빡인다.
 */
export function inferInstantStoreOrderMessengerMyRole(
  contextMeta: CommunityMessengerRoomContextMetaV1 | null | undefined,
  searchParams: { get(name: string): string | null }
): "owner" | "member" | undefined {
  const from = searchParams.get("from")?.trim();
  if (from === "delivery-owner") return "owner";

  const cmReturn = searchParams.get("cm_return")?.trim() ?? "";
  if (
    /\/stores\/owner|\/my\/business\/store-order-chat|\/order-chats(?:\/|$)/i.test(cmReturn)
  ) {
    return "owner";
  }

  const rl = contextMeta?.roleLabel?.trim().toLowerCase() ?? "";
  if (rl === "매장" || rl === "owner" || rl === "seller" || rl === "store") return "owner";

  return undefined;
}
