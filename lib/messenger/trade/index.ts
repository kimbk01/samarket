/**
 * trade Domain 모듈 (Phase 3 구현 · cutover OFF · UI 미연결).
 * UX: 홈 거래허브 → /community-messenger/trade-chats → 거래방. 일반 inbox 직나열 금지.
 */
export { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
export {
  TRADE_PHASE3_UX_RULES,
  TRADE_LIST_HREF,
  type TradeHubViewModel,
  type TradeListViewModel,
  type TradeRoomHeaderViewModel,
} from "@/lib/messenger/trade/ux-contract";
export {
  EMPTY_TRADE_STATE,
  TRADE_PRODUCT_TITLE_PLACEHOLDER,
  TRADE_PEER_PLACEHOLDER,
  type TradeListItem,
  type TradeRoomInput,
  type TradeDomainState,
  type TradeListSnapshot,
} from "@/lib/messenger/trade/types";

export {
  buildTradeIdentity,
  parseTradeIdentityKey,
  assertTradeOwnedRoom,
  tradeIdentityPort,
} from "@/lib/messenger/trade/identity";
export {
  assertTradeViewerPermission,
  TRADE_LIST_API_PLAN,
  tradePermissionPort,
} from "@/lib/messenger/trade/permission";
export { buildTradeListSnapshot, mapTradeListItem } from "@/lib/messenger/trade/list";
export { buildTradeHubViewModel, assertHomeInboxRejectsTradeDomain } from "@/lib/messenger/trade/hub";
export { resolveTradePresentation, resolveTradePresentationFromListItem } from "@/lib/messenger/trade/presentation";
export { resolveTradeHeaderKind, buildTradeHeaderModel } from "@/lib/messenger/trade/header";
export { resolveTradePreview, assertTradePreviewDoesNotUseMetadata } from "@/lib/messenger/trade/preview";
export { buildTradeListViewModel, tradeStatusBadgeSeparated, tradeRouterPort } from "@/lib/messenger/trade/row-model";
export {
  resolveTradeViewerRole,
  tradeViewerRoleLabelKo,
  tradeViewerRoleLabelEn,
  type TradeViewerRole,
} from "@/lib/messenger/trade/viewer-role";
export {
  resolveTradeItemStatus,
  normalizeTradeListPreviewLine,
  looksLikeTradeStatusChangePreview,
  type TradeItemStatus,
} from "@/lib/messenger/trade/item-status";
export {
  filterTradeListRowsByRole,
  sortTradeListRows,
  compareTradeListSortKeys,
  type TradeListRoleFilter,
} from "@/lib/messenger/trade/list-sort-filter";

export { acceptTradeBootstrap, mergeTradePartialBootstrap } from "@/lib/messenger/trade/bootstrap";
export {
  buildTradeCacheKey,
  TradeReadonlyMemoryCache,
  tradeMemoryCache,
} from "@/lib/messenger/trade/cache";
export {
  assertTradeReadAllowed,
  buildTradeMarkReadPayload,
  countTradeUnreadRooms,
  buildTradeBadgeContribution,
} from "@/lib/messenger/trade/read-unread-badge";
export {
  resolveTradeNotificationDisplay,
  resolveTradeSoundKey,
  TRADE_SOUND_EVENT_KEY,
} from "@/lib/messenger/trade/notification-sound";
export {
  applyTradeNotificationEnvelope,
  TradeNotificationCacheHarness,
} from "@/lib/messenger/trade/phase9-notification";
export { tradePorts } from "@/lib/messenger/trade/ports";

export {
  tradePhase6Cache,
  createTradeFixtureBootstrapSource,
  runTradeBootstrap,
  type TradeBootstrapHub,
} from "@/lib/messenger/trade/phase6-bootstrap";

export {
  createTradeRealtimeApplyPort,
  emptyTradeHarnessSnapshot,
  type TradeRealtimeApplyPort,
} from "@/lib/messenger/trade/phase7-realtime";

export {
  createTradeReadPort,
  buildTradeUnreadContribution,
  buildTradeHubBadgeFromUnread,
  buildTradeAppIconContribution,
  buildTradeRowBadge,
  type TradeReadPort,
} from "@/lib/messenger/trade/phase8a-read-unread-badge";
