import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";
import { buildMypageInfoHubHref } from "@/lib/my/mypage-info-hub";

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
  { href: "/community-messenger?section=chats&kind=trade", label: "채팅" },
  { href: MYPAGE_TRADE_FAVORITES_HREF, label: "찜" },
  { href: "/mypage/trade/reviews", label: "후기" },
];

const ORDERS_CTAS: ManagedMyCtaLink[] = [
  { href: "/mypage/store-orders", label: "주문 내역" },
  { href: "/mypage/trade/purchases", label: "구매" },
  { href: "/mypage/trade/sales", label: "판매" },
];

const BOARD_CTAS: ManagedMyCtaLink[] = [{ href: "/mypage/community-posts", label: "내 활동" }];

function storeSectionCtas(ownerStoreId?: string | null): ManagedMyCtaLink[] {
  const sid = ownerStoreId?.trim();
  const enc = sid ? encodeURIComponent(sid) : "";
  const newOrdersHref = sid ? `/mypage/business/orders?storeId=${enc}` : "/mypage/business/orders";
  const hubHref = sid ? `/mypage/business?storeId=${enc}` : "/mypage/business";

  if (sid) {
    return [
      { href: newOrdersHref, label: "신규 주문" },
      { href: hubHref, label: "운영 허브" },
      { href: "/mypage/store-orders", label: "내 주문" },
    ];
  }

  return [
    { href: newOrdersHref, label: "주문 접수" },
    { href: hubHref, label: "운영 허브" },
    { href: "/mypage/store-orders", label: "내 주문" },
    { href: "/mypage/business/apply", label: "매장 신청" },
  ];
}

const ACCOUNT_CTAS: ManagedMyCtaLink[] = [
  { href: "/mypage", label: "내정보" },
  { href: "/mypage/account", label: "계정" },
  { href: "/mypage/notifications", label: "알림" },
  { href: "/mypage/order-notifications", label: "주문알림" },
  { href: "/mypage/points", label: "포인트" },
  { href: buildMypageInfoHubHref(), label: "앱·설정" },
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
