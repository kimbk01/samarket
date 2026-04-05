import { normalizeAppPathnameForTier1 } from "@/lib/layout/normalize-app-pathname";

const COMMUNITY_POST_DETAIL_RE = /^\/community\/post\/[^/]+$/;
const PHILIFE_POST_DETAIL_RE = /^\/philife\/post\/[^/]+$/;
const CHAT_ROOM_DETAIL_RE = /^\/chats\/[^/]+$/;

function startsWithPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * TRADE 탭 플로팅 다이얼·홈형 하단 스크롤 패딩 적용 경로.
 * - `/home`, `/market`, `/market/*` — 상단 거래 메뉴·카테고리 피드와 동일(운영에서 `/market/[slug]`만 늘어도 자동 포함)
 * - `/home/purchases`, `/home/sales`, `/home/reviews` — 홈에서 연 개인거래 숏컷
 */
export function isTradeFloatingMenuSurface(pathname: string | null | undefined): boolean {
  const raw = typeof pathname === "string" ? pathname : "";
  const safePath = raw.split("?")[0]!.trim();
  if (!safePath) return false;
  if (safePath === "/home" || safePath === "/market" || startsWithPath(safePath, "/market")) return true;
  if (
    startsWithPath(safePath, "/home/purchases") ||
    startsWithPath(safePath, "/home/sales") ||
    safePath === "/home/reviews" ||
    startsWithPath(safePath, "/home/reviews/")
  ) {
    return true;
  }
  return false;
}

export type MobileTopTier1RuleSet = {
  showRegionBar: boolean;
  showRegionPicker: boolean;
  /** `/mypage/trade` — 지역 선택 대신 뒤로가기 + 허브 제목 */
  showTradeHubLeading: boolean;
  showSearch: boolean;
  showNotifications: boolean;
  showServicesMenu: boolean;
  showStoreCart: boolean;
};

/**
 * 메인 1단(`RegionBar`/`AppStickyHeader`) 노출·변형 규칙.
 * 대부분의 (main) 경로에서 1단을 켜고, 채팅방 상세처럼 내부 전용 헤더만 쓰는 화면만 끈다.
 */
export function getMobileTopTier1RuleSet(pathname: string | null | undefined): MobileTopTier1RuleSet {
  const pathNoQuery = normalizeAppPathnameForTier1(pathname);

  const isTradeExploration = isTradeFloatingMenuSurface(pathNoQuery);
  const isPhilifeExploration = pathNoQuery === "/philife" || pathNoQuery === "/community";

  const isUnderMypageTrade = startsWithPath(pathNoQuery, "/mypage/trade");

  const isMypageTradeChatRoom = /^\/mypage\/trade\/chat\/[^/]+$/.test(pathNoQuery);
  const isCommunityMessengerRoom = /^\/community-messenger\/rooms\/[^/]+$/.test(pathNoQuery);
  const isCommunityMessengerCallPage = /^\/community-messenger\/calls\/[^/]+$/.test(pathNoQuery);
  const isLegacyChatRoomDetail =
    CHAT_ROOM_DETAIL_RE.test(pathNoQuery) &&
    pathNoQuery !== "/chats/new" &&
    pathNoQuery !== "/chats/order";

  /** `/stores` 루트만 제외 — `startsWithPath(..., "/stores/")`는 `/stores//`로 잘못 매칭되어 browse 등이 빠지던 버그 방지 */
  const isStoresSubpathExcludingRoot =
    pathNoQuery !== "/stores" && startsWithPath(pathNoQuery, "/stores");
  const isStoresBrowsePath =
    pathNoQuery === "/stores/browse" || pathNoQuery.startsWith("/stores/browse/");
  /** browse 는 전역 1단 + `MainTier1Extras` 2단으로 통일, 그 외 매장 하위는 로컬 앱바만 */
  const suppressStoresTier1ForLocalChrome =
    isStoresSubpathExcludingRoot && !isStoresBrowsePath;

  /**
   * `/my/business` 및 하위(매장 허브·설정 등)는 `TradePrimaryColumnStickyAppBar` 등 로컬 헤더만 씀.
   * `startsWithPath(..., "/my/business/")` 는 접두어 끝 `/` 때문에 `/my/business//…` 만 매칭되어 프로필 등이 빠지던 버그가 있었음 → `/my/business` 기준.
   */
  const isMyBusinessOwnerHubSurface =
    pathNoQuery === "/my/business" ||
    (startsWithPath(pathNoQuery, "/my/business") &&
      !pathNoQuery.startsWith("/my/business/apply"));

  const isPhilifeMeetings = startsWithPath(pathNoQuery, "/philife/meetings");
  const isPhilifeMyPage = pathNoQuery === "/philife/my";

  const isCommunityOrPhilifePostDetail =
    COMMUNITY_POST_DETAIL_RE.test(pathNoQuery) || PHILIFE_POST_DETAIL_RE.test(pathNoQuery);

  /** 전역 1단과 로컬 `TradePrimaryColumnStickyAppBar` 등이 겹치지 않게 끄는 구간 */
  const suppressMainTier1 =
    isMypageTradeChatRoom ||
    isCommunityMessengerRoom ||
    isCommunityMessengerCallPage ||
    isLegacyChatRoomDetail ||
    suppressStoresTier1ForLocalChrome ||
    isMyBusinessOwnerHubSurface ||
    isCommunityOrPhilifePostDetail ||
    isPhilifeMeetings ||
    isPhilifeMyPage;

  const showRegionBar = !suppressMainTier1;

  const showRegionPicker =
    showRegionBar && isTradeExploration && !isUnderMypageTrade && !isPhilifeExploration;

  /** `/mypage/trade` 도 동일 h-12 서브페이지 1단(`resolveMainTier1Subpage`)으로 통일 */
  const showTradeHubLeading = false;

  const showSearchNotificationsMenu =
    showRegionBar && (isTradeExploration || isPhilifeExploration) && !isUnderMypageTrade;

  return {
    showRegionBar,
    showRegionPicker,
    showTradeHubLeading,
    showSearch: showSearchNotificationsMenu,
    showNotifications: showSearchNotificationsMenu,
    showServicesMenu: showSearchNotificationsMenu,
    showStoreCart: false,
  };
}
