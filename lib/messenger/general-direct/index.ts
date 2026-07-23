/**
 * general_direct Domain 모듈 (Phase 2 구현 · cutover OFF · UI 미연결).
 */
export {
  GENERAL_DIRECT_DOMAIN,
  GENERAL_DIRECT_PEER_PLACEHOLDER_NAME,
  EMPTY_GENERAL_DIRECT_STATE,
  type GeneralDirectListItem,
  type GeneralDirectRowModel,
  type GeneralDirectHeaderModel,
  type GeneralDirectRoomInput,
  type GeneralDirectDomainState,
  type GeneralDirectListSnapshot,
} from "@/lib/messenger/general-direct/types";

export {
  buildGeneralDirectIdentity,
  parseGeneralDirectIdentityKey,
  assertGeneralDirectOwnedRoom,
  assertNotForeignDomainIdentity,
  generalDirectIdentityPort,
} from "@/lib/messenger/general-direct/identity";

export {
  assertGeneralDirectViewerPermission,
  GENERAL_DIRECT_LIST_API_PLAN,
  generalDirectPermissionPort,
} from "@/lib/messenger/general-direct/permission";

export {
  buildGeneralDirectListSnapshot,
  mapGeneralDirectListItem,
  generalDirectListAcceptsOnlyOwnDomain,
} from "@/lib/messenger/general-direct/list";

export {
  resolveGeneralDirectDisplayIdentity,
  resolveGeneralDirectDisplayFromListItem,
} from "@/lib/messenger/general-direct/presentation";

export {
  resolveGeneralDirectHeaderKind,
  buildGeneralDirectHeaderModel,
} from "@/lib/messenger/general-direct/header";

export {
  resolveGeneralDirectPreview,
  assertGeneralDirectPreviewDoesNotUseMetadata,
} from "@/lib/messenger/general-direct/preview";

export {
  buildGeneralDirectRowModel,
  generalDirectRouterPort,
} from "@/lib/messenger/general-direct/row-model";

export {
  acceptGeneralDirectBootstrap,
  mergeGeneralDirectPartialBootstrap,
} from "@/lib/messenger/general-direct/bootstrap";

export {
  buildGeneralDirectCacheKey,
  GeneralDirectReadonlyMemoryCache,
  generalDirectMemoryCache,
} from "@/lib/messenger/general-direct/cache";

export {
  assertGeneralDirectReadAllowed,
  buildGeneralDirectMarkReadPayload,
  sumGeneralDirectUnread,
  countGeneralDirectUnreadRooms,
  buildGeneralDirectBadgeContribution,
} from "@/lib/messenger/general-direct/read-unread-badge";

export {
  resolveGeneralDirectNotificationDisplay,
  resolveGeneralDirectSoundKey,
  GENERAL_DIRECT_SOUND_EVENT_KEY,
} from "@/lib/messenger/general-direct/notification-sound";

export {
  applyGeneralDirectNotificationEnvelope,
  GeneralDirectNotificationCacheHarness,
} from "@/lib/messenger/general-direct/phase9-notification";

export { generalDirectPorts } from "@/lib/messenger/general-direct/ports";

export {
  generalDirectPhase6Cache,
  createGeneralDirectFixtureBootstrapSource,
  runGeneralDirectBootstrap,
  generalDirectSnapshotRowsToRowModels,
} from "@/lib/messenger/general-direct/phase6-bootstrap";

export {
  createGeneralDirectRealtimeApplyPort,
  emptyGeneralDirectHarnessSnapshot,
  type GeneralDirectRealtimeApplyPort,
} from "@/lib/messenger/general-direct/phase7-realtime";

export {
  createGeneralDirectReadPort,
  buildGeneralDirectUnreadContribution,
  buildGeneralDirectAppIconContribution,
  buildGeneralDirectRowBadge,
  type GeneralDirectReadPort,
} from "@/lib/messenger/general-direct/phase8a-read-unread-badge";
