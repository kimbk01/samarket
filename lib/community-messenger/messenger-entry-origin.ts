/**
 * 메신저 진입 출처(`?from=...`) 단일 원천.
 *
 * `/community-messenger` 와 `/community-messenger/trade-chats` `/delivery-chats`
 * 의 1단 헤더 뒤로가기는 이 출처에 따라 분기한다.
 *
 * URL 에 `?from=` 이 없을 때(직 링크 등)를 위해 **세션**에 마지막 유효 출처를 저장해
 * 인박스 뒤로가기·방→목록 복귀 URL 을 안정화한다.
 */

export type MessengerEntryOrigin = "community" | "trade" | "delivery" | null;

const KNOWN: ReadonlySet<NonNullable<MessengerEntryOrigin>> = new Set([
  "community",
  "trade",
  "delivery",
]);

export const MESSENGER_ENTRY_ORIGIN_QUERY_KEY = "from";

/** 방에서 뒤로가기 시 돌아갈 목록 — 거래 묶음 / 배달 묶음 / 인박스(1:1·그룹) */
export type MessengerRoomListSource = "trade" | "delivery" | "inbox";

export const MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY = "cm_list";

export function parseMessengerRoomListSource(value: string | null | undefined): MessengerRoomListSource {
  const v = value?.trim().toLowerCase();
  if (v === "trade") return "trade";
  if (v === "delivery") return "delivery";
  return "inbox";
}

/**
 * 현재 메신저 목록 라우트에 따라 방 진입 시 부착할 `cm_list` 값.
 * - `/community-messenger/trade-chats` → 거래 채팅방 목록으로 복귀
 * - `/community-messenger/delivery-chats` → 배달 채팅방 목록으로 복귀
 * - 그 외(인박스 등) → 전체 채팅 목록(`section=chats`)으로 복귀
 */
export function messengerRoomListSourceFromPathname(pathname: string | null | undefined): MessengerRoomListSource {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (!p) return "inbox";
  if (p === "/community-messenger/trade-chats" || p.startsWith("/community-messenger/trade-chats/")) return "trade";
  if (p === "/community-messenger/delivery-chats" || p.startsWith("/community-messenger/delivery-chats/")) {
    return "delivery";
  }
  return "inbox";
}

/** `cm_list` + `from` 로 채팅방 목록(거래/배달/인박스) 절대 경로 생성 */
export function messengerRoomListDestination(source: MessengerRoomListSource, origin: MessengerEntryOrigin): string {
  if (source === "trade") {
    return withMessengerEntryOrigin("/community-messenger/trade-chats", origin);
  }
  if (source === "delivery") {
    return withMessengerEntryOrigin("/community-messenger/delivery-chats", origin);
  }
  return withMessengerEntryOrigin("/community-messenger?section=chats", origin);
}

export function parseMessengerEntryOrigin(value: string | null | undefined): MessengerEntryOrigin {
  const v = value?.trim().toLowerCase();
  if (!v) return null;
  if (KNOWN.has(v as NonNullable<MessengerEntryOrigin>)) {
    return v as NonNullable<MessengerEntryOrigin>;
  }
  return null;
}

/**
 * 출처별 1단 헤더 뒤로가기 목적지.
 * - `community` → 하단 탭 「커뮤니티」와 동일(`/philife`)
 * - `trade` → 하단 탭 「거래」와 동일(`/market`)
 * - `delivery` → 하단 탭 「배달」과 동일(`/stores`)
 * - 기본 → `/philife`
 */
export function messengerEntryOriginBackHref(origin: MessengerEntryOrigin): string {
  if (origin === "community") return "/philife";
  if (origin === "trade") return "/market";
  if (origin === "delivery") return "/stores";
  return "/philife";
}

/**
 * 메신저로 가는 href 에 `?from=` 을 부착한다(이미 있는 경우 덮어쓰기).
 * `origin == null` 이면 그대로 반환.
 */
export function withMessengerEntryOrigin(href: string, origin: MessengerEntryOrigin): string {
  if (!origin) return href;
  const u = new URL(href, "https://samarket.local");
  u.searchParams.set(MESSENGER_ENTRY_ORIGIN_QUERY_KEY, origin);
  return `${u.pathname}${u.search}${u.hash}`;
}

/** 거래/배달 서브 라우트 → 메신저 인박스로 돌아갈 때 출처를 보존하기 위한 helper. */
export function messengerInboxHrefWithOrigin(origin: MessengerEntryOrigin): string {
  return withMessengerEntryOrigin("/community-messenger?section=chats", origin);
}

/**
 * 페이지 경로(pathname) 만으로 메신저 진입 출처를 추정.
 * 하단 탭(커뮤니티·거래·배달) 및 해당 헤더 표면과 정렬한다.
 * - `/philife`, `/philife/...`, `/community`, `/community/...` → `community`
 * - `/market`, `/market/...` → `trade`
 * - `/stores`, `/stores/...` → `delivery`
 * - 그 외 → `null` (메신저 헤더 백은 기본 `/philife`)
 */
