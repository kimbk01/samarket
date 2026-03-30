import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";

/**
 * 내정보 하위 화면 공통 UI — 상황(거래/주문/게시판/매장/계정)별 빠른 CTA 프리셋.
 * 인스타 프로필 하단 스토리 링·탭과 동일한 정보 구조를 유지합니다.
 */
export type ManagedMySection = "trade" | "orders" | "board" | "store" | "account";

export type ManagedMyCtaLink = { href: string; label: string };

const TRADE_CTAS: ManagedMyCtaLink[] = [
  { href: "/mypage/trade", label: "거래 허브" },
  { href: "/mypage/trade/purchases", label: "구매" },
  { href: "/mypage/trade/sales", label: "판매" },
  { href: "/mypage/trade/chat", label: "채팅" },
  { href: MYPAGE_TRADE_FAVORITES_HREF, label: "찜" },
  { href: "/mypage/trade/reviews", label: "후기" },
];

const ORDERS_CTAS: ManagedMyCtaLink[] = [{ href: "/my/store-orders", label: "매장 주문" }];

const BOARD_CTAS: ManagedMyCtaLink[] = [
  { href: "/community", label: "동네생활" },
  { href: "/community/write", label: "글쓰기" },
  { href: "/my/community-posts", label: "내 글" },
  { href: "/my/recent-viewed", label: "최근 본" },
];

function storeSectionCtas(ownerStoreId?: string | null): ManagedMyCtaLink[] {
  const sid = ownerStoreId?.trim();
  const orderHref = sid ? buildStoreOrdersHref({ storeId: sid }) : "/my/business/store-orders";
  return [
    { href: "/my/store-orders", label: "내 주문" },
    { href: "/my/business", label: "운영 허브" },
    { href: orderHref, label: "주문 접수" },
    { href: "/my/business/apply", label: "매장 신청" },
  ];
}

const ACCOUNT_CTAS: ManagedMyCtaLink[] = [
  { href: "/mypage", label: "내정보" },
  { href: "/my/notifications", label: "알림" },
  { href: "/my/settings", label: "설정" },
  { href: "/my/points", label: "포인트" },
  { href: "/my/account", label: "계정" },
];

export function getManagedSectionCtas(
  section: ManagedMySection,
  opts?: { ownerStoreId?: string | null }
): ManagedMyCtaLink[] {
  switch (section) {
    case "trade":
      return TRADE_CTAS;
    case "orders":
      return ORDERS_CTAS;
    case "board":
      return BOARD_CTAS;
    case "store":
      return storeSectionCtas(opts?.ownerStoreId);
    case "account":
      return ACCOUNT_CTAS;
    default:
      return [];
  }
}
