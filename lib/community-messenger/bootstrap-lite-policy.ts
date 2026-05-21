/**
 * Messenger bootstrap `?lite=1` / `tier=critical` — App Boot·Surface 계약.
 * 구현: `getCommunityMessengerBootstrap` (`skipDiscoverable`+`deferCallLog` → isMinimalLiteBootstrap).
 * 회귀 락: `docs/messenger-bootstrap-lite-performance-lock.md`
 */

/** lite=critical 첫 리스트: 방·참가·unread·peer 라벨만 — trade full enrich 금지 */
export const MESSENGER_BOOTSTRAP_LITE_SKIP_TRADE_ENRICH = true as const;

/** 친구·요청·팔로우·discoverable·call log — parallel 초기 묶음에서 제외(캐시·[]·백그라운드) */
export const MESSENGER_BOOTSTRAP_LITE_SKIP_SOCIAL_GRAPH = true as const;

/** trade meta 보강 — `useTradeChatListMetaHydration` + Background scheduler */
export const MESSENGER_BOOTSTRAP_LITE_TRADE_META_BACKGROUND = true as const;

/**
 * lite rooms — `community_messenger_bootstrap_lite_my_rooms_bundle` 1RTT(없으면 legacy round1+2).
 * 프로세스 캐시 4s(`fresh=1` bypass). last_message 는 room 행에 포함(별도 N+1 없음).
 */
export const MESSENGER_BOOTSTRAP_LITE_ROOMS_BUNDLE_RPC = "community_messenger_bootstrap_lite_my_rooms_bundle" as const;

/** lite bootstrap first paint 필수(동기) */
export const MESSENGER_BOOTSTRAP_LITE_FIRST_PAINT_REQUIRED = [
  "my_rooms",
  "participants_minimum",
  "profiles_minimum",
  "unread_count",
  "latest_message_summary",
  "trade_minimal_meta",
  "viewer_state",
] as const;

/** lite bootstrap deferred(캐시·[]·클라/home-sync·백그라운드) */
export const MESSENGER_BOOTSTRAP_LITE_FIRST_PAINT_DEFERRED = [
  "friends_full",
  "requests_full",
  "meetings",
  "discoverable",
  "non_visible_social_metadata",
  "heavy_profile_details",
  "favorite_full",
  "following_hidden_blocked",
  "call_logs",
] as const;