export function inferMessengerEntryOriginFromPath(pathname: string | null | undefined): MessengerEntryOrigin {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (!p) return null;
  if (p === "/philife" || p.startsWith("/philife/")) return "community";
  if (p === "/community" || p.startsWith("/community/")) return "community";
  if (p === "/market" || p.startsWith("/market/")) return "trade";
  if (p === "/stores" || p.startsWith("/stores/")) return "delivery";
  if (p === "/orders" || p.startsWith("/orders/")) return "delivery";
  if (p === "/my/store-orders" || p.startsWith("/my/store-orders/")) return "delivery";
  if (p === "/mypage/store-orders" || p.startsWith("/mypage/store-orders/")) return "delivery";
  return null;
}

/** 하단 탭 메신저 링크 — 레일별 목록 + `?from=` (1단 뒤로가기·세션 출처) */
export function mainBottomNavMessengerTabHref(origin: NonNullable<MessengerEntryOrigin>): string {
  if (origin === "delivery") {
    return withMessengerEntryOrigin("/community-messenger/delivery-chats", "delivery");
  }
  if (origin === "trade") {
    return withMessengerEntryOrigin("/community-messenger/trade-chats", "trade");
  }
  return withMessengerEntryOrigin("/community-messenger?section=chats", "community");
}

/** `?from=` → 하단 우측 레일(stores|trade|philife) */
export function messengerEntryOriginToSecondaryRail(
  origin: MessengerEntryOrigin
): "stores" | "trade" | "philife" {
  if (origin === "delivery") return "stores";
  if (origin === "trade") return "trade";
  return "philife";
}

/** 하단 탭 메신저 링크 — 현재 표면 출처로 목록 URL·`?from=` 결정 */
export function bottomNavMessengerHrefWithOrigin(
  _baseHref: string,
  pathname: string | null | undefined,
  searchParams?: { get: (key: string) => string | null } | null
): string {
  const fromQuery = parseMessengerEntryOrigin(searchParams?.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY));
  const origin =
    fromQuery ??
    inferMessengerEntryOriginFromPath(pathname) ??
    (typeof window !== "undefined" ? readStoredMessengerEntryOrigin() : null) ??
    "community";
  return mainBottomNavMessengerTabHref(origin);
}

/**
 * 현재 페이지 referrer URL 로부터 진입 출처 추정 (클라 전용).
 * - 같은 origin 의 referrer 만 신뢰. 외부 referrer 는 무시.
 */
export function inferMessengerEntryOriginFromReferrer(): MessengerEntryOrigin {
  if (typeof window === "undefined") return null;
  const ref = document?.referrer ?? "";
  if (!ref) return null;
  try {
    const u = new URL(ref);
    if (u.origin !== window.location.origin) return null;
    return inferMessengerEntryOriginFromPath(u.pathname);
  } catch {
    return null;
  }
}

const ENTRY_ORIGIN_STORAGE_KEY = "sam.messenger.entryOrigin.v1";

/** 유효한 출처만 저장 — 탭 세션 동안 인박스 백·목록 복귀 URL 고정에 사용 */
export function persistMessengerEntryOrigin(origin: NonNullable<MessengerEntryOrigin>): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ENTRY_ORIGIN_STORAGE_KEY, origin);
  } catch {
    /* ignore */
  }
}

export function readStoredMessengerEntryOrigin(): MessengerEntryOrigin {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ENTRY_ORIGIN_STORAGE_KEY);
    return parseMessengerEntryOrigin(raw);
  } catch {
    return null;
  }
}

/**
 * 방 화면 헤더 뒤로가기 → 채팅 목록
 * - `cm_list=trade` → 거래 채팅방 목록
 * - `cm_list=delivery` → 배달 채팅방 목록
 * - 없음·인박스 → 전체 채팅 목록(`section=chats`)
 */
export function buildMessengerRoomListBackHref(searchParams: { get: (key: string) => string | null }): string {
  const source = parseMessengerRoomListSource(searchParams.get(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY));
  const o = parseMessengerEntryOrigin(searchParams.get(MESSENGER_ENTRY_ORIGIN_QUERY_KEY));
  return messengerRoomListDestination(source, o);
}

/**
 * 목록에서 넘어올 때 `from` 과 목록 종류(`cm_list`)를 방 URL 에 실어 둔다.
 * `listSource === "inbox"` 일 때는 `cm_list` 생략(전체 채팅 목록으로 복귀).
 */
export function communityMessengerRoomHref(
  roomId: string,
  fromQueryValue: string | null | undefined,
  listSource: MessengerRoomListSource = "inbox"
): string {
  const base = `/community-messenger/rooms/${encodeURIComponent(String(roomId).trim())}`;
  const u = new URL(base, "https://samarket.local");
  const o = parseMessengerEntryOrigin(fromQueryValue);
  if (o) u.searchParams.set(MESSENGER_ENTRY_ORIGIN_QUERY_KEY, o);
  if (listSource === "trade") u.searchParams.set(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY, "trade");
  if (listSource === "delivery") u.searchParams.set(MESSENGER_ROOM_LIST_SOURCE_QUERY_KEY, "delivery");
  return `${u.pathname}${u.search}${u.hash}`;
}
