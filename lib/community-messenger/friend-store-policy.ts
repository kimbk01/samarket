/** 프로덕션에서는 `community_friend_requests` 미존재 시 in-memory dev fallback 금지 */
export function allowCommunityMessengerFriendInMemoryDevFallback(): boolean {
  return process.env.NODE_ENV !== "production";
}
