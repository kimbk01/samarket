import { MYPAGE_TRADE_FAVORITES_HREF } from "@/lib/mypage/trade-hub-paths";

/** 거래 허브 — 구매·판매·찜·후기 상단 탭 */
export const MYPAGE_HOME_TRADE_HUB_HREF = "/mypage/trade" as const;
export const MYPAGE_HOME_TRADE_SALES_HREF = "/mypage/trade/sales" as const;
export const MYPAGE_HOME_TRADE_FAVORITES_HREF = MYPAGE_TRADE_FAVORITES_HREF;

/** 스토어 주문 허브 */
export const MYPAGE_HOME_STORE_ORDERS_HREF = "/mypage/store-orders" as const;

/** 통합 채팅 허브 */
export const MYPAGE_HOME_MESSENGER_HREF = "/community-messenger?section=chats" as const;

/** 커뮤니티 글 허브 (RSC) */
export const MYPAGE_HOME_COMMUNITY_POSTS_HREF = "/mypage/community-posts" as const;

/** 커뮤니티 활동 허브 — 댓글·반응·신고 (RSC seed) */
export const MYPAGE_HOME_COMMUNITY_ACTIVITY_HREF = "/mypage/community-activity" as const;

/** 가격 제안 */
export const MYPAGE_HOME_TRADE_OFFERS_HREF = "/my/offers" as const;

/** @deprecated section — legacy adapter only */
export const MYPAGE_SECTION_COMMUNITY_COMMENTS_HREF =
  "/mypage/section/community/comments" as const;
