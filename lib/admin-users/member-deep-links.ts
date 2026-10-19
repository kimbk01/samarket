/** Existing Admin surfaces only — no new engines. */

import { resolveAdminStoreApplicationHref } from "@/lib/admin/admin-ops-deeplink";

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
  return `/admin/community/posts/${encodeURIComponent(postId)}`;
}

/** 이 회원이 받은 신고 (작성한 글·댓글 대상) */
export function memberCommunityReceivedReportsAdminHref(userId: string): string {
  return `/admin/community/reports?authorId=${encodeURIComponent(userId)}`;
}

export function memberCommunityAuthorAdminHref(userId: string): string {
  return `/admin/community/members/${encodeURIComponent(userId)}`;
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

export function memberStoresAdminHref(query?: string): string {
  const q = String(query ?? "").trim();
  return q ? `/admin/stores?q=${encodeURIComponent(q)}` : "/admin/stores";
}

/** Canonical Admin Store Detail — Member list + detail must share this resolver. */
export function memberBusinessDetailHref(storeId: string): string {
  return resolveAdminStoreApplicationHref(storeId);
}

export function memberStorePublicHref(slug: string): string {
  const value = slug.trim();
  return `/stores/${encodeURIComponent(value)}`;
}

export function memberBusinessCreditHref(query?: string): string {
  const q = String(query ?? "").trim();
  return q ? `/admin/store-points?q=${encodeURIComponent(q)}` : "/admin/store-points";
}

export function memberNoteComposeHref(userId: string): string {
  // A2-2: Support Center is SSOT for admin↔member messaging (legacy member-notes writer disabled).
  return `/admin/support?search=${encodeURIComponent(userId)}`;
}

/** C-10: 회원이 참여한 모든 채팅방 — 전체채팅의 서버 `user_id` 참여자 필터 (닉네임 검색 아님). */
export function memberMessengerAdminHref(userId: string): string {
  return `/admin/chats?user_id=${encodeURIComponent(userId.trim())}`;
}

export function memberGroupAdminHref(): string {
  return "/admin/chats/group";
}

export function memberOrderRoomAdminHref(): string {
  return "/admin/order-chats";
}

export function memberInquiryAdminHref(userId: string): string {
  return `/admin/support?search=${encodeURIComponent(userId)}`;
}

export function memberInboxAdminHref(): string {
  return "/admin/support";
}
