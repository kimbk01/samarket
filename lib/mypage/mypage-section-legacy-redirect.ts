/**
 * section 스택 → 허브 redirect SSOT
 * 홈·하단탭은 허브만 연결하고, 북마크·레거시 URL 은 여기서 흡수한다.
 */
import {
  MYPAGE_HOME_ACCOUNT_HREF,
  MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
  MYPAGE_HOME_ADDRESSES_HREF,
  MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
  MYPAGE_HOME_MESSENGER_HREF,
  MYPAGE_HOME_RECENT_VIEWED_HREF,
  MYPAGE_HOME_STORE_ORDERS_HREF,
  MYPAGE_HOME_TRADE_FAVORITES_HREF,
  MYPAGE_HOME_TRADE_HUB_HREF,
  MYPAGE_HOME_TRADE_SALES_HREF,
} from "@/lib/mypage/mypage-home-hub-links";

const LEGACY_HUB_REDIRECTS: Record<string, string> = {
  "trade:sales": MYPAGE_HOME_TRADE_SALES_HREF,
  "trade:purchases": MYPAGE_HOME_TRADE_HUB_HREF,
  "trade:favorites": MYPAGE_HOME_TRADE_FAVORITES_HREF,
  /** Slice 5: section recent → recent-viewed hub (not self) */
  "trade:recent": MYPAGE_HOME_RECENT_VIEWED_HREF,
  "trade:trade-chat": "/mypage/trade/chat",
  "trade:reviews": "/mypage/trade/reviews",
  "store:orders": MYPAGE_HOME_STORE_ORDERS_HREF,
  "store:order-chat": "/mypage/section/store/order-chat",
  /** Slice 6: address shells → addresses hub */
  "store:address": MYPAGE_HOME_ADDRESSES_HREF,
  "settings:address": MYPAGE_HOME_ADDRESSES_HREF,
  /** Slice 6: account parallel shells → account SSOT */
  "account:account-info": MYPAGE_HOME_ACCOUNT_HREF,
  "account:profile": MYPAGE_HOME_ACCOUNT_HREF,
  "community:comments": MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
  "community:posts": "/mypage/community-posts",
  "community:favorite-posts": MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF,
  "messenger:dm": MYPAGE_HOME_MESSENGER_HREF,
  "messenger:groups": "/community-messenger?section=groups",
  "messenger:friends": "/mypage/section/messenger/friends",
  "messenger:chat-alerts": "/mypage/section/messenger/chat-alerts",
  /** App CS — stub support → full-page hub */
  "settings:support": "/mypage/customer-center",
  /** Slice 6: leave canonical (also linked from Account) */
  "settings:leave": MYPAGE_HOME_ACCOUNT_LEAVE_HREF,
};

export function resolveMypageSectionLegacyHubRedirect(
  section: string,
  item: string
): string | null {
  const key = `${section.trim()}:${item.trim()}`;
  return LEGACY_HUB_REDIRECTS[key] ?? null;
}
