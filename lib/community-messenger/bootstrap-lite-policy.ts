/**
 * Messenger bootstrap `?lite=1` / `tier=critical` — App Boot·Surface 계약.
 * 구현: `getCommunityMessengerBootstrap` (`skipDiscoverable`+`deferCallLog` → isMinimalLiteBootstrap).
 */

/** lite=critical 첫 리스트: 방·참가·unread·peer 라벨만 — trade full enrich 금지 */
export const MESSENGER_BOOTSTRAP_LITE_SKIP_TRADE_ENRICH = true as const;

/** 친구·요청·팔로우·discoverable·call log — Background / home-sync */
export const MESSENGER_BOOTSTRAP_LITE_SKIP_SOCIAL_GRAPH = true as const;

/** trade meta 보강 — `useTradeChatListMetaHydration` + Background scheduler */
export const MESSENGER_BOOTSTRAP_LITE_TRADE_META_BACKGROUND = true as const;
