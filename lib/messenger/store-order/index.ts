/**
 * store_order Domain 모듈 (Phase 4 구현 · cutover OFF · UI 미연결).
 * trade/general Port 비상속. Customer/Owner 파이프라인 완전 분리.
 */
export { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";
export {
  STORE_ORDER_DESIGN_LOCK,
  STORE_ORDER_PHASE4_APPROVAL_CONDITIONS,
  STORE_ORDER_INVARIANT_IDS,
  STORE_ORDER_REQUIRES_DUAL_PRESENTATION_PORTS,
  STORE_ORDER_BADGE_CONTRIBUTES_TO,
  STORE_ORDER_NAV_MESSENGER_CONTRIBUTION,
  STORE_ORDER_FORBIDDEN_MODULE_IMPORTS,
  STORE_ORDER_FORBIDDEN_TRADE_PORT_TOKENS,
  assertStoreOrderIdentityKey,
  buildStoreOrderIdentityKey,
  assertDistinctOrdersSeparateIdentity,
  assertStoreOrderPreviewDoesNotUseMetadata,
  contentHitsStoreOrderPreviewForbiddenMarkers,
  STORE_ORDER_PREVIEW_FORBIDDEN_MARKERS,
  assertStoreOrderCustomerSurface,
  assertStoreOrderOwnerSurface,
  assertStoreOrderBadgeContributionTargets,
  assertStoreOrderHeaderOwnDomainOnly,
  assertStoreOrderPreviewOwnDomainOnly,
  assertStoreOrderNotificationOwnDomainOnly,
  assertForeignDomainRejectedByStoreOrderCapability,
} from "@/lib/messenger/store-order/design-lock";
export {
  STORE_ORDER_LIST_HREF,
  STORE_ORDER_PHASE4_UX_RULES,
  type StoreOrderHubViewModel,
  type StoreOrderCustomerListViewModel,
  type StoreOrderOwnerListViewModel,
  type StoreOrderCustomerHeaderViewModel,
  type StoreOrderOwnerHeaderViewModel,
} from "@/lib/messenger/store-order/ux-contract";
export {
  EMPTY_STORE_ORDER_STATE,
  STORE_ORDER_STORE_NAME_PLACEHOLDER,
  STORE_ORDER_CUSTOMER_NAME_PLACEHOLDER,
  type StoreOrderListItem,
  type StoreOrderRoomInput,
  type StoreOrderDomainState,
  type StoreOrderListSnapshot,
} from "@/lib/messenger/store-order/types";

export {
  buildStoreOrderIdentity,
  parseStoreOrderIdentityKey,
  assertStoreOrderOwnedRoom,
  storeOrderIdentityPort,
} from "@/lib/messenger/store-order/identity";
export {
  assertStoreOrderViewerPermission,
  STORE_ORDER_LIST_API_PLAN,
  storeOrderPermissionPort,
} from "@/lib/messenger/store-order/permission";
export { buildStoreOrderListSnapshot, mapStoreOrderListItem } from "@/lib/messenger/store-order/list";
export {
  buildStoreOrderHubViewModel,
  assertHomeInboxRejectsStoreOrderDomain,
} from "@/lib/messenger/store-order/hub";
export {
  resolveStoreOrderCustomerPresentation,
  resolveStoreOrderCustomerPresentationFromListItem,
} from "@/lib/messenger/store-order/customer-presentation-resolver";
export {
  resolveStoreOrderOwnerPresentation,
  resolveStoreOrderOwnerPresentationFromListItem,
} from "@/lib/messenger/store-order/owner-presentation-resolver";
export {
  resolveStoreOrderCustomerHeaderKind,
  buildStoreOrderCustomerHeaderModel,
  storeOrderCustomerHeaderPort,
} from "@/lib/messenger/store-order/customer-header";
export {
  resolveStoreOrderOwnerHeaderKind,
  buildStoreOrderOwnerHeaderModel,
  storeOrderOwnerHeaderPort,
} from "@/lib/messenger/store-order/owner-header";
export {
  resolveStoreOrderPreview,
  storeOrderPreviewPort,
  STORE_ORDER_EMPTY_CONVERSATION_PREVIEW,
  STORE_ORDER_SUMMARY_REDACTED_PREVIEW,
} from "@/lib/messenger/store-order/preview";
export {
  buildStoreOrderCustomerListViewModel,
  buildStoreOrderOwnerListViewModel,
  storeOrderStatusBadgeSeparated,
  storeOrderRouterPort,
} from "@/lib/messenger/store-order/row-model";
export {
  acceptStoreOrderBootstrap,
  mergeStoreOrderPartialBootstrap,
} from "@/lib/messenger/store-order/bootstrap";
export {
  buildStoreOrderCacheKey,
  StoreOrderReadonlyMemoryCache,
  storeOrderMemoryCache,
} from "@/lib/messenger/store-order/cache";
export {
  assertStoreOrderReadAllowed,
  buildStoreOrderMarkReadPayload,
  countStoreOrderUnreadRooms,
  buildStoreOrderBadgeContribution,
} from "@/lib/messenger/store-order/read-unread-badge";
export {
  resolveStoreOrderNotificationDisplay,
  resolveStoreOrderSoundKey,
  STORE_ORDER_SOUND_EVENT_KEY,
  STORE_ORDER_SOUND_EVENT_KEY_CUSTOMER,
  STORE_ORDER_SOUND_EVENT_KEY_OWNER,
} from "@/lib/messenger/store-order/notification-sound";
export {
  applyStoreOrderNotificationEnvelope,
  StoreOrderNotificationCacheHarness,
  STORE_ORDER_STORE_IMAGE_PLACEHOLDER,
} from "@/lib/messenger/store-order/phase9-notification";
export {
  storeOrderPorts,
  storeOrderCustomerPresentationPort,
  storeOrderOwnerPresentationPort,
} from "@/lib/messenger/store-order/ports";

export {
  assertStoreOrderCustomerDisplayIdentity,
  toStoreOrderCustomerSurface,
  type StoreOrderCustomerSurface,
} from "@/lib/messenger/store-order/customer-surface";
export {
  assertStoreOrderOwnerDisplayIdentity,
  toStoreOrderOwnerSurface,
  type StoreOrderOwnerSurface,
} from "@/lib/messenger/store-order/owner-surface";

export {
  storeOrderPhase6Cache,
  createStoreOrderFixtureBootstrapSource,
  runStoreOrderBootstrap,
  buildStoreOrderCacheKeyForSurface,
  type StoreOrderSurfaceRole,
  type StoreOrderBootstrapHub,
} from "@/lib/messenger/store-order/phase6-bootstrap";

export {
  createStoreOrderRealtimeApplyPort,
  emptyStoreOrderHarnessSnapshot,
  type StoreOrderRealtimeApplyPort,
} from "@/lib/messenger/store-order/phase7-realtime";

export {
  createStoreOrderReadPort,
  buildStoreOrderUnreadContribution,
  buildStoreOrderHubBadgeFromUnread,
  buildStoreOrderAppIconContribution,
  buildStoreOrderRowBadge,
  assertSameStoreOwnerContributions,
  type StoreOrderReadPort,
} from "@/lib/messenger/store-order/phase8a-read-unread-badge";
