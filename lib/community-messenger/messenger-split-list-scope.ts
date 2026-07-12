import { parseMessengerRoomListSource } from "@/lib/community-messenger/messenger-entry-origin";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";

/** 768px+ split 좌측 목록 범위 — URL SSOT */
export type MessengerSplitListScope = "inbox" | "trade" | "delivery";

export function parseMessengerSplitListScopeFromPathname(
  pathname: string | null | undefined
): MessengerSplitListScope {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (p === "/community-messenger/trade-chats" || p.startsWith("/community-messenger/trade-chats/")) {
    return "trade";
  }
  if (p === "/community-messenger/delivery-chats" || p.startsWith("/community-messenger/delivery-chats/")) {
    return "delivery";
  }
  return "inbox";
}

export function resolveMessengerSplitListScope(args: {
  pathname: string | null | undefined;
  cmList: string | null | undefined;
}): MessengerSplitListScope {
  if (parseCommunityMessengerRoomIdFromPathname(args.pathname)) {
    const source = parseMessengerRoomListSource(args.cmList);
    if (source === "trade") return "trade";
    if (source === "delivery") return "delivery";
    return "inbox";
  }
  return parseMessengerSplitListScopeFromPathname(args.pathname);
}
