/**
 * group Domain 모듈 (Phase 5 구현 · cutover OFF · UI 미연결).
 * private_group / open_group 은 subtype. Identity: group:{groupId}.
 * general_direct RowModel 상속 금지. 홈 inbox 에 직접 표시 (허브 없음).
 */
export { GROUP_DOMAIN, type GroupSubtype, GROUP_NAME_PLACEHOLDER } from "@/lib/messenger/group/domain";
export {
  EMPTY_GROUP_STATE,
  type GroupListItem,
  type GroupRoomInput,
  type GroupRowModel,
  type GroupHeaderModel,
  type GroupDomainState,
  type GroupListSnapshot,
} from "@/lib/messenger/group/types";

export {
  buildGroupIdentity,
  parseGroupIdentityKey,
  assertGroupOwnedRoom,
  groupIdentityPort,
} from "@/lib/messenger/group/identity";
export {
  assertGroupViewerPermission,
  GROUP_LIST_API_PLAN,
  groupPermissionPort,
} from "@/lib/messenger/group/permission";
export { buildGroupListSnapshot, mapGroupListItem } from "@/lib/messenger/group/list";
export {
  resolveGroupPresentation,
  resolveGroupPresentationFromListItem,
  groupPresentationPort,
} from "@/lib/messenger/group/presentation";
export {
  resolveGroupHeaderKind,
  buildGroupHeaderModel,
  groupHeaderPort,
} from "@/lib/messenger/group/header";
export {
  resolveGroupPreview,
  assertGroupPreviewDoesNotUseMetadata,
  groupPreviewPort,
} from "@/lib/messenger/group/preview";
export { buildGroupRowModel, groupRouterPort } from "@/lib/messenger/group/row-model";
export { acceptGroupBootstrap, mergeGroupPartialBootstrap } from "@/lib/messenger/group/bootstrap";
export {
  buildGroupCacheKey,
  GroupReadonlyMemoryCache,
  groupMemoryCache,
} from "@/lib/messenger/group/cache";
export {
  assertGroupReadAllowed,
  buildGroupMarkReadPayload,
  countGroupUnreadRooms,
  sumGroupUnread,
  buildGroupBadgeContribution,
} from "@/lib/messenger/group/read-unread-badge";
export {
  resolveGroupNotificationDisplay,
  resolveGroupSoundKey,
  GROUP_SOUND_EVENT_KEY,
} from "@/lib/messenger/group/notification-sound";
export {
  applyGroupNotificationEnvelope,
  GroupNotificationCacheHarness,
} from "@/lib/messenger/group/phase9-notification";
export { groupPorts } from "@/lib/messenger/group/ports";

export {
  groupPhase6Cache,
  createGroupFixtureBootstrapSource,
  runGroupBootstrap,
  groupSnapshotRowsToRowModels,
} from "@/lib/messenger/group/phase6-bootstrap";

export {
  createGroupRealtimeApplyPort,
  emptyGroupHarnessSnapshot,
  type GroupRealtimeApplyPort,
} from "@/lib/messenger/group/phase7-realtime";

export {
  createGroupReadPort,
  buildGroupUnreadContribution,
  buildGroupAppIconContribution,
  buildGroupRowBadge,
  type GroupReadPort,
} from "@/lib/messenger/group/phase8a-read-unread-badge";
