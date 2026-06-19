import type { MessageKey } from "@/lib/i18n/messages";
import type { MypageHomeLinkMenuItem } from "@/lib/mypage/mypage-home-menu-types";
import {
  MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
  MYPAGE_HOME_COMMUNITY_POSTS_HREF,
  MYPAGE_HOME_TRADE_FAVORITES_HREF,
  MYPAGE_HOME_TRADE_OFFERS_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

/** 주요 기능(quick access) — 홈 허브 진입만 */
export const MYPAGE_HOME_QUICK_ITEMS: MypageHomeLinkMenuItem[] = [
  {
    href: MYPAGE_HOME_TRADE_SALES_HREF,
    titleKey: "mypage_comp_menu_trade_active_title",
    icon: "package",
  },
  {
    href: MYPAGE_HOME_TRADE_FAVORITES_HREF,
    titleKey: "mypage_comp_menu_trade_favorites_title",
    icon: "heart",
  },
  {
    href: MYPAGE_HOME_TRADE_OFFERS_HREF,
    titleKey: "mypage_comp_menu_trade_offers_title",
    icon: "receipt-text",
  },
  {
    href: MYPAGE_HOME_COMMUNITY_POSTS_HREF,
    titleKey: "mypage_comp_menu_community_posts_title",
    icon: "book-open",
  },
  {
    href: MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
    titleKey: "mypage_comp_menu_community_activity_title",
    icon: "message-circle",
  },
];

export type { MessageKey };
