/**
 * SAMarket — 제품 표면(거래·커뮤니티·매장/배달·채팅·계정)과 라우트 정렬.
 * 하단 탭의 href 진실은 `bottom-nav-config` 단일 원천; 여기서는 탭 id 연결·딥링크·푸시용 보조 경로만 둔다.
 *
 * 사용자 대면 「채팅」3종 정의: `lib/chat-domain/samarket-three-chat-pillars.ts` (Philife·store 스트림·통화는 별도).
 */

import {
  BOTTOM_NAV_ITEMS,
  type BottomNavBuiltinTabId,
} from "@/lib/main-menu/bottom-nav-config";

export const SAMARKET_SURFACES = [
  "trade",
  "community",
  "stores",
  "orders",
  "chat",
  "account",
] as const;
export type SamarketSurface = (typeof SAMARKET_SURFACES)[number];

/** 내장 탭 id → 제품 표면 (분석·푸시 카테고리·커스텀 탭 매핑 시 사용) */
export const BUILTIN_TAB_TO_SURFACE: Record<BottomNavBuiltinTabId, SamarketSurface> = {
  home: "trade",
  community: "community",
  stores: "stores",
  chat: "chat",
  my: "account",
};

export function mainTabHref(tabId: BottomNavBuiltinTabId): string {
  return BOTTOM_NAV_ITEMS.find((i) => i.id === tabId)?.href ?? "/home";
}

/** 표면 기본 진입 URL — 내장 탭과 1:1 (운영 커스텀 탭은 추후 resolve 계층에서 덮어쓰기) */
export function surfaceEntryPath(surface: SamarketSurface): string {
  const entry = (
    Object.entries(BUILTIN_TAB_TO_SURFACE) as [BottomNavBuiltinTabId, SamarketSurface][]
  ).find(([, s]) => s === surface);
  if (entry) return mainTabHref(entry[0]);
  if (surface === "orders") return SAMARKET_ROUTES.orders.hub;
  return "/home";
}

/** 하단 탭 밖에서 자주 쓰는 경로 (App Router 기준) */
export const SAMARKET_ROUTES = {
  trade: {
    search: "/search",
    newPost: "/posts/new",
    newProduct: "/products/new",
    writeCategory: (categoryId: string) => `/write/${encodeURIComponent(categoryId)}`,
    post: (postId: string) => `/post/${encodeURIComponent(postId)}`,
    product: (productId: string) => `/products/${encodeURIComponent(productId)}`,
    market: (slug: string) => `/market/${encodeURIComponent(slug)}`,
  },
  community: {
    home: "/community",
    write: "/community/write",
    board: (boardSlug: string) => `/community/${encodeURIComponent(boardSlug)}`,
    boardPost: (boardSlug: string, postId: string) =>
      `/community/${encodeURIComponent(boardSlug)}/${encodeURIComponent(postId)}`,
    legacyPost: (postId: string) => `/community/post/${encodeURIComponent(postId)}`,
  },
  stores: {
    browsePrimary: (primary: string) => `/stores/browse/${encodeURIComponent(primary)}`,
    store: (slug: string) => `/stores/${encodeURIComponent(slug)}`,
    cart: (slug: string) => `/stores/${encodeURIComponent(slug)}/cart`,
    checkout: (slug: string) => `/stores/${encodeURIComponent(slug)}/checkout`,
    order: (slug: string, orderId: string) =>
      `/stores/${encodeURIComponent(slug)}/order/${encodeURIComponent(orderId)}`,
    product: (slug: string, productId: string) =>
      `/stores/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`,
  },
  orders: {
    hub: "/orders",
    /** 사업자·레거시 마이페이지 트리 — 구매자 배달 목록은 `orderChats` */
    storeOrders: "/mypage/store-orders",
    tradePurchases: "/mypage/purchases",
    /** 구매자 배달·매장 주문 목록(채팅 허브 탭과 동일) */
    orderChats: "/my/store-orders",
  },
  chat: {
    messengerHub: "/community-messenger?section=chats",
    /** 모임 허브 — Philife meetup 피드가 아닌 메신저 `open_chat` */
    messengerMeetingsHub: "/community-messenger?section=open_chat",
    orderHub: "/my/store-orders",
    newChat: "/chats/new",
    /** 주문/거래 공통 — 방 단위 단일 URL (`source` 있으면 부트스트랩 힌트, `lib/chats/trade-chat-notification-href` 와 동일 의미) */
    room: (roomId: string, sourceHint?: "chat_room" | "product_chat") =>
      sourceHint === "chat_room" || sourceHint === "product_chat"
        ? `/chats/${encodeURIComponent(roomId)}?source=${encodeURIComponent(sourceHint)}`
        : `/chats/${encodeURIComponent(roomId)}`,
  },
  account: {
    mypage: "/mypage",
    mypageAccount: "/mypage/account",
    mypageNotifications: "/mypage/notifications",
    mypageOrderNotifications: "/mypage/order-notifications",
    mypagePoints: "/mypage/points",
    mypageSettings: "/mypage/settings",
    mypageStoreOrders: "/mypage/store-orders",
    /** 레거시 /my 트리 — 신규는 /mypage 우선 */
    myRoot: "/my",
  },
} as const;
