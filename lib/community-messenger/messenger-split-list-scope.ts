import {
  resolveMessengerRoomListSource,
  type MessengerRoomListSource,
} from "@/lib/community-messenger/messenger-entry-origin";

/** 768px+ split 좌측 목록 범위 — URL SSOT */
export type MessengerSplitListScope = MessengerRoomListSource;

export function parseMessengerSplitListScopeFromPathname(
  pathname: string | null | undefined
): MessengerSplitListScope {
  return resolveMessengerRoomListSource({ pathname, cmList: null });
}

export function resolveMessengerSplitListScope(args: {
  pathname: string | null | undefined;
  cmList: string | null | undefined;
}): MessengerSplitListScope {
  return resolveMessengerRoomListSource(args);
}
