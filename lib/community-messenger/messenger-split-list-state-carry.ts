import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";
import {
  MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY,
  resolveMessengerRoomListSource,
} from "@/lib/community-messenger/messenger-entry-origin";

/** 메신저 홈 하위 화면 주소 키 — `section=search` = 채팅 검색 (`messenger-sub-screen-route.ts`) */
const SECTION_KEY = "section";
const SEARCH_SECTION = "search";

function isMessengerHomeOrRoomPathname(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "");
  return p === "/community-messenger" || parseCommunityMessengerRoomIdFromPathname(p) != null;
}

/**
 * 768px+ 분할 화면 — 왼쪽 목록은 주소(`cm_list`·`section`)로 정해진다(`MessengerResponsiveShell` · `CommunityMessengerHome`).
 * 방 주소에 그 값이 없으면 지금 왼쪽 목록 상태를 이어 붙여, 방을 열어도 왼쪽 목록(거래 채팅·채팅 검색)이 바뀌지 않게 한다.
 * 이미 값이 있는 방 주소(목록 행이 정한 `cm_list` 등)는 그대로 둔다. 분할 화면에서만 호출한다.
 */
export function carryMessengerSplitListStateIntoRoomHref(
  dest: string,
  current: { pathname: string; search: string }
): string {
  const u = new URL(dest, "https://samarket.local");
  if (parseCommunityMessengerRoomIdFromPathname(u.pathname) == null) return dest;
  const cur = new URLSearchParams(current.search.replace(/^\?/, ""));
  let changed = false;
  if (!u.searchParams.has(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY)) {
    const scope = resolveMessengerRoomListSource({
      pathname: current.pathname,
      cmList: cur.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY),
    });
    if (scope !== "inbox") {
      u.searchParams.set(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY, scope);
      changed = true;
    }
  }
  if (
    !u.searchParams.has(SECTION_KEY) &&
    cur.get(SECTION_KEY) === SEARCH_SECTION &&
    isMessengerHomeOrRoomPathname(current.pathname)
  ) {
    u.searchParams.set(SECTION_KEY, SEARCH_SECTION);
    changed = true;
  }
  return changed ? `${u.pathname}${u.search}${u.hash}` : dest;
}

/** 브라우저 현재 위치 기준 — 분할 화면이 아니면 그대로 */
export function carryMessengerSplitListStateIntoRoomHrefFromLocation(dest: string, splitViewport: boolean): string {
  if (!splitViewport || typeof window === "undefined") return dest;
  return carryMessengerSplitListStateIntoRoomHref(dest, {
    pathname: window.location.pathname || "",
    search: window.location.search || "",
  });
}
