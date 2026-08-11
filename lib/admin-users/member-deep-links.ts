/** Existing Admin surfaces only — no new engines. */

export function memberCommunityPostsAdminHref(userId: string): string {
  return `/admin/community/posts?userId=${encodeURIComponent(userId)}`;
}

export function memberCommunityCommentsAdminHref(userId: string): string {
  return `/admin/community/comments?userId=${encodeURIComponent(userId)}`;
}

export function memberCommunityReportsAdminHref(userId: string): string {
  return `/admin/community/reports?reporterId=${encodeURIComponent(userId)}`;
}

export function memberCommunityPostHref(postId: string): string {
  return `/admin/community/posts?postId=${encodeURIComponent(postId)}`;
}

export function memberFeedAdsAdminHref(): string {
  return "/admin/feed-ads";
}

export function memberTradePostHref(postId: string): string {
  return `/post/${encodeURIComponent(postId)}`;
}

export function memberTradeAdminHref(): string {
  return "/admin/posts-management";
}

export function memberTradeChatAdminHref(): string {
  return "/admin/chats/trade";
}

export function memberOrderDetailHref(orderId: string): string {
  return `/admin/stores/orders/${encodeURIComponent(orderId)}`;
}

export function memberOrdersByBuyerHref(userId: string): string {
  return `/admin/stores/orders/by-buyer/${encodeURIComponent(userId)}`;
}

export function memberStoreOrdersByStoreHref(storeId: string): string {
  return `/admin/stores/orders/by-store/${encodeURIComponent(storeId)}`;
}

export function memberStoresAdminHref(): string {
  return "/admin/stores";
}

export function memberBusinessCreditHref(): string {
  return "/admin/store-settlements";
}

export function memberMessengerAdminHref(userId: string): string {
  return `/admin/chats/messenger?q=${encodeURIComponent(userId)}`;
}

export function memberGroupAdminHref(): string {
  return "/admin/chats/group";
}

export function memberOrderRoomAdminHref(): string {
  return "/admin/chats/business";
}

export function memberInquiryAdminHref(userId: string): string {
  return `/admin/member-notes?kind=inquiry&memberUserId=${encodeURIComponent(userId)}`;
}

export function memberInboxAdminHref(): string {
  return "/admin/member-notes?kind=inbox";
}
