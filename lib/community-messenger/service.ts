import type { CommunityMessengerRoomSnapshotDiagnostics } from "@/lib/chat-domain/ports/community-messenger-read";
import { randomUUID } from "crypto";
import { after } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { resolvePublicIdAtDisplay } from "@/lib/auth/dibay-public-id-ssot";
import { getPublicDeployTier } from "@/lib/config/deploy-surface";
import { registerCommunityMessengerServiceCacheFootprintGetter } from "@/lib/community-messenger/dev/cm-service-cache-footprint-registry";
import { pruneByExpiresAtAndMaxSize } from "@/lib/http/memory-map-prune";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { resolveCallLogDisplayPeerUserId } from "@/lib/community-messenger/call-history/call-log-display-peer";
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import {
  canDeleteMessageForEveryone,
  canDeleteMessageForMe,
  canHideMessageForMe,
} from "@/lib/community-messenger/message-actions/message-delete-policy";
import { canEditMessageText } from "@/lib/community-messenger/message-actions/message-edit-policy";
import { messageRoomKindForActions } from "@/lib/community-messenger/message-actions/message-room-kind";
import {
  canReactToMessage,
  isMessengerQuickReactionKey,
} from "@/lib/community-messenger/message-actions/message-reaction-policy";
import { resolveDeletedMessagePlaceholder } from "@/lib/community-messenger/message-actions/message-reply-policy";
import { isCommunityMessengerGroupRoomType, isCommunityMessengerPrivateGroupListRoomType } from "@/lib/community-messenger/types";
import { buildProfileUserSearchOrFilter } from "@/lib/community-messenger/profile-user-search-filter";
import {
  COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS,
  downsampleVoiceWaveformPeaks,
  parseVoiceWaveformPeaksFromMetadata,
} from "@/lib/community-messenger/voice-waveform";
import {
  isCommunityMessengerStickerPublicPath,
  normalizeCommunityMessengerStickerContent,
} from "@/lib/stickers/sticker-content";
import {
  buildCommunityMessengerCallStubLabel,
} from "@/lib/community-messenger/call-stub-message-label";
import { logCallTimelineDevWarning } from "@/lib/community-messenger/call-timeline-dev-log";
import {
  cmDirectRoomSubtitleFallback,
  cmGroupRoomSubtitle,
  cmGroupTitleFallback,
  cmGroupTitleWithPeers,
  cmOpenGroupRoomSubtitle,
  cmOpenGroupRoomTitle,
  cmPeerFallbackLabel,
  cmProfileFallbackLabel,
  cmRoomLastMessagePlaceholder,
  cmRoomSnapshotDescription,
  cmSenderDisplayLabel,
  cmMessagePreviewFallback,
  cmSvcUserDefaultLabel,
  cmSvcDeletedMessagePreview,
  cmLastPreviewVoice,
  cmLastPreviewImage,
  cmLastPreviewFile,
  cmLastPreviewSticker,
  cmLastPreviewCall,
  cmLastPreviewNotification,
  cmLastPreviewPhotoAlbum,
  cmServiceT,
  cmTradePostTitleFallback,
  isWeakTradeMessengerHeadline,
} from "@/lib/community-messenger/cm-service-copy";
import {
  cmMgmtAdminRoleContent,
  cmMgmtMemberInviteContent,
  cmMgmtMemberKickContent,
  cmMgmtNoticeContent,
  cmMgmtOwnerTransferContent,
  cmMgmtPermissionsContent,
  cmStoreOrderHeadline,
  cmTradeFlowMessageBlockedCopy,
  cmTradeSellerClosedCopy,
  cmTradeSenderLeftCopy,
  cmTradeChatModeLockedCopy,
} from "@/lib/community-messenger/cm-home-list-copy";
import { buildMessengerContextMetaFromProductChatSnapshot } from "@/lib/community-messenger/product-chat-messenger-meta";
import { enrichCommerceChatRoomLifecycleForList } from "@/lib/community-messenger/commerce-chat-room-lifecycle-enrich";
import { enrichTradeRoomClassificationForDeferredHomeSync } from "@/lib/community-messenger/trade-chat-list/trade-room-classification-enrich";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import {
  enrichMessengerTradeUnreadWithLegacyTrade,
  prefetchHs5LegacyUnreadRows,
} from "@/lib/community-messenger/enrich-messenger-trade-unread-with-legacy-trade";
import {
  peekBootstrapLiteRoomsPayload,
  storeBootstrapLiteRoomsPayload,
} from "@/lib/community-messenger/bootstrap-lite-rooms-payload-cache";
import {
  peekBootstrapLiteSocialDeferred,
  scheduleBootstrapLiteSocialGraphBackgroundHydration,
  storeBootstrapLiteSocialDeferred,
  type BootstrapLiteSocialDeferredSnapshot,
} from "@/lib/community-messenger/bootstrap-lite-social-deferred-cache";
import {
  peekHomeSyncCriticalRoomsCache,
  setHomeSyncCriticalRoomsCache,
} from "@/lib/community-messenger/home-sync-critical-rooms-cache";
import { allowCommunityMessengerFriendInMemoryDevFallback } from "@/lib/community-messenger/friend-store-policy";
import {
  addFriendSaved,
  blockUserSocial,
  fetchFriendSavedAcceptedRowsForViewer,
  isBlockedEitherWay,
  isFriendSavedByMe,
  listBlockedByMeIds,
  listFriendSavedIds,
  logSocialRelationEvent,
  removeFriendSaved,
  resolveDirectInteractionGuard,
  resolveUserByPublicId,
  unblockUserSocial,
} from "@/lib/community-messenger/social-relations";
import {
  canStartDirectCallBetweenUsers,
  directCallGateFromPermissionResult,
  logCallPermission,
  mapDenyCodeToApiError,
} from "@/lib/community-messenger/direct-call-permission";
import { assertDirectRoomCommunicationNotBlocked } from "@/lib/community-messenger/direct-room-communication-gate";
import { resolveFriendshipPair } from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import {
  friendshipPairResolutionFromResolved,
  projectRoomSnapshotFriendshipFromResolution,
} from "@/lib/community-messenger/friendship/room-snapshot-friendship-projection";
import {
  mergeCommunityFriendAcceptedRowsFromSources,
  type CommunityFriendRequestAcceptedRow,
} from "@/lib/community-messenger/friendship/community-messenger-friend-accepted-list";
import { listBootstrapAcceptedFriendRowsFromSsot } from "@/lib/community-messenger/friendship/bootstrap-accepted-friend-rows-from-ssot";
import { listFriendshipSsotRowsForViewer } from "@/lib/community-messenger/friendship/community-messenger-friendships-ssot";
import {
  plannedColumnsForGeneralDirect,
  plannedColumnsForGroup,
  plannedColumnsForStoreOrderRoom,
  plannedColumnsForTrade,
  roomDomainInsertColumns,
  type PlannedRoomDomainColumns,
} from "@/lib/chat-domain/domain-identity-legacy-map";
import {
  newDomainSeparationCorrelationId,
  traceDomainSeparation,
} from "@/lib/chat-domain/domain-separation-trace";
import {
  communityMessengerSummaryEligibleForPhaseDTradeEnrich,
  isMessengerGeneralFriendDirectKey,
  messengerDirectKeyForUserPair,
} from "@/lib/community-messenger/messenger-room-domain";
import { isUnknownPeerNoticeDismissed } from "@/lib/community-messenger/peer-notices";
import { participantViewerBlockedHidden } from "@/lib/community-messenger/participant-block-hide";
import { extractHs5TradeHintsFromRoomsPayload } from "@/lib/community-messenger/home-sync-hs5-trade-hints";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  homeSyncBreakdownEnabled,
  logHomeSyncBreakdown,
  logHomeSyncBreakdownSummary,
} from "@/lib/community-messenger/home-sync-breakdown-log";
import { samarketMessengerTraceLogEnabled } from "@/lib/debug/samarket-server-trace-flags";
import { logMessengerPerfMs, messengerPerfStepsEnabled } from "@/lib/community-messenger/messenger-home-sync-perf-log";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";
import type {
  HomeSyncDeepStepsCategoryFetchDetail,
  HomeSyncDeepStepsTradeDirectKeys,
  HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown,
  HomeSyncDeepStepsTradeMetaBuildFromPostDetail,
  HomeSyncDeepStepsTradeMetaExplainedComponentsDetail,
  HomeSyncDeepStepsTradePostsFetchDetail,
  HomeSyncTrace,
} from "@/lib/community-messenger/home-sync-trace";
import { homeSyncTraceMeterEnabled, ms } from "@/lib/community-messenger/home-sync-trace";
import {
  COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_ROOM_CAP_HARD_MAX,
} from "@/lib/community-messenger/home-sync-room-caps";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";
import { extractPostThumbnailPathFromPostRow } from "@/lib/community-messenger/trade-chat-list/post-thumbnail-path";
import {
  resolveTradeChatCategoryLabelForList,
  type TradeChatCategoryMetaLike,
} from "@/lib/community-messenger/trade-chat-list/category-menu-label";
import {
  peekTradeMetaCategoryModule,
  setTradeMetaCategoryModule,
} from "@/lib/community-messenger/trade-meta-category-cache";
import {
  peekBridgeChatRoomsFallbackRequest,
  peekBridgeItemTradeLedgerRequest,
  peekBridgeProductChatsRequest,
  runWithTradeMetaRequestScope,
  setBridgeChatRoomsFallbackRequest,
  setBridgeItemTradeLedgerRequest,
  setBridgeProductChatsRequest,
} from "@/lib/community-messenger/trade-meta-request-scope";
import {
  tradeChatProductCategoryDisplayName,
  tradePostCategoryId,
  tradePostHeadlineForMessengerList,
} from "@/lib/community-messenger/trade-chat-list/trade-post-row-fields";
import type { ChatRoom } from "@/lib/types/chat";
import {
  persistProductChatMessengerRoomId,
  syncChatRoomMessengerLink,
} from "@/lib/trade/persist-trade-messenger-room-link";
import { scheduleItemTradeReadSyncAfterMessengerMark } from "@/lib/trade/schedule-item-trade-read-sync-after-messenger-mark";
import { itemTradeChatRoomIdFromMessengerDirectKey } from "@/lib/trade/mirror-community-messenger-text-to-item-trade-ledger";
import {
  resolveProductChat,
  type ProductChatRow,
  type ResolveProductChatResult,
} from "@/lib/trade/resolve-product-chat";
import {
  assertMessengerProductChatLinkedSendAllowed,
  evaluateTradeMessagingForMessengerRoom,
  loadTradeProductChatExitSnapshotForMessengerRoom,
} from "@/lib/messenger-policy/load-trade-product-chat-exit-for-room";
import { assertMessengerRoomAllowsCommunicationFeature } from "@/lib/trade/enforce-messenger-trade-room-call-policy";
import { hashMeetingPassword, verifyMeetingPassword } from "@/lib/neighborhood/meeting-password";
import { invalidateOwnerHubBadgeCache } from "@/lib/chats/owner-hub-badge-cache";
import { invalidateHomeSyncSnapshotCache } from "@/lib/community-messenger/home-sync-snapshot-cache";
import { invalidateCmBootstrapSnapshotCache } from "@/lib/community-messenger/cm-bootstrap-snapshot-cache";
import { invalidateFullBootstrapSnapshotCache } from "@/lib/community-messenger/full-bootstrap-snapshot-cache";
import {
  HomeSyncSnapshotUnavailableError,
  tryBuildHomeSyncCriticalFromSnapshot,
} from "@/lib/community-messenger/home-sync-snapshot";
import { tryLoadRoomBootstrapCriticalWaveAFromSnapshot } from "@/lib/community-messenger/room-bootstrap-snapshot";
import {
  invalidateRoomBootstrapSnapshotCache,
  invalidateRoomBootstrapSnapshotCacheForViewer,
} from "@/lib/community-messenger/room-bootstrap-snapshot-cache";
import { notifyMessagePipeline } from "@/lib/notifications/pipeline/notify-message-pipeline";
import { notifyMissedCallPipeline } from "@/lib/notifications/pipeline/notify-missed-call-pipeline";
import { notifyCommunityMessengerGroupInviteReceived } from "@/lib/notifications/community-messenger-group-inapp-notify";
import { MESSENGER_FRIEND_REJECT_COOLDOWN_MS } from "@/lib/community-messenger/messenger-latency-config";
import {
  getMessengerCallAdminPolicyCached,
  type MessengerCallAdminPolicy,
} from "@/lib/community-messenger/messenger-call-admin-policy";
import {
  isStaleRingingRow,
  terminalStaleRingingDirectSessionsForUser,
} from "@/lib/community-messenger/call-stale-ringing-cleanup";
import { sendWebPushForCommunityMessengerIncomingCall } from "@/lib/push/send-community-messenger-incoming-call-push";
import { sendWebPushForCommunityMessengerCallTerminal } from "@/lib/push/send-community-messenger-call-canceled-push";
import { sendWebPushForCommunityMessengerCallAnsweredElsewhere } from "@/lib/push/send-community-messenger-call-answered-elsewhere-push";
import {
  CALL_ANSWERED_ELSEWHERE_ERROR,
  evaluateAcceptDeviceClaim,
  normalizeAnswerClaimDeviceId,
} from "@/lib/community-messenger/call-multi-device-authority";
import { resolveAuthoritativeCallDurationSeconds } from "@/lib/community-messenger/call-authority/call-duration-authority";
import {
  resolveCanonicalCallLogPeerUserId,
} from "@/lib/community-messenger/call-authority/call-history-peer-authority";
import { decideMissedCallBellNotify } from "@/lib/community-messenger/call-authority/call-missed-bell-authority";
import {
  isTrustedClientEndedReason,
  resolveTerminalEndedReason,
} from "@/lib/community-messenger/call-authority/call-terminal-reason-authority";
import {
  provenCanonicalRoomDomainEnvelopeFromDbRow,
  type RoomDomainEnvelope,
} from "@/lib/chat-domain/room-domain-envelope";
import { isFourDomainPollutionQuarantineRoom } from "@/lib/chat-domain/four-domain-pollution-quarantine";
import { loadCommunityMessengerRoomSilentDeltaSnapshot } from "@/lib/community-messenger/server/load-community-messenger-room-silent-delta";
import {
  loadMarkReadParticipantRowWithSnapshotCache,
  storeMarkReadParticipantSnapshotsFromRow,
} from "@/lib/community-messenger/mark-read-participant-snapshot";
import {
  messengerImageClientFieldsFromMetadata,
  peekMessengerImageMetaDiagnosticsCounts,
  resetMessengerImageMetaDiagnosticsCounts,
} from "@/lib/community-messenger/messenger-image-message-map";
import {
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT,
  type CommunityMessengerBootstrap,
  type CommunityMessengerBootstrapCritical,
  CommunityMessengerCallKind,
  type CommunityMessengerCallLogDisplayType,
  CommunityMessengerCallLog,
  CommunityMessengerCallParticipant,
  CommunityMessengerCallParticipantStatus,
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerIdentityMode,
  CommunityMessengerRoomAliasProfile,
  CommunityMessengerCallSessionMode,
  CommunityMessengerCallSession,
  CommunityMessengerCallSessionStatus,
  CommunityMessengerCallSignal,
  CommunityMessengerCallSignalType,
  CommunityMessengerRoomJoinPolicy,
  CommunityMessengerRoomIdentityPolicy,
  CommunityMessengerRoomContextMetaV1,
  CommunityMessengerCallStatus,
  CommunityMessengerFriendRequest,
  CommunityMessengerFriendRequestStatus,
  CommunityMessengerMessage,
  type CommunityMessengerImageSendItem,
  type CommunityMessengerPeerPresenceSnapshot,
  type CommunityMessengerReadReceipt,
  CommunityMessengerProfileLite,
  type CommunityMessengerPresenceState,
  CommunityMessengerRoomSnapshot,
  type CommunityMessengerTradeMessagingSnapshot,
  CommunityMessengerRoomStatus,
  CommunityMessengerRoomSummary,
  CommunityMessengerRoomType,
  CommunityMessengerRoomVisibility,
} from "@/lib/community-messenger/types";
import { derivePresenceFromDbRow } from "@/lib/community-messenger/presence/presence-policy";
import { dedupeTradeMessengerRoomSummaries } from "@/lib/community-messenger/trade-list-canonical-key";
import { incomingCallPeerNicknameLabel, labelFromDisplayAndUsername } from "@/lib/users/user-label";

export {
  COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_FULL_ROOM_CAP,
  COMMUNITY_MESSENGER_HOME_SYNC_ROOM_CAP_HARD_MAX,
};

type SupabaseLike = ReturnType<typeof getSupabaseServer>;

type ProfileRow = {
  id: string;
  display_name?: string | null;
  nickname?: string | null;
  username?: string | null;
  dibay_id?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

type RequestRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: CommunityMessengerFriendRequestStatus;
  created_at: string;
  responded_at?: string | null;
};

/** critical home-sync: `server-store-record` 정적 import 제거 — 공유 컴파일 그래프 분리(런타임 동일). */
function recordMessengerMonitoringEventsCriticalRoomsLazy(criticalRoomsDiag: { round1Ms: number; round2Ms: number }): void {
  void import("@/lib/community-messenger/monitoring/server-store-record")
    .then((mod) => {
      const ts = Date.now();
      mod.recordMessengerMonitoringEvent({
        ts,
        category: "chat.unread_sync",
        metric: "home_sync_critical_fetch_my_rooms_round1_ms",
        source: "server",
        value: criticalRoomsDiag.round1Ms,
        unit: "ms",
        labels: { tier: "critical" },
      });
      mod.recordMessengerMonitoringEvent({
        ts,
        category: "chat.unread_sync",
        metric: "home_sync_critical_fetch_my_rooms_round2_ms",
        source: "server",
        value: criticalRoomsDiag.round2Ms,
        unit: "ms",
        labels: { tier: "critical" },
      });
    })
    .catch(() => {});
}

/** 상대가 거절한 내 발신 요청을 같은 방향으로 재전송할 때만 쿨다운 적용(상대가 먼저 걸면 기존 행 삭제 후 새 방향 허용). */
function remainingFriendRejectCooldownMs(
  row: Pick<RequestRow, "status" | "requester_id" | "addressee_id" | "responded_at">,
  userId: string,
  target: string,
  nowMs: number
): number {
  const cool = MESSENGER_FRIEND_REJECT_COOLDOWN_MS;
  if (cool <= 0) return 0;
  if (row.status !== "rejected") return 0;
  if (row.requester_id !== userId || row.addressee_id !== target) return 0;
  const t = row.responded_at;
  if (t == null || !String(t).trim()) return 0;
  const respondedMs = Date.parse(String(t));
  if (!Number.isFinite(respondedMs)) return 0;
  return Math.max(0, respondedMs + cool - nowMs);
}

type RoomRow = {
  id: string;
  room_type: CommunityMessengerRoomType;
  room_status?: CommunityMessengerRoomStatus | null;
  visibility?: CommunityMessengerRoomVisibility | null;
  join_policy?: CommunityMessengerRoomJoinPolicy | null;
  identity_policy?: CommunityMessengerRoomIdentityPolicy | null;
  is_readonly?: boolean | null;
  title: string | null;
  summary?: string | null;
  avatar_url: string | null;
  created_by: string | null;
  owner_user_id?: string | null;
  member_limit?: number | null;
  is_discoverable?: boolean | null;
  allow_member_invite?: boolean | null;
  notice_text?: string | null;
  pinned_message_id?: string | null;
  notice_updated_at?: string | null;
  notice_updated_by?: string | null;
  allow_admin_invite?: boolean | null;
  allow_admin_kick?: boolean | null;
  allow_admin_edit_notice?: boolean | null;
  allow_member_upload?: boolean | null;
  allow_member_call?: boolean | null;
  password_hash?: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_message_type: string | null;
  direct_key?: string | null;
  chat_domain?: string | null;
  domain_identity?: string | null;
  domain_identity_key?: string | null;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  unread_count: number | null;
  is_muted: boolean | null;
  is_pinned: boolean | null;
  is_archived?: boolean | null;
  blocked_hidden_at?: string | null;
  joined_at: string | null;
  last_read_at?: string | null;
  last_read_message_id?: string | null;
};

type RoomProfileRow = {
  id: string;
  room_id: string;
  user_id: string;
  identity_mode: CommunityMessengerIdentityMode;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

type MessageRow = {
  id: string;
  room_id: string;
  sender_id: string | null;
  message_type: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker" | "community_post_share";
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  reply_to_message_id?: string | null;
  reply_preview_text?: string | null;
  reply_preview_type?: string | null;
  reply_sender_label_snapshot?: string | null;
  deleted_for_everyone_at?: string | null;
};

/** 목록·스냅샷·단건 조회 공통 SELECT — `deleted_at` 필터는 쿼리별로 별도 */
const COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT =
  "id, room_id, sender_id, message_type, content, metadata, created_at, reply_to_message_id, reply_preview_text, reply_preview_type, reply_sender_label_snapshot, deleted_for_everyone_at";

/** 마이그레이션 미적용 환경에서도 타임라인 조회가 깨지지 않도록 최소 컬럼만 요청 */
const COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT_LEGACY =
  "id, room_id, sender_id, message_type, content, metadata, created_at";

function isCommunityMessengerMessageListSelectRecoverableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  const code = String(e.code ?? "");
  const msg = String(e.message ?? "").toLowerCase();
  if (code === "42703") return true;
  if (msg.includes("42703")) return true;
  if ((msg.includes("column") || msg.includes("field")) && (msg.includes("does not exist") || msg.includes("not found")))
    return true;
  return false;
}

/**
 * `reply_*` / `deleted_for_everyone_at` 컬럼이 아직 없는 DB 에서 SELECT 가 실패하면 레거시 컬럼으로 한 번 더 시도한다.
 */
async function queryCommunityMessengerMessageRowsWithSelectFallback(
  run: (selectCols: string) => Promise<{ data: unknown; error: unknown }>
): Promise<{ data: unknown; error: unknown }> {
  const first = await run(COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT);
  if (!first.error) return first;
  if (!isCommunityMessengerMessageListSelectRecoverableError(first.error)) return first;
  return run(COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT_LEGACY);
}

type CallRow = {
  id: string;
  session_id?: string | null;
  room_id: string | null;
  caller_user_id: string;
  peer_user_id: string | null;
  call_kind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at?: string | null;
  /** `fetchCallLogRowsOnly` 에서 sessions 배치 조회로 합성 */
  sessionEndedAt?: string | null;
  sessionEndedReason?: string | null;
};

type CallSessionMetaRow = {
  id: string;
  room_id: string;
  session_mode: CommunityMessengerCallSessionMode | null;
};

type CallSessionRow = {
  id: string;
  room_id: string;
  initiator_user_id: string;
  recipient_user_id: string | null;
  session_mode?: CommunityMessengerCallSessionMode | null;
  max_participants?: number | null;
  call_kind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  started_at: string | null;
  answered_at: string | null;
  answered_device_id?: string | null;
  ended_at: string | null;
  ended_reason?: string | null;
  updated_at?: string | null;
  created_at: string | null;
  chat_domain?: string | null;
  domain_identity_key?: string | null;
};

type CallSignalRow = {
  id: string;
  session_id: string;
  room_id: string;
  from_user_id: string;
  to_user_id: string;
  signal_type: CommunityMessengerCallSignalType;
  payload: Record<string, unknown> | null;
  created_at: string | null;
};

type CallSessionParticipantRow = {
  id: string;
  session_id: string;
  room_id: string;
  user_id: string;
  participation_status: CommunityMessengerCallParticipantStatus;
  joined_at: string | null;
  left_at: string | null;
  created_at: string | null;
};

type DevRoom = {
  id: string;
  roomType: CommunityMessengerRoomType;
  roomStatus: CommunityMessengerRoomStatus;
  visibility: CommunityMessengerRoomVisibility;
  joinPolicy: CommunityMessengerRoomJoinPolicy;
  identityPolicy: CommunityMessengerRoomIdentityPolicy;
  isReadonly: boolean;
  title: string;
  summary: string;
  avatarUrl: string | null;
  createdBy: string;
  ownerUserId: string;
  memberLimit: number | null;
  isDiscoverable: boolean;
  allowMemberInvite: boolean;
  noticeText?: string;
  pinnedMessageId?: string | null;
  noticeUpdatedAt?: string | null;
  noticeUpdatedBy?: string | null;
  allowAdminInvite?: boolean;
  allowAdminKick?: boolean;
  allowAdminEditNotice?: boolean;
  allowMemberUpload?: boolean;
  allowMemberCall?: boolean;
  passwordHash: string | null;
  directKey: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageType: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker" | "community_post_share";
};

type DevParticipant = {
  id: string;
  roomId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  unreadCount: number;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  blockedHiddenAt?: string | null;
  joinedAt: string;
  lastReadAt?: string | null;
  lastReadMessageId?: string | null;
};

type DevRoomProfile = {
  id: string;
  roomId: string;
  userId: string;
  identityMode: CommunityMessengerIdentityMode;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
};

type DevMessage = {
  id: string;
  roomId: string;
  senderId: string | null;
  messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice" | "sticker" | "community_post_share";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type DevCall = {
  id: string;
  sessionId?: string | null;
  roomId: string | null;
  callerUserId: string;
  peerUserId: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  durationSeconds: number;
  startedAt: string;
  /** dev 원장 세션과 합성 (`fetchCallLogRowsOnly`) */
  sessionEndedAt?: string | null;
  sessionEndedReason?: string | null;
};

type DevCallSession = {
  id: string;
  roomId: string;
  sessionMode: CommunityMessengerCallSessionMode;
  initiatorUserId: string;
  recipientUserId: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallSessionStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  /** 클라 연결 실패 등 — dev 전용 */
  endedReason?: string | null;
  createdAt: string;
  participants: DevCallSessionParticipant[];
};

type DevCallSignal = {
  id: string;
  sessionId: string;
  roomId: string;
  fromUserId: string;
  toUserId: string;
  signalType: CommunityMessengerCallSignalType;
  payload: Record<string, unknown>;
  createdAt: string;
};

type DevCallSessionParticipant = {
  id: string;
  sessionId: string;
  roomId: string;
  userId: string;
  participationStatus: CommunityMessengerCallParticipantStatus;
  joinedAt: string | null;
  leftAt: string | null;
  createdAt: string;
};

type DevState = {
  friendRequests: RequestRow[];
  favoriteFriends: Map<string, Set<string>>;
  hiddenFriends: Map<string, Set<string>>;
  rooms: DevRoom[];
  participants: DevParticipant[];
  roomProfiles: DevRoomProfile[];
  messages: DevMessage[];
  calls: DevCall[];
  callSessions: DevCallSession[];
  callSignals: DevCallSignal[];
};

type PresenceSnapshotRow = {
  user_id: string;
  last_seen_at: string | null;
  updated_at: string | null;
  last_ping_at?: string | null;
  last_activity_at?: string | null;
  app_visibility?: string | null;
  presence_state_cached?: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function participantLastReadAt(value: ParticipantRow | DevParticipant | undefined): string | null {
  if (!value) return null;
  return trimText("last_read_at" in value ? (value as ParticipantRow).last_read_at : (value as DevParticipant).lastReadAt) || null;
}

function participantLastReadMessageId(value: ParticipantRow | DevParticipant | undefined): string | null {
  if (!value) return null;
  return trimText(
    "last_read_message_id" in value
      ? (value as ParticipantRow).last_read_message_id
      : (value as DevParticipant).lastReadMessageId
  ) || null;
}

function isMissingTableError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return /does not exist|relation .* does not exist|schema cache|column .* does not exist|Could not find the .* column/i.test(
    message
  );
}

function isMissingRpcFunctionError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "PGRST202" || /Could not find the function|function .* does not exist/i.test(message);
}

function isUniqueViolationError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "23505" || /duplicate key|unique constraint/i.test(message);
}

function getSupabaseOrNull(): SupabaseLike | null {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

async function userHasActiveDirectCallSession(sb: SupabaseLike, userId: string): Promise<boolean> {
  const id = await getUserLiveDirectCallSessionId(sb, userId, "active");
  return Boolean(id);
}

/** 발신·수신 중(ringing|active) 1:1 direct 세션 — busy·중복 발신 차단 */
async function userHasLiveDirectCallSession(sb: SupabaseLike, userId: string): Promise<boolean> {
  const id = await getUserLiveDirectCallSessionId(sb, userId, "live");
  return Boolean(id);
}

const STALE_ACTIVE_RECONCILE_MS = 10 * 60 * 1000;

type LiveReconcileRow = {
  id: string;
  status: CommunityMessengerCallSessionStatus | string;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  updated_at: string | null;
  initiator_user_id: string | null;
  recipient_user_id: string | null;
  session_mode: CommunityMessengerCallSessionMode | null;
};

function toMs(value: string | null | undefined): number | null {
  const raw = trimText(value ?? "");
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isStaleActiveRowForReconcile(row: LiveReconcileRow, nowMs = Date.now()): boolean {
  if (trimText(row.status) !== "active") return false;
  if (trimText(row.ended_at ?? "")) return true;
  if (!trimText(row.answered_at ?? "")) return true;
  const baseMs = toMs(row.updated_at) ?? toMs(row.answered_at) ?? toMs(row.started_at);
  if (baseMs == null) return false;
  return nowMs - baseMs > STALE_ACTIVE_RECONCILE_MS;
}

export async function reconcileUserLiveCallSessions(
  userId: string,
  reason = "reconcile",
): Promise<{ reconciled: number; liveSessionId: string | null }> {
  const uid = trimText(userId);
  if (!uid) return { reconciled: 0, liveSessionId: null };
  const sb = getSupabaseOrNull();
  if (!sb) return { reconciled: 0, liveSessionId: null };

  const policy = await getMessengerCallAdminPolicyCached();
  await terminalStaleRingingDirectSessionsForUser(sb, uid, policy).catch(() => 0);

  const { data, error } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select(
      "id, status, started_at, answered_at, ended_at, updated_at, initiator_user_id, recipient_user_id, session_mode, created_at"
    )
    .eq("session_mode", "direct")
    .or(`initiator_user_id.eq.${uid},recipient_user_id.eq.${uid}`)
    .in("status", ["ringing", "active"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { reconciled: 0, liveSessionId: null };

  const rows = (data ?? []) as LiveReconcileRow[];
  let reconciled = 0;
  for (const row of rows) {
    const sid = trimText(row.id);
    if (!sid) continue;
    const status = trimText(row.status);
    const staleRinging = isStaleRingingRow({ status, started_at: row.started_at }, policy);
    const staleActive = isStaleActiveRowForReconcile(row);
    if (!staleRinging && !staleActive) continue;

    const action: "cancel" | "missed" | "end" =
      status === "ringing"
        ? messengerUserIdsEqual(row.initiator_user_id, uid)
          ? "cancel"
          : "missed"
        : "end";
    const patched = await updateCommunityMessengerCallSession({
      userId: uid,
      sessionId: sid,
      action,
      clientEndedReason: `reconcile_${reason}`,
    }).catch(() => ({ ok: false as const }));
    if (patched.ok) reconciled += 1;
  }

  const liveSessionId = await getUserLiveDirectCallSessionId(sb, uid, "live");
  return { reconciled, liveSessionId };
}

async function getUserLiveDirectCallSessionId(
  sb: SupabaseLike,
  userId: string,
  mode: "live" | "active" = "live"
): Promise<string | null> {
  const u = trimText(userId);
  if (!u) return null;
  let q = (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, started_at")
    .eq("session_mode", "direct")
    .or(`initiator_user_id.eq.${u},recipient_user_id.eq.${u}`)
    .order("created_at", { ascending: false })
    .limit(1);
  if (mode === "active") {
    q = q.eq("status", "active");
  } else {
    q = q.in("status", ["ringing", "active"]);
  }
  const { data } = await q.maybeSingle();
  const row = data as { id?: string; status?: string; started_at?: string | null } | null;
  const id = trimText(row?.id ?? "");
  if (!id) return null;
  if (mode === "live" && trimText(row?.status) === "ringing") {
    const policy = await getMessengerCallAdminPolicyCached();
    if (isStaleRingingRow({ status: "ringing", started_at: row?.started_at ?? null }, policy)) {
      await terminalStaleRingingDirectSessionsForUser(sb, u, policy).catch(() => 0);
      return null;
    }
  }
  return id;
}

type LiveSessionParticipantRow = {
  id?: string;
  status?: string;
  started_at?: string | null;
  initiator_user_id?: string | null;
  recipient_user_id?: string | null;
};

/**
 * 수신 목록·busy 자동거절에 쓸 live 세션 — 본인 발신 `ringing` 은 수신 차단에 포함하지 않는다.
 */
async function getViewerIncomingBlockingLiveSessionId(
  sb: SupabaseLike,
  userId: string,
): Promise<string | null> {
  const u = trimText(userId);
  if (!u) return null;
  const { data } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, started_at, initiator_user_id, recipient_user_id")
    .eq("session_mode", "direct")
    .or(`initiator_user_id.eq.${u},recipient_user_id.eq.${u}`)
    .in("status", ["ringing", "active"])
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as LiveSessionParticipantRow[];
  const policy = await getMessengerCallAdminPolicyCached();
  for (const row of rows) {
    const id = trimText(row.id ?? "");
    if (!id) continue;
    const status = trimText(row.status);
    if (status === "active") return id;
    if (status !== "ringing") continue;
    if (isStaleRingingRow({ status: "ringing", started_at: row.started_at ?? null }, policy)) {
      await terminalStaleRingingDirectSessionsForUser(sb, u, policy).catch(() => 0);
      continue;
    }
    if (messengerUserIdsEqual(row.initiator_user_id, u)) continue;
    if (messengerUserIdsEqual(row.recipient_user_id, u)) return id;
  }
  return null;
}

/** 방 단위 live(ringing|active) direct 세션 — fresh 발신 전 정리·검증용 */
async function getLiveDirectCallSessionIdInRoom(sb: SupabaseLike, roomId: string): Promise<string | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const { data } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id")
    .eq("room_id", rid)
    .eq("session_mode", "direct")
    .in("status", ["ringing", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = trimText((data as { id?: string } | null)?.id ?? "");
  return id || null;
}

/** 다른 방에서 진행 중인 live direct 세션 — fresh 재발신은 동일 방 terminate 후 허용 */
async function userHasLiveDirectCallSessionOutsideRoom(
  sb: SupabaseLike,
  userId: string,
  roomId: string
): Promise<boolean> {
  const u = trimText(userId);
  const rid = trimText(roomId);
  if (!u || !rid) return false;
  const { data } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id")
    .eq("session_mode", "direct")
    .neq("room_id", rid)
    .or(`initiator_user_id.eq.${u},recipient_user_id.eq.${u}`)
    .in("status", ["ringing", "active"])
    .limit(1)
    .maybeSingle();
  return Boolean(trimText((data as { id?: string } | null)?.id ?? ""));
}

async function loadDirectCallSessionRowById(
  sb: SupabaseLike,
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSession | null> {
  const sid = trimText(sessionId);
  if (!sid) return null;
  const { data: row } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select(
      "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
    )
    .eq("id", sid)
    .maybeSingle();
  if (!row) return null;
  return mapCallSession(userId, row as CallSessionRow);
}

/** 앱 부팅·새로고침 — 본인 live(ringing|active) 1:1 통화 복구용 */
export async function getLiveDirectCallSessionForUser(
  userId: string
): Promise<CommunityMessengerCallSession | null> {
  const uid = trimText(userId);
  if (!uid) return null;
  const sb = getSupabaseOrNull();
  if (!sb) {
    const dev = getDevState();
    const row = dev.callSessions.find(
      (s) =>
        s.sessionMode === "direct" &&
        (s.status === "ringing" || s.status === "active") &&
        (messengerUserIdsEqual(s.initiatorUserId, uid) ||
          (s.recipientUserId != null && messengerUserIdsEqual(s.recipientUserId, uid)))
    );
    return row ? await mapCallSession(uid, row) : null;
  }
  await reconcileUserLiveCallSessions(uid, "active_api");
  const sessionId = await getUserLiveDirectCallSessionId(sb, uid, "live");
  if (!sessionId) return null;
  return loadDirectCallSessionRowById(sb, uid, sessionId);
}

/** active-only subset — 기존 호출부 호환 */
export async function getActiveDirectCallSessionForUser(
  userId: string
): Promise<CommunityMessengerCallSession | null> {
  const live = await getLiveDirectCallSessionForUser(userId);
  if (!live || live.status !== "active") return null;
  return live;
}

async function appendCommunityMessengerCallSessionEvent(
  sb: SupabaseLike,
  input: {
    sessionId: string;
    actorUserId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const sid = trimText(input.sessionId);
  const aid = trimText(input.actorUserId);
  const ev = trimText(input.eventType);
  if (!sid || !aid || !ev) return;
  try {
    const { error } = await (sb as any).from("community_messenger_call_events").insert({
      session_id: sid,
      actor_user_id: aid,
      event_type: ev,
      payload: input.payload ?? {},
    });
    if (error && !isMissingTableError(error)) {
      /* best-effort */
    }
  } catch (e) {
    if (!isMissingTableError(e)) {
      /* ignore */
    }
  }
}

function endedReasonForSessionDelta(
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed",
  nextStatus: CommunityMessengerCallSessionStatus,
  clientEndedReason?: string | null,
): string | null {
  return resolveTerminalEndedReason({ action, nextStatus, clientEndedReason });
}

function auditEventTypeForAction(
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed",
  nextStatus: CommunityMessengerCallSessionStatus
): string {
  if (action === "accept" || nextStatus === "active") return "accepted";
  if (action === "reject" || nextStatus === "rejected") return "declined";
  if (action === "cancel" || nextStatus === "cancelled") return "canceled";
  if (action === "missed" || nextStatus === "missed") return "missed";
  if (action === "end" || nextStatus === "ended") return "ended";
  return "ended";
}

async function filterDirectIncomingRowsForPolicy(
  sb: SupabaseLike,
  userId: string,
  rows: CallSessionRow[],
  policy: MessengerCallAdminPolicy
): Promise<CallSessionRow[]> {
  if (!rows.length) return [];
  await reconcileUserLiveCallSessions(userId, "incoming_policy");
  let viewerLiveSessionId = await getViewerIncomingBlockingLiveSessionId(sb, userId);
  if (viewerLiveSessionId && rows.some((row) => row.id !== viewerLiveSessionId)) {
    const { data: blockingRow } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select("id, status, initiator_user_id, recipient_user_id")
      .eq("id", viewerLiveSessionId)
      .maybeSingle();
    const blocking = (blockingRow ?? null) as CallSessionRow | null;
    if (blocking && trimText(blocking.status) === "ringing") {
      const action: "cancel" | "missed" = messengerUserIdsEqual(blocking.initiator_user_id, userId)
        ? "cancel"
        : "missed";
      await updateCommunityMessengerCallSession({
        userId,
        sessionId: viewerLiveSessionId,
        action,
        clientEndedReason: "incoming_policy_superseded",
      }).catch(() => {});
      viewerLiveSessionId = await getViewerIncomingBlockingLiveSessionId(sb, userId);
    }
  }
  if (viewerLiveSessionId) {
    for (const row of rows) {
      if (row.id === viewerLiveSessionId) continue;
      if (row.status !== "ringing") continue;
      /** Busy / concurrent ringing — NOT callee_rejected (declined). */
      void updateCommunityMessengerCallSession({
        userId,
        sessionId: row.id,
        action: "missed",
        clientEndedReason: "incoming_policy_superseded",
      }).catch(() => {});
    }
    /** 본인 live(ringing 수신 등) 세션은 목록에 남긴다 — `return []` 는 GET refresh 가 Broadcast UI 를 지움 */
    const liveRow = rows.find((row) => row.id === viewerLiveSessionId);
    return liveRow ? [liveRow] : [];
  }
  let out = [...rows];
  const initiatorIds = out.map((r) => trimText(r.initiator_user_id));
  const { blocked } = await getViewerRelationSets(userId, initiatorIds);
  for (const row of out) {
    const init = trimText(row.initiator_user_id);
    if (blocked.has(init)) {
      void updateCommunityMessengerCallSession({ userId, sessionId: row.id, action: "reject" }).catch(() => {});
    }
  }
  out = out.filter((r) => !blocked.has(trimText(r.initiator_user_id)));
  if (policy.repeated_call_cooldown_seconds > 0 && out.length) {
    const cutoffIso = new Date(Date.now() - policy.repeated_call_cooldown_seconds * 1000).toISOString();
    const inits = [...new Set(out.map((r) => trimText(r.initiator_user_id)))].filter(Boolean);
    if (inits.length) {
      const { data: recentEnds } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select("initiator_user_id")
        .eq("recipient_user_id", userId)
        .in("initiator_user_id", inits)
        .not("ended_at", "is", null)
        .gte("ended_at", cutoffIso);
      const cooldownBlocked = new Set(
        ((recentEnds ?? []) as Array<{ initiator_user_id?: string }>)
          .map((r) => trimText(r.initiator_user_id))
          .filter(Boolean)
      );
      out = out.filter((r) => !cooldownBlocked.has(trimText(r.initiator_user_id)));
    }
  }
  return out;
}

export function profileDibaySubtitle(row: ProfileRow | null | undefined): string | undefined {
  return resolvePublicIdAtDisplay(row) ?? undefined;
}

export function profileLabel(row: ProfileRow | null | undefined, fallbackId: string): string {
  const display = trimText(row?.display_name) || trimText(row?.nickname);
  const username = trimText(row?.username);
  const label = labelFromDisplayAndUsername(display, username).trim();
  if (label) return label;
  return cmProfileFallbackLabel(fallbackId);
}

function profileCallPeerLabel(row: ProfileRow | null | undefined, fallbackId: string): string {
  const display = trimText(row?.display_name) || trimText(row?.nickname);
  if (display) return display;
  const username = trimText(row?.username).replace(/^@+/, "");
  if (username) return username;
  return cmProfileFallbackLabel(fallbackId);
}

function directKeyFor(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

function dedupeIds(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => trimText(v)).filter(Boolean))];
}

async function fetchCommunityMessengerHiddenMessageIdsForUser(
  sb: SupabaseLike,
  userId: string,
  messageIds: string[]
): Promise<Set<string>> {
  const ids = dedupeIds(messageIds);
  if (!ids.length) return new Set();
  const { data, error } = await (sb as any)
    .from("community_messenger_message_user_hides")
    .select("message_id")
    .eq("user_id", userId)
    .in("message_id", ids);
  if (error && !isMissingTableError(error)) return new Set();
  const set = new Set<string>();
  for (const row of (data ?? []) as Array<{ message_id?: string }>) {
    const mid = trimText(row.message_id);
    if (mid) set.add(mid);
  }
  return set;
}

/** 반응 집계 시 메시지 작성자별로 필터 — 자기 메시지에 단 반응(구스키마·버그)은 UI·카운트에서 제외 */
function communityMessengerAuthorUserIdByMessageIdForReactions(
  rows: Array<MessageRow | DevMessage>
): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    const mid = trimText((r as MessageRow).id);
    const sid = "sender_id" in r ? trimText((r as MessageRow).sender_id) : trimText((r as DevMessage).senderId);
    if (mid && sid) m.set(mid, sid);
  }
  return m;
}

async function fetchCommunityMessengerReactionAggregatesForMessages(
  sb: SupabaseLike,
  messageIds: string[],
  viewerUserId: string,
  options?: { authorUserIdByMessageId?: Map<string, string> | null }
): Promise<Map<string, NonNullable<CommunityMessengerMessage["reactions"]>>> {
  const out = new Map<string, NonNullable<CommunityMessengerMessage["reactions"]>>();
  const ids = dedupeIds(messageIds);
  if (!ids.length) return out;
  const authorByMid = options?.authorUserIdByMessageId ?? null;
  const { data, error } = await (sb as any)
    .from("community_messenger_message_reactions")
    .select("message_id, user_id, reaction_key, created_at")
    .in("message_id", ids);
  if (error && !isMissingTableError(error)) return out;
  type RxRow = { message_id?: string; user_id?: string; reaction_key?: string; created_at?: string | null };
  /** 구 PK (message_id,user_id,reaction_key) 시 동일 유저·메시지에 여러 이모지 행이 있을 수 있음 → 최신 1행만 사용 */
  const latestByMessageUser = new Map<string, RxRow>();
  for (const row of (data ?? []) as RxRow[]) {
    const mid = trimText(row.message_id);
    const rk = trimText(row.reaction_key);
    const uid = trimText(row.user_id);
    if (!mid || !rk || !uid) continue;
    if (!isMessengerQuickReactionKey(rk)) continue;
    const authorId = authorByMid?.get(mid);
    if (authorId && authorId === uid) continue;

    const k = `${mid}\u0000${uid}`;
    const prev = latestByMessageUser.get(k);
    if (!prev) {
      latestByMessageUser.set(k, row);
      continue;
    }
    const curAt = trimText(row.created_at) || "";
    const prevAt = trimText(prev.created_at) || "";
    if (curAt >= prevAt) latestByMessageUser.set(k, row);
  }

  const byMessage = new Map<string, Map<string, { count: number; mine: boolean }>>();
  for (const row of latestByMessageUser.values()) {
    const mid = trimText(row.message_id);
    const rk = trimText(row.reaction_key);
    const uid = trimText(row.user_id);
    if (!mid || !rk || !uid) continue;
    let rkMap = byMessage.get(mid);
    if (!rkMap) {
      rkMap = new Map();
      byMessage.set(mid, rkMap);
    }
    const cell = rkMap.get(rk) ?? { count: 0, mine: false };
    cell.count += 1;
    if (uid === viewerUserId) cell.mine = true;
    rkMap.set(rk, cell);
  }
  for (const [mid, rkMap] of byMessage) {
    const list: NonNullable<CommunityMessengerMessage["reactions"]> = [];
    for (const [reactionKey, cell] of rkMap) {
      list.push({ reactionKey, count: cell.count, mine: cell.mine });
    }
    list.sort((a, b) => a.reactionKey.localeCompare(b.reactionKey));
    out.set(mid, list);
  }
  return out;
}

function mapCommunityMessengerDbMessageRowToMessage(input: {
  row: MessageRow;
  viewerUserId: string;
  profileById: Map<string, CommunityMessengerProfileLite>;
  reactions?: CommunityMessengerMessage["reactions"];
}): CommunityMessengerMessage {
  const message = input.row;
  const senderId = trimText(message.sender_id) || null;
  const metadata = (message.metadata ?? {}) as Record<string, unknown>;
  const isMine = senderId === input.viewerUserId;
  const mt = trimText(message.message_type) as CommunityMessengerMessage["messageType"];
  const safeMt: CommunityMessengerMessage["messageType"] =
    mt === "image" ||
    mt === "file" ||
    mt === "system" ||
    mt === "call_stub" ||
    mt === "voice" ||
    mt === "sticker" ||
    mt === "community_post_share"
      ? mt
      : "text";
  const dfeAt = trimText(message.deleted_for_everyone_at);
  const deletedForEveryoneAt = dfeAt || undefined;
  const contentRaw = trimText(message.content);
  const contentForUi = deletedForEveryoneAt ? resolveDeletedMessagePlaceholder() : contentRaw;
  const replyToMessageId = trimText(message.reply_to_message_id) || null;
  const replyPreviewText = trimText(message.reply_preview_text) || null;
  const replyPreviewTypeRaw = trimText(message.reply_preview_type);
  const replyPreviewType = replyPreviewTypeRaw.length > 0 ? replyPreviewTypeRaw : null;
  const replySenderLabelSnapshot = trimText(message.reply_sender_label_snapshot) || null;
  const clientRaw = metadata.client_message_id;
  const clientMessageId =
    typeof clientRaw === "string" && clientRaw.trim()
      ? clientRaw.trim()
      : typeof metadata.clientMessageId === "string" && metadata.clientMessageId.trim()
        ? String(metadata.clientMessageId).trim()
        : null;

  const voiceExtra =
    deletedForEveryoneAt || safeMt !== "voice"
      ? {}
      : {
          voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
          voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
          voiceMimeType: trimText(metadata.mimeType as string) || null,
        };
  const fileExtra =
    deletedForEveryoneAt || safeMt !== "file"
      ? {}
      : {
          fileName: trimText(metadata.fileName as string) || null,
          fileMimeType: trimText(metadata.mimeType as string) || null,
          fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
        };
  const imageExtra =
    deletedForEveryoneAt || safeMt !== "image"
      ? {}
      : messengerImageClientFieldsFromMetadata(safeMt, metadata, contentRaw);

  return {
    id: message.id,
    roomId: message.room_id,
    senderId,
    senderLabel: isMine
      ? cmServiceT("common_me")
      : senderId
        ? trimText(input.profileById.get(senderId)?.label) || profileLabel(null, senderId)
        : cmServiceT("cm_svc_system"),
    messageType: safeMt,
    content: contentForUi,
    createdAt: trimText(message.created_at) || nowIso(),
    metadata: message.metadata ?? null,
    clientMessageId,
    isMine,
    callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
    callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
    callSessionId: trimText(metadata.sessionId as string) || null,
    callTmpSessionId: trimText(metadata.tmpSessionId as string) || null,
    ...(replyToMessageId
      ? {
          replyToMessageId,
          ...(replyPreviewText != null && replyPreviewText.length > 0 ? { replyPreviewText } : {}),
          ...(replyPreviewType != null ? { replyPreviewType } : {}),
          ...(replySenderLabelSnapshot != null && replySenderLabelSnapshot.length > 0 ? { replySenderLabelSnapshot } : {}),
        }
      : {}),
    ...(deletedForEveryoneAt ? { deletedForEveryoneAt } : {}),
    ...(input.reactions?.length ? { reactions: input.reactions } : {}),
    ...voiceExtra,
    ...fileExtra,
    ...imageExtra,
  };
}

function invalidateOwnerHubBadgeForCommunityMessengerPeers(
  senderUserId: string,
  recipientUserIds: string[],
  roomId?: string
): void {
  for (const id of dedupeIds([senderUserId, ...recipientUserIds])) {
    invalidateOwnerHubBadgeCache(id);
    invalidateHomeSyncSnapshotCache(id);
    invalidateCmBootstrapSnapshotCache(id);
    invalidateFullBootstrapSnapshotCache(id, "peer_hub_invalidate");
  }
  const rid = trimText(roomId ?? "");
  if (rid) {
    invalidateRoomBootstrapSnapshotCache(rid, dedupeIds([senderUserId, ...recipientUserIds]));
  }
}

function normalizeRoomStatus(value: unknown): CommunityMessengerRoomStatus {
  return value === "blocked" || value === "archived" ? value : "active";
}

function normalizeRoomVisibility(value: unknown, roomType: CommunityMessengerRoomType): CommunityMessengerRoomVisibility {
  if (value === "public") return "public";
  return roomType === "open_group" ? "public" : "private";
}

function normalizeRoomJoinPolicy(value: unknown, roomType: CommunityMessengerRoomType): CommunityMessengerRoomJoinPolicy {
  if (value === "free") return "free";
  if (value === "password") return "password";
  return roomType === "open_group" ? "password" : "invite_only";
}

function normalizeRoomIdentityPolicy(
  value: unknown,
  roomType: CommunityMessengerRoomType
): CommunityMessengerRoomIdentityPolicy {
  if (value === "alias_allowed") return "alias_allowed";
  return roomType === "open_group" ? "alias_allowed" : "real_name";
}

function isTerminalCallSessionStatus(value: unknown): value is Exclude<CommunityMessengerCallSessionStatus, "ringing" | "active"> {
  return value === "ended" || value === "rejected" || value === "missed" || value === "cancelled";
}

function getDevState(): DevState {
  const scope = globalThis as {
    __samarketCommunityMessengerState?: DevState;
  };
  if (!scope.__samarketCommunityMessengerState) {
    scope.__samarketCommunityMessengerState = {
      friendRequests: [],
      favoriteFriends: new Map(),
      hiddenFriends: new Map(),
      rooms: [],
      participants: [],
      roomProfiles: [],
      messages: [],
      calls: [],
      callSessions: [],
      callSignals: [],
    };
  }
  return scope.__samarketCommunityMessengerState;
}

function allowCommunityMessengerDevFallback(): boolean {
  return getPublicDeployTier() === "local";
}

function ensureCommunityMessengerDevFallbackAllowed(error = "messenger_storage_unavailable") {
  if (allowCommunityMessengerDevFallback()) return { ok: true as const };
  return { ok: false as const, error };
}

/**
 * `fetchProfilesByIds` row 단위 짧은 TTL(기본 5s) + 동일 missing 집합 single-flight.
 * trade-chat-list-meta 등 연속 배치에서 seller id 겹침 시 RTT·중복 왕복 감소(응답 필드 동일).
 */
const PROFILE_ID_ROW_TTL_MS = Math.min(
  300_000,
  Math.max(2_000, Number(process.env.SAMARKET_PROFILE_ROW_CACHE_TTL_MS ?? 5_000))
);
const profileIdRowCache = new Map<string, { expiresAt: number; row: ProfileRow }>();
const profileIdsInflight = new Map<string, Promise<Map<string, ProfileRow>>>();

type FetchProfilesByIdsRowStats = {
  rowCacheHits: number;
  rowCacheMisses: number;
  singleflightJoined: boolean;
};

/** lite bootstrap first paint — bio 제외·컬럼 최소(관계 쿼리 없음) */
const BOOTSTRAP_LITE_FIRST_PAINT_PROFILE_SELECT =
  "id, display_name, nickname, username, dibay_id, avatar_url";

async function fetchProfilesByIdsBootstrapLiteFirstPaint(
  ids: string[],
  rowStats?: FetchProfilesByIdsRowStats
): Promise<Map<string, ProfileRow>> {
  const unique = dedupeIds(ids);
  if (!unique.length) return new Map();
  const now = Date.now();
  const out = new Map<string, ProfileRow>();
  const missing: string[] = [];
  for (const id of unique) {
    const ent = profileIdRowCache.get(id);
    if (ent && ent.expiresAt > now) {
      out.set(id, { ...ent.row, bio: null });
      if (rowStats) rowStats.rowCacheHits += 1;
    } else {
      missing.push(id);
    }
  }
  if (!missing.length) return out;

  const sb = getSupabaseOrNull();
  if (!sb) return out;
  if (rowStats) rowStats.rowCacheMisses += missing.length;

  const sortedMissing = dedupeIds(missing).slice().sort();
  const inflightKey = `lite:${sortedMissing.join("\0")}`;
  let inflight = profileIdsInflight.get(inflightKey);
  if (!inflight) {
    inflight = (async (): Promise<Map<string, ProfileRow>> => {
      const t0 = Date.now();
      const { data } = await (sb as any)
        .from("profiles")
        .select(BOOTSTRAP_LITE_FIRST_PAINT_PROFILE_SELECT)
        .in("id", sortedMissing);
      const fresh = new Map<string, ProfileRow>();
      for (const row of (data ?? []) as ProfileRow[]) {
        const rid = trimText(row.id);
        if (!rid) continue;
        const slim: ProfileRow = {
          id: rid,
          display_name: row.display_name ?? null,
          nickname: row.nickname ?? null,
          username: row.username ?? null,
          dibay_id: row.dibay_id ?? null,
          avatar_url: row.avatar_url ?? null,
          bio: null,
        };
        fresh.set(rid, slim);
        profileIdRowCache.set(rid, { expiresAt: t0 + PROFILE_ID_ROW_TTL_MS, row: slim });
      }
      pruneByExpiresAtAndMaxSize(profileIdRowCache, t0, 4_000);
      return fresh;
    })();
    profileIdsInflight.set(inflightKey, inflight);
    inflight.finally(() => {
      profileIdsInflight.delete(inflightKey);
    });
  } else if (rowStats) {
    rowStats.singleflightJoined = true;
  }
  const fetched = await inflight;
  for (const id of sortedMissing) {
    const row = fetched.get(id);
    if (row) out.set(id, row);
  }
  return out;
}

async function fetchProfilesByIds(
  ids: string[],
  rowStats?: FetchProfilesByIdsRowStats,
  rowTtlMs: number = PROFILE_ID_ROW_TTL_MS
): Promise<Map<string, ProfileRow>> {
  const unique = dedupeIds(ids);
  if (!unique.length) return new Map();
  const now = Date.now();
  const ttlMs = Math.min(300_000, Math.max(2_000, rowTtlMs));
  const out = new Map<string, ProfileRow>();
  const missing: string[] = [];
  for (const id of unique) {
    const ent = profileIdRowCache.get(id);
    if (ent && ent.expiresAt > now) {
      out.set(id, ent.row);
      if (rowStats) rowStats.rowCacheHits += 1;
    } else {
      missing.push(id);
    }
  }
  if (!missing.length) {
    return out;
  }

  const sb = getSupabaseOrNull();
  if (!sb) return new Map();

  if (rowStats) {
    rowStats.rowCacheMisses += missing.length;
  }

  const sortedMissing = dedupeIds(missing).slice().sort();
  const inflightKey = sortedMissing.join("\0");
  let inflight = profileIdsInflight.get(inflightKey);
  let joinedSingleflight = false;
  if (!inflight) {
    inflight = (async (): Promise<Map<string, ProfileRow>> => {
      const t0 = Date.now();
      const { data } = await (sb as any)
        .from("profiles")
        .select("id, display_name, nickname, username, dibay_id, avatar_url, bio")
        .in("id", sortedMissing);
      const fresh = new Map<string, ProfileRow>();
      for (const row of (data ?? []) as ProfileRow[]) {
        const rid = trimText(row.id);
        if (!rid) continue;
        fresh.set(rid, row);
        profileIdRowCache.set(rid, { expiresAt: t0 + ttlMs, row });
      }
      pruneByExpiresAtAndMaxSize(profileIdRowCache, t0, 4_000);
      return fresh;
    })();
    profileIdsInflight.set(inflightKey, inflight);
    inflight.finally(() => {
      profileIdsInflight.delete(inflightKey);
    });
  } else {
    joinedSingleflight = true;
  }
  if (rowStats && joinedSingleflight) {
    rowStats.singleflightJoined = true;
  }
  const fetched = await inflight;
  for (const id of sortedMissing) {
    const row = fetched.get(id);
    if (row) out.set(id, row);
  }
  return out;
}

type ParticipantRowWithOptionalProfileEmbed = ParticipantRow & { profiles?: ProfileRow | null };

/** capped participants 결과에 viewer 행이 이미 있으면 `myParticipant` 단건 조회 생략 */
function participantQueryRowsIncludeViewer(data: unknown, viewerUserId: string): boolean {
  const v = trimText(viewerUserId);
  if (!v) return false;
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as { user_id?: string; userId?: string };
    const uid = trimText(r.user_id ?? r.userId);
    if (uid === v) return true;
  }
  return false;
}

/** `profiles (…)` embed 가 붙은 participants 쿼리 결과에서 행을 평탄화하고 프로필 맵을 수집한다. */
function embeddedProfilesFromParticipantQueryRows(data: unknown): { rows: ParticipantRow[]; profiles: Map<string, ProfileRow> } {
  const profiles = new Map<string, ProfileRow>();
  const rows: ParticipantRow[] = [];
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? [data] : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as ParticipantRowWithOptionalProfileEmbed;
    const embRaw = r.profiles;
    const emb = Array.isArray(embRaw) ? embRaw[0] : embRaw;
    if (emb && typeof emb === "object" && "id" in emb) {
      const pr = emb as ProfileRow;
      const pid = trimText(pr.id);
      if (pid) profiles.set(pid, pr);
    }
    const { profiles: _drop, ...rest } = r as unknown as ParticipantRowWithOptionalProfileEmbed;
    rows.push(rest as ParticipantRow);
  }
  return { rows, profiles };
}

function roomProfileKey(roomId: string, userId: string) {
  return `${roomId}:${userId}`;
}

export async function getCommunityMessengerPresenceSnapshotsByUserIds(
  ids: string[]
): Promise<Map<string, CommunityMessengerPeerPresenceSnapshot>> {
  const unique = dedupeIds(ids);
  const result = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
  if (!unique.length) return result;
  const sb = getSupabaseOrNull();
  if (!sb) return result;
  const { data, error } = await (sb as any)
    .from("community_messenger_presence_snapshots")
    .select("user_id, last_seen_at, updated_at, last_ping_at, last_activity_at, app_visibility, presence_state_cached")
    .in("user_id", unique);
  if (error && !isMissingTableError(error)) {
    return result;
  }
  const nowMs = Date.now();
  for (const row of (data ?? []) as PresenceSnapshotRow[]) {
    const userId = trimText(row.user_id);
    if (!userId) continue;
    const lastSeenAt = trimText(row.last_seen_at) || trimText(row.updated_at) || null;
    const state = derivePresenceFromDbRow({
      nowMs,
      lastPingAtIso: row.last_ping_at ?? null,
      lastActivityAtIso: row.last_activity_at ?? null,
      lastSeenAtIso: row.last_seen_at ?? null,
      updatedAtIso: row.updated_at ?? null,
      appVisibility: row.app_visibility ?? "unknown",
    });
    result.set(userId, {
      userId,
      state,
      lastSeenAt,
    });
  }
  return result;
}

async function fetchRoomProfilesByRoomIds(roomIds: string[]): Promise<Map<string, RoomProfileRow | DevRoomProfile>> {
  const uniqueRoomIds = dedupeIds(roomIds);
  const result = new Map<string, RoomProfileRow | DevRoomProfile>();
  if (!uniqueRoomIds.length) return result;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_room_profiles")
      .select("id, room_id, user_id, identity_mode, display_name, bio, avatar_url")
      .in("room_id", uniqueRoomIds);
    if (!error || !isMissingTableError(error)) {
      for (const row of (data ?? []) as RoomProfileRow[]) {
        result.set(roomProfileKey(row.room_id, row.user_id), row);
      }
      return result;
    }
  }
  const dev = getDevState();
  for (const row of dev.roomProfiles.filter((item) => uniqueRoomIds.includes(item.roomId))) {
    result.set(roomProfileKey(row.roomId, row.userId), row);
  }
  return result;
}

function resolveRoomProfileLite(
  baseProfile: CommunityMessengerProfileLite | undefined,
  roomProfile: RoomProfileRow | DevRoomProfile | undefined
): CommunityMessengerProfileLite | undefined {
  if (!baseProfile) return undefined;
  if (!roomProfile) return baseProfile;
  const isDbProfile = "room_id" in roomProfile;
  const identityMode = (isDbProfile ? roomProfile.identity_mode : roomProfile.identityMode) as CommunityMessengerIdentityMode;
  if (identityMode !== "alias") {
    const raw = trimText(baseProfile.avatarUrl);
    const safeAvatar =
      raw && !isCommunityMessengerStickerPublicPath(raw) ? raw : null;
    return {
      ...baseProfile,
      identityMode: "real_name",
      aliasProfile: null,
      avatarUrl: safeAvatar,
    };
  }
  const displayName = trimText(isDbProfile ? roomProfile.display_name : roomProfile.displayName);
  const bio = trimText(isDbProfile ? roomProfile.bio : roomProfile.bio);
  const rawRoomAvatar = trimText(isDbProfile ? roomProfile.avatar_url : roomProfile.avatarUrl);
  const fromRoom =
    rawRoomAvatar && !isCommunityMessengerStickerPublicPath(rawRoomAvatar) ? rawRoomAvatar : null;
  const rawBaseAvatar = trimText(baseProfile.avatarUrl);
  const fromBase =
    rawBaseAvatar && !isCommunityMessengerStickerPublicPath(rawBaseAvatar) ? rawBaseAvatar : null;
  const avatarUrl = fromRoom ?? fromBase;
  return {
    ...baseProfile,
    label: displayName || baseProfile.label,
    subtitle: bio || baseProfile.subtitle,
    avatarUrl,
    identityMode: "alias",
    aliasProfile: {
      displayName: displayName || baseProfile.label,
      bio,
      avatarUrl,
    },
  };
}

async function upsertRoomIdentityProfile(input: {
  userId: string;
  roomId: string;
  identityMode: CommunityMessengerIdentityMode;
  aliasProfile?: Partial<CommunityMessengerRoomAliasProfile> | null;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const aliasDisplayName = trimText(input.aliasProfile?.displayName);
  const aliasBio = trimText(input.aliasProfile?.bio);
  let aliasAvatarUrl = trimText(input.aliasProfile?.avatarUrl) || null;
  if (aliasAvatarUrl && isCommunityMessengerStickerPublicPath(aliasAvatarUrl)) {
    aliasAvatarUrl = null;
  }
  if (input.identityMode === "alias" && !aliasDisplayName) {
    return { ok: false, error: "alias_name_required" };
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const { error } = await (sb as any).from("community_messenger_room_profiles").upsert(
      {
        room_id: roomId,
        user_id: input.userId,
        identity_mode: input.identityMode,
        display_name: input.identityMode === "alias" ? aliasDisplayName : "",
        bio: input.identityMode === "alias" ? aliasBio : "",
        avatar_url: input.identityMode === "alias" ? aliasAvatarUrl : null,
        updated_at: nowIso(),
      },
      { onConflict: "room_id,user_id" }
    );
    if (!error) return { ok: true };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_profile_upsert_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed("messenger_migration_required");
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const existing = dev.roomProfiles.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (existing) {
    existing.identityMode = input.identityMode;
    existing.displayName = input.identityMode === "alias" ? aliasDisplayName : "";
    existing.bio = input.identityMode === "alias" ? aliasBio : "";
    existing.avatarUrl = input.identityMode === "alias" ? aliasAvatarUrl : null;
    return { ok: true };
  }
  dev.roomProfiles.push({
    id: randomUUID(),
    roomId,
    userId: input.userId,
    identityMode: input.identityMode,
    displayName: input.identityMode === "alias" ? aliasDisplayName : "",
    bio: input.identityMode === "alias" ? aliasBio : "",
    avatarUrl: input.identityMode === "alias" ? aliasAvatarUrl : null,
  });
  return { ok: true };
}

async function getViewerRelationSets(
  userId: string,
  targetIds: string[]
): Promise<{
  following: Set<string>;
  blocked: Set<string>;
  friendIds: Set<string>;
  favoriteFriendIds: Set<string>;
  hiddenFriendIds: Set<string>;
}> {
  const following = new Set<string>();
  const blocked = new Set<string>();
  const friendIds = new Set<string>();
  const favoriteFriendIds = new Set<string>();
  const hiddenFriendIds = new Set<string>();
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id !== userId));
  if (!uniqueTargets.length) {
    return { following, blocked, friendIds, favoriteFriendIds, hiddenFriendIds };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: relationRows }, { data: socialRows }, { data: favoriteRows }] = await Promise.all([
      (sb as any)
        .from("user_relationships")
        .select("target_user_id, relation_type, type")
        .eq("user_id", userId)
        .in("target_user_id", uniqueTargets),
      (sb as any)
        .from("user_social_relations")
        .select("target_user_id, relation_type, is_active")
        .eq("owner_user_id", userId)
        .in("target_user_id", uniqueTargets),
      (sb as any)
        .from("community_friend_favorites")
        .select("target_user_id")
        .eq("user_id", userId)
        .in("target_user_id", uniqueTargets),
    ]);

    for (const row of (relationRows ?? []) as Array<{
      target_user_id?: string;
      relation_type?: string | null;
      type?: string | null;
    }>) {
      const target = trimText(row.target_user_id);
      const relationType = trimText(row.relation_type || row.type);
      if (!target) continue;
      if (relationType === "neighbor_follow") following.add(target);
      if (relationType === "blocked") blocked.add(target);
      if (relationType === "hidden") hiddenFriendIds.add(target);
    }

    for (const row of (socialRows ?? []) as Array<{
      target_user_id?: string;
      relation_type?: string | null;
      is_active?: boolean | null;
    }>) {
      const target = trimText(row.target_user_id);
      const relationType = trimText(row.relation_type);
      if (!target) continue;
      if (relationType === "blocked" && row.is_active !== false) blocked.add(target);
    }

    for (const row of (favoriteRows ?? []) as Array<{ target_user_id?: string }>) {
      const target = trimText(row.target_user_id);
      if (target) favoriteFriendIds.add(target);
    }
  } else {
    const dev = getDevState();
    const favorites = dev.favoriteFriends.get(userId);
    if (favorites) {
      for (const target of favorites) favoriteFriendIds.add(target);
    }
    const hidden = dev.hiddenFriends.get(userId);
    if (hidden) {
      for (const target of hidden) hiddenFriendIds.add(target);
    }
  }

  const acceptedRows = await fetchCommunityFriendAcceptedRowsForViewer(userId);
  const acceptedPeerSet = new Set(acceptedPeerIdsFromCommunityFriendRows(userId, acceptedRows));
  for (const target of uniqueTargets) {
    if (acceptedPeerSet.has(target)) friendIds.add(target);
  }

  if (!favoriteFriendIds.size || !hiddenFriendIds.size) {
    const dev = getDevState();
    const favorites = dev.favoriteFriends.get(userId);
    if (favorites) {
      for (const target of favorites) favoriteFriendIds.add(target);
    }
    const hidden = dev.hiddenFriends.get(userId);
    if (hidden) {
      for (const target of hidden) hiddenFriendIds.add(target);
    }
  }

  return { following, blocked, friendIds, favoriteFriendIds, hiddenFriendIds };
}

async function hydrateProfilesWithProfileMap(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<{ members: CommunityMessengerProfileLite[]; profileMap: Map<string, ProfileRow> }> {
  const includeSelf = options?.includeSelf === true;
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id && (includeSelf || id !== viewerId)));
  if (!uniqueTargets.length) return { members: [], profileMap: new Map() };
  const [profileMap, relationSets] = await Promise.all([
    fetchProfilesByIds(uniqueTargets),
    getViewerRelationSets(viewerId, uniqueTargets),
  ]);
  const members = uniqueTargets.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: profileDibaySubtitle(profile),
      bio: trimText(profile?.bio) || null,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: id === viewerId ? false : relationSets.following.has(id),
      blocked: id === viewerId ? false : relationSets.blocked.has(id),
      isFriend: id === viewerId ? false : relationSets.friendIds.has(id),
      isFavoriteFriend: id === viewerId ? false : relationSets.favoriteFriendIds.has(id),
      isHiddenFriend: id === viewerId ? false : relationSets.hiddenFriendIds.has(id),
    };
  });
  return { members, profileMap };
}

async function hydrateProfiles(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean }
): Promise<CommunityMessengerProfileLite[]> {
  const { members } = await hydrateProfilesWithProfileMap(viewerId, targetIds, options);
  return members;
}

/**
 * 통화 세션 매핑 전용 — `getViewerRelationSets` 생략(친구/팔로우 등 3쿼리)으로 발신·GET TTFB 를 줄인다.
 * 통화 UI는 표시명·아바타 중심이며 관계 뱃지는 불필요하다.
 */
function parseBootstrapLiteBundleProfileLabels(raw: unknown): Map<string, ProfileRow> {
  const out = new Map<string, ProfileRow>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== "object") continue;
    const row = val as Record<string, unknown>;
    const id = trimText(row.id ?? key);
    if (!id) continue;
    out.set(id, {
      id,
      display_name: (row.display_name as string | null) ?? null,
      nickname: (row.nickname as string | null) ?? null,
      username: (row.username as string | null) ?? null,
      dibay_id: (row.dibay_id as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      bio: null,
    });
  }
  return out;
}

export async function hydrateProfilesLabelsOnlyWithMap(
  viewerId: string,
  targetIds: string[],
  options?: {
    includeSelf?: boolean;
    prefetchedProfiles?: Map<string, ProfileRow>;
    trace?: HomeSyncTrace;
    /** lite list first paint — bio·full select 생략 */
    bootstrapLiteFirstPaint?: boolean;
  }
): Promise<{ members: CommunityMessengerProfileLite[]; profileMap: Map<string, ProfileRow> }> {
  const trace = options?.trace;
  const deepSteps = homeSyncTraceMeterEnabled(trace);
  const tTop = deepSteps ? performance.now() : 0;
  const includeSelf = options?.includeSelf === true;
  const tDedupe = deepSteps ? performance.now() : 0;
  const uniqueTargets = dedupeIds(targetIds.filter((id) => id && (includeSelf || id !== viewerId)));
  const dedupeMs = deepSteps ? performance.now() - tDedupe : 0;
  if (!uniqueTargets.length) return { members: [], profileMap: new Map() };
  const prefetched = options?.prefetchedProfiles ?? new Map<string, ProfileRow>();
  const tMissing = deepSteps ? performance.now() : 0;
  const missingForFetch = uniqueTargets.filter((tid) => !prefetched.has(tid));
  const missingMs = deepSteps ? performance.now() - tMissing : 0;
  const tFetch = deepSteps ? performance.now() : 0;
  const liteFirstPaint = options?.bootstrapLiteFirstPaint === true;
  const fetched = missingForFetch.length
    ? liteFirstPaint
      ? await fetchProfilesByIdsBootstrapLiteFirstPaint(missingForFetch)
      : await fetchProfilesByIds(missingForFetch)
    : new Map<string, ProfileRow>();
  const fetchMs = deepSteps ? performance.now() - tFetch : 0;
  const tMerge = deepSteps ? performance.now() : 0;
  const profileMap = new Map<string, ProfileRow>([...prefetched, ...fetched]);
  const mergeMs = deepSteps ? performance.now() - tMerge : 0;
  const tBuild = deepSteps ? performance.now() : 0;
  const members = uniqueTargets.map((id) => {
    const profile = profileMap.get(id);
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: profileDibaySubtitle(profile),
      bio: liteFirstPaint ? null : trimText(profile?.bio) || null,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
      isHiddenFriend: false,
    };
  });
  const buildMs = deepSteps ? performance.now() - tBuild : 0;
  if (deepSteps && trace) {
    trace.deepSteps.participantsProfiles = {
      dbFetchMs: ms(fetchMs),
      profileMergeMs: ms(mergeMs),
      participantNormalizeMs: ms(buildMs),
      dedupeMs: ms(dedupeMs),
      missingMs: ms(missingMs),
      totalMs: ms(performance.now() - tTop),
      ids: ms(uniqueTargets.length),
      fetched: ms(missingForFetch.length),
    };
  }
  return { members, profileMap };
}

async function hydrateProfilesLabelsOnly(
  viewerId: string,
  targetIds: string[],
  options?: { includeSelf?: boolean; trace?: HomeSyncTrace }
): Promise<CommunityMessengerProfileLite[]> {
  const { members } = await hydrateProfilesLabelsOnlyWithMap(viewerId, targetIds, options);
  return members;
}

export function buildProfilesFromKnownRelations(params: {
  viewerId: string;
  targetIds: string[];
  profileMap: Map<string, ProfileRow>;
  friendIds?: Iterable<string>;
  favoriteFriendIds?: Iterable<string>;
  followingIds?: Iterable<string>;
  hiddenIds?: Iterable<string>;
  blockedIds?: Iterable<string>;
  friendshipAcceptedAtByPeer?: Map<string, string>;
}): CommunityMessengerProfileLite[] {
  const friendIdSet = new Set(params.friendIds ?? []);
  const favoriteFriendIdSet = new Set(params.favoriteFriendIds ?? []);
  const followingIdSet = new Set(params.followingIds ?? []);
  const hiddenIdSet = new Set(params.hiddenIds ?? []);
  const blockedIdSet = new Set(params.blockedIds ?? []);
  return dedupeIds(params.targetIds).map((id) => {
    const profile = params.profileMap.get(id);
    const isViewer = id === params.viewerId;
    return {
      id,
      label: profileLabel(profile, id),
      subtitle: profileDibaySubtitle(profile),
      bio: trimText(profile?.bio) || null,
      avatarUrl: trimText(profile?.avatar_url) || null,
      following: isViewer ? false : followingIdSet.has(id),
      blocked: isViewer ? false : blockedIdSet.has(id),
      isFriend: isViewer ? false : friendIdSet.has(id),
      isFavoriteFriend: isViewer ? false : favoriteFriendIdSet.has(id),
      isHiddenFriend: isViewer ? false : hiddenIdSet.has(id),
      friendshipAcceptedAt: params.friendshipAcceptedAtByPeer?.get(id) ?? null,
    };
  });
}

async function resolveCommunityMessengerGroupTitle(
  userId: string,
  memberIds: string[],
  rawTitle?: string
): Promise<string> {
  const explicitTitle = trimText(rawTitle);
  if (explicitTitle) return explicitTitle;

  const peerIds = dedupeIds(memberIds.filter((id) => id !== userId));
  if (!peerIds.length) return cmGroupTitleFallback(memberIds.length);

  const peers = await hydrateProfiles(userId, peerIds);
  const labels = peers
    .map((peer) => trimText(peer.label))
    .filter(Boolean)
    .slice(0, 3);

  return cmGroupTitleWithPeers(labels, peerIds.length, memberIds.length);
}

async function hydrateSelfProfile(userId: string): Promise<CommunityMessengerProfileLite | null> {
  const me = await hydrateProfiles(userId, [userId], { includeSelf: true });
  return me[0] ?? null;
}

async function listCommunityMessengerFriendRequestRows(userId: string): Promise<RequestRow[]> {
  const sb = getSupabaseOrNull();
  let rows: RequestRow[] = [];
  if (sb) {
    const {
      listPendingFriendRequestRowsFromFriendshipsSsot,
    } = await import("@/lib/community-messenger/friendship/community-messenger-friendships-ssot");
    try {
      rows = (await listPendingFriendRequestRowsFromFriendshipsSsot(sb, userId)) as RequestRow[];
    } catch {
      rows = [];
    }
    if (!rows.length) {
      const { data, error } = await (sb as any)
        .from("community_friend_requests")
        .select("id, requester_id, addressee_id, status, created_at")
        .eq("status", "pending")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (!error || !isMissingTableError(error)) {
        rows = ((data ?? []) as RequestRow[]).filter(Boolean);
      }
    }
  }
  if (!rows.length) {
    rows = getDevState().friendRequests
      .filter((row) => row.status === "pending" && (row.requester_id === userId || row.addressee_id === userId))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  return rows;
}

export function buildCommunityMessengerFriendRequestsFromProfileMap(
  userId: string,
  rows: RequestRow[],
  profileMap: Map<string, ProfileRow>
): CommunityMessengerFriendRequest[] {
  return rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    requesterLabel: profileLabel(profileMap.get(row.requester_id), row.requester_id),
    addresseeId: row.addressee_id,
    addresseeLabel: profileLabel(profileMap.get(row.addressee_id), row.addressee_id),
    status: row.status,
    direction: row.addressee_id === userId ? "incoming" : "outgoing",
    createdAt: row.created_at,
  }));
}

export async function listCommunityMessengerFriendRequests(
  _userId: string
): Promise<CommunityMessengerFriendRequest[]> {
  // Telegram Contact LOCK — pending friend requests retired; always empty.
  return [];
}

/** legacy mutual user_social_relations — SSOT merge fallback input. */
async function fetchLegacyMutualFriendAcceptedRowsForViewer(
  userId: string
): Promise<CommunityFriendRequestAcceptedRow[]> {
  const saved = await fetchFriendSavedAcceptedRowsForViewer(userId);
  const mutualSaved: CommunityFriendRequestAcceptedRow[] = [];
  for (const row of saved) {
    const peer = trimText(row.addressee_id);
    if (peer && (await isFriendSavedByMe(peer, userId))) {
      mutualSaved.push(row);
    }
  }
  return mutualSaved;
}

/** accepted 친구 rows — friendships SSOT 1순위, legacy mutual save / requests fallback. */
async function fetchCommunityFriendAcceptedRowsForViewer(
  userId: string
): Promise<CommunityFriendRequestAcceptedRow[]> {
  const viewer = trimText(userId);
  if (!viewer) return [];

  let ssotRows: Awaited<ReturnType<typeof listFriendshipSsotRowsForViewer>> = [];
  const sb = getSupabaseOrNull();
  if (sb) {
    try {
      ssotRows = await listFriendshipSsotRowsForViewer(sb, viewer);
    } catch {
      ssotRows = [];
    }
  }

  const legacyMutualRows = await fetchLegacyMutualFriendAcceptedRowsForViewer(viewer);
  let legacyRequestRows = await fetchCommunityFriendRequestsAcceptedRowsForViewer(viewer);
  if (!legacyRequestRows.length && !allowCommunityMessengerFriendInMemoryDevFallback()) {
    legacyRequestRows = [];
  }

  return mergeCommunityFriendAcceptedRowsFromSources({
    userId: viewer,
    ssotRows,
    legacyMutualRows,
    legacyRequestRows,
  });
}

/** @deprecated legacy community_friend_requests — dev fallback only */
async function fetchCommunityFriendRequestsAcceptedRowsForViewer(
  userId: string
): Promise<CommunityFriendRequestAcceptedRow[]> {
  const rows: CommunityFriendRequestAcceptedRow[] = [];
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_friend_requests")
      .select("requester_id, addressee_id, status, responded_at, created_at")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (!error || !isMissingTableError(error)) {
      rows.push(...((data ?? []) as CommunityFriendRequestAcceptedRow[]));
    }
  }
  for (const row of getDevState().friendRequests) {
    if (row.status !== "accepted") continue;
    rows.push({
      requester_id: row.requester_id,
      addressee_id: row.addressee_id,
      status: row.status,
      responded_at: row.responded_at,
      created_at: row.created_at,
    });
  }
  return rows;
}

export function acceptedPeerIdsFromCommunityFriendRows(userId: string, rows: CommunityFriendRequestAcceptedRow[]): string[] {
  const result = new Set<string>();
  for (const row of rows) {
    const requesterId = trimText(row.requester_id);
    const addresseeId = trimText(row.addressee_id);
    const peerId = requesterId === userId ? addresseeId : requesterId;
    if (peerId) result.add(peerId);
  }
  return [...result];
}

export function friendshipAcceptedAtByPeerFromRows(
  userId: string,
  rows: CommunityFriendRequestAcceptedRow[]
): Map<string, string> {
  const map = new Map<string, string>();
  const merge = (peerId: string, atRaw: string | null | undefined) => {
    const at = trimText(atRaw);
    if (!at || !peerId) return;
    const prev = map.get(peerId);
    if (!prev || Date.parse(at) > Date.parse(prev)) map.set(peerId, at);
  };
  for (const row of rows) {
    const requesterId = trimText(row.requester_id);
    const addresseeId = trimText(row.addressee_id);
    const peerId = requesterId === userId ? addresseeId : requesterId;
    const at = trimText(row.responded_at) || trimText(row.created_at);
    merge(peerId, at);
  }
  return map;
}

async function listAcceptedFriendIds(userId: string): Promise<string[]> {
  const saved = await listFriendSavedIds(userId);
  if (saved.length) return saved;
  if (!allowCommunityMessengerFriendInMemoryDevFallback()) return saved;
  const rows = await fetchCommunityFriendAcceptedRowsForViewer(userId);
  return acceptedPeerIdsFromCommunityFriendRows(userId, rows);
}

async function listFavoriteFriendIds(userId: string): Promise<string[]> {
  const result = new Set<string>();
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data } = await (sb as any)
      .from("community_friend_favorites")
      .select("target_user_id")
      .eq("user_id", userId);
    for (const row of (data ?? []) as Array<{ target_user_id?: string | null }>) {
      const target = trimText(row.target_user_id);
      if (target) result.add(target);
    }
  }
  const dev = getDevState();
  const favorites = dev.favoriteFriends.get(userId);
  if (favorites) {
    for (const target of favorites) {
      const id = trimText(target);
      if (id) result.add(id);
    }
  }
  return [...result];
}

/** 수락된 친구 관계마다 상대 peer → 수락 시각(가장 최근 값). `responded_at` 우선, 없으면 `created_at` */
async function fetchFriendshipAcceptedAtByPeerId(userId: string): Promise<Map<string, string>> {
  const rows = await fetchCommunityFriendAcceptedRowsForViewer(userId);
  return friendshipAcceptedAtByPeerFromRows(userId, rows);
}

async function listFollowingIds(userId: string, relationType: "neighbor_follow" | "blocked" | "hidden"): Promise<string[]> {
  const result = new Set<string>();
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data } = await (sb as any)
      .from("user_relationships")
      .select("target_user_id, relation_type, type")
      .eq("user_id", userId)
      .or(`relation_type.eq.${relationType},type.eq.${relationType}`);
    for (const row of (data ?? []) as Array<{
      target_user_id?: string | null;
    }>) {
      const target = trimText(row.target_user_id);
      if (target) result.add(target);
    }
  }
  return [...result];
}

function buildRoomSummaryFromHydratedMembers(
  userId: string,
  room: RoomRow | DevRoom,
  participants: Array<ParticipantRow | DevParticipant>,
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile> | undefined,
  memberProfilesRaw: CommunityMessengerProfileLite[],
  meta?: { totalMemberCount?: number },
  /** dev home-sync trace: 참가자 `unread_count` → 요약 필드 반영 CPU 누적 */
  unreadPerf?: { participantUnreadCpuMs: number }
): CommunityMessengerRoomSummary {
  const roomId = room.id;
  const isDbRoom = "room_type" in room;
  const roomType = (isDbRoom ? room.room_type : room.roomType) as CommunityMessengerRoomType;
  const roomStatus = normalizeRoomStatus(isDbRoom ? room.room_status : room.roomStatus);
  const visibility = normalizeRoomVisibility(isDbRoom ? room.visibility : room.visibility, roomType);
  const joinPolicy = normalizeRoomJoinPolicy(isDbRoom ? room.join_policy : room.joinPolicy, roomType);
  const identityPolicy = normalizeRoomIdentityPolicy(isDbRoom ? room.identity_policy : room.identityPolicy, roomType);
  const isReadonly = isDbRoom ? room.is_readonly === true : room.isReadonly;
  const roomTitle = trimText(isDbRoom ? room.title : room.title);
  const roomSummary = trimText(isDbRoom ? room.summary : room.summary);
  const contextMeta = parseCommunityMessengerRoomContextMeta(roomSummary);
  const roomAvatar = trimText(isDbRoom ? room.avatar_url : room.avatarUrl) || null;
  const roomLastMessage = trimText(isDbRoom ? room.last_message : room.lastMessage);
  const roomLastMessageTypeRaw = trimText(isDbRoom ? room.last_message_type : room.lastMessageType);
  const roomLastMessageType =
    roomLastMessageTypeRaw === "image" ||
    roomLastMessageTypeRaw === "file" ||
    roomLastMessageTypeRaw === "system" ||
    roomLastMessageTypeRaw === "call_stub" ||
    roomLastMessageTypeRaw === "voice" ||
    roomLastMessageTypeRaw === "sticker" ||
    roomLastMessageTypeRaw === "community_post_share"
      ? roomLastMessageTypeRaw
      : "text";
  const roomLastAt = trimText(isDbRoom ? room.last_message_at : room.lastMessageAt) || nowIso();
  const ownerUserId = trimText(isDbRoom ? room.owner_user_id : room.ownerUserId) || trimText(isDbRoom ? room.created_by : room.createdBy) || null;
  const memberLimitRaw = isDbRoom ? room.member_limit : room.memberLimit;
  const memberLimit = typeof memberLimitRaw === "number" && Number.isFinite(memberLimitRaw) ? memberLimitRaw : null;
  const isDiscoverable = isDbRoom ? room.is_discoverable === true : room.isDiscoverable;
  const allowMemberInvite = isDbRoom ? room.allow_member_invite !== false : room.allowMemberInvite;
  const noticeText = trimText(isDbRoom ? room.notice_text : room.noticeText);
  const pinnedMessageId =
    trimText(isDbRoom ? (room as RoomRow).pinned_message_id : (room as DevRoom).pinnedMessageId) || null;
  const noticeUpdatedAt = trimText(isDbRoom ? room.notice_updated_at : room.noticeUpdatedAt) || null;
  const noticeUpdatedBy = trimText(isDbRoom ? room.notice_updated_by : room.noticeUpdatedBy) || null;
  const allowAdminInvite = isDbRoom ? room.allow_admin_invite !== false : room.allowAdminInvite !== false;
  const allowAdminKick = isDbRoom ? room.allow_admin_kick !== false : room.allowAdminKick !== false;
  const allowAdminEditNotice =
    isDbRoom ? room.allow_admin_edit_notice !== false : room.allowAdminEditNotice !== false;
  const allowMemberUpload = isDbRoom ? room.allow_member_upload !== false : room.allowMemberUpload !== false;
  const allowMemberCall = isDbRoom ? room.allow_member_call !== false : room.allowMemberCall !== false;
  const requiresPassword =
    joinPolicy === "password" &&
    trimText(isDbRoom ? room.password_hash : room.passwordHash).length > 0;
  const me = participants.find((item) => ("user_id" in item ? item.user_id : item.userId) === userId);
  const isArchivedByViewer = participantViewerArchived(me);
  const isBlockedHiddenByViewer = participantViewerBlockedHiddenFromRow(me);
  const memberIds = dedupeParticipantUserIds(participants);
  const effectiveMemberCount = meta?.totalMemberCount ?? memberIds.length;
  const peers = memberIds.filter((id) => id !== userId);
  const peerProfilesBase = memberProfilesRaw.filter((profile) => profile.id !== userId);
  const memberProfiles = memberProfilesRaw.map((profile) =>
    resolveRoomProfileLite(profile, roomProfileMap?.get(roomProfileKey(roomId, profile.id))) ?? profile
  );
  const ownerLabel =
    (ownerUserId ? memberProfiles.find((profile) => profile.id === ownerUserId)?.label : "") ||
    (ownerUserId ? profileLabel(null, ownerUserId) : "-");
  const defaultDirectTitle = peerProfilesBase[0]?.label ?? cmServiceT("cm_ui_new_conversation");
  const title =
    roomType === "direct"
      ? defaultDirectTitle
      : roomTitle ||
        (roomType === "open_group" ? cmOpenGroupRoomTitle() : cmGroupTitleFallback(effectiveMemberCount));
  const subtitle =
    roomType === "direct"
      ? peerProfilesBase[0]?.subtitle ?? cmDirectRoomSubtitleFallback()
      : roomType === "open_group"
        ? cmOpenGroupRoomSubtitle(effectiveMemberCount)
        : cmGroupRoomSubtitle(effectiveMemberCount);
  const messengerDirectKeyRaw =
    roomType === "direct"
      ? isDbRoom
        ? trimText((room as RoomRow).direct_key ?? "") || null
        : trimText((room as DevRoom).directKey ?? "") || null
      : null;
  let messengerDirectKey = messengerDirectKeyRaw;
  if (roomType === "direct" && !messengerDirectKey) {
    const solePeer = peers.length === 1 ? peers[0] : peerProfilesBase[0]?.id?.trim();
    if (solePeer) {
      const derived = messengerDirectKeyForUserPair(userId, solePeer);
      if (isMessengerGeneralFriendDirectKey(derived)) messengerDirectKey = derived;
    }
  }
  let unreadCountVal: number;
  if (unreadPerf) {
    const tu = performance.now();
    unreadCountVal = Math.max(
      0,
      Number(
        ("unread_count" in (me ?? {})
          ? (me as ParticipantRow).unread_count
          : (me as DevParticipant | undefined)?.unreadCount) ?? 0
      )
    );
    unreadPerf.participantUnreadCpuMs += performance.now() - tu;
  } else {
    unreadCountVal = Math.max(
      0,
      Number(
        ("unread_count" in (me ?? {})
          ? (me as ParticipantRow).unread_count
          : (me as DevParticipant | undefined)?.unreadCount) ?? 0
      )
    );
  }
  const domainRaw = isDbRoom ? trimText((room as RoomRow).chat_domain ?? "") : "";
  const identityRaw = isDbRoom ? trimText((room as RoomRow).domain_identity ?? "") : "";
  const chatDomainAttached =
    domainRaw === "general_direct" ||
    domainRaw === "group" ||
    domainRaw === "trade" ||
    domainRaw === "store_order"
      ? (domainRaw as CommunityMessengerRoomSummary["chatDomain"])
      : undefined;
  return {
    id: roomId,
    roomType,
    roomStatus,
    visibility,
    joinPolicy,
    identityPolicy,
    isReadonly,
    title,
    subtitle,
    summary: roomSummary,
    avatarUrl: roomAvatar || peerProfilesBase[0]?.avatarUrl || null,
    unreadCount: unreadCountVal,
    isMuted: "is_muted" in (me ?? {}) ? (me as ParticipantRow).is_muted === true : false,
    isPinned: "is_pinned" in (me ?? {}) ? (me as ParticipantRow).is_pinned === true : false,
    lastMessage:
      roomLastMessage ||
      cmRoomLastMessagePlaceholder(roomType === "direct" ? "direct" : "group"),
    lastMessageType: roomLastMessageType,
    lastMessageAt: roomLastAt,
    memberCount: effectiveMemberCount,
    ownerUserId,
    ownerLabel,
    memberLimit,
    isDiscoverable,
    requiresPassword,
    allowMemberInvite,
    noticeText,
    pinnedMessageId,
    noticeUpdatedAt,
    noticeUpdatedBy,
    allowAdminInvite,
    allowAdminKick,
    allowAdminEditNotice,
    allowMemberUpload,
    allowMemberCall,
    myIdentityMode: resolveRoomProfileLite(
      memberProfilesRaw.find((profile) => profile.id === userId),
      roomProfileMap?.get(roomProfileKey(roomId, userId))
    )?.identityMode,
    peerUserId: roomType === "direct" ? peers[0] ?? null : null,
    isArchivedByViewer,
    isBlockedHiddenByViewer,
    messengerDirectKey,
    contextMeta: contextMeta ?? null,
    ...(chatDomainAttached ? { chatDomain: chatDomainAttached } : {}),
    ...(identityRaw ? { domainIdentity: identityRaw } : {}),
  };
}

export function buildParticipantsByRoomMap(
  participantRows: Array<ParticipantRow | DevParticipant>
): Map<string, Array<ParticipantRow | DevParticipant>> {
  const byRoomId = new Map<string, Array<ParticipantRow | DevParticipant>>();
  for (const participant of participantRows) {
    const roomId = participantRowRoomId(participant);
    const list = byRoomId.get(roomId) ?? [];
    list.push(participant);
    byRoomId.set(roomId, list);
  }
  return byRoomId;
}

/**
 * Community Messenger — `hydrateProfiles` / 관계 조립 경로 (실 API 기준)
 *
 * - `fetchMyRoomsPayload`: 참가 방이 많으면 `last_message_at` 메타로 상위 `COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP`만 로드.
 * - `getCommunityMessengerBootstrap`: 친구·차단·팔로우 ID, `fetchMyRoomsPayload`, (옵션) 탐색 raw, 통화 로그 행을 모은 뒤
 *   **단일** `hydrateProfiles` → `summarizeRoomsBatchWithProfileMap` + 통화 `roomSummaryMap` + `loadSessionMapsForCallLogs`.
 *   `skipDiscoverable` 이면 탐색 오픈그룹 쿼리를 생략하고 `discoverableGroups` 는 빈 배열(클라이언트가 `open-groups`로 후속 로드).
 * - `listCommunityMessengerMyChatsAndGroups`: **full** 은 **1회** `hydrateProfiles`; **`tier=critical`(home-sync)** 은 **1회** `hydrateProfilesLabelsOnly`(관계 3쿼리 생략). home-sync 는 **RPC `p_limit`로 방 개수 상한**(critical 20 / full 30). **`homeSyncSkipHeavyEnrich`** 는 Philife 오픈그룹 라벨 보강만 생략; 거래 방 **`enrichTradeRoomContextMetaForBootstrap`**(썸네일·제목) 은 full tier 에서 항상 수행. `/api/community-messenger/rooms` 는 상한 미지정(500) 유지.
 * - 방 상세 `getCommunityMessengerRoomDetail`: 해당 방 멤버만 **1회** `hydrateProfilesWithProfileMap`.
 * - `listCommunityMessengerFriends` / `searchCommunityMessengerUsers`: 목록·검색 전용 **1회**.
 * - `loadCallSessionParticipants` / `resolveCommunityMessengerGroupTitle`: 해당 작업 범위 **1회** (세션/그룹 제목용).
 */
function participantRowRoomId(p: ParticipantRow | DevParticipant): string {
  return "room_id" in p ? p.room_id : p.roomId;
}

export function participantRowUserId(p: ParticipantRow | DevParticipant): string {
  return trimText("user_id" in p ? p.user_id : p.userId) || "";
}

export function dedupeParticipantUserIds(rows: Array<ParticipantRow | DevParticipant>): string[] {
  return dedupeIds(rows.map((p) => participantRowUserId(p)).filter((id): id is string => Boolean(id)));
}

function participantViewerArchived(me: ParticipantRow | DevParticipant | undefined): boolean {
  if (!me) return false;
  if ("is_archived" in me && (me as ParticipantRow).is_archived === true) return true;
  if ("isArchived" in me && (me as DevParticipant).isArchived === true) return true;
  return false;
}

function participantViewerBlockedHiddenFromRow(me: ParticipantRow | DevParticipant | undefined): boolean {
  if (!me) return false;
  if ("blocked_hidden_at" in me) {
    return participantViewerBlockedHidden(me as ParticipantRow);
  }
  if ("blockedHiddenAt" in me && (me as DevParticipant).blockedHiddenAt) return true;
  return false;
}

function rankParticipantRoleForBootstrap(role: "owner" | "admin" | "member"): number {
  if (role === "owner") return 0;
  if (role === "admin") return 1;
  return 2;
}

function participantJoinedAtForBootstrap(p: ParticipantRow | DevParticipant): string {
  return trimText("joined_at" in p ? p.joined_at : p.joinedAt) || "";
}

/** 방 멤버 목록·부트스트랩·페이지네이션 공통 정렬 (오프셋과 부트스트랩 첫 페이지가 동일 기준) */
function sortParticipantsForRoomMemberList<T extends ParticipantRow | DevParticipant>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const dr = rankParticipantRoleForBootstrap(a.role) - rankParticipantRoleForBootstrap(b.role);
    if (dr !== 0) return dr;
    const jd = participantJoinedAtForBootstrap(b).localeCompare(participantJoinedAtForBootstrap(a));
    if (jd !== 0) return jd;
    return participantRowUserId(a).localeCompare(participantRowUserId(b));
  });
}

/** 그룹방 부트스트랩: 방장·관리자 우선, 그다음 최근 가입 순 — 뷰어는 항상 슬라이스에 포함(캡·정렬로 누락되면 헤더·권한 UI가 깨짐) */
export function sliceGroupParticipantsForRoomBootstrap<T extends ParticipantRow | DevParticipant>(
  rows: T[],
  viewerUserId: string,
  cap: number
): { rows: T[]; truncated: boolean } {
  if (rows.length <= cap) return { rows, truncated: false };
  const sorted = sortParticipantsForRoomMemberList(rows);
  const viewer = trimText(viewerUserId);
  const base = sorted.slice(0, cap);
  const viewerRow = viewer ? sorted.find((r) => participantRowUserId(r) === viewer) : undefined;
  if (!viewerRow || base.some((r) => participantRowUserId(r) === viewer)) {
    return { rows: base, truncated: true };
  }
  const trimmed = base.slice(0, Math.max(0, cap - 1));
  return { rows: [...trimmed, viewerRow], truncated: true };
}

function isDbCallLogRow(row: CallRow | DevCall): row is CallRow {
  return "caller_user_id" in row;
}

function callLogRoomId(row: CallRow | DevCall): string | null {
  const v = isDbCallLogRow(row) ? row.room_id : row.roomId;
  return trimText(v) || null;
}

function callLogSessionId(row: CallRow | DevCall): string | null {
  const v = isDbCallLogRow(row) ? row.session_id : row.sessionId;
  return trimText(v) || null;
}

function callLogPeerUserId(row: CallRow | DevCall): string | null {
  const v = isDbCallLogRow(row) ? row.peer_user_id : row.peerUserId;
  return trimText(v) || null;
}

/** 이미 hydrateProfiles 로 채운 맵으로 방 요약만 조립 (부트스트랩 단일 하이드레이션용). */
export function summarizeRoomsBatchWithProfileMap(
  userId: string,
  roomRows: Array<RoomRow | DevRoom>,
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile>,
  participantsByRoom: Map<string, Array<ParticipantRow | DevParticipant>>,
  profileById: Map<string, CommunityMessengerProfileLite>,
  participantUnreadPerf?: { participantUnreadCpuMs: number }
): CommunityMessengerRoomSummary[] {
  return roomRows.map((room) => {
    const participants = participantsByRoom.get(room.id) ?? [];
    const memberIds = dedupeParticipantUserIds(participants);
    const memberProfilesForRoom = memberIds
      .map((id) => profileById.get(id))
      .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
    return buildRoomSummaryFromHydratedMembers(
      userId,
      room,
      participants,
      roomProfileMap,
      memberProfilesForRoom,
      undefined,
      participantUnreadPerf
    );
  });
}

/** 방 목록용: 참가자 전원에 대해 hydrateProfiles 1회만 호출 (방마다 호출 시 N배 지연). */
async function summarizeRoomsBatch(
  userId: string,
  roomRows: Array<RoomRow | DevRoom>,
  participantRows: Array<ParticipantRow | DevParticipant>,
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile>,
  participantsByRoom: Map<string, Array<ParticipantRow | DevParticipant>>
): Promise<CommunityMessengerRoomSummary[]> {
  const allMemberIds = dedupeParticipantUserIds(participantRows);
  const allMemberProfiles = await hydrateProfiles(userId, allMemberIds, { includeSelf: true });
  const profileById = new Map(allMemberProfiles.map((profile) => [profile.id, profile]));
  return summarizeRoomsBatchWithProfileMap(userId, roomRows, roomProfileMap, participantsByRoom, profileById);
}

type MessengerRoomsPayload = {
  roomRows: Array<RoomRow | DevRoom>;
  participantRows: Array<ParticipantRow | DevParticipant>;
  byRoomId: Map<string, Array<ParticipantRow | DevParticipant>>;
  roomProfileMap: Map<string, RoomProfileRow | DevRoomProfile>;
  /** lite bundle RPC `profile_labels` — 별도 profiles.in() RTT 생략 */
  bootstrapLiteProfileLabels?: Map<string, ProfileRow>;
};

function sliceMessengerRoomsPayloadForHomeSyncCritical(
  payload: MessengerRoomsPayload,
  cap: number
): MessengerRoomsPayload {
  if (payload.roomRows.length <= cap) return payload;
  const roomRows = payload.roomRows.slice(0, cap);
  const allow = new Set(roomRows.map((room) => room.id));
  const participantRows = payload.participantRows.filter((p) => allow.has(participantRowRoomId(p)));
  const byRoomId = buildParticipantsByRoomMap(participantRows);
  return {
    roomRows,
    participantRows,
    byRoomId,
    roomProfileMap: payload.roomProfileMap,
  };
}

export type CommunityMessengerBootstrapRoomsDiagnostics = {
  rounds: number;
  queryCount: number;
  metaChunkCount: number;
  roomIdsBeforeCap: number;
  roomIdsAfterCap: number;
  round1Ms: number;
  round2Ms: number;
  round2RoomsMs: number;
  round2RoomsDbFetchMs: number;
  round2RoomsNormalizeMs: number;
  round2RoomsMergeMapMs: number;
  round2RoomsHydrateLabelMs: number;
  round2RoomsPayloadSerializeMs: number;
  round2ParticipantsMs: number;
  round3Ms: number;
  transformMs: number;
  postprocessMs: number;
  round1RoomIdCount: number;
  round2RoomRowCount: number;
  round2ParticipantRowCount: number;
  round3RoomProfileCount: number;
  /** lite bundle RPC 1RTT 경로 */
  liteBundleUsed: boolean;
  liteBundleRpcMs: number;
  liteBundleRoomsParseMs: number;
  liteBundleParticipantsParseMs: number;
  liteBundleProfilesParseMs: number;
  liteBundleMapMs: number;
  liteRoomsCacheHit: boolean;
  /** `bundle_rpc` | `participant_embed` | `legacy` */
  liteRoomsFetchPath: string;
};

export function createEmptyBootstrapRoomsDiagnostics(): CommunityMessengerBootstrapRoomsDiagnostics {
  return {
    rounds: 0,
    queryCount: 0,
    metaChunkCount: 0,
    roomIdsBeforeCap: 0,
    roomIdsAfterCap: 0,
    round1Ms: 0,
    round2Ms: 0,
    round2RoomsMs: 0,
    round2RoomsDbFetchMs: 0,
    round2RoomsNormalizeMs: 0,
    round2RoomsMergeMapMs: 0,
    round2RoomsHydrateLabelMs: 0,
    round2RoomsPayloadSerializeMs: 0,
    round2ParticipantsMs: 0,
    round3Ms: 0,
    transformMs: 0,
    postprocessMs: 0,
    round1RoomIdCount: 0,
    round2RoomRowCount: 0,
    round2ParticipantRowCount: 0,
    round3RoomProfileCount: 0,
    liteBundleUsed: false,
    liteBundleRpcMs: 0,
    liteBundleRoomsParseMs: 0,
    liteBundleParticipantsParseMs: 0,
    liteBundleProfilesParseMs: 0,
    liteBundleMapMs: 0,
    liteRoomsCacheHit: false,
    liteRoomsFetchPath: "legacy",
  };
}

function finishBootstrapLiteRoomsQueryBreakdown(
  bootstrapDiag: CommunityMessengerBootstrapDiagnostics,
  roomsDiag: CommunityMessengerBootstrapRoomsDiagnostics
): void {
  bootstrapDiag.bootstrapLiteRoomIdsRpcMs = roomsDiag.liteBundleUsed
    ? roomsDiag.liteBundleRpcMs
    : roomsDiag.round1Ms;
  bootstrapDiag.bootstrapLiteRoomsMetaFetchMs = roomsDiag.liteBundleUsed
    ? roomsDiag.liteBundleRoomsParseMs
    : roomsDiag.round2RoomsDbFetchMs;
  bootstrapDiag.bootstrapLiteParticipantsJoinMs = roomsDiag.liteBundleUsed
    ? roomsDiag.liteBundleParticipantsParseMs
    : roomsDiag.round2ParticipantsMs;
  bootstrapDiag.bootstrapLiteLastMessageFetchMs = 0;
  bootstrapDiag.bootstrapLiteRoomPayloadMapMs = roomsDiag.liteBundleUsed
    ? roomsDiag.liteBundleMapMs
    : roomsDiag.postprocessMs;
  bootstrapDiag.bootstrapLiteRoomsRpcCacheHit = roomsDiag.liteRoomsCacheHit;
  bootstrapDiag.bootstrapLiteRoomCount = roomsDiag.round2RoomRowCount;
  bootstrapDiag.bootstrapLiteParticipantCount = roomsDiag.round2ParticipantRowCount;
  bootstrapDiag.bootstrapLiteRoomsFetchPath = roomsDiag.liteRoomsFetchPath;
  const stages: Array<[string, number]> = [
    ["room_ids_rpc", bootstrapDiag.bootstrapLiteRoomIdsRpcMs],
    ["rooms_meta", bootstrapDiag.bootstrapLiteRoomsMetaFetchMs],
    ["participants_join", bootstrapDiag.bootstrapLiteParticipantsJoinMs],
    ["last_message", bootstrapDiag.bootstrapLiteLastMessageFetchMs],
    ["payload_map", bootstrapDiag.bootstrapLiteRoomPayloadMapMs],
  ];
  let slowestStage = "room_ids_rpc";
  let slowestMs = -1;
  for (const [name, ms] of stages) {
    if (ms > slowestMs) {
      slowestMs = ms;
      slowestStage = name;
    }
  }
  bootstrapDiag.bootstrapLiteRoomsQuerySlowestStage = slowestStage;
  bootstrapDiag.bootstrapLiteRoomsQuerySlowestMs = Math.max(0, slowestMs);
}

/** participant-only room id 목록이 최근순이 아닐 때 round2 전에 last_message_at 기준으로 자른다 */
async function narrowRoomIdsByLastMessageAtForRoomLimit(
  sb: SupabaseLike,
  roomIds: string[],
  limit: number,
  diagnostics?: CommunityMessengerBootstrapRoomsDiagnostics
): Promise<string[]> {
  const ids = dedupeIds(roomIds);
  if (ids.length <= limit) return ids;
  const metas: Array<{ id: string; lastAt: string }> = [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK) {
    chunks.push(ids.slice(i, i + COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK));
  }
  if (diagnostics) {
    diagnostics.rounds += 1;
    diagnostics.queryCount += chunks.length;
    diagnostics.metaChunkCount = chunks.length;
  }
  const tMeta = performance.now();
  const metaChunks = await Promise.all(
    chunks.map((chunk) =>
      (sb as any).from("community_messenger_rooms").select("id, last_message_at").in("id", chunk)
    )
  );
  if (diagnostics) {
    diagnostics.transformMs += Math.round(performance.now() - tMeta);
  }
  for (const { data: metaRows } of metaChunks) {
    for (const row of (metaRows ?? []) as Array<{ id?: string; last_message_at?: string | null }>) {
      const id = trimText(row.id);
      if (!id) continue;
      metas.push({ id, lastAt: trimText(row.last_message_at) || "" });
    }
  }
  metas.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return metas.slice(0, limit).map((m) => m.id);
}

export type CommunityMessengerBootstrapDiagnostics = {
  parallelInitialWallMs: number;
  roomsQueryMs: number;
  roomsQueryRound1Ms: number;
  roomsQueryRound2Ms: number;
  roomsQueryRound2RoomsMs: number;
  roomsQueryRound2RoomsDbFetchMs: number;
  roomsQueryRound2RoomsNormalizeMs: number;
  roomsQueryRound2RoomsMergeMapMs: number;
  roomsQueryRound2RoomsHydrateLabelMs: number;
  roomsQueryRound2RoomsPayloadSerializeMs: number;
  roomsQueryRound2ParticipantsMs: number;
  roomsQueryRound3Ms: number;
  roomsQueryTransformMs: number;
  roomsQueryPostprocessMs: number;
  unreadMs: number;
  profilesMs: number;
  tradeContextMs: number;
  callsLogMs: number;
  transformMs: number;
  roomCount: number;
  participantCount: number;
  roomsQueryRound1RoomIdCount: number;
  roomsQueryRound2RoomRowCount: number;
  roomsQueryRound2ParticipantRowCount: number;
  roomsQueryRound3RoomProfileCount: number;
  unreadAggregation: string;
  roomsQueryRounds: number;
  additionalLookupRounds: number;
  extraRoomsFetchRounds: number;
  hasPerRoomNPlusOne: boolean;
  callsLogIncluded: boolean;
  discoverableIncluded: boolean;
  /** `fetchMyRoomsPayload` 내부 PostgREST/RPC 왕복 추정(rooms diagnostics.queryCount) */
  roomsPayloadDbRoundTrips: number;
  /** 병렬 초기 묶음 — 수락 친구 행 단일 SELECT */
  parallelAcceptedFriendsBundleMs: number;
  parallelFavoriteFriendsMs: number;
  parallelFollowingNeighborMs: number;
  parallelFollowingHiddenMs: number;
  parallelFollowingBlockedMs: number;
  parallelFriendRequestsMs: number;
  parallelDiscoverableFetchMs: number;
  /** `fetchCallLogRowsOnly` 단독 */
  callsLogRowsFetchMs: number;
  parallelMeetingsForDiscoverableMs: number;
  enrichTradeDirectKeysMs: number;
  enrichTradeSellerHydrateMs: number;
  enrichTradeMiddlePipelineMs: number;
  /** bootstrap trade enrich 분해 — `[cm-bootstrap-breakdown]` 전용(응답 shape 무관) */
  enrichTradePostsFetchMs: number;
  enrichTradeCategoryFetchMs: number;
  enrichTradeCpuMergeMs: number;
  enrichTradeNormalizeMs: number;
  /** lite/fast 의도와 달리 full category·posts fallback·Phase D 등이 실행된 벽시계 합 */
  enrichTradeHiddenFallbackMs: number;
  /** true = lite fast path( mega direct_keys + critical posts + fallback_only category ) */
  bootstrapLiteTradeEnrichFastPath: boolean;
  /**
   * lite tier 거래 분류 parity — fast-path 이후 critical/full 과 동일한
   * `enrichTradeRoomClassificationForDeferredHomeSync`(peer-pair/product_chats) 벽시계.
   * critical `criticalTradeClassificationMs` 와 동일 의미(관측 전용, optional).
   */
  bootstrapLiteTradeClassificationMs?: number;
  /** true = Phase A–D 중개 파이프라인을 생략(direct_keys·seller 만 또는 조기 종료) */
  bootstrapLiteTradeHeavyPipelineSkipped: boolean;
  /** direct_keys 직전 trade 목록 heavy 후보 수 */
  bootstrapLiteHeavyTargetCountBefore: number;
  /** direct_keys 직후 first-paint 미충족 trade 방 수 */
  bootstrapLiteHeavyTargetCountAfterDirectKeys: number;
  /** 미충족 사유 상위(콤마 구분, 로그 전용) */
  bootstrapLiteHeavyTargetReasonsTop: string;
  /** lite missing-only posts 배치 벽시계 */
  bootstrapLiteMissingOnlyBatchMs: number;
  /** true = Phase A–C legacy middle 미실행 */
  bootstrapLiteMiddlePipelineBlocked: boolean;
  /** postId 없어 background hydration 으로 미룬 trade 방 수 */
  bootstrapLiteDeferredHydrationCount: number;
  /** lite: `home_sync_direct_keys_critical_bundle` RPC 벽시계(leader) */
  bootstrapLiteDirectKeysMegaRpcMs: number;
  /** lite: mega 프로세스 캐시 — `row_cache_hit` | `row_cache_singleflight_join` | `rpc_cold` */
  bootstrapLiteDirectKeysMegaCacheReason: string;
  /** lite: enrich 에서 prefetch Promise 대기 벽시계(0 이면 parallel 구간에서 완료) */
  bootstrapLiteDirectKeysPrefetchWaitMs: number;
  /** lite: mega JSON 파싱+맵+apply 루프 CPU 근사 */
  bootstrapLiteDirectKeysParseApplyMs: number;
  /** lite: PostgREST 클라이언트 대기 추정(RPC − 서버는 분리 불가 시 동일) */
  bootstrapLiteDirectKeysMegaNetworkMs: number;
  /** `getCommunityMessengerBootstrap` 진입~반환 벽시계 (측정 전용) */
  bootstrapMonolithWallMs: number;
  /** lite parallel 분해 — `[cm-bootstrap-v2]` / `[cm-bootstrap-breakdown]` */
  bootstrapLiteRoomsFetchMs: number;
  bootstrapLiteFriendsFetchMs: number;
  bootstrapLiteRequestsFetchMs: number;
  bootstrapLiteFavoriteFetchMs: number;
  bootstrapLiteDiscoverableFetchMs: number;
  bootstrapLiteMeetingsFetchMs: number;
  bootstrapLiteParallelSlowestStage: string;
  bootstrapLiteParallelSlowestMs: number;
  /** lite 소셜 그래프 출처 — `cache` | `empty` | `full_fetch` | `n/a` */
  bootstrapLiteSocialGraphSource: string;
  bootstrapLiteRoomIdsRpcMs: number;
  bootstrapLiteRoomsMetaFetchMs: number;
  bootstrapLiteParticipantsJoinMs: number;
  bootstrapLiteLastMessageFetchMs: number;
  bootstrapLiteRoomPayloadMapMs: number;
  bootstrapLiteRoomsQuerySlowestStage: string;
  bootstrapLiteRoomsQuerySlowestMs: number;
  bootstrapLiteRoomsRpcCacheHit: boolean;
  bootstrapLiteRoomsCacheBypass: boolean;
  bootstrapLiteRoomCount: number;
  bootstrapLiteParticipantCount: number;
  bootstrapLiteRoomsFetchPath: string;
  /** lite first paint — bundle `profile_labels` 임베드 수 */
  bootstrapLiteProfilesBundleEmbeddedCount: number;
  /** lite first paint — 추가 `profiles.in` 대상 수 */
  bootstrapLiteProfilesMissFetchCount: number;
  /** lite first paint — `hydrateProfilesLabelsOnlyWithMap` 벽시계( miss fetch 포함) */
  bootstrapLiteProfilesFetchMs: number;
};

/** 메신저 홈·부트스트랩에서 한 번에 실을 최대 방 수(최근 활동순). 초과분은 목록에서 제외(방 URL 직접 진입은 `getCommunityMessengerRoomSnapshot` 등 별도). */
const COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP = 500;
/** `id in (…)` 메타 조회 시 PostgREST URL 부담을 줄이기 위한 청크 크기 */
const COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK = 120;

type BootstrapRoomIdRpcRow = {
  room_id?: string | null;
  last_message_at?: string | null;
  membership_total_count?: number | null;
};

type BootstrapRoomRowRpc = {
  id?: string | null;
  room_type?: RoomRow["room_type"] | null;
  room_status?: RoomRow["room_status"] | null;
  is_readonly?: boolean | null;
  title?: string | null;
  summary?: string | null;
  avatar_url?: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_type?: RoomRow["last_message_type"] | null;
  direct_key?: string | null;
};

async function fetchBootstrapRoomIdsViaRpc(
  sb: SupabaseLike,
  userId: string,
  /** 미지정 시 부트스트랩 상한 500 — home-sync 는 20~30 등으로 줄여 DB 정렬·LIMIT 를 RPC 안에서 수행 */
  rpcRoomLimit?: number
): Promise<{ roomIds: string[]; totalCount: number } | null> {
  const pLimit =
    typeof rpcRoomLimit === "number" && rpcRoomLimit > 0
      ? Math.min(rpcRoomLimit, COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP)
      : COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP;
  const { data, error } = await (sb as any).rpc("community_messenger_bootstrap_my_room_ids", {
    p_user_id: userId,
    p_limit: pLimit,
  });
  if (error) {
    if (isMissingRpcFunctionError(error) || isMissingTableError(error)) return null;
    throw error;
  }
  const rows = (data ?? []) as BootstrapRoomIdRpcRow[];
  const roomIds = dedupeIds(rows.map((row) => String(row.room_id ?? "")).filter(Boolean));
  const totalCountRaw = rows[0]?.membership_total_count;
  const totalCount =
    typeof totalCountRaw === "number" && Number.isFinite(totalCountRaw)
      ? totalCountRaw
      : roomIds.length;
  return { roomIds, totalCount };
}

async function attachDirectKeysToRoomRows(sb: SupabaseLike, rows: RoomRow[]): Promise<RoomRow[]> {
  const ids = dedupeIds(rows.map((r) => trimText(r.id)).filter(Boolean));
  if (!ids.length) return rows;
  const { data, error } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id, direct_key")
    .in("id", ids);
  if (error || !data) return rows;
  const byId = new Map(
    (data as Array<{ id?: unknown; direct_key?: unknown }>).map((x) => [
      trimText(x.id),
      (typeof x.direct_key === "string" ? x.direct_key.trim() : null) as string | null,
    ])
  );
  return rows.map((r) => {
    const dk = byId.get(trimText(r.id));
    if (dk === undefined) return r;
    return { ...r, direct_key: dk };
  });
}

async function fetchBootstrapRoomsViaRpc(
  sb: SupabaseLike,
  roomIds: string[]
): Promise<RoomRow[] | null> {
  const { data, error } = await (sb as any).rpc("community_messenger_bootstrap_rooms", {
    p_room_ids: roomIds,
  });
  if (error) {
    if (isMissingRpcFunctionError(error) || isMissingTableError(error)) return null;
    throw error;
  }
  const rawList = (data ?? []) as BootstrapRoomRowRpc[];
  const rpcIncludesDirectKeyColumn =
    rawList.length === 0 ||
    Object.prototype.hasOwnProperty.call(rawList[0] as object, "direct_key");
  const mapped = rawList.map((row) => ({
    id: String(row.id ?? ""),
    room_type: (row.room_type ?? "direct") as RoomRow["room_type"],
    room_status: (row.room_status ?? "active") as RoomRow["room_status"],
    is_readonly: row.is_readonly === true,
    title: row.title ?? null,
    summary: row.summary ?? null,
    avatar_url: row.avatar_url ?? null,
    created_by: null,
    direct_key:
      row.direct_key != null && typeof row.direct_key === "string"
        ? row.direct_key.trim() || null
        : row.direct_key != null
          ? String(row.direct_key).trim() || null
          : null,
    last_message: row.last_message ?? null,
    last_message_at: row.last_message_at ?? null,
    last_message_type: (row.last_message_type ?? "text") as RoomRow["last_message_type"],
  }));
  return rpcIncludesDirectKeyColumn ? mapped : attachDirectKeysToRoomRows(sb, mapped);
}

type BootstrapLiteRoomsBundleRpcJson = {
  membership_total_count?: number | null;
  room_ids?: string[] | null;
  rooms?: Array<{
    id?: string | null;
    room_type?: string | null;
    room_status?: string | null;
    is_readonly?: boolean | null;
    direct_key?: string | null;
    title?: string | null;
    last_message?: string | null;
    last_message_at?: string | null;
    last_message_type?: string | null;
  }> | null;
  participants?: Array<{
    room_id?: string | null;
    user_id?: string | null;
    unread_count?: number | null;
    is_muted?: boolean | null;
    is_pinned?: boolean | null;
    is_archived?: boolean | null;
  }> | null;
  profile_labels?: Record<string, unknown> | null;
};

async function fetchBootstrapLiteMyRoomsBundleViaRpc(
  sb: SupabaseLike,
  userId: string,
  roomLimit?: number
): Promise<{
  totalCount: number;
  roomIds: string[];
  roomRows: RoomRow[];
  participantRows: ParticipantRow[];
  profileLabels: Map<string, ProfileRow>;
  roomsParseMs: number;
  participantsParseMs: number;
  profilesParseMs: number;
} | null> {
  const pLimit =
    typeof roomLimit === "number" && roomLimit > 0
      ? Math.min(roomLimit, COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP)
      : COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP;
  const { data, error } = await (sb as any).rpc("community_messenger_bootstrap_lite_my_rooms_bundle", {
    p_user_id: userId,
    p_limit: pLimit,
  });
  if (error) {
    if (isMissingRpcFunctionError(error) || isMissingTableError(error)) return null;
    throw error;
  }
  const raw = (typeof data === "string" ? JSON.parse(data) : data) as BootstrapLiteRoomsBundleRpcJson | null;
  if (!raw || typeof raw !== "object") return null;
  const totalCount =
    typeof raw.membership_total_count === "number" && Number.isFinite(raw.membership_total_count)
      ? raw.membership_total_count
      : 0;
  const roomIds = dedupeIds(
    (Array.isArray(raw.room_ids) ? raw.room_ids : []).map((id) => String(id ?? "")).filter(Boolean)
  );
  const tRoomsParse = performance.now();
  const roomRows: RoomRow[] = (Array.isArray(raw.rooms) ? raw.rooms : []).map((row) => ({
    id: String(row.id ?? ""),
    room_type: (row.room_type ?? "direct") as RoomRow["room_type"],
    room_status: (row.room_status ?? "active") as RoomRow["room_status"],
    is_readonly: row.is_readonly === true,
    title: row.title ?? null,
    summary: null,
    avatar_url: null,
    created_by: null,
    direct_key:
      row.direct_key != null && typeof row.direct_key === "string"
        ? row.direct_key.trim() || null
        : row.direct_key != null
          ? String(row.direct_key).trim() || null
          : null,
    last_message: row.last_message ?? null,
    last_message_at: row.last_message_at ?? null,
    last_message_type: (row.last_message_type ?? "text") as RoomRow["last_message_type"],
  }));
  const roomsParseMs = performance.now() - tRoomsParse;
  const tPartsParse = performance.now();
  const participantRows: ParticipantRow[] = (Array.isArray(raw.participants) ? raw.participants : []).map(
    (row) => {
      const roomId = String(row.room_id ?? "");
      const userId = String(row.user_id ?? "");
      return {
        id: `${roomId}:${userId}`,
        room_id: roomId,
        user_id: userId,
        role: "member" as const,
        unread_count: Number(row.unread_count ?? 0),
        is_muted: row.is_muted === true,
        is_pinned: row.is_pinned === true,
        is_archived: row.is_archived === true,
        joined_at: null,
      };
    }
  );
  const participantsParseMs = performance.now() - tPartsParse;
  const tProfilesParse = performance.now();
  const profileLabels = parseBootstrapLiteBundleProfileLabels(raw.profile_labels);
  const profilesParseMs = performance.now() - tProfilesParse;
  return {
    totalCount: totalCount || roomIds.length,
    roomIds,
    roomRows,
    participantRows,
    profileLabels,
    roomsParseMs,
    participantsParseMs,
    profilesParseMs,
  };
}

/** home-sync critical — DB select 최소(응답 필드는 summarize·hydrate 로 동일 표면 유지) */
const HOME_SYNC_CRITICAL_ROOMS_SELECT =
  "id, room_type, room_status, is_readonly, direct_key, title, last_message, last_message_at, last_message_type, chat_domain, domain_identity";

export async function fetchMyRoomsPayload(
  userId: string,
  options?: {
    diagnostics?: CommunityMessengerBootstrapRoomsDiagnostics;
    includeRoomProfiles?: boolean;
    /** round2 이전에 room id 개수 상한 — 최근 활동 우선(RPC·메타정렬 경로는 slice, 그 외는 메타 조회 후 자름) */
    roomLimit?: number;
    /** home-sync critical — summary/avatar 등 무거운 room 컬럼 select 생략 */
    criticalSlimRoomSelect?: boolean;
    /** `?lite=1` — `community_messenger_bootstrap_lite_my_rooms_bundle` 1RTT (RPC 없으면 legacy round1+2) */
    bootstrapLiteBundle?: boolean;
  }
): Promise<MessengerRoomsPayload> {
  const tPayload0 = performance.now();
  const diagnostics = options?.diagnostics;
  const includeRoomProfiles = options?.includeRoomProfiles !== false;
  const criticalSlimRoomSelect = options?.criticalSlimRoomSelect === true;
  const bootstrapLiteBundle = options?.bootstrapLiteBundle === true;
  const roomsTableSelect = criticalSlimRoomSelect
    ? HOME_SYNC_CRITICAL_ROOMS_SELECT
    : "id, room_type, room_status, is_readonly, direct_key, title, summary, avatar_url, last_message, last_message_at, last_message_type, chat_domain, domain_identity";
  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];
  let bootstrapLiteProfileLabels: Map<string, ProfileRow> | undefined;
  let liteBundleLoaded = false;

  if (sb && bootstrapLiteBundle) {
    const tBundleRpc = performance.now();
    const bundle = await fetchBootstrapLiteMyRoomsBundleViaRpc(sb, userId, options?.roomLimit);
    const bundleRpcMs = Math.round(performance.now() - tBundleRpc);
    if (bundle) {
      liteBundleLoaded = true;
      roomRows = bundle.roomRows;
      participantRows = bundle.participantRows;
      bootstrapLiteProfileLabels = bundle.profileLabels;
      if (diagnostics) {
        diagnostics.liteBundleUsed = true;
        diagnostics.liteBundleRpcMs = bundleRpcMs;
        diagnostics.liteBundleRoomsParseMs = Math.round(bundle.roomsParseMs);
        diagnostics.liteBundleParticipantsParseMs = Math.round(bundle.participantsParseMs);
        diagnostics.liteBundleProfilesParseMs = Math.round(bundle.profilesParseMs);
        const nowSeed = Date.now();
        for (const [id, row] of bundle.profileLabels) {
          profileIdRowCache.set(id, { expiresAt: nowSeed + PROFILE_ID_ROW_TTL_MS, row });
        }
        pruneByExpiresAtAndMaxSize(profileIdRowCache, nowSeed, 4_000);
        diagnostics.rounds = 1;
        diagnostics.queryCount = 1;
        diagnostics.round1Ms = bundleRpcMs;
        diagnostics.round2Ms = 0;
        diagnostics.round2RoomsDbFetchMs = diagnostics.liteBundleRoomsParseMs;
        diagnostics.round2ParticipantsMs = diagnostics.liteBundleParticipantsParseMs;
        diagnostics.roomIdsBeforeCap = bundle.totalCount;
        diagnostics.round1RoomIdCount = bundle.totalCount;
        diagnostics.roomIdsAfterCap = bundle.roomIds.length;
        diagnostics.round2RoomRowCount = roomRows.length;
        diagnostics.round2ParticipantRowCount = participantRows.length;
      }
      if (diagnostics) {
        diagnostics.liteRoomsFetchPath = "bundle_rpc";
      }
      if (homeSyncBreakdownEnabled() && diagnostics) {
        logHomeSyncBreakdown("bootstrap_lite_my_rooms_bundle_rpc_ms", bundleRpcMs, { ok: true });
      }
    }
  }

  if (sb && !liteBundleLoaded) {
    if (diagnostics && bootstrapLiteBundle) {
      diagnostics.liteRoomsFetchPath = "legacy";
    }
    let roomIdResolution: "rpc" | "fallback_meta_sorted" | "fallback_participant_raw" = "fallback_participant_raw";
    diagnostics && (diagnostics.rounds += 1);
    diagnostics && (diagnostics.queryCount += 1);
    const tRound1 = performance.now();
    let roomIds: string[] = [];
    const tRpcIds = performance.now();
    const rpcRoomIds = await fetchBootstrapRoomIdsViaRpc(sb, userId, options?.roomLimit);
    if (homeSyncBreakdownEnabled() && diagnostics) {
      logHomeSyncBreakdown("my_rooms_rpc_bootstrap_my_room_ids_ms", performance.now() - tRpcIds, {
        ok: Boolean(rpcRoomIds),
      });
    }
    if (rpcRoomIds) {
      roomIdResolution = "rpc";
      roomIds = rpcRoomIds.roomIds;
      if (diagnostics) {
        diagnostics.roomIdsBeforeCap = rpcRoomIds.totalCount;
        diagnostics.round1RoomIdCount = rpcRoomIds.totalCount;
        diagnostics.roomIdsAfterCap = roomIds.length;
      }
    } else {
      const tFallbackP = performance.now();
      const { data: myParticipants, error: myParticipantsError } = await (sb as any)
        .from("community_messenger_participants")
        .select("room_id")
        .eq("user_id", userId);
      if (homeSyncBreakdownEnabled() && diagnostics) {
        logHomeSyncBreakdown("my_rooms_fallback_participants_room_ids_ms", performance.now() - tFallbackP, {});
      }
      if (!myParticipantsError || !isMissingTableError(myParticipantsError)) {
        roomIds = dedupeIds(
          ((myParticipants ?? []) as Array<{ room_id?: string | null }>).map((row) => String(row.room_id ?? ""))
        );
        if (diagnostics) diagnostics.roomIdsBeforeCap = roomIds.length;
        if (diagnostics) diagnostics.round1RoomIdCount = roomIds.length;
        if (roomIds.length > COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP) {
          roomIdResolution = "fallback_meta_sorted";
          const metas: Array<{ id: string; lastAt: string }> = [];
          const chunks: string[][] = [];
          for (let i = 0; i < roomIds.length; i += COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK) {
            chunks.push(roomIds.slice(i, i + COMMUNITY_MESSENGER_ROOM_IDS_META_CHUNK));
          }
          if (diagnostics) {
            diagnostics.rounds += 1;
            diagnostics.queryCount += chunks.length;
            diagnostics.metaChunkCount = chunks.length;
          }
          const tTransform = performance.now();
          const metaChunks = await Promise.all(
            chunks.map((chunk) =>
              (sb as any)
                .from("community_messenger_rooms")
                .select("id, last_message_at")
                .in("id", chunk)
            )
          );
          if (homeSyncBreakdownEnabled() && diagnostics) {
            logHomeSyncBreakdown("my_rooms_meta_chunks_parallel_wall_ms", performance.now() - tTransform, {
              chunkCount: chunks.length,
            });
          }
          for (const { data: metaRows } of metaChunks) {
            for (const row of (metaRows ?? []) as Array<{ id?: string; last_message_at?: string | null }>) {
              const id = trimText(row.id);
              if (!id) continue;
              metas.push({ id, lastAt: trimText(row.last_message_at) || "" });
            }
          }
          metas.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
          roomIds = metas.slice(0, COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP).map((m) => m.id);
          diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransform));
        }
        if (diagnostics) diagnostics.roomIdsAfterCap = roomIds.length;
      }
    }

    const roomLimitOpt = options?.roomLimit;
    if (typeof roomLimitOpt === "number" && roomLimitOpt > 0 && roomIds.length > roomLimitOpt) {
      if (roomIdResolution === "rpc" || roomIdResolution === "fallback_meta_sorted") {
        roomIds = roomIds.slice(0, roomLimitOpt);
      } else {
        roomIds = await narrowRoomIdsByLastMessageAtForRoomLimit(sb, roomIds, roomLimitOpt, diagnostics);
      }
      if (diagnostics) {
        diagnostics.roomIdsAfterCap = roomIds.length;
      }
    }

    diagnostics && (diagnostics.round1Ms = Math.round(performance.now() - tRound1));
    if (messengerPerfStepsEnabled()) {
      logMessengerPerfMs("room_ids_fetch", performance.now() - tRound1);
    }

    if (roomIds.length) {
      diagnostics && (diagnostics.rounds += 1);
      diagnostics && (diagnostics.queryCount += 2);
      const tRound2 = performance.now();
      const roomsPromise = (async () => {
        const tRoomsTotal = performance.now();
        const tRoomsQuery = performance.now();
        /** lite: `bootstrap_rooms` RPC(summary·avatar 포함) 생략 — slim select 1RTT */
        const rpcRows =
          bootstrapLiteBundle ? null : await fetchBootstrapRoomsViaRpc(sb, roomIds);
        const roomRowsRaw =
          rpcRows ??
          (((await (sb as any)
            .from("community_messenger_rooms")
            .select(roomsTableSelect)
            .in("id", roomIds)
            .order("last_message_at", { ascending: false })).data ?? []) as RoomRow[]);
        diagnostics && (diagnostics.round2RoomsDbFetchMs = Math.round(performance.now() - tRoomsQuery));
        const tRoomsNormalize = performance.now();
        const normalizedRooms = roomRowsRaw.map((row) => row);
        diagnostics && (diagnostics.round2RoomsNormalizeMs = Math.round(performance.now() - tRoomsNormalize));
        diagnostics && (diagnostics.round2RoomsMs = Math.round(performance.now() - tRoomsTotal));
        return normalizedRooms;
      })();
      const participantsPromise = (async () => {
        const tParticipantsQuery = performance.now();
        const result = await (sb as any)
          .from("community_messenger_participants")
          .select("room_id, user_id, unread_count, is_muted, is_pinned, is_archived")
          .in("room_id", roomIds);
        diagnostics && (diagnostics.round2ParticipantsMs = Math.round(performance.now() - tParticipantsQuery));
        return result;
      })();
      const [rooms, { data: participants }] = await Promise.all([roomsPromise, participantsPromise]);
      diagnostics && (diagnostics.round2Ms = Math.round(performance.now() - tRound2));
      if (messengerPerfStepsEnabled()) {
        const r2Wall = performance.now() - tRound2;
        logMessengerPerfMs("round2_parallel_wall", r2Wall);
        if (diagnostics) {
          logMessengerPerfMs("rooms_meta_fetch", diagnostics.round2RoomsDbFetchMs);
          logMessengerPerfMs("participants_join", diagnostics.round2ParticipantsMs);
          logMessengerPerfMs("last_message_fetch", diagnostics.round2RoomsDbFetchMs);
        }
      }
      roomRows = rooms;
      participantRows = (participants ?? []) as ParticipantRow[];
      if (diagnostics) {
        diagnostics.round2RoomRowCount = roomRows.length;
        diagnostics.round2ParticipantRowCount = participantRows.length;
      }
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    let roomIds = dedupeIds(dev.participants.filter((row) => row.userId === userId).map((row) => row.roomId));
    const devRoomCap =
      typeof options?.roomLimit === "number" && options.roomLimit > 0
        ? Math.min(COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP, options.roomLimit)
        : COMMUNITY_MESSENGER_MY_ROOMS_LIST_CAP;
    roomRows = dev.rooms
      .filter((room) => roomIds.includes(room.id))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .slice(0, devRoomCap);
    roomIds = roomRows.map((room) => room.id);
    participantRows = dev.participants.filter((row) => roomIds.includes(row.roomId));
  }

  const tPostprocess = performance.now();
  const byRoomId = buildParticipantsByRoomMap(participantRows);
  const postprocessMs = Math.round(performance.now() - tPostprocess);
  diagnostics && (diagnostics.postprocessMs = postprocessMs);
  if (diagnostics?.liteBundleUsed) {
    diagnostics.liteBundleMapMs = postprocessMs;
  }
  if (messengerPerfStepsEnabled()) {
    logMessengerPerfMs("final_map", performance.now() - tPostprocess);
    logMessengerPerfMs("unread_calc", 0);
    logMessengerPerfMs("peer_read_cursor", 0);
    logMessengerPerfMs("trade_join", 0);
  }
  if (includeRoomProfiles && roomRows.length && diagnostics) {
    diagnostics.rounds += 1;
    diagnostics.queryCount += 1;
  }
  let roomProfileMap = new Map<string, RoomProfileRow | DevRoomProfile>();
  if (includeRoomProfiles && roomRows.length) {
    const tRound3 = performance.now();
    roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
    diagnostics && (diagnostics.round3Ms = Math.round(performance.now() - tRound3));
    diagnostics && (diagnostics.round3RoomProfileCount = roomProfileMap.size);
  }
  if (messengerPerfStepsEnabled()) {
    logMessengerPerfMs("fetchMyRoomsPayload", performance.now() - tPayload0);
  }
  return { roomRows, participantRows, byRoomId, roomProfileMap, bootstrapLiteProfileLabels };
}

async function fetchRoomsPayloadByRoomIds(
  roomIds: string[],
  /** `POST trade-chat-list-meta` 등 — rooms+participants 병렬 vs room 프로필 조회 RTT 분리 */
  roomFetchTimings?: {
    roomsParticipantsParallelMs?: number;
    roomProfilesFetchMs?: number;
    /** rooms+participants 와 room_profiles in(...) 을 한 벽시계로 겹친 구간 */
    roomsProfilesParallelWallMs?: number;
  }
): Promise<MessengerRoomsPayload> {
  const uniqueRoomIds = dedupeIds(roomIds);
  if (!uniqueRoomIds.length) {
    return {
      roomRows: [],
      participantRows: [],
      byRoomId: new Map(),
      roomProfileMap: new Map(),
    };
  }

  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];
  let roomProfileMap = new Map<string, RoomProfileRow | DevRoomProfile>();

  if (sb) {
    const tWall0 = roomFetchTimings ? performance.now() : 0;
    const [rpBlock, profMap] = await Promise.all([
      (async (): Promise<{ rr: Array<RoomRow | DevRoom>; pr: Array<ParticipantRow | DevParticipant> }> => {
        const tRp = roomFetchTimings ? performance.now() : 0;
        const [{ data: rooms, error: roomsError }, { data: participants }] = await Promise.all([
          (sb as any)
            .from("community_messenger_rooms")
            .select(
              "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, direct_key, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, pinned_message_id, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type, chat_domain, domain_identity"
            )
            .in("id", uniqueRoomIds),
          (sb as any)
            .from("community_messenger_participants")
            .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at")
            .in("room_id", uniqueRoomIds),
        ]);
        if (roomFetchTimings) {
          roomFetchTimings.roomsParticipantsParallelMs = performance.now() - tRp;
        }
        let rr: Array<RoomRow | DevRoom> = [];
        let pr: Array<ParticipantRow | DevParticipant> = [];
        if (!roomsError || !isMissingTableError(roomsError)) {
          rr = (rooms ?? []) as RoomRow[];
          pr = (participants ?? []) as ParticipantRow[];
        }
        return { rr, pr };
      })(),
      (async (): Promise<Map<string, RoomProfileRow | DevRoomProfile>> => {
        const tP = roomFetchTimings ? performance.now() : 0;
        const m = await fetchRoomProfilesByRoomIds(uniqueRoomIds);
        if (roomFetchTimings) {
          roomFetchTimings.roomProfilesFetchMs = performance.now() - tP;
        }
        return m;
      })(),
    ]);
    roomRows = rpBlock.rr;
    participantRows = rpBlock.pr;
    roomProfileMap = profMap;
    if (roomFetchTimings) {
      roomFetchTimings.roomsProfilesParallelWallMs = performance.now() - tWall0;
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    roomRows = dev.rooms.filter((room) => uniqueRoomIds.includes(room.id));
    participantRows = dev.participants.filter((participant) => uniqueRoomIds.includes(participant.roomId));
  }

  const byRoomId = buildParticipantsByRoomMap(participantRows);
  if (!sb && roomRows.length) {
    const tProf = roomFetchTimings ? performance.now() : 0;
    roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
    if (roomFetchTimings) {
      roomFetchTimings.roomProfilesFetchMs = performance.now() - tProf;
    }
  }
  return { roomRows, participantRows, byRoomId, roomProfileMap };
}

async function loadRoomSummaryMap(
  userId: string,
  roomIds: string[]
): Promise<Map<string, CommunityMessengerRoomSummary>> {
  const uniqueRoomIds = dedupeIds(roomIds);
  const result = new Map<string, CommunityMessengerRoomSummary>();
  if (!uniqueRoomIds.length) return result;

  const payload = await fetchRoomsPayloadByRoomIds(uniqueRoomIds);
  const summaries = await summarizeRoomsBatch(
    userId,
    payload.roomRows,
    payload.participantRows,
    payload.roomProfileMap,
    payload.byRoomId
  );
  for (const summary of summaries) {
    result.set(summary.id, summary);
  }
  return result;
}

/** 홈 `homeRoomIds` 청크 밖 방 — 단일 `CommunityMessengerRoomSummary` (목록 끼워넣기·실시간 보강용). */
export async function getCommunityMessengerSingleRoomSummaryForViewer(
  viewerUserId: string,
  roomId: string
): Promise<CommunityMessengerRoomSummary | null> {
  const rid = trimText(roomId);
  if (!rid) return null;
  const payload = await fetchRoomsPayloadByRoomIds([rid]);
  if (!payload.roomRows.length) return null;
  const roomParticipants = payload.byRoomId.get(rid) ?? [];
  if (!roomParticipants.some((p) => participantRowUserId(p) === viewerUserId)) return null;
  const summaries = await summarizeRoomsBatch(
    viewerUserId,
    payload.roomRows,
    payload.participantRows,
    payload.roomProfileMap,
    payload.byRoomId
  );
  const summary = summaries[0];
  if (!summary) return null;
  await enrichTradeRoomContextMetaForBootstrap(viewerUserId, [summary], undefined, undefined);
  const sbUnread = getSupabaseOrNull();
  if (sbUnread) {
    await enrichMessengerTradeUnreadWithLegacyTrade(sbUnread as any, viewerUserId, [summary]).catch(() => {});
  }
  return summary;
}

const TRADE_CHAT_LIST_META_BATCH_CAP = 40;

/**
 * 거래 채팅 목록 전용 — 부트스트랩에 썸네일이 비어 있을 때 클라가 배치로 재조립한다.
 * `getCommunityMessengerSingleRoomSummaryForViewer` 와 동일한 요약 + `enrichTradeRoomContextMetaForBootstrap` 를 다방에 대해 1회만.
 */
export async function hydrateTradeChatListContextMetaForRoomIds(
  viewerUserId: string,
  roomIds: string[]
): Promise<{
  patches: Array<{ roomId: string; contextMeta: CommunityMessengerRoomContextMetaV1 | null }>;
  perf: Record<string, unknown>;
}> {
  const totalT0 = performance.now();
  const perf: Record<string, unknown> = {
    trade_chat_meta_room_count: 0,
    trade_chat_meta_auth_ms: 0,
  };
  const ids = dedupeIds(roomIds.map((x) => trimText(x)).filter(Boolean)).slice(0, TRADE_CHAT_LIST_META_BATCH_CAP);
  perf.trade_chat_meta_room_count = ids.length;
  if (!ids.length) {
    perf.trade_chat_meta_total_ms = Math.round(performance.now() - totalT0);
    perf.trade_chat_meta_top_bottleneck = "early_empty_room_ids";
    perf.trade_chat_meta_top_bottleneck_ms = 0;
    perf.trade_chat_meta_top_bottleneck_percent = 0;
    return { patches: [], perf };
  }
  const roomFetchTimings: {
    roomsParticipantsParallelMs?: number;
    roomProfilesFetchMs?: number;
    roomsProfilesParallelWallMs?: number;
  } = {};
  const tRooms = performance.now();
  const payload = await fetchRoomsPayloadByRoomIds(ids, roomFetchTimings);
  perf.trade_chat_meta_rooms_fetch_ms = Math.round(performance.now() - tRooms);
  perf.trade_chat_meta_rooms_participants_parallel_ms = Math.round(roomFetchTimings.roomsParticipantsParallelMs ?? 0);
  perf.trade_chat_meta_room_profiles_fetch_ms = Math.round(roomFetchTimings.roomProfilesFetchMs ?? 0);
  perf.trade_chat_meta_rooms_profiles_parallel_wall_ms = Math.round(roomFetchTimings.roomsProfilesParallelWallMs ?? 0);
  const rpMs = Number(perf.trade_chat_meta_rooms_participants_parallel_ms) || 0;
  const pfMs = Number(perf.trade_chat_meta_room_profiles_fetch_ms) || 0;
  const wallMs = Number(perf.trade_chat_meta_rooms_profiles_parallel_wall_ms) || 0;
  if (rpMs > 0 && pfMs > 0 && wallMs > 0) {
    perf.trade_chat_meta_rooms_profiles_parallel_saved_ms_approx = Math.max(0, Math.round(rpMs + pfMs - wallMs));
  }
  if (!payload.roomRows.length) {
    const patches = ids.map((roomId) => ({ roomId, contextMeta: null }));
    perf.trade_chat_meta_total_ms = Math.round(performance.now() - totalT0);
    perf.trade_chat_meta_summarize_ms = 0;
    perf.trade_chat_meta_enrich_total_ms = 0;
    perf.trade_chat_meta_posts_fetch_ms = 0;
    perf.trade_chat_meta_products_fetch_ms = 0;
    perf.trade_chat_meta_stores_fetch_ms = 0;
    perf.trade_chat_meta_profiles_fetch_ms = Math.round(roomFetchTimings.roomProfilesFetchMs ?? 0);
    perf.trade_chat_meta_merge_cpu_ms = 0;
    perf.trade_chat_meta_payload_build_ms = 0;
    perf.trade_chat_meta_query_count = 0;
    perf.trade_chat_meta_top_bottleneck = "trade_chat_meta_rooms_fetch_ms";
    perf.trade_chat_meta_top_bottleneck_ms = perf.trade_chat_meta_rooms_fetch_ms;
    perf.trade_chat_meta_top_bottleneck_percent =
      Number(perf.trade_chat_meta_total_ms) > 0
        ? Math.round((Number(perf.trade_chat_meta_top_bottleneck_ms) / Number(perf.trade_chat_meta_total_ms)) * 1000) / 10
        : 0;
    return { patches, perf };
  }
  const viewerTrim = trimText(viewerUserId);
  const tFilter = performance.now();
  const allowedRows = payload.roomRows.filter((row) => {
    const rid = trimText(row.id);
    const parts = payload.byRoomId.get(rid) ?? [];
    return parts.some((p) => participantRowUserId(p) === viewerTrim);
  });
  perf.trade_chat_meta_filter_allowed_cpu_ms = Math.round(performance.now() - tFilter);
  if (!allowedRows.length) {
    const patches = ids.map((roomId) => ({ roomId, contextMeta: null }));
    perf.trade_chat_meta_total_ms = Math.round(performance.now() - totalT0);
    perf.trade_chat_meta_summarize_ms = 0;
    perf.trade_chat_meta_enrich_total_ms = 0;
    perf.trade_chat_meta_posts_fetch_ms = 0;
    perf.trade_chat_meta_products_fetch_ms = 0;
    perf.trade_chat_meta_stores_fetch_ms = 0;
    perf.trade_chat_meta_profiles_fetch_ms = Math.round(roomFetchTimings.roomProfilesFetchMs ?? 0);
    perf.trade_chat_meta_merge_cpu_ms = 0;
    perf.trade_chat_meta_payload_build_ms = 0;
    perf.trade_chat_meta_query_count = 0;
    perf.trade_chat_meta_top_bottleneck = "trade_chat_meta_rooms_fetch_ms";
    perf.trade_chat_meta_top_bottleneck_ms = perf.trade_chat_meta_rooms_fetch_ms;
    perf.trade_chat_meta_top_bottleneck_percent =
      Number(perf.trade_chat_meta_total_ms) > 0
        ? Math.round((Number(perf.trade_chat_meta_top_bottleneck_ms) / Number(perf.trade_chat_meta_total_ms)) * 1000) / 10
        : 0;
    return { patches, perf };
  }
  const tSum = performance.now();
  const summaries = await summarizeRoomsBatch(
    viewerUserId,
    allowedRows,
    payload.participantRows,
    payload.roomProfileMap,
    payload.byRoomId
  );
  perf.trade_chat_meta_summarize_ms = Math.round(performance.now() - tSum);
  /** 합성 trace — `tier: critical` 으로 HS2 posts 단일 select·HS3 direct_keys mega 번들 경로를 home-sync critical 과 동일하게 재사용한다(응답 shape·메타 의미 동일). */
  const listMetaTrace: HomeSyncTrace = {
    token: "trade-chat-list-meta",
    tier: "critical",
    authSessionMs: 0,
    deepSteps: {},
  };
  const tEnrich = performance.now();
  await runWithTradeMetaRequestScope(() =>
    enrichTradeRoomContextMetaForBootstrap(viewerUserId, summaries, undefined, listMetaTrace, {
      tradeListMetaUltraLight: true,
    })
  );
  perf.trade_chat_meta_enrich_total_ms = Math.round(performance.now() - tEnrich);
  perf.trade_list_meta_ultra_light = 1;
  const te = listMetaTrace.deepSteps.tradeMetaEnrich;
  if (te) {
    perf.trade_chat_meta_posts_fetch_ms = te.tradePostsFetchMs;
    perf.trade_chat_meta_products_fetch_ms = te.categoryFetchMs;
    perf.trade_chat_meta_merge_cpu_ms = te.cpuMergeMs;
    const spd = te.tradePostsDetail;
    const cd = listMetaTrace.deepSteps.categoryFetchDetail;
    const postQ = typeof spd?.queryCount === "number" ? spd.queryCount : 0;
    const catQ =
      (typeof cd?.categoriesQueryCount === "number" ? cd.categoriesQueryCount : 0) +
      (typeof cd?.tradeCategoriesQueryCount === "number" ? cd.tradeCategoriesQueryCount : 0);
    perf.trade_chat_meta_query_count = 2 + 1 + postQ + catQ;
  } else {
    perf.trade_chat_meta_posts_fetch_ms = 0;
    perf.trade_chat_meta_products_fetch_ms = 0;
    perf.trade_chat_meta_merge_cpu_ms = 0;
    perf.trade_chat_meta_query_count = 2 + 1;
  }
  perf.trade_chat_meta_stores_fetch_ms = 0;
  perf.trade_chat_meta_profiles_fetch_ms =
    Math.round(roomFetchTimings.roomProfilesFetchMs ?? 0) + Math.round(Number(te?.sellerProfileAttachMs ?? 0));
  const phs = listMetaTrace.deepSteps.tradeListMetaProfileHydrateStats;
  if (phs) {
    Object.assign(perf, phs);
  }
  const br = listMetaTrace.deepSteps.tradeListMetaEnrichBootstrapBreakdown;
  const dkb = listMetaTrace.deepSteps.tradeDirectKeysListMetaBreakdown;
  if (dkb) {
    Object.assign(perf, dkb);
  }
  if (br) {
    Object.assign(perf, br);
    perf.enrich_total_ms = perf.trade_chat_meta_enrich_total_ms;
    perf.enrich_query_count = br.enrich_query_count_approx;
    perf.enrich_profile_attach_ms = Math.round(Number(te?.sellerProfileAttachMs ?? 0));
    perf.enrich_product_summary_ms = br.enrich_category_fetch_wall_ms;
    perf.enrich_reserved_state_ms = 0;
    perf.enrich_listing_state_ms = 0;
    perf.enrich_transition_state_ms = 0;
    perf.enrich_permissions_ms = 0;
    perf.enrich_room_patch_ms = 0;
    perf.enrich_cpu_ms = br.enrich_cpu_merge_tracked_ms;
  }
  const tMap = performance.now();
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const patches = ids.map((roomId) => ({
    roomId,
    contextMeta: byId.get(roomId)?.contextMeta ?? null,
  }));
  perf.trade_chat_meta_payload_build_ms = Math.round(performance.now() - tMap);
  perf.trade_chat_meta_total_ms = Math.round(performance.now() - totalT0);
  const bottleneckCandidates: Array<[string, number]> = [
    ["trade_chat_meta_rooms_fetch_ms", Number(perf.trade_chat_meta_rooms_fetch_ms) || 0],
    ["trade_chat_meta_summarize_ms", Number(perf.trade_chat_meta_summarize_ms) || 0],
    ["trade_chat_meta_enrich_total_ms", Number(perf.trade_chat_meta_enrich_total_ms) || 0],
    ["trade_chat_meta_posts_fetch_ms", Number(perf.trade_chat_meta_posts_fetch_ms) || 0],
    ["trade_chat_meta_products_fetch_ms", Number(perf.trade_chat_meta_products_fetch_ms) || 0],
    ["trade_chat_meta_profiles_fetch_ms", Number(perf.trade_chat_meta_profiles_fetch_ms) || 0],
    ["trade_chat_meta_payload_build_ms", Number(perf.trade_chat_meta_payload_build_ms) || 0],
  ];
  let topKey = bottleneckCandidates[0][0];
  let topMs = bottleneckCandidates[0][1];
  for (const [k, v] of bottleneckCandidates) {
    if (v > topMs) {
      topKey = k;
      topMs = v;
    }
  }
  perf.trade_chat_meta_top_bottleneck = topKey;
  perf.trade_meta_runtime_top_after = topKey;
  perf.trade_chat_meta_top_bottleneck_ms = Math.round(topMs);
  const tot = Number(perf.trade_chat_meta_total_ms) || 1;
  perf.trade_chat_meta_top_bottleneck_percent = Math.round((topMs / tot) * 1000) / 10;
  return { patches, perf };
}

type DiscoverableOpenGroupsRawState = MessengerRoomsPayload & { joinedRoomIds: Set<string> };

async function fetchDiscoverableOpenGroupsRawState(userId: string): Promise<DiscoverableOpenGroupsRawState> {
  const sb = getSupabaseOrNull();
  let roomRows: Array<RoomRow | DevRoom> = [];
  let participantRows: Array<ParticipantRow | DevParticipant> = [];
  let joinedRoomIds = new Set<string>();

  if (sb) {
    const [{ data: rooms, error: roomsError }, { data: myParticipants }] = await Promise.all([
      (sb as any)
        .from("community_messenger_rooms")
        .select(
          "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, pinned_message_id, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type"
        )
        .eq("room_type", "open_group")
        .eq("is_discoverable", true)
        .order("last_message_at", { ascending: false })
        .limit(50),
      (sb as any)
        .from("community_messenger_participants")
        .select("room_id")
        .eq("user_id", userId),
    ]);
    if (!roomsError || !isMissingTableError(roomsError)) {
      roomRows = (rooms ?? []) as RoomRow[];
      const roomIdList = dedupeIds(roomRows.map((room) => room.id));
      if (roomIdList.length) {
        const { data: participants } = await (sb as any)
          .from("community_messenger_participants")
          .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at")
          .in("room_id", roomIdList);
        participantRows = (participants ?? []) as ParticipantRow[];
      }
      joinedRoomIds = new Set(
        ((myParticipants ?? []) as Array<{ room_id?: string | null }>)
          .map((row) => trimText(row.room_id))
          .filter(Boolean)
      );
    }
  }

  if (!roomRows.length) {
    const dev = getDevState();
    roomRows = dev.rooms
      .filter((room) => room.roomType === "open_group" && room.isDiscoverable)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    participantRows = dev.participants.filter((participant) =>
      roomRows.some((room) => room.id === participant.roomId)
    );
    joinedRoomIds = new Set(
      dev.participants.filter((participant) => participant.userId === userId).map((participant) => participant.roomId)
    );
  }

  const byRoomId = buildParticipantsByRoomMap(participantRows);
  const roomProfileMap = await fetchRoomProfilesByRoomIds(roomRows.map((room) => room.id));
  return { roomRows, participantRows, byRoomId, roomProfileMap, joinedRoomIds };
}

export async function listDiscoverableOpenGroupRooms(
  userId: string,
  query?: string
): Promise<CommunityMessengerDiscoverableGroupSummary[]> {
  const keyword = trimText(query).toLowerCase();
  const state = await fetchDiscoverableOpenGroupsRawState(userId);
  const baseSummaries = await summarizeRoomsBatch(
    userId,
    state.roomRows,
    state.participantRows,
    state.roomProfileMap,
    state.byRoomId
  );
  const summaries = baseSummaries
    .map((summary) => {
      if (summary.roomType !== "open_group") return null;
      if (keyword) {
        const haystack = [summary.title, summary.summary, summary.ownerLabel].join(" ").toLowerCase();
        if (!haystack.includes(keyword)) return null;
      }
      return {
        id: summary.id,
        roomType: "open_group" as const,
        roomStatus: summary.roomStatus,
        visibility: "public" as const,
        joinPolicy: summary.joinPolicy === "free" ? "free" : "password",
        identityPolicy: summary.identityPolicy,
        title: summary.title,
        summary: summary.summary,
        ownerUserId: summary.ownerUserId,
        ownerLabel: summary.ownerLabel,
        memberCount: summary.memberCount,
        memberLimit: summary.memberLimit,
        isDiscoverable: summary.isDiscoverable,
        requiresPassword: summary.requiresPassword,
        lastMessage: summary.lastMessage,
        lastMessageAt: summary.lastMessageAt,
        isJoined: state.joinedRoomIds.has(summary.id),
      };
    })
    .filter(Boolean);

  return summaries as CommunityMessengerDiscoverableGroupSummary[];
}

export async function getOpenGroupJoinPreview(
  userId: string,
  roomId: string
): Promise<{ ok: boolean; group?: CommunityMessengerDiscoverableGroupSummary; error?: string }> {
  const groups = await listDiscoverableOpenGroupRooms(userId);
  const group = groups.find((item) => item.id === trimText(roomId));
  if (!group) return { ok: false, error: "room_not_found" };
  return { ok: true, group };
}

async function fetchCallLogRowsOnly(userId: string): Promise<Array<CallRow | DevCall>> {
  const sb = getSupabaseOrNull();
  let rows: Array<CallRow | DevCall> = [];
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_logs")
      .select(
        "id, session_id, room_id, caller_user_id, peer_user_id, call_kind, status, duration_seconds, started_at, ended_at"
      )
      .or(`caller_user_id.eq.${userId},peer_user_id.eq.${userId}`)
      .order("started_at", { ascending: false })
      .limit(30);
    if (!error || !isMissingTableError(error)) {
      const base = (data ?? []) as CallRow[];
      const sessionIds = dedupeIds(base.map((r) => trimText(r.session_id ?? "")).filter(Boolean));
      const sessionById = new Map<string, { ended_at: string | null; ended_reason: string | null }>();
      if (sessionIds.length) {
        const { data: srows } = await (sb as any)
          .from("community_messenger_call_sessions")
          .select("id, ended_at, ended_reason")
          .in("id", sessionIds);
        for (const s of (srows ?? []) as Array<{
          id: string;
          ended_at: string | null;
          ended_reason: string | null;
        }>) {
          sessionById.set(s.id, { ended_at: s.ended_at, ended_reason: s.ended_reason });
        }
      }
      rows = base.map((r) => {
        const sid = trimText(r.session_id ?? "");
        const s = sid ? sessionById.get(sid) : undefined;
        return {
          ...r,
          sessionEndedAt: s?.ended_at ?? null,
          sessionEndedReason: s?.ended_reason ?? null,
        };
      });
    }
  }
  if (!rows.length) {
    rows = getDevState()
      .calls.filter((row) => row.callerUserId === userId || row.peerUserId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((row) => enrichDevCallLogRowWithSession(row));
  }
  return rows;
}

async function fetchCallSessionParticipantUserIds(sessionIds: string[]): Promise<string[]> {
  if (!sessionIds.length) return [];
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("user_id")
      .in("session_id", sessionIds);
    return dedupeIds(
      ((data ?? []) as Array<{ user_id?: string | null }>)
        .map((row) => trimText(row.user_id))
        .filter(Boolean)
    );
  }
  const dev = getDevState();
  const ids = new Set<string>();
  for (const sid of sessionIds) {
    const session = dev.callSessions.find((item) => item.id === sid);
    if (session?.participants) {
      for (const p of session.participants) {
        ids.add(p.userId);
      }
    }
  }
  return [...ids];
}

async function loadSessionMapsForCallLogs(
  userId: string,
  sessionIds: string[],
  profileById: Map<string, CommunityMessengerProfileLite>
): Promise<{
  sessionMap: Map<string, CallSessionMetaRow | DevCallSession>;
  participantsBySession: Map<string, CommunityMessengerCallParticipant[]>;
}> {
  const sessionMap = new Map<string, CallSessionMetaRow | DevCallSession>();
  const participantsBySession = new Map<string, CommunityMessengerCallParticipant[]>();
  const sb = getSupabaseOrNull();
  if (sb && sessionIds.length) {
    const [{ data: sessionRows }, { data: sessionParticipantRows }] = await Promise.all([
      (sb as any)
        .from("community_messenger_call_sessions")
        .select("id, room_id, session_mode")
        .in("id", sessionIds),
      (sb as any)
        .from("community_messenger_call_session_participants")
        .select("session_id, user_id, participation_status, joined_at, left_at, created_at")
        .in("session_id", sessionIds),
    ]);
    for (const session of (sessionRows ?? []) as CallSessionMetaRow[]) {
      sessionMap.set(session.id, session);
    }
    const participantRows = (sessionParticipantRows ?? []) as Array<{
      session_id?: string | null;
      user_id?: string | null;
      participation_status?: CommunityMessengerCallParticipantStatus | null;
      joined_at?: string | null;
      left_at?: string | null;
    }>;
    for (const row of participantRows) {
      const sessionId = trimText(row.session_id) || "";
      const participantUserId = trimText(row.user_id) || "";
      if (!sessionId || !participantUserId) continue;
      const list = participantsBySession.get(sessionId) ?? [];
      const profile = profileById.get(participantUserId);
      list.push({
        userId: participantUserId,
        label: profile?.label ?? profileLabel(null, participantUserId),
        status: (trimText(row.participation_status) as CommunityMessengerCallParticipantStatus) || "invited",
        joinedAt: trimText(row.joined_at) || null,
        leftAt: trimText(row.left_at) || null,
        isMe: participantUserId === userId,
      });
      participantsBySession.set(sessionId, list);
    }
  } else {
    for (const session of getDevState().callSessions.filter((item) => sessionIds.includes(item.id))) {
      sessionMap.set(session.id, session);
      const participants = await loadCallSessionParticipants(userId, session);
      participantsBySession.set(session.id, participants);
    }
  }
  return { sessionMap, participantsBySession };
}

function resolveCommunityMessengerCallLogEndedAtIso(
  logEndedAt: string | null | undefined,
  sessionEndedAt: string | null | undefined
): string | null {
  const a = trimText(logEndedAt ?? "");
  if (a) return a;
  const b = trimText(sessionEndedAt ?? "");
  if (b) return b;
  return null;
}

function computeCommunityMessengerCallLogDisplayType(
  status: CommunityMessengerCallStatus,
  endedReason: string | null | undefined,
  isOutgoing: boolean
): CommunityMessengerCallLogDisplayType {
  const er = trimText(endedReason ?? "") || null;
  if (status === "missed") return isOutgoing ? "missed_outgoing" : "missed_incoming";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  if (status === "dialing") return "outgoing";
  if (status === "incoming") return "incoming";
  if (status === "ended") {
    if (er && er.startsWith("failed_")) return "failed";
    return isOutgoing ? "outgoing" : "incoming";
  }
  return isOutgoing ? "outgoing" : "incoming";
}

function enrichDevCallLogRowWithSession(row: DevCall): DevCall {
  const sid = trimText(row.sessionId ?? "");
  const sess = sid ? getDevState().callSessions.find((s) => s.id === sid) : undefined;
  return {
    ...row,
    sessionEndedAt: sess?.endedAt ?? row.sessionEndedAt ?? null,
    sessionEndedReason: sess?.endedReason ?? row.sessionEndedReason ?? null,
  };
}

function buildCallLogEntriesFromRows(
  userId: string,
  rows: Array<CallRow | DevCall>,
  profileById: Map<string, CommunityMessengerProfileLite>,
  roomMetaMap: Map<string, CommunityMessengerRoomSummary>,
  sessionMap: Map<string, CallSessionMetaRow | DevCallSession>,
  participantsBySession: Map<string, CommunityMessengerCallParticipant[]>
): CommunityMessengerCallLog[] {
  return rows.map((row) => {
    const isDbCall = isDbCallLogRow(row);
    const roomId = (isDbCall ? row.room_id : row.roomId) ?? null;
    const sessionId = (isDbCall ? row.session_id : row.sessionId) ?? null;
    const session = sessionId ? sessionMap.get(sessionId) : null;
    const roomMeta = roomId ? roomMetaMap.get(roomId) : null;
    const sessionMode =
      session && "session_mode" in session
        ? (session.session_mode ?? "direct")
        : session
          ? session.sessionMode
          : roomMeta?.roomType && roomMeta.roomType !== "direct"
            ? "group"
            : "direct";
    const sessionPeerHint =
      session && "initiator_user_id" in session
        ? {
            initiatorUserId: trimText(String(session.initiator_user_id ?? "")) || null,
            recipientUserId:
              "recipient_user_id" in session
                ? trimText(String(session.recipient_user_id ?? "")) || null
                : null,
          }
        : session && "initiatorUserId" in session
          ? {
              initiatorUserId: trimText(String(session.initiatorUserId ?? "")) || null,
              recipientUserId:
                "recipientUserId" in session
                  ? trimText(String(session.recipientUserId ?? "")) || null
                  : null,
            }
          : null;
    const displayPeerUserId =
      sessionMode === "group"
        ? null
        : resolveCallLogDisplayPeerUserId(
            userId,
            {
              callerUserId: isDbCall ? row.caller_user_id : row.callerUserId,
              peerUserId: isDbCall ? row.peer_user_id : row.peerUserId,
            },
            {
              session: sessionPeerHint,
              roomPeerUserId: roomMeta?.peerUserId ?? null,
            }
          );
    const peer = displayPeerUserId ? profileById.get(displayPeerUserId) : undefined;
    const startedAt = trimText(isDbCall ? row.started_at : row.startedAt) || nowIso();
    const participants = sessionId ? participantsBySession.get(sessionId) ?? [] : [];
    const participantLabels = participants
      .filter((participant) => !participant.isMe)
      .map((participant) => participant.label);
    const participantCount =
      sessionMode === "group" ? Math.max(participants.length, Number(roomMeta?.memberCount ?? 0), 2) : 2;
    const title =
      sessionMode === "group"
        ? roomMeta?.title ?? cmServiceT("cm_svc_group_call")
        : roomId
          ? roomMeta?.title ?? peer?.label ?? cmServiceT("cm_svc_call")
          : peer?.label ?? cmServiceT("cm_svc_call");
    const groupPeerLabel =
      participantLabels.length > 1
        ? cmServiceT("cm_svc_call_participants", {
            name: participantLabels[0] ?? "",
            extra: participantLabels.length - 1,
          })
        : participantLabels[0] ?? cmServiceT("cm_svc_group_call_label", { count: participantCount });

    const sessionEndedReason =
      trimText(isDbCall ? row.sessionEndedReason ?? "" : row.sessionEndedReason ?? "") || null;
    const endedAt = resolveCommunityMessengerCallLogEndedAtIso(
      isDbCall ? row.ended_at : null,
      isDbCall ? row.sessionEndedAt : row.sessionEndedAt
    );
    const isOutgoing = isDbCall
      ? messengerUserIdsEqual(row.caller_user_id, userId)
      : messengerUserIdsEqual(row.callerUserId, userId);
    const displayType = computeCommunityMessengerCallLogDisplayType(row.status, sessionEndedReason, isOutgoing);

    return {
      id: row.id,
      sessionId,
      roomId,
      sessionMode,
      title,
      peerLabel:
        sessionMode === "group"
          ? groupPeerLabel
          : incomingCallPeerNicknameLabel(peer?.label) || cmPeerFallbackLabel(),
      peerPublicId:
        sessionMode === "group" ? null : peer?.subtitle?.trim().replace(/^@+/, "") || null,
      peerAvatarUrl:
        sessionMode === "group" ? roomMeta?.avatarUrl ?? null : peer?.avatarUrl ?? null,
      peerUserId: displayPeerUserId,
      participantCount,
      participantLabels,
      callKind: (isDbCall ? row.call_kind : row.callKind) as CommunityMessengerCallKind,
      status: row.status as CommunityMessengerCallStatus,
      startedAt,
      durationSeconds: Number((isDbCall ? row.duration_seconds : row.durationSeconds) ?? 0),
      endedAt,
      isOutgoing,
      endedReason: sessionEndedReason,
      displayType,
      peerRelationLabel:
        sessionMode === "group" || !displayPeerUserId
          ? undefined
          : peer?.isFriend
            ? "mutual_friend"
            : "stranger",
    };
  });
}

export async function listCommunityMessengerCallLogs(userId: string): Promise<CommunityMessengerCallLog[]> {
  const rows = await fetchCallLogRowsOnly(userId);
  const roomIds = dedupeIds(
    rows.map((row) => callLogRoomId(row)).filter((value): value is string => Boolean(value))
  );
  const sessionIds = dedupeIds(
    rows.map((row) => callLogSessionId(row) ?? "").filter(Boolean)
  );
  const peerIds = dedupeIds(
    rows.flatMap((row) => {
      const ids: string[] = [];
      if (isDbCallLogRow(row)) {
        const caller = trimText(row.caller_user_id);
        const peer = trimText(row.peer_user_id ?? "");
        if (caller) ids.push(caller);
        if (peer) ids.push(peer);
      } else {
        const caller = trimText(row.callerUserId ?? "");
        const peer = trimText(row.peerUserId ?? "");
        if (caller) ids.push(caller);
        if (peer) ids.push(peer);
      }
      return ids;
    })
  );
  const roomPayload = await fetchRoomsPayloadByRoomIds(roomIds);
  const sessionParticipantUserIds = await fetchCallSessionParticipantUserIds(sessionIds);
  const allIds = dedupeIds([
    userId,
    ...dedupeParticipantUserIds(roomPayload.participantRows),
    ...peerIds,
    ...sessionParticipantUserIds,
  ]);
  const profileById = new Map(
    (await hydrateProfiles(userId, allIds, { includeSelf: true })).map((p) => [p.id, p])
  );
  const roomMetaMap = new Map(
    summarizeRoomsBatchWithProfileMap(
      userId,
      roomPayload.roomRows,
      roomPayload.roomProfileMap,
      roomPayload.byRoomId,
      profileById
    ).map((s) => [s.id, s])
  );
  const { sessionMap, participantsBySession } = await loadSessionMapsForCallLogs(userId, sessionIds, profileById);
  return buildCallLogEntriesFromRows(userId, rows, profileById, roomMetaMap, sessionMap, participantsBySession);
}

export async function deleteCommunityMessengerCallLog(
  userId: string,
  callLogId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const id = callLogId.trim();
  if (!id) return { ok: false, error: "missing_call_log_id" };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "supabase_unavailable" };
  const { data, error } = await (sb as any)
    .from("community_messenger_call_logs")
    .delete()
    .eq("id", id)
    .or(`caller_user_id.eq.${userId},peer_user_id.eq.${userId}`)
    .select("id");
  if (error) return { ok: false, error: String(error.message ?? "delete_failed") };
  if (!Array.isArray(data) || data.length < 1) return { ok: false, error: "not_found" };
  return { ok: true };
}

/** `GET /api/community-messenger/rooms` 전용 — 부트스트랩 전체 없이 내 채팅·그룹 목록만 조립 */
export async function listCommunityMessengerMyChatsAndGroups(
  userId: string,
  options?: {
    tier?: "critical" | "full";
    /**
     * `GET /api/community-messenger/home-sync` 전용 — RPC `p_limit`·폴백 메타 정렬 상한.
     * 미설정이면 `tier=critical` 일 때만 기본 `COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP`.
     * 비 home-sync 호출(`/api/community-messenger/rooms` 등)은 생략 → 부트스트랩 상한 500 유지.
     */
    roomListCap?: number;
    /** home-sync: Philife 오픈그룹 라벨 보강만 생략(목록 속도). */
    homeSyncSkipHeavyEnrich?: boolean;
    /**
     * home-sync: 거래 `contextMeta` enrich 를 HTTP 응답 전에 await 하지 않음.
     * 클라 `trade-chat-list-meta` + `useTradeChatListMetaHydration` 으로 seed-first 후 silent merge.
     */
    deferTradeMetaEnrich?: boolean;
    /** home-sync dev 계측 전용(요청별 token) */
    trace?: HomeSyncTrace;
  }
): Promise<{
  chats: CommunityMessengerRoomSummary[];
  groups: CommunityMessengerRoomSummary[];
}> {
  const tListTop = performance.now();
  const tier = options?.tier ?? "full";
  const isCritical = tier === "critical";
  const skipHeavyEnrich = options?.homeSyncSkipHeavyEnrich === true;
  const isDev = process.env.NODE_ENV === "development";

  if (isCritical) {
    const sbSnap = getSupabaseOrNull();
    if (!sbSnap) {
      throw new HomeSyncSnapshotUnavailableError("supabase_unavailable");
    }
    const snap = await tryBuildHomeSyncCriticalFromSnapshot(sbSnap as never, userId, options?.trace);
    if (snap) {
      const chats = dedupeTradeMessengerRoomSummaries(snap.chats);
      if (messengerPerfStepsEnabled()) {
        logMessengerPerfMs("listCommunityMessengerMyChatsAndGroups_wall", performance.now() - tListTop);
      }
      return {
        chats,
        groups: snap.groups,
      };
    }
    throw new HomeSyncSnapshotUnavailableError("unified_rpc_unavailable");
  }

  const explicitCap = options?.roomListCap;
  let effectiveRoomLimit: number | undefined;
  if (typeof explicitCap === "number" && explicitCap > 0) {
    effectiveRoomLimit = Math.min(Math.ceil(explicitCap), COMMUNITY_MESSENGER_HOME_SYNC_ROOM_CAP_HARD_MAX);
  } else if (isCritical) {
    effectiveRoomLimit = COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP;
  }

  const criticalRoomsDiag = isCritical ? createEmptyBootstrapRoomsDiagnostics() : undefined;
  const roomsDiagForBreakdown =
    criticalRoomsDiag ??
    (homeSyncBreakdownEnabled() || homeSyncTraceMeterEnabled(options?.trace)
      ? createEmptyBootstrapRoomsDiagnostics()
      : undefined);
  const capForCache = effectiveRoomLimit ?? COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP;
  let roomsCacheHit = 0;
  const tFetchMyRooms = performance.now();
  let myPayloadRaw: MessengerRoomsPayload;
  if (isCritical) {
    const cachedRooms = peekHomeSyncCriticalRoomsCache(userId, capForCache);
    if (cachedRooms) {
      roomsCacheHit = 1;
      myPayloadRaw = cachedRooms as MessengerRoomsPayload;
      console.log("[home-sync-rooms-cache-hit]", { room_count: cachedRooms.roomRows.length, cap: capForCache });
    } else {
      console.log("[home-sync-rooms-cache-miss]", { cap: capForCache });
      myPayloadRaw = await fetchMyRoomsPayload(userId, {
        includeRoomProfiles: false,
        roomLimit: effectiveRoomLimit,
        diagnostics: roomsDiagForBreakdown,
        criticalSlimRoomSelect: true,
      });
      setHomeSyncCriticalRoomsCache(userId, capForCache, myPayloadRaw);
    }
  } else {
    myPayloadRaw = await fetchMyRoomsPayload(userId, {
      includeRoomProfiles: true,
      roomLimit: effectiveRoomLimit,
      diagnostics: roomsDiagForBreakdown,
    });
  }
  const fetchMyRoomsMs = performance.now() - tFetchMyRooms;

  if (isCritical && criticalRoomsDiag) {
    recordMessengerMonitoringEventsCriticalRoomsLazy(criticalRoomsDiag);
  }

  const tSlicePayload = performance.now();
  const myPayload = isCritical
    ? sliceMessengerRoomsPayloadForHomeSyncCritical(myPayloadRaw, COMMUNITY_MESSENGER_HOME_SYNC_CRITICAL_ROOM_CAP)
    : myPayloadRaw;
  const roomSliceCpuMs = performance.now() - tSlicePayload;

  const phaseRows: Array<{ phase: string; ms: number }> = [];
  if (homeSyncBreakdownEnabled() && roomsDiagForBreakdown) {
    phaseRows.push({ phase: "my_rooms_round1_wall", ms: roomsDiagForBreakdown.round1Ms });
    phaseRows.push({
      phase: "my_rooms_round2_parallel_bottleneck_max_rooms_or_participants",
      ms: Math.max(
        roomsDiagForBreakdown.round2RoomsDbFetchMs,
        roomsDiagForBreakdown.round2ParticipantsMs
      ),
    });
    if (roomsDiagForBreakdown.round3Ms > 0) {
      phaseRows.push({ phase: "my_rooms_round3_room_profiles_table", ms: roomsDiagForBreakdown.round3Ms });
    }
    logHomeSyncBreakdown("my_rooms_fetch_query_roundtrips_estimate", 0, {
      queryCount: roomsDiagForBreakdown.queryCount,
      metaChunkCount: roomsDiagForBreakdown.metaChunkCount,
    });
  }

  const tRoomIds = performance.now();
  const allIds = dedupeIds([userId, ...dedupeParticipantUserIds(myPayload.participantRows)]);
  const roomIdsMs = performance.now() - tRoomIds;

  const sbList = getSupabaseOrNull();
  const hs5Hints = isCritical ? extractHs5TradeHintsFromRoomsPayload(myPayload) : { cmRoomIds: [], productChatIds: [] };
  const unreadPrefetchPromise =
    isCritical && sbList && hs5Hints.cmRoomIds.length
      ? prefetchHs5LegacyUnreadRows(sbList as any, userId, hs5Hints.cmRoomIds, hs5Hints.productChatIds, options?.trace)
      : Promise.resolve(null);

  const useLabelsOnlyParticipantHydrate = isCritical || options?.homeSyncSkipHeavyEnrich === true;
  const tHydrate = performance.now();
  const [profileMembers, unreadPreloaded] = await Promise.all([
    useLabelsOnlyParticipantHydrate
      ? hydrateProfilesLabelsOnly(userId, allIds, { includeSelf: true, trace: options?.trace })
      : hydrateProfiles(userId, allIds, { includeSelf: true }),
    unreadPrefetchPromise,
  ]);
  const hs5HydrateUnreadParallelWallMs = performance.now() - tHydrate;
  const profileById = new Map(profileMembers.map((p) => [p.id, p]));
  const participantsProfilesMs = hs5HydrateUnreadParallelWallMs;
  if (homeSyncBreakdownEnabled()) {
    phaseRows.push({
      phase: useLabelsOnlyParticipantHydrate
        ? "hydrate_profiles_labels_only_fetch"
        : "hydrate_profiles_full_with_relations",
      ms: participantsProfilesMs,
    });
  }
  if (messengerPerfStepsEnabled()) {
    logMessengerPerfMs(
      useLabelsOnlyParticipantHydrate
        ? "hydrate_profiles_labels_only_fetch"
        : "hydrate_profiles_full_with_relations",
      participantsProfilesMs
    );
  }
  const participantUnreadPerf = homeSyncTraceMeterEnabled(options?.trace) ? { participantUnreadCpuMs: 0 } : undefined;
  const tSummarize = performance.now();
  const mySummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    myPayload.roomRows,
    myPayload.roomProfileMap,
    myPayload.byRoomId,
    profileById,
    participantUnreadPerf
  );
  const summarizeMs = performance.now() - tSummarize;
  if (homeSyncTraceMeterEnabled(options?.trace) && participantUnreadPerf) {
    const tr = options!.trace!;
    const rawIds = mySummaries.map((s) => String(s.id ?? "").trim()).filter(Boolean);
    const uniqueIds = new Set(rawIds);
    tr.deepSteps.unreadHomeSyncSteps = {
      ...(tr.deepSteps.unreadHomeSyncSteps ?? {}),
      participantUnreadMs: ms(participantUnreadPerf.participantUnreadCpuMs),
      unreadBootstrapListRoomCount: mySummaries.length,
      unreadBootstrapListDuplicateIdRows: Math.max(0, rawIds.length - uniqueIds.size),
    };
  }
  if (homeSyncBreakdownEnabled()) {
    phaseRows.push({ phase: "summarize_rooms_batch_cpu", ms: summarizeMs });
  }
  const deferTradeMeta = options?.deferTradeMetaEnrich === true;
  if (deferTradeMeta) {
    const tTradeClass = performance.now();
    await enrichTradeRoomClassificationForDeferredHomeSync(sbList, userId, mySummaries);
    const tradeClassificationMs = performance.now() - tTradeClass;
    const tradeRooms = mySummaries.filter((s) => s.contextMeta?.kind === "trade").length;
    console.log("[trade-meta-deferred]", {
      tier,
      rooms_count: mySummaries.length,
      trade_rooms_count: tradeRooms,
      trade_classification_ms: Math.round(tradeClassificationMs),
      cache_hit: 0,
      deferred_ms: 0,
    });
    if (homeSyncTraceMeterEnabled(options?.trace)) {
      const tr = options!.trace!;
      tr.deepSteps.bundleSteps = {
        ...(tr.deepSteps.bundleSteps ?? {}),
        tradeMetaEnrichTotalMs: 0,
        tradeClassificationMs: ms(tradeClassificationMs),
        tradeMetaDeferred: true,
      };
    }
    if (homeSyncBreakdownEnabled()) {
      phaseRows.push({ phase: "enrich_trade_room_classification_deferred", ms: tradeClassificationMs });
      phaseRows.push({ phase: "enrich_trade_room_context_meta_deferred", ms: 0 });
    }
    await enrichCommerceChatRoomLifecycleForList(sbList, mySummaries);
  } else {
    const tTradeCtx = performance.now();
    await enrichTradeRoomContextMetaForBootstrap(userId, mySummaries, undefined, options?.trace, {
      tradeCategoryFetchMode: isCritical ? "fallback_only" : "full",
      homeSyncMegaBundleForDirectKeys:
        typeof options?.roomListCap === "number" && Number.isFinite(options.roomListCap) && options.roomListCap > 0,
    });
    const tradeMetaEnrichMs = performance.now() - tTradeCtx;
    if (homeSyncBreakdownEnabled()) {
      phaseRows.push({ phase: "enrich_trade_room_context_meta_bootstrap", ms: tradeMetaEnrichMs });
    }
  }
  let unreadBadgeMs = 0;
  if (sbList) {
    const tLeg = performance.now();
    /**
     * HS5: critical 도 **거래 줄 unread**는 탭/스토어 배지와 맞추기 위해 레거시 소스가 필요(문서화된 계약).
     * 병합을 유예(defer)하면 첫 페인트 뱃지·읽음 표시가 어긋날 수 있어 home-sync critical 에서는 defer 하지 않는다.
     * rows fetch 와 병렬 prefetch 후 apply 만 수행(동일 합산 의미).
     */
    await enrichMessengerTradeUnreadWithLegacyTrade(
      sbList as any,
      userId,
      mySummaries,
      undefined,
      options?.trace,
      { preloadedLegacy: unreadPreloaded }
    ).catch(() => {});
    unreadBadgeMs = performance.now() - tLeg;
    if (homeSyncTraceMeterEnabled(options?.trace)) {
      const tr = options!.trace!;
      tr.deepSteps.unreadHomeSyncSteps = {
        ...(tr.deepSteps.unreadHomeSyncSteps ?? {}),
        unreadBadgeMs: ms(unreadBadgeMs),
      };
    }
    if (homeSyncBreakdownEnabled()) {
      phaseRows.push({ phase: "enrich_messenger_trade_unread_legacy", ms: unreadBadgeMs });
    }
  }
  if (!isCritical && !skipHeavyEnrich) {
    const tOpen = performance.now();
    const { enrichOpenGroupSummariesWithPhilifeMeetingLabels } = await import(
      "@/lib/community-messenger/philife-meeting-open-group-summaries"
    );
    await enrichOpenGroupSummariesWithPhilifeMeetingLabels(userId, mySummaries);
    if (homeSyncBreakdownEnabled()) {
      phaseRows.push({ phase: "enrich_open_group_philife_meeting_labels", ms: performance.now() - tOpen });
    }
  }
  if (messengerPerfStepsEnabled()) {
    logMessengerPerfMs("listCommunityMessengerMyChatsAndGroups_wall", performance.now() - tListTop);
  }
  if (homeSyncBreakdownEnabled()) {
    phaseRows.push({ phase: "list_my_chats_and_groups_wall_total", ms: performance.now() - tListTop });
    let dbEstimate = roomsDiagForBreakdown?.queryCount ?? 0;
    dbEstimate += 1;
    logHomeSyncBreakdownSummary({
      tier,
      rows: phaseRows,
      dbQueryCountEstimate: dbEstimate,
      notes:
        "queryCount is estimated inside fetchMyRoomsPayload. hydrate uses one profiles.in RTT (0 on cache hit). round2 rooms/participants parallel; see enrich logs for legacy queries.",
    });
  }
  const tSplitLists = performance.now();
  const listDeduped = dedupeTradeMessengerRoomSummaries(mySummaries);
  const chats = listDeduped.filter((room) => room.roomType === "direct");
  const groups = listDeduped.filter((room) => isCommunityMessengerPrivateGroupListRoomType(room.roomType));
  const listSplitFilterMs = performance.now() - tSplitLists;
  const payloadBuildMs = ms(roomIdsMs + roomSliceCpuMs + summarizeMs + listSplitFilterMs);

  if (homeSyncTraceMeterEnabled(options?.trace)) {
    const listTrace = options!.trace!;
    const listWall = performance.now() - tListTop;
    const prev = listTrace.deepSteps.bundleSteps;
    listTrace.deepSteps.bundleSteps = {
      ...(prev ?? {}),
      roomsFetchMs: ms(fetchMyRoomsMs),
      roomSliceCpuMs: ms(roomSliceCpuMs),
      roomIdsDedupeMs: ms(roomIdsMs),
      participantsProfilesMs: ms(participantsProfilesMs),
      summarizeRoomsMs: ms(summarizeMs),
      unreadBadgeMs: ms(unreadBadgeMs),
      payloadBuildMs: ms(payloadBuildMs),
      listSplitFilterMs: ms(listSplitFilterMs),
      listMyChatsWallMs: ms(listWall),
      roomsRound2RoomsDbFetchMs: ms(roomsDiagForBreakdown?.round2RoomsDbFetchMs ?? 0),
      homeSyncCriticalRoomsCacheHit: roomsCacheHit,
      homeSyncHs5HydrateUnreadParallelWallMs: isCritical ? ms(hs5HydrateUnreadParallelWallMs) : undefined,
    };
    if (isCritical && homeSyncTraceMeterEnabled(options?.trace)) {
      const ur = listTrace.deepSteps.unreadHomeSyncSteps;
      listTrace.deepSteps.unreadHomeSyncSteps = {
        ...(ur ?? {}),
        unreadHs5PrefetchParallelWithHydrateMs: ms(hs5HydrateUnreadParallelWallMs),
      };
    }
  }
  return { chats, groups };
}

type CallSessionProfileHydrationMode = "full" | "labels_only";

async function loadCallSessionParticipants(
  userId: string,
  session: CallSessionRow | DevCallSession,
  /** 방금 insert 직후에는 DB 재조회 없이 메모리 행으로 매핑해 발신 API 지연을 줄인다 */
  preloadedDbRows?: CallSessionParticipantRow[] | null,
  /** `listIncomingCommunityMessengerCallSessions` 배치 경로 — 참가자 행을 이미 묶어 조회했으면 세션당 재조회하지 않는다 */
  profileById?: Map<string, CommunityMessengerProfileLite>,
  dbParticipantsPreloaded?: boolean,
  profileHydration: CallSessionProfileHydrationMode = "full"
): Promise<CommunityMessengerCallParticipant[]> {
  const isDbSession = "initiator_user_id" in session;
  const sessionId = session.id;
  const fallbackIds = dedupeIds(
    (isDbSession
      ? [session.initiator_user_id, session.recipient_user_id]
      : [session.initiatorUserId, session.recipientUserId]
    ).filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  let rows: Array<CallSessionParticipantRow | DevCallSessionParticipant> = [];
  if (dbParticipantsPreloaded && isDbSession) {
    rows = preloadedDbRows ?? [];
  } else if (preloadedDbRows && preloadedDbRows.length > 0) {
    rows = preloadedDbRows;
  }
  const sb = getSupabaseOrNull();
  if (!rows.length && isDbSession && sb && !dbParticipantsPreloaded) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (data && !error) {
      rows = data as CallSessionParticipantRow[];
    }
  } else if (!isDbSession) {
    rows = session.participants;
  }

  if (!rows.length) {
    const startedAt = trimText(isDbSession ? session.started_at : session.startedAt) || nowIso();
    const endedAt = trimText(isDbSession ? session.ended_at : session.endedAt) || null;
    const status = (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus;
    rows = fallbackIds.map((memberId) => ({
      id: `${sessionId}:${memberId}`,
      session_id: sessionId,
      room_id: isDbSession ? session.room_id : session.roomId,
      user_id: memberId,
      participation_status:
        status === "active"
          ? "joined"
          : status === "rejected" && memberId === (isDbSession ? session.recipient_user_id : session.recipientUserId)
            ? "rejected"
            : status === "ended" || status === "missed" || status === "cancelled"
              ? "left"
              : "invited",
      joined_at: status === "active" ? trimText(isDbSession ? session.answered_at : session.answeredAt) || startedAt : null,
      left_at: status === "ended" || status === "missed" || status === "cancelled" || status === "rejected" ? endedAt : null,
      created_at: startedAt,
    })) as CallSessionParticipantRow[];
  }

  const memberIds = dedupeIds(rows.map((row) => ("user_id" in row ? row.user_id : row.userId)));
  let profileMap: Map<string, CommunityMessengerProfileLite>;
  if (profileById && profileById.size > 0) {
    profileMap = new Map();
    const missing: string[] = [];
    for (const id of memberIds) {
      const p = profileById.get(id);
      if (p) profileMap.set(id, p);
      else missing.push(id);
    }
    const need = dedupeIds(missing);
    if (need.length) {
      const hydrated =
        profileHydration === "labels_only"
          ? await hydrateProfilesLabelsOnly(userId, need, { includeSelf: true })
          : await hydrateProfiles(userId, need, { includeSelf: true });
      for (const p of hydrated) profileMap.set(p.id, p);
    }
  } else {
    const profiles =
      profileHydration === "labels_only"
        ? await hydrateProfilesLabelsOnly(userId, memberIds, { includeSelf: true })
        : await hydrateProfiles(userId, memberIds, { includeSelf: true });
    profileMap = new Map(profiles.map((item) => [item.id, item]));
  }
  return rows.map((row) => {
    const isDbRow = "user_id" in row;
    const participantUserId = isDbRow ? row.user_id : row.userId;
    const profile = profileMap.get(participantUserId);
    return {
      userId: participantUserId,
      label: profile?.label ?? profileLabel(null, participantUserId),
      status: (isDbRow ? row.participation_status : row.participationStatus) as CommunityMessengerCallParticipantStatus,
      joinedAt: trimText(isDbRow ? row.joined_at : row.joinedAt) || null,
      leftAt: trimText(isDbRow ? row.left_at : row.leftAt) || null,
      isMe: participantUserId === userId,
    };
  });
}

async function mapCallSession(
  userId: string,
  session: CallSessionRow | DevCallSession,
  preloadedParticipantRows?: CallSessionParticipantRow[] | null,
  profileById?: Map<string, CommunityMessengerProfileLite>,
  dbParticipantsPreloaded?: boolean,
  profileHydration: CallSessionProfileHydrationMode = "full"
): Promise<CommunityMessengerCallSession> {
  const isDbSession = "initiator_user_id" in session;
  const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
  const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
  const sessionMode = ((isDbSession ? session.session_mode : session.sessionMode) ?? "direct") as CommunityMessengerCallSessionMode;
  const participants = await loadCallSessionParticipants(
    userId,
    session,
    preloadedParticipantRows,
    profileById,
    dbParticipantsPreloaded,
    profileHydration
  );
  const peerUserId =
    sessionMode === "direct"
      ? messengerUserIdsEqual(initiatorUserId, userId)
        ? recipientUserId
        : initiatorUserId
      : null;
  const joinedCount = participants.filter((item) => item.status === "joined").length;
  const peerLabel =
    sessionMode === "group"
      ? joinedCount > 1
        ? cmServiceT("cm_svc_group_call_active", { count: joinedCount })
        : cmServiceT("cm_svc_group_call")
      : incomingCallPeerNicknameLabel(
          peerUserId
            ? participants.find((p) => p.userId === peerUserId)?.label
            : undefined
        ) || profileCallPeerLabel(null, peerUserId ?? initiatorUserId);
  let peerAvatarUrl: string | null = null;
  let peerPublicId: string | null = null;
  if (sessionMode === "direct" && peerUserId) {
    const peerHydrated =
      profileById?.get(peerUserId) != null
        ? null
        : await hydrateProfilesLabelsOnly(userId, [peerUserId], { includeSelf: true });
    const peerProfile = profileById?.get(peerUserId) ?? peerHydrated?.[0] ?? null;
    peerAvatarUrl = peerProfile?.avatarUrl ?? null;
    peerPublicId = peerProfile?.subtitle?.trim().replace(/^@+/, "") || null;
  }

  const peerProfileForRelation =
    sessionMode === "direct" && peerUserId ? profileById?.get(peerUserId) ?? null : null;
  const peerRelationLabel =
    sessionMode === "direct" && peerUserId
      ? peerProfileForRelation?.isFriend
        ? "mutual_friend"
        : "stranger"
      : undefined;

  return {
    id: session.id,
    roomId: isDbSession ? session.room_id : session.roomId,
    sessionMode,
    initiatorUserId,
    recipientUserId,
    peerUserId,
    peerLabel,
    peerAvatarUrl,
    ...(peerPublicId ? { peerPublicId } : {}),
    ...(peerRelationLabel ? { peerRelationLabel } : {}),
    callKind: (isDbSession ? session.call_kind : session.callKind) as CommunityMessengerCallKind,
    status: (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus,
    startedAt: trimText(isDbSession ? session.started_at : session.startedAt) || nowIso(),
    answeredAt: trimText(isDbSession ? session.answered_at : session.answeredAt) || null,
    endedAt: trimText(isDbSession ? session.ended_at : session.endedAt) || null,
    endedReason: isDbSession
      ? trimText((session as CallSessionRow).ended_reason ?? "") || null
      : trimText((session as DevCallSession).endedReason ?? "") || null,
    isMineInitiator: messengerUserIdsEqual(initiatorUserId, userId),
    participants,
  };
}

/** 수신 통화 폴링 전용 — 세션·프로필 조회를 배치로 묶어 지연·Supabase 왕복을 줄인다 */
async function mapIncomingCallSessionsBatch(
  userId: string,
  sessionRows: CallSessionRow[]
): Promise<CommunityMessengerCallSession[]> {
  if (!sessionRows.length) return [];
  const sb = getSupabaseOrNull();
  if (!sb) {
    return Promise.all(sessionRows.map((row) => mapCallSession(userId, row, undefined, undefined, undefined, "labels_only")));
  }
  const sessionIds = dedupeIds(sessionRows.map((r) => r.id));
  const { data: participantRows } = await (sb as any)
    .from("community_messenger_call_session_participants")
    .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
    .in("session_id", sessionIds)
    .order("created_at", { ascending: true });
  const bySession = new Map<string, CallSessionParticipantRow[]>();
  for (const row of (participantRows ?? []) as CallSessionParticipantRow[]) {
    const sid = trimText(row.session_id);
    if (!sid) continue;
    const list = bySession.get(sid) ?? [];
    list.push(row);
    bySession.set(sid, list);
  }
  const fromSessions = sessionRows.flatMap((r) =>
    [r.initiator_user_id, r.recipient_user_id].filter((v): v is string => typeof v === "string" && v.length > 0)
  );
  const fromParticipants = ((participantRows ?? []) as CallSessionParticipantRow[])
    .map((p) => p.user_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);
  const allUserIds = dedupeIds([...fromSessions, ...fromParticipants]);
  const profileById = new Map(
    (await hydrateProfilesLabelsOnly(userId, allUserIds, { includeSelf: true })).map((p) => [p.id, p])
  );
  return Promise.all(
    sessionRows.map((row) =>
      mapCallSession(userId, row, bySession.get(row.id) ?? [], profileById, true, "labels_only")
    )
  );
}

const ACTIVE_CALL_ROOM_CACHE_TTL_MS = 2500;
const ACTIVE_CALL_ROOM_CACHE_MAX_ENTRIES = 2_000;
const activeCallSessionByUserRoomCache = new Map<string, { expiresAt: number; session: CommunityMessengerCallSession | null }>();

function invalidateActiveCallSessionByUserRoomCacheForRoom(roomId: string): void {
  const rid = trimText(roomId);
  if (!rid) return;
  const suffix = `\0${rid}`;
  for (const key of [...activeCallSessionByUserRoomCache.keys()]) {
    if (key.endsWith(suffix)) activeCallSessionByUserRoomCache.delete(key);
  }
}

export function resolveGroupCallSessionStatusAfterParticipantChange(input: {
  joinedCount: number;
  invitedCount: number;
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed";
}): CommunityMessengerCallSessionStatus {
  const { joinedCount, invitedCount, action } = input;
  if (joinedCount > 1 || (joinedCount >= 1 && invitedCount > 0)) return "active";
  if (invitedCount > 0) return "ringing";
  if (joinedCount > 0) return "ended";
  return action === "reject" ? "rejected" : "ended";
}

function viewerMaySeeActiveGroupCallSession(
  mapped: CommunityMessengerCallSession,
  viewerUserId: string
): boolean {
  if (mapped.sessionMode !== "group") return true;
  const mine = mapped.participants.find((p) => messengerUserIdsEqual(p.userId, viewerUserId));
  if (!mine) return false;
  return mine.status === "joined" || mine.status === "invited";
}

async function getActiveCallSessionForRoom(
  userId: string,
  roomId: string
): Promise<CommunityMessengerCallSession | null> {
  const rid = trimText(roomId);
  const uid = trimText(userId);
  const ck = `${uid}\0${rid}`;
  const nowMs = Date.now();
  pruneByExpiresAtAndMaxSize(activeCallSessionByUserRoomCache, nowMs, ACTIVE_CALL_ROOM_CACHE_MAX_ENTRIES);
  const hit = activeCallSessionByUserRoomCache.get(ck);
  if (hit && hit.expiresAt > Date.now()) return hit.session;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
      )
      .eq("room_id", rid)
      .in("status", ["ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && !error) {
      const mapped = await mapCallSession(userId, data as CallSessionRow, undefined, undefined, undefined, "labels_only");
      const visible =
        viewerMaySeeActiveGroupCallSession(mapped, uid) && !isTerminalCallSessionStatus(mapped.status)
          ? mapped
          : null;
      const tSet = Date.now();
      activeCallSessionByUserRoomCache.set(ck, {
        expiresAt: tSet + ACTIVE_CALL_ROOM_CACHE_TTL_MS,
        session: visible,
      });
      pruneByExpiresAtAndMaxSize(activeCallSessionByUserRoomCache, tSet, ACTIVE_CALL_ROOM_CACHE_MAX_ENTRIES);
      return visible;
    }
  }

  const dev = getDevState();
  const session = dev.callSessions
    .filter((item) => item.roomId === roomId && (item.status === "ringing" || item.status === "active"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const mappedRaw = session
    ? await mapCallSession(userId, session, undefined, undefined, undefined, "labels_only")
    : null;
  const mapped =
    mappedRaw && viewerMaySeeActiveGroupCallSession(mappedRaw, uid) && !isTerminalCallSessionStatus(mappedRaw.status)
      ? mappedRaw
      : null;
  const tSetDev = Date.now();
  activeCallSessionByUserRoomCache.set(ck, {
    expiresAt: tSetDev + ACTIVE_CALL_ROOM_CACHE_TTL_MS,
    session: mapped,
  });
  pruneByExpiresAtAndMaxSize(activeCallSessionByUserRoomCache, tSetDev, ACTIVE_CALL_ROOM_CACHE_MAX_ENTRIES);
  return mapped;
}

export async function getCommunityMessengerCallSessionById(
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSession | null> {
  const id = trimText(sessionId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  if (sb) {
    const [sessionRes, participantRes] = await Promise.all([
      (sb as any)
        .from("community_messenger_call_sessions")
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
        )
        .eq("id", id)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_call_session_participants")
        .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
        .eq("session_id", id)
        .order("created_at", { ascending: true }),
    ]);
    const { data, error } = sessionRes as { data: unknown; error: unknown };
    if (data && !error) {
      const row = data as CallSessionRow;
      const participantRows = (!participantRes.error && participantRes.data
        ? participantRes.data
        : []) as CallSessionParticipantRow[];
      const participants = dedupeIds(
        participantRows.map((item) => item.user_id).filter((value): value is string => typeof value === "string" && value.length > 0)
      );
      const mode = trimText(row.session_mode ?? "") || "direct";
      const canRead =
        callSessionParticipantsContain(participants, userId) ||
        (mode === "direct" &&
          (messengerUserIdsEqual(row.initiator_user_id, userId) ||
            messengerUserIdsEqual(row.recipient_user_id, userId)));
      if (!canRead) return null;
      return mapCallSession(
        userId,
        row,
        participantRows.length ? participantRows : null,
        undefined,
        participantRows.length > 0,
        "labels_only"
      );
    }
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === id);
  if (!session) return null;
  const participants = dedupeIds(session.participants.map((item) => item.userId));
  const canRead =
    callSessionParticipantsContain(participants, userId) ||
    (session.sessionMode === "direct" &&
      (messengerUserIdsEqual(session.initiatorUserId, userId) ||
        messengerUserIdsEqual(session.recipientUserId, userId)));
  if (!canRead) return null;
  return mapCallSession(userId, session, undefined, undefined, undefined, "labels_only");
}

function isCallStubRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasMatchingCallStubSessionId(metadata: unknown, sessionId: string | null | undefined): boolean {
  if (!sessionId || !isCallStubRecord(metadata)) return false;
  const sid = trimText(sessionId);
  if (!sid) return false;
  return trimText(metadata.sessionId) === sid || trimText(metadata.tmpSessionId) === sid;
}

type CallStubExistingRow = { id: string; createdAt: string };

async function findCallStubRowBySessionId(
  roomId: string,
  sessionId: string
): Promise<CallStubExistingRow | null> {
  const sid = trimText(sessionId);
  if (!sid) return null;
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existingRows } = await (sb as any)
      .from("community_messenger_messages")
      .select("id, metadata, created_at")
      .eq("room_id", roomId)
      .eq("message_type", "call_stub")
      .order("created_at", { ascending: false })
      .limit(100);
    const existingRow = ((existingRows ?? []) as Array<{ id: string; metadata?: unknown; created_at?: string }>).find(
      (row) => hasMatchingCallStubSessionId(row.metadata, sid)
    );
    if (!existingRow?.id) return null;
    return {
      id: existingRow.id,
      createdAt: trimText(existingRow.created_at) || "",
    };
  }
  const dev = getDevState();
  const existingMessage = [...dev.messages]
    .reverse()
    .find(
      (item) =>
        item.roomId === roomId &&
        item.messageType === "call_stub" &&
        hasMatchingCallStubSessionId(item.metadata, sid)
    );
  if (!existingMessage) return null;
  return { id: existingMessage.id, createdAt: trimText(existingMessage.createdAt) };
}

async function resolveCallSessionStartedAtIso(input: {
  sessionId?: string | null;
  explicitStartedAt?: string | null;
  context: string;
}): Promise<string> {
  const explicit = trimText(input.explicitStartedAt ?? "");
  if (explicit) return explicit;
  const sessionId = trimText(input.sessionId ?? "");
  if (sessionId) {
    const sb = getSupabaseOrNull();
    if (sb) {
      const { data } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select("started_at")
        .eq("id", sessionId)
        .maybeSingle();
      const fromDb = trimText((data as { started_at?: string } | null)?.started_at);
      if (fromDb) return fromDb;
    }
    const devSession = getDevState().callSessions.find((item) => item.id === sessionId);
    const fromDev = trimText(devSession?.startedAt);
    if (fromDev) return fromDev;
  }
  logCallTimelineDevWarning("call_started_at_fallback", {
    context: input.context,
    sessionId: sessionId || null,
  });
  return nowIso();
}

export async function appendCommunityMessengerCallStubMessage(input: {
  userId: string;
  roomId: string | null;
  sessionId?: string | null;
  /** 프리뷰 tmp_ — 세션 id 전엔 metadata 보조 */
  tmpSessionId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  /** 타임라인 행 created_at — 보통 session.started_at (dial→terminal UPDATE 시 불변) */
  createdAt: string;
  /**
   * 목록 lastActivityAt 권위 — terminal occurred_at(ended_at).
   * 없으면 createdAt. forward-only max(current, listActivityAt).
   */
  listActivityAt?: string | null;
  replaceExisting?: boolean;
  incrementUnread?: boolean;
  durationSeconds?: number;
  /**
   * true — rooms.last_message_at 을 listActivityAt 기준으로 forward-only bump + preview 갱신.
   * false — 레거시 dial stub 이후 terminal UPDATE(시각 유지, preview는 stub 시각 이내만).
   * CONTRACT: 1:1 은 dialing stub 미발행(2026-07-29) → terminal INSERT/UPDATE 는 true 필수.
   */
  bumpRoomLastMessageAt?: boolean;
}) {
  if (!input.roomId) return;
  const label = buildCommunityMessengerCallStubLabel(input.callKind, input.status, input.durationSeconds);
  const tmp = trimText(input.tmpSessionId ?? "");
  const metadata = {
    callKind: input.callKind,
    callStatus: input.status,
    sessionId: trimText(input.sessionId ?? "") || null,
    ...(tmp ? { tmpSessionId: tmp } : {}),
    durationSeconds:
      input.status === "ended" && Math.max(0, Number(input.durationSeconds ?? 0)) > 0
        ? Math.max(0, Math.floor(Number(input.durationSeconds ?? 0)))
        : null,
  };
  const shouldIncrementUnread = input.incrementUnread ?? true;
  const sessionId = trimText(input.sessionId ?? "");
  const bumpRoomLastMessageAt = input.bumpRoomLastMessageAt !== false;
  const listActivityAt =
    trimText(input.listActivityAt ?? "") || trimText(input.createdAt) || nowIso();

  const applyForwardOnlyRoomLastMessageAt = (
    currentAt: string,
    nextAt: string
  ): string | null => {
    const currentMs = new Date(currentAt).getTime();
    const nextMs = new Date(nextAt).getTime();
    if (!Number.isFinite(nextMs)) return null;
    if (!Number.isFinite(currentMs) || nextMs >= currentMs) return nextAt;
    return null;
  };

  const updateExistingStub = async (existing: CallStubExistingRow) => {
    const stubStartedAt = trimText(existing.createdAt) || trimText(input.createdAt);
    const sb = getSupabaseOrNull();
    if (sb) {
      await (sb as any)
        .from("community_messenger_messages")
        .update({
          content: label,
          metadata,
        })
        .eq("id", existing.id);
      const { data: roomRow } = await (sb as any)
        .from("community_messenger_rooms")
        .select("last_message_at, last_message_type")
        .eq("id", input.roomId)
        .maybeSingle();
      const roomAt = trimText((roomRow as { last_message_at?: string } | null)?.last_message_at);
      const roomMs = new Date(roomAt).getTime();
      const stubMs = new Date(stubStartedAt).getTime();
      if (bumpRoomLastMessageAt) {
        const roomPatch: Record<string, unknown> = {
          last_message: label,
          last_message_type: "call_stub",
        };
        const bumped = applyForwardOnlyRoomLastMessageAt(roomAt, listActivityAt);
        if (bumped) {
          roomPatch.last_message_at = bumped;
          roomPatch.updated_at = bumped;
        }
        await (sb as any).from("community_messenger_rooms").update(roomPatch).eq("id", input.roomId);
        return;
      }
      const roomPreviewStillFromThisCall =
        Number.isFinite(roomMs) && Number.isFinite(stubMs) && roomMs <= stubMs;
      if (roomPreviewStillFromThisCall) {
        await (sb as any)
          .from("community_messenger_rooms")
          .update({
            last_message: label,
            last_message_type: "call_stub",
          })
          .eq("id", input.roomId);
      }
      return;
    }
    const dev = getDevState();
    const existingMessage = dev.messages.find((item) => item.id === existing.id);
    if (existingMessage) {
      existingMessage.content = label;
      existingMessage.metadata = metadata;
    }
    const room = dev.rooms.find((item) => item.id === input.roomId);
    if (room) {
      if (bumpRoomLastMessageAt) {
        room.lastMessage = label;
        room.lastMessageType = "call_stub";
        const bumped = applyForwardOnlyRoomLastMessageAt(trimText(room.lastMessageAt), listActivityAt);
        if (bumped) room.lastMessageAt = bumped;
        return;
      }
      const roomMs = new Date(trimText(room.lastMessageAt)).getTime();
      const stubMs = new Date(stubStartedAt).getTime();
      if (Number.isFinite(roomMs) && Number.isFinite(stubMs) && roomMs > stubMs) {
        return;
      }
      room.lastMessage = label;
      room.lastMessageType = "call_stub";
    }
  };

  if (sessionId) {
    const existing = await findCallStubRowBySessionId(input.roomId, sessionId);
    if (existing) {
      await updateExistingStub(existing);
      return;
    }
  }
  if (tmp) {
    const existingByTmp = await findCallStubRowBySessionId(input.roomId, tmp);
    if (existingByTmp) {
      await updateExistingStub(existingByTmp);
      return;
    }
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    if (input.replaceExisting && sessionId) {
      /* legacy path — sessionId 매칭 행 없으면 복구 INSERT */
    }
    await (sb as any).from("community_messenger_messages").insert({
      room_id: input.roomId,
      sender_id: input.userId,
      message_type: "call_stub",
      content: label,
      metadata,
      created_at: input.createdAt,
    });
    const roomPatch: Record<string, unknown> = {
      last_message: label,
      last_message_type: "call_stub",
    };
    if (bumpRoomLastMessageAt) {
      /** lastActivityAt SSOT — terminal occurred_at 기준 forward-only */
      const { data: roomRow } = await (sb as any)
        .from("community_messenger_rooms")
        .select("last_message_at")
        .eq("id", input.roomId)
        .maybeSingle();
      const currentAt = trimText((roomRow as { last_message_at?: string } | null)?.last_message_at);
      const bumped = applyForwardOnlyRoomLastMessageAt(currentAt, listActivityAt);
      if (bumped) {
        roomPatch.last_message_at = bumped;
        roomPatch.updated_at = bumped;
      }
    }
    await (sb as any).from("community_messenger_rooms").update(roomPatch).eq("id", input.roomId);
    const { data: participants } = await (sb as any)
      .from("community_messenger_participants")
      .select("id, user_id, unread_count")
      .eq("room_id", input.roomId);
    if (!shouldIncrementUnread) return;
    for (const participant of (participants ?? []) as Array<{ id: string; user_id: string; unread_count?: number | null }>) {
      await (sb as any)
        .from("community_messenger_participants")
        .update({
          unread_count: participant.user_id === input.userId ? 0 : Number(participant.unread_count ?? 0) + 1,
          last_read_at: participant.user_id === input.userId ? input.createdAt : null,
        })
        .eq("id", participant.id);
    }
    return;
  }

  const dev = getDevState();
  dev.messages.push({
    id: randomUUID(),
    roomId: input.roomId,
    senderId: input.userId,
    messageType: "call_stub",
    content: label,
    metadata,
    createdAt: input.createdAt,
  });
  const room = dev.rooms.find((item) => item.id === input.roomId);
  if (room) {
    room.lastMessage = label;
    room.lastMessageType = "call_stub";
    if (bumpRoomLastMessageAt) {
      const bumped = applyForwardOnlyRoomLastMessageAt(trimText(room.lastMessageAt), listActivityAt);
      if (bumped) room.lastMessageAt = bumped;
    }
  }
  if (!shouldIncrementUnread) return;
  for (const participant of dev.participants.filter((item) => item.roomId === input.roomId)) {
    participant.unreadCount = participant.userId === input.userId ? 0 : participant.unreadCount + 1;
  }
}

async function ensureNoBlockedEitherWay(userId: string, targetUserId: string): Promise<boolean> {
  return !(await isBlockedEitherWay(userId, targetUserId));
}

export async function fetchBootstrapLiteSocialGraphSnapshot(
  userId: string
): Promise<BootstrapLiteSocialDeferredSnapshot> {
  const [
    acceptedFriendRows,
    favoriteFriendIds,
    followingIds,
    hiddenIds,
    blockedIds,
    requestRows,
  ] = await Promise.all([
    listBootstrapAcceptedFriendRowsFromSsot(userId),
    listFavoriteFriendIds(userId),
    listFollowingIds(userId, "neighbor_follow"),
    listFollowingIds(userId, "hidden"),
    listBlockedByMeIds(userId),
    Promise.resolve([] as RequestRow[]),
  ]);
  return {
    acceptedFriendRows,
    favoriteFriendIds,
    followingIds,
    hiddenIds,
    blockedIds,
    requestRows,
  };
}

function finishBootstrapLiteParallelBreakdown(diagnostics: CommunityMessengerBootstrapDiagnostics): void {
  const stages: Array<[string, number]> = [
    ["rooms", diagnostics.bootstrapLiteRoomsFetchMs],
    ["friends", diagnostics.bootstrapLiteFriendsFetchMs],
    ["requests", diagnostics.bootstrapLiteRequestsFetchMs],
    ["favorite", diagnostics.bootstrapLiteFavoriteFetchMs],
    ["discoverable", diagnostics.bootstrapLiteDiscoverableFetchMs],
    ["meetings", diagnostics.bootstrapLiteMeetingsFetchMs],
  ];
  let slowestStage = "rooms";
  let slowestMs = -1;
  for (const [name, ms] of stages) {
    if (ms > slowestMs) {
      slowestMs = ms;
      slowestStage = name;
    }
  }
  diagnostics.bootstrapLiteParallelSlowestStage = slowestStage;
  diagnostics.bootstrapLiteParallelSlowestMs = Math.max(0, slowestMs);
}

export async function getCommunityMessengerBootstrap(
  userId: string,
  options?: {
    skipDiscoverable?: boolean;
    deferCallLog?: boolean;
    diagnostics?: CommunityMessengerBootstrapDiagnostics;
    detailedTimingBreakdown?: boolean;
    /** `?fresh=1` — lite rooms 프로세스 캐시 우회(측정용) */
    bypassLiteRoomsCache?: boolean;
  }
): Promise<CommunityMessengerBootstrap> {
  const skipDiscoverable = options?.skipDiscoverable === true;
  const deferCallLog = options?.deferCallLog === true;
  const isMinimalLiteBootstrap = skipDiscoverable && deferCallLog;
  const diagnostics = options?.diagnostics;
  const detailedTimingBreakdown = options?.detailedTimingBreakdown === true;
  const myRoomsDiagnostics = createEmptyBootstrapRoomsDiagnostics();
  if (diagnostics) {
    diagnostics.parallelInitialWallMs = 0;
    diagnostics.roomsQueryMs = 0;
    diagnostics.roomsQueryRound1Ms = 0;
    diagnostics.roomsQueryRound2Ms = 0;
    diagnostics.roomsQueryRound2RoomsMs = 0;
    diagnostics.roomsQueryRound2RoomsDbFetchMs = 0;
    diagnostics.roomsQueryRound2RoomsNormalizeMs = 0;
    diagnostics.roomsQueryRound2RoomsMergeMapMs = 0;
    diagnostics.roomsQueryRound2RoomsHydrateLabelMs = 0;
    diagnostics.roomsQueryRound2RoomsPayloadSerializeMs = 0;
    diagnostics.roomsQueryRound2ParticipantsMs = 0;
    diagnostics.roomsQueryRound3Ms = 0;
    diagnostics.roomsQueryTransformMs = 0;
    diagnostics.roomsQueryPostprocessMs = 0;
    diagnostics.unreadMs = 0;
    diagnostics.profilesMs = 0;
    diagnostics.tradeContextMs = 0;
    diagnostics.callsLogMs = 0;
    diagnostics.transformMs = 0;
    diagnostics.roomCount = 0;
    diagnostics.participantCount = 0;
    diagnostics.roomsQueryRound1RoomIdCount = 0;
    diagnostics.roomsQueryRound2RoomRowCount = 0;
    diagnostics.roomsQueryRound2ParticipantRowCount = 0;
    diagnostics.roomsQueryRound3RoomProfileCount = 0;
    diagnostics.unreadAggregation =
      "community_messenger_participants.unread_count + trade legacy unread batch max merge";
    diagnostics.roomsQueryRounds = 0;
    diagnostics.additionalLookupRounds = 0;
    diagnostics.extraRoomsFetchRounds = 0;
    diagnostics.hasPerRoomNPlusOne = false;
    diagnostics.callsLogIncluded = !deferCallLog;
    diagnostics.discoverableIncluded = !skipDiscoverable;
    diagnostics.roomsPayloadDbRoundTrips = 0;
    diagnostics.parallelAcceptedFriendsBundleMs = 0;
    diagnostics.parallelFavoriteFriendsMs = 0;
    diagnostics.parallelFollowingNeighborMs = 0;
    diagnostics.parallelFollowingHiddenMs = 0;
    diagnostics.parallelFollowingBlockedMs = 0;
    diagnostics.parallelFriendRequestsMs = 0;
    diagnostics.parallelDiscoverableFetchMs = 0;
    diagnostics.callsLogRowsFetchMs = 0;
    diagnostics.parallelMeetingsForDiscoverableMs = 0;
    diagnostics.enrichTradeDirectKeysMs = 0;
    diagnostics.enrichTradeSellerHydrateMs = 0;
    diagnostics.enrichTradeMiddlePipelineMs = 0;
    diagnostics.enrichTradePostsFetchMs = 0;
    diagnostics.enrichTradeCategoryFetchMs = 0;
    diagnostics.enrichTradeCpuMergeMs = 0;
    diagnostics.enrichTradeNormalizeMs = 0;
    diagnostics.enrichTradeHiddenFallbackMs = 0;
    diagnostics.bootstrapLiteTradeEnrichFastPath = false;
    diagnostics.bootstrapLiteTradeHeavyPipelineSkipped = false;
    diagnostics.bootstrapLiteHeavyTargetCountBefore = 0;
    diagnostics.bootstrapLiteHeavyTargetCountAfterDirectKeys = 0;
    diagnostics.bootstrapLiteHeavyTargetReasonsTop = "";
    diagnostics.bootstrapLiteMissingOnlyBatchMs = 0;
    diagnostics.bootstrapLiteMiddlePipelineBlocked = false;
    diagnostics.bootstrapLiteDeferredHydrationCount = 0;
    diagnostics.bootstrapLiteDirectKeysMegaRpcMs = 0;
    diagnostics.bootstrapLiteDirectKeysMegaCacheReason = "";
    diagnostics.bootstrapLiteDirectKeysPrefetchWaitMs = 0;
    diagnostics.bootstrapLiteDirectKeysParseApplyMs = 0;
    diagnostics.bootstrapLiteDirectKeysMegaNetworkMs = 0;
    diagnostics.bootstrapMonolithWallMs = 0;
    diagnostics.bootstrapLiteRoomsFetchMs = 0;
    diagnostics.bootstrapLiteFriendsFetchMs = 0;
    diagnostics.bootstrapLiteRequestsFetchMs = 0;
    diagnostics.bootstrapLiteFavoriteFetchMs = 0;
    diagnostics.bootstrapLiteDiscoverableFetchMs = 0;
    diagnostics.bootstrapLiteMeetingsFetchMs = 0;
    diagnostics.bootstrapLiteParallelSlowestStage = "";
    diagnostics.bootstrapLiteParallelSlowestMs = 0;
    diagnostics.bootstrapLiteSocialGraphSource = "n/a";
    diagnostics.bootstrapLiteRoomIdsRpcMs = 0;
    diagnostics.bootstrapLiteRoomsMetaFetchMs = 0;
    diagnostics.bootstrapLiteParticipantsJoinMs = 0;
    diagnostics.bootstrapLiteLastMessageFetchMs = 0;
    diagnostics.bootstrapLiteRoomPayloadMapMs = 0;
    diagnostics.bootstrapLiteRoomsQuerySlowestStage = "";
    diagnostics.bootstrapLiteRoomsQuerySlowestMs = 0;
    diagnostics.bootstrapLiteRoomsRpcCacheHit = false;
    diagnostics.bootstrapLiteRoomsCacheBypass = options?.bypassLiteRoomsCache === true;
    diagnostics.bootstrapLiteRoomCount = 0;
    diagnostics.bootstrapLiteParticipantCount = 0;
    diagnostics.bootstrapLiteRoomsFetchPath = "legacy";
    diagnostics.bootstrapLiteProfilesBundleEmbeddedCount = 0;
    diagnostics.bootstrapLiteProfilesMissFetchCount = 0;
    diagnostics.bootstrapLiteProfilesFetchMs = 0;
  }
  const tBootstrapMonolith0 = performance.now();
  const myPayloadPromise = (async () => {
    const tRooms = performance.now();
    if (isMinimalLiteBootstrap && !options?.bypassLiteRoomsCache) {
      const cached = peekBootstrapLiteRoomsPayload(userId);
      if (cached) {
        myRoomsDiagnostics.liteRoomsCacheHit = true;
        const payload = cached as MessengerRoomsPayload;
        if (diagnostics) {
          diagnostics.roomsQueryMs = Math.round(performance.now() - tRooms);
          diagnostics.roomCount = payload.roomRows.length;
          diagnostics.participantCount = payload.participantRows.length;
          diagnostics.roomsPayloadDbRoundTrips = 0;
          myRoomsDiagnostics.round2RoomRowCount = payload.roomRows.length;
          myRoomsDiagnostics.round2ParticipantRowCount = payload.participantRows.length;
          finishBootstrapLiteRoomsQueryBreakdown(diagnostics, myRoomsDiagnostics);
        }
        return payload;
      }
    }
    const payload = await fetchMyRoomsPayload(userId, {
      diagnostics: myRoomsDiagnostics,
      includeRoomProfiles: !isMinimalLiteBootstrap,
      bootstrapLiteBundle: isMinimalLiteBootstrap,
      criticalSlimRoomSelect: isMinimalLiteBootstrap,
    });
    if (isMinimalLiteBootstrap) {
      storeBootstrapLiteRoomsPayload(userId, payload);
    }
    if (diagnostics) {
      diagnostics.roomsQueryMs = Math.round(performance.now() - tRooms);
      diagnostics.roomCount = payload.roomRows.length;
      diagnostics.participantCount = payload.participantRows.length;
      diagnostics.roomsQueryRounds = myRoomsDiagnostics.rounds;
      diagnostics.roomsQueryRound1Ms = myRoomsDiagnostics.round1Ms;
      diagnostics.roomsQueryRound2Ms = myRoomsDiagnostics.round2Ms;
      diagnostics.roomsQueryRound2RoomsMs = myRoomsDiagnostics.round2RoomsMs;
      diagnostics.roomsQueryRound2RoomsDbFetchMs = myRoomsDiagnostics.round2RoomsDbFetchMs;
      diagnostics.roomsQueryRound2RoomsNormalizeMs = myRoomsDiagnostics.round2RoomsNormalizeMs;
      diagnostics.roomsQueryRound2RoomsMergeMapMs = myRoomsDiagnostics.round2RoomsMergeMapMs;
      diagnostics.roomsQueryRound2RoomsHydrateLabelMs = myRoomsDiagnostics.round2RoomsHydrateLabelMs;
      diagnostics.roomsQueryRound2RoomsPayloadSerializeMs = myRoomsDiagnostics.round2RoomsPayloadSerializeMs;
      diagnostics.roomsQueryRound2ParticipantsMs = myRoomsDiagnostics.round2ParticipantsMs;
      diagnostics.roomsQueryRound3Ms = myRoomsDiagnostics.round3Ms;
      diagnostics.roomsQueryTransformMs = myRoomsDiagnostics.transformMs;
      diagnostics.roomsQueryPostprocessMs = myRoomsDiagnostics.postprocessMs;
      diagnostics.roomsQueryRound1RoomIdCount = myRoomsDiagnostics.round1RoomIdCount;
      diagnostics.roomsQueryRound2RoomRowCount = myRoomsDiagnostics.round2RoomRowCount;
      diagnostics.roomsQueryRound2ParticipantRowCount = myRoomsDiagnostics.round2ParticipantRowCount;
      diagnostics.roomsQueryRound3RoomProfileCount = myRoomsDiagnostics.round3RoomProfileCount;
      diagnostics.roomsPayloadDbRoundTrips = myRoomsDiagnostics.queryCount;
      if (isMinimalLiteBootstrap) {
        finishBootstrapLiteRoomsQueryBreakdown(diagnostics, myRoomsDiagnostics);
      }
    }
    return payload;
  })();
  /** lite: rooms 직후 mega RPC — enrich 에서 동일 Promise 재사용 */
  const bootstrapLiteMegaBundlePrefetchPromise: Promise<HomeSyncMegaDirectKeysBundleFetchResult> | null =
    isMinimalLiteBootstrap
      ? myPayloadPromise.then((payload) => {
          const sb = getSupabaseOrNull();
          if (!sb) {
            return {
              data: null,
              error: { message: "no_supabase" },
              leaderRpcWallMs: 0,
              lookupWallMs: 0,
              megaMapSyncMs: 0,
              megaInflightOrRpcWaitMs: 0,
              cacheReason: "rpc_cold" as const,
              singleflightJoinCount: 0,
              cacheKey: "",
            };
          }
          const { pcIds, itemTradeRoomIds } = extractTradeDirectKeyIdsFromRoomRows(
            payload.roomRows as ReadonlyArray<{ direct_key?: string | null }>
          );
          if (!pcIds.length && !itemTradeRoomIds.length) {
            return {
              data: null,
              error: null,
              leaderRpcWallMs: 0,
              lookupWallMs: 0,
              megaMapSyncMs: 0,
              megaInflightOrRpcWaitMs: 0,
              cacheReason: "rpc_cold" as const,
              singleflightJoinCount: 0,
              cacheKey: "mega:empty",
            };
          }
          return fetchHomeSyncMegaDirectKeysBundleCached(sb, pcIds, itemTradeRoomIds);
        })
      : null;
  const callRowsPromise = deferCallLog
    ? Promise.resolve<Array<CallRow | DevCall>>([])
    : (async () => {
        const tCalls = performance.now();
        const rows = await fetchCallLogRowsOnly(userId);
        const elapsed = Math.round(performance.now() - tCalls);
        diagnostics && (diagnostics.callsLogMs += elapsed);
        diagnostics && (diagnostics.callsLogRowsFetchMs = elapsed);
        return rows;
      })();
  const emptyDiscoverableState = (): DiscoverableOpenGroupsRawState => ({
    roomRows: [],
    participantRows: [],
    byRoomId: new Map(),
    roomProfileMap: new Map(),
    joinedRoomIds: new Set(),
  });

  let acceptedFriendRows: CommunityFriendRequestAcceptedRow[] = [];
  let favoriteFriendIds: string[] = [];
  let followingIds: string[] = [];
  let hiddenIds: string[] = [];
  let blockedIds: string[] = [];
  let requestRows: RequestRow[] = [];
  let myPayload: Awaited<ReturnType<typeof fetchMyRoomsPayload>>;
  let discState: DiscoverableOpenGroupsRawState;
  let callRows: Array<CallRow | DevCall>;

  const tParallelInitial = performance.now();
  if (isMinimalLiteBootstrap) {
    /** lite 첫 페인트: 방 목록만 parallel wall 에 포함 — mega·소셜은 겹치거나 지연 */
    myPayload = await myPayloadPromise;
    diagnostics && (diagnostics.bootstrapLiteRoomsFetchMs = diagnostics.roomsQueryMs);
    const socialPeek = peekBootstrapLiteSocialDeferred(userId);
    if (socialPeek.snapshot) {
      acceptedFriendRows = socialPeek.snapshot.acceptedFriendRows;
      favoriteFriendIds = socialPeek.snapshot.favoriteFriendIds;
      followingIds = socialPeek.snapshot.followingIds;
      hiddenIds = socialPeek.snapshot.hiddenIds;
      blockedIds = socialPeek.snapshot.blockedIds;
      requestRows = socialPeek.snapshot.requestRows as RequestRow[];
      diagnostics && (diagnostics.bootstrapLiteSocialGraphSource = "cache");
      diagnostics && (diagnostics.bootstrapLiteFriendsFetchMs = socialPeek.peekMs);
    } else {
      diagnostics && (diagnostics.bootstrapLiteSocialGraphSource = "empty");
    }
    diagnostics && (diagnostics.bootstrapLiteRequestsFetchMs = 0);
    diagnostics && (diagnostics.bootstrapLiteFavoriteFetchMs = 0);
    diagnostics && (diagnostics.bootstrapLiteDiscoverableFetchMs = 0);
    diagnostics && (diagnostics.bootstrapLiteMeetingsFetchMs = 0);
    diagnostics &&
      (diagnostics.parallelAcceptedFriendsBundleMs = diagnostics.bootstrapLiteFriendsFetchMs);
    diagnostics && (diagnostics.parallelFavoriteFriendsMs = 0);
    diagnostics && (diagnostics.parallelFollowingNeighborMs = 0);
    diagnostics && (diagnostics.parallelFollowingHiddenMs = 0);
    diagnostics && (diagnostics.parallelFollowingBlockedMs = 0);
    diagnostics && (diagnostics.parallelFriendRequestsMs = 0);
    diagnostics && (diagnostics.parallelDiscoverableFetchMs = 0);
    discState = emptyDiscoverableState();
    callRows = [];
    scheduleBootstrapLiteSocialGraphBackgroundHydration(userId, () =>
      fetchBootstrapLiteSocialGraphSnapshot(userId)
    );
  } else {
    const acceptedFriendRowsPromise = (async () => {
      const t = performance.now();
      const rows = await listBootstrapAcceptedFriendRowsFromSsot(userId);
      diagnostics && (diagnostics.parallelAcceptedFriendsBundleMs = Math.round(performance.now() - t));
      return rows;
    })();
    const fullParallel = await Promise.all([
      acceptedFriendRowsPromise,
      (async () => {
        const t = performance.now();
        const r = await listFavoriteFriendIds(userId);
        diagnostics && (diagnostics.parallelFavoriteFriendsMs = Math.round(performance.now() - t));
        return r;
      })(),
      (async () => {
        const t = performance.now();
        const r = await listFollowingIds(userId, "neighbor_follow");
        diagnostics && (diagnostics.parallelFollowingNeighborMs = Math.round(performance.now() - t));
        return r;
      })(),
      (async () => {
        const t = performance.now();
        const r = await listFollowingIds(userId, "hidden");
        diagnostics && (diagnostics.parallelFollowingHiddenMs = Math.round(performance.now() - t));
        return r;
      })(),
      (async () => {
        const t = performance.now();
        const r = await listBlockedByMeIds(userId);
        diagnostics && (diagnostics.parallelFollowingBlockedMs = Math.round(performance.now() - t));
        return r;
      })(),
      (async () => {
        const t = performance.now();
        const r = await listCommunityMessengerFriendRequestRows(userId);
        diagnostics && (diagnostics.parallelFriendRequestsMs = Math.round(performance.now() - t));
        return r;
      })(),
      myPayloadPromise,
      bootstrapLiteMegaBundlePrefetchPromise ?? Promise.resolve(null),
      skipDiscoverable
        ? Promise.resolve(emptyDiscoverableState())
        : (async () => {
            const t = performance.now();
            const r = await fetchDiscoverableOpenGroupsRawState(userId);
            diagnostics && (diagnostics.parallelDiscoverableFetchMs = Math.round(performance.now() - t));
            return r;
          })(),
      callRowsPromise,
    ]);
    acceptedFriendRows = fullParallel[0]!;
    favoriteFriendIds = fullParallel[1]!;
    followingIds = fullParallel[2]!;
    hiddenIds = fullParallel[3]!;
    blockedIds = fullParallel[4]!;
    requestRows = fullParallel[5]!;
    myPayload = fullParallel[6]!;
    discState = fullParallel[8]!;
    callRows = fullParallel[9]!;
    diagnostics && (diagnostics.bootstrapLiteSocialGraphSource = "full_fetch");
    diagnostics && (diagnostics.bootstrapLiteRoomsFetchMs = diagnostics.roomsQueryMs);
    diagnostics && (diagnostics.bootstrapLiteFriendsFetchMs = diagnostics.parallelAcceptedFriendsBundleMs);
    diagnostics && (diagnostics.bootstrapLiteRequestsFetchMs = diagnostics.parallelFriendRequestsMs);
    diagnostics && (diagnostics.bootstrapLiteFavoriteFetchMs = diagnostics.parallelFavoriteFriendsMs);
    diagnostics && (diagnostics.bootstrapLiteDiscoverableFetchMs = diagnostics.parallelDiscoverableFetchMs);
    diagnostics && (diagnostics.bootstrapLiteMeetingsFetchMs = 0);
  }
  const friendIds = acceptedPeerIdsFromCommunityFriendRows(userId, acceptedFriendRows);
  const friendshipAcceptedAtByPeer = friendshipAcceptedAtByPeerFromRows(userId, acceptedFriendRows);
  diagnostics && (diagnostics.parallelInitialWallMs = Math.round(performance.now() - tParallelInitial));
  if (isMinimalLiteBootstrap && diagnostics) {
    finishBootstrapLiteParallelBreakdown(diagnostics);
  }
  if (isMinimalLiteBootstrap && diagnostics) {
    /** Lite 도 trade unread 병합·context enrich 를 쓰므로 full 과 동일 문구 */
    diagnostics.unreadAggregation =
      "community_messenger_participants.unread_count + trade legacy unread batch max merge";
  }

  const callRoomIds = dedupeIds(
    callRows.map((row) => callLogRoomId(row)).filter((value): value is string => Boolean(value))
  );
  const myRoomIdSet = new Set(myPayload.roomRows.map((r) => r.id));
  const missingCallRoomIds = callRoomIds.filter((id) => !myRoomIdSet.has(id));
  const shouldHydrateCallData = !deferCallLog && callRows.length > 0;
  const extraPayload =
    shouldHydrateCallData && missingCallRoomIds.length > 0
      ? await (async () => {
          const tExtraRooms = performance.now();
          const payload = await fetchRoomsPayloadByRoomIds(missingCallRoomIds);
          diagnostics && (diagnostics.extraRoomsFetchRounds += 1);
          diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tExtraRooms));
          return payload;
        })()
      : null;

  const sessionIds = shouldHydrateCallData
    ? dedupeIds(callRows.map((row) => callLogSessionId(row) ?? "").filter(Boolean))
    : [];
  const sessionParticipantUserIds = shouldHydrateCallData
    ? await (async () => {
        const tSessionUsers = performance.now();
        const ids = await fetchCallSessionParticipantUserIds(sessionIds);
        diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tSessionUsers));
        return ids;
      })()
    : [];

  const peerIdsFromCalls = dedupeIds(
    callRows.map((row) => callLogPeerUserId(row) ?? "").filter(Boolean)
  );

  const allIds = dedupeIds([
    userId,
    ...friendIds,
    ...favoriteFriendIds,
    ...followingIds,
    ...hiddenIds,
    ...blockedIds,
    ...requestRows.flatMap((row) => [row.requester_id, row.addressee_id]),
    ...dedupeParticipantUserIds(myPayload.participantRows),
    ...dedupeParticipantUserIds(discState.participantRows),
    ...(extraPayload ? dedupeParticipantUserIds(extraPayload.participantRows) : []),
    ...peerIdsFromCalls,
    ...sessionParticipantUserIds,
  ]);

  const liteProfileHydrateIds = isMinimalLiteBootstrap
    ? dedupeIds([userId, ...dedupeParticipantUserIds(myPayload.participantRows)])
    : allIds;
  const litePrefetchedProfiles = isMinimalLiteBootstrap ? myPayload.bootstrapLiteProfileLabels : undefined;
  if (isMinimalLiteBootstrap && diagnostics) {
    let embedded = 0;
    let miss = 0;
    for (const id of liteProfileHydrateIds) {
      if (litePrefetchedProfiles?.has(id)) embedded += 1;
      else miss += 1;
    }
    diagnostics.bootstrapLiteProfilesBundleEmbeddedCount = embedded;
    diagnostics.bootstrapLiteProfilesMissFetchCount = miss;
  }

  const tProfiles = performance.now();
  const { profileMap } = await hydrateProfilesLabelsOnlyWithMap(userId, liteProfileHydrateIds, {
    includeSelf: true,
    prefetchedProfiles: litePrefetchedProfiles,
    bootstrapLiteFirstPaint: isMinimalLiteBootstrap,
  });
  const profilesWallMs = Math.round(performance.now() - tProfiles);
  diagnostics && (diagnostics.profilesMs = profilesWallMs);
  diagnostics && isMinimalLiteBootstrap && (diagnostics.bootstrapLiteProfilesFetchMs = profilesWallMs);
  const profileBuildTargetIds = isMinimalLiteBootstrap ? liteProfileHydrateIds : allIds;
  const allProfiles = buildProfilesFromKnownRelations({
    viewerId: userId,
    targetIds: profileBuildTargetIds,
    profileMap,
    friendIds,
    favoriteFriendIds,
    followingIds,
    hiddenIds,
    blockedIds,
    friendshipAcceptedAtByPeer,
  });
  const profileById = new Map(allProfiles.map((profile) => [profile.id, profile]));

  const tTransformCore = performance.now();
  const me = profileById.get(userId) ?? null;
  const friends = friendIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile))
    .map((profile) => ({
      ...profile,
      friendshipAcceptedAt: friendshipAcceptedAtByPeer.get(profile.id) ?? null,
    }));
  const following = followingIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
  const hidden = hiddenIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
  const blocked = blockedIds
    .map((id) => profileById.get(id))
    .filter((profile): profile is CommunityMessengerProfileLite => Boolean(profile));
  const requests: CommunityMessengerFriendRequest[] = [];
  const hiddenIdSet = new Set(hidden.map((profile) => profile.id));

  const tRoomsHydrateLabel = performance.now();
  const mySummaries = summarizeRoomsBatchWithProfileMap(userId, myPayload.roomRows, myPayload.roomProfileMap, myPayload.byRoomId, profileById);
  diagnostics && (diagnostics.roomsQueryRound2RoomsHydrateLabelMs = Math.round(performance.now() - tRoomsHydrateLabel));
  diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransformCore));
  /**
   * Lite 부트스트랩: 썸네일·제목은 유지하되 home-sync critical 과 동일한 fast enrich
   * (mega direct_keys · posts critical 1RTT · category fallback_only · Phase D 생략).
   * Philife 오픈그룹 라벨 보강만 lite 에서 생략한다.
   * @see `bootstrap-lite-policy.ts` — heavy enrich 는 클라 `useTradeChatListMetaHydration` 이 보강.
   */
  {
    const tTrade = performance.now();
    const liteBootstrapTrace: HomeSyncTrace | undefined = isMinimalLiteBootstrap
      ? {
          token: "bootstrap-lite",
          tier: "critical",
          authSessionMs: 0,
          deepSteps: {},
        }
      : undefined;
    if (diagnostics && isMinimalLiteBootstrap) {
      diagnostics.bootstrapLiteTradeEnrichFastPath = true;
    }
    await enrichTradeRoomContextMetaForBootstrap(userId, mySummaries, diagnostics, liteBootstrapTrace, {
      tradeCategoryFetchMode: isMinimalLiteBootstrap ? "fallback_only" : "full",
      homeSyncMegaBundleForDirectKeys: isMinimalLiteBootstrap,
      bootstrapLiteFastEnrich: isMinimalLiteBootstrap,
      megaBundlePrefetchPromise: bootstrapLiteMegaBundlePrefetchPromise ?? undefined,
    });
    diagnostics && (diagnostics.tradeContextMs = Math.round(performance.now() - tTrade));
    diagnostics &&
      (diagnostics.enrichTradeMiddlePipelineMs = isMinimalLiteBootstrap
        ? 0
        : Math.max(
            0,
            diagnostics.tradeContextMs -
              diagnostics.enrichTradeDirectKeysMs -
              diagnostics.enrichTradeSellerHydrateMs
          ));
    const sbBoot = getSupabaseOrNull();
    if (sbBoot) {
      /**
       * Lite tier 거래 분류 parity — critical(`bootstrap/critical-stage`)·full 과 동일하게
       * peer-pair/product_chats/item_trade ledger 기반 trade 확정을 lite context_meta 에 반영한다.
       * fast-path 로 이미 `kind==="trade"` 인 방은 함수 내부에서 보존되고 미분류 direct 방만 보강한다
       * (일반 friend·delivery·group·commerce direct_key·타 CM 방 FK product_chat 은 제외 — 오분류 방지 유지).
       * 추가 쿼리는 미분류 direct 방이 있을 때만: product_chats(by room) + chat_rooms(ledger) + peer-pair 2병렬 — N+1 아님.
       */
      if (isMinimalLiteBootstrap) {
        const tTradeClass = performance.now();
        await enrichTradeRoomClassificationForDeferredHomeSync(sbBoot as never, userId, mySummaries).catch(() => {});
        diagnostics && (diagnostics.bootstrapLiteTradeClassificationMs = Math.round(performance.now() - tTradeClass));
      }
      const tUnread = performance.now();
      await enrichMessengerTradeUnreadWithLegacyTrade(sbBoot as any, userId, mySummaries).catch(() => {});
      diagnostics && (diagnostics.unreadMs = Math.round(performance.now() - tUnread));
    }
  }
  if (!isMinimalLiteBootstrap) {
    const { enrichOpenGroupSummariesWithPhilifeMeetingLabels } = await import(
      "@/lib/community-messenger/philife-meeting-open-group-summaries"
    );
    await enrichOpenGroupSummariesWithPhilifeMeetingLabels(userId, mySummaries);
  }
  const tTransformLists = performance.now();
  const chats = mySummaries.filter((room) => room.roomType === "direct");
  const groups = mySummaries.filter((room) => isCommunityMessengerPrivateGroupListRoomType(room.roomType));

  const discSummaries = summarizeRoomsBatchWithProfileMap(
    userId,
    discState.roomRows,
    discState.roomProfileMap,
    discState.byRoomId,
    profileById
  );
  const meetingMetaByRoomId = new Map<
    string,
    { id: string; regionText: string | null; categoryText: string | null; platformApprovalStatus: string | null }
  >();
  const discoverableRoomIds = dedupeIds(discSummaries.map((summary) => summary.id));
  if (discoverableRoomIds.length > 0) {
    const sbMeet = getSupabaseOrNull();
    if (sbMeet) {
      const tMeet = performance.now();
      const { data: meetingRows } = await (sbMeet as any)
        .from("meetings")
        .select("id, community_messenger_room_id, region_text, category_text, platform_approval_status")
        .in("community_messenger_room_id", discoverableRoomIds);
      diagnostics && (diagnostics.parallelMeetingsForDiscoverableMs = Math.round(performance.now() - tMeet));
      for (const row of (meetingRows ?? []) as Array<{
        id?: unknown;
        community_messenger_room_id?: unknown;
        region_text?: unknown;
        category_text?: unknown;
        platform_approval_status?: unknown;
      }>) {
        const roomId = trimText(row.community_messenger_room_id);
        const meetingId = trimText(row.id);
        if (!roomId || !meetingId) continue;
        meetingMetaByRoomId.set(roomId, {
          id: meetingId,
          regionText: trimText(row.region_text) || null,
          categoryText: trimText(row.category_text) || null,
          platformApprovalStatus: trimText(row.platform_approval_status) || null,
        });
      }
    }
  }
  const discoverableGroups = discSummaries
    .map((summary) => {
      if (summary.roomType !== "open_group") return null;
      const meetingMeta = meetingMetaByRoomId.get(summary.id);
      if (meetingMeta?.platformApprovalStatus === "pending_approval") return null;
      return {
        id: summary.id,
        roomType: "open_group" as const,
        roomStatus: summary.roomStatus,
        visibility: "public" as const,
        joinPolicy: summary.joinPolicy === "free" ? "free" : "password",
        identityPolicy: summary.identityPolicy,
        title: summary.title,
        summary: summary.summary,
        ownerUserId: summary.ownerUserId,
        ownerLabel: summary.ownerLabel,
        memberCount: summary.memberCount,
        memberLimit: summary.memberLimit,
        isDiscoverable: summary.isDiscoverable,
        requiresPassword: summary.requiresPassword,
        lastMessage: summary.lastMessage,
        lastMessageAt: summary.lastMessageAt,
        isJoined: discState.joinedRoomIds.has(summary.id),
        meetingId: meetingMeta?.id ?? null,
        regionText: meetingMeta?.regionText ?? null,
        categoryText: meetingMeta?.categoryText ?? null,
        platformApprovalStatus: meetingMeta?.platformApprovalStatus ?? null,
      };
    })
    .filter(Boolean) as CommunityMessengerDiscoverableGroupSummary[];

  const tRoomsMergeMap = performance.now();
  const roomSummaryMap = new Map<string, CommunityMessengerRoomSummary>();
  for (const s of mySummaries) roomSummaryMap.set(s.id, s);
  diagnostics && (diagnostics.roomsQueryRound2RoomsMergeMapMs = Math.round(performance.now() - tRoomsMergeMap));
  if (extraPayload) {
    const extraSummaries = summarizeRoomsBatchWithProfileMap(
      userId,
      extraPayload.roomRows,
      extraPayload.roomProfileMap,
      extraPayload.byRoomId,
      profileById
    );
    for (const s of extraSummaries) roomSummaryMap.set(s.id, s);
  }
  if (diagnostics && detailedTimingBreakdown) {
    const tRoomsSerialize = performance.now();
    JSON.stringify({ chats, groups });
    diagnostics.roomsQueryRound2RoomsPayloadSerializeMs = Math.round(performance.now() - tRoomsSerialize);
  }
  diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransformLists));

  const { sessionMap, participantsBySession } = shouldHydrateCallData
    ? await (async () => {
        const tSessionMaps = performance.now();
        const maps = await loadSessionMapsForCallLogs(userId, sessionIds, profileById);
        diagnostics && (diagnostics.callsLogMs += Math.round(performance.now() - tSessionMaps));
        return maps;
      })()
    : {
        sessionMap: new Map<string, CallSessionMetaRow | DevCallSession>(),
        participantsBySession: new Map<string, CommunityMessengerCallParticipant[]>(),
      };
  const tTransformCalls = performance.now();
  const calls = buildCallLogEntriesFromRows(
    userId,
    callRows,
    profileById,
    roomSummaryMap,
    sessionMap,
    participantsBySession
  );
  diagnostics && (diagnostics.transformMs += Math.round(performance.now() - tTransformCalls));

  const base: CommunityMessengerBootstrap = {
    me,
    tabs: {
      friends: friends.filter((profile) => !hiddenIdSet.has(profile.id)).length,
      chats: chats.length,
      groups: groups.length,
      calls: calls.length,
    },
    friends,
    following,
    hidden,
    blocked,
    requests,
    chats,
    groups,
    discoverableGroups,
    calls,
  };
  if (!isMinimalLiteBootstrap) {
    storeBootstrapLiteSocialDeferred(userId, {
      acceptedFriendRows,
      favoriteFriendIds,
      followingIds,
      hiddenIds,
      blockedIds,
      requestRows,
    });
    if (diagnostics) {
      finishBootstrapLiteParallelBreakdown(diagnostics);
    }
  }
  if (diagnostics) {
    diagnostics.additionalLookupRounds =
      (diagnostics.profilesMs > 0 ? 1 : 0) +
      (diagnostics.tradeContextMs > 0 ? 2 : 0) +
      (diagnostics.unreadMs > 0 ? 3 : 0) +
      (shouldHydrateCallData && diagnostics.callsLogMs > 0 ? 3 : 0);
    diagnostics.bootstrapMonolithWallMs = Math.round(performance.now() - tBootstrapMonolith0);
  }
  return deferCallLog ? { ...base, deferredCallLog: true as const } : base;
}

export async function getCommunityMessengerBootstrapCritical(userId: string): Promise<{
  payload: CommunityMessengerBootstrapCritical;
  criticalPayloadMs: number;
  dbRoundTrips: number;
  roomCount: number;
  tierDiagnostics: import("@/lib/community-messenger/bootstrap/critical-stage").CommunityMessengerCriticalTierDiagnostics;
}> {
  const t0 = performance.now();
  const { loadCommunityMessengerBootstrapCritical } = await import("@/lib/community-messenger/bootstrap/critical-stage");
  const tierDiagnostics: import("@/lib/community-messenger/bootstrap/critical-stage").CommunityMessengerCriticalTierDiagnostics =
    {
      roomsQueryMs: 0,
      participantsQueryMs: 0,
      roomsPayloadDbRoundTrips: 0,
      profilesMs: 0,
      unreadMs: 0,
      criticalCpuMergeMs: 0,
      criticalSkippedRoomProfiles: false,
      criticalReusedPayloadByRoomId: false,
      dbRoundTrips: 0,
    };
  const payload = await loadCommunityMessengerBootstrapCritical(userId, { diagnostics: tierDiagnostics });
  const criticalPayloadMs = Math.round(performance.now() - t0);
  const roomCount = payload.chats.length + payload.groups.length;
  return {
    payload,
    criticalPayloadMs,
    dbRoundTrips: tierDiagnostics.dbRoundTrips,
    roomCount,
    tierDiagnostics,
  };
}

function tradeMessengerListThumbnailMissing(summary: CommunityMessengerRoomSummary): boolean {
  if (summary.contextMeta?.kind !== "trade") return true;
  const t = summary.contextMeta.thumbnailUrl;
  return !(typeof t === "string" && t.trim().length > 0);
}

/** 썸네일은 있는데 제목·postId·PC id·대메뉴 라벨이 비어 있으면 `product_chats`→`posts` 재조인이 필요하다. */
function tradeMessengerTradeListMetaNeedsPcHydration(summary: CommunityMessengerRoomSummary): boolean {
  const m = summary.contextMeta;
  if (!m || m.kind !== "trade") return false;
  const headline = trimText(m.headline);
  const weakHeadline = isWeakTradeMessengerHeadline(headline);
  const missingPostId = !trimText(m.postId);
  const missingPc = !trimText(m.productChatId);
  return weakHeadline || missingPostId || missingPc;
}

/** bootstrap lite fast enrich: direct_keys 이후 Phase A–D 가 필요한 direct 방 */
function tradeSummariesNeedingBootstrapHeavyEnrich(
  summaries: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  return summaries.filter(
    (s) =>
      s.roomType === "direct" &&
      (tradeMessengerListThumbnailMissing(s) || tradeMessengerTradeListMetaNeedsPcHydration(s))
  );
}

function isBootstrapLiteTradeListSummary(s: CommunityMessengerRoomSummary): boolean {
  if (s.roomType !== "direct") return false;
  if (s.contextMeta?.kind === "trade") return true;
  return parseTradeMessengerDirectKey(s.messengerDirectKey) != null;
}

/** lite 첫 페인트 최소 메타(썸네일·제목·postId·pc/direct_key) — category·seller 는 background */
function bootstrapLiteFirstPaintMetaSatisfied(s: CommunityMessengerRoomSummary): boolean {
  if (!isBootstrapLiteTradeListSummary(s)) return true;
  const m = s.contextMeta;
  if (!m || m.kind !== "trade") return false;
  if (tradeMessengerListThumbnailMissing(s)) return false;
  const headline = trimText(m.headline);
  if (!headline || isWeakTradeMessengerHeadline(headline)) return false;
  if (!trimText(m.postId)) return false;
  const pcid = trimText(m.productChatId);
  if (!pcid && !isMessengerAuthoritativeTradeDirectKey(s.messengerDirectKey)) return false;
  return true;
}

function bootstrapLiteHeavyTargetReasonCodes(s: CommunityMessengerRoomSummary): string[] {
  if (!isBootstrapLiteTradeListSummary(s)) return [];
  const m = s.contextMeta;
  if (!m || m.kind !== "trade") return ["no_trade_context"];
  const codes: string[] = [];
  if (tradeMessengerListThumbnailMissing(s)) codes.push("no_thumbnail");
  const headline = trimText(m.headline);
  if (!headline) codes.push("no_title");
  else if (isWeakTradeMessengerHeadline(headline)) codes.push("weak_headline");
  if (!trimText(m.postId)) codes.push("no_post_id");
  if (!trimText(m.productChatId) && !isMessengerAuthoritativeTradeDirectKey(s.messengerDirectKey)) {
    codes.push("no_product_chat_id");
  }
  return codes;
}

function bootstrapLiteHeavyTargetReasonsTopFromSummaries(
  rooms: CommunityMessengerRoomSummary[]
): string {
  const counts = new Map<string, number>();
  for (const s of rooms) {
    for (const code of bootstrapLiteHeavyTargetReasonCodes(s)) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

function tradeSummariesBootstrapLiteHeavyTargetBeforeDirectKeys(
  summaries: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  return summaries.filter(
    (s) =>
      isBootstrapLiteTradeListSummary(s) &&
      (tradeMessengerListThumbnailMissing(s) || tradeMessengerTradeListMetaNeedsPcHydration(s))
  );
}

/** lite: direct_keys 이후에도 first-paint 미충족인 trade 방만 */
function tradeSummariesBootstrapLiteMissingAfterDirectKeys(
  summaries: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  return summaries.filter((s) => isBootstrapLiteTradeListSummary(s) && !bootstrapLiteFirstPaintMetaSatisfied(s));
}

async function runBootstrapLiteMissingOnlyBatch(args: {
  userId: string;
  missing: CommunityMessengerRoomSummary[];
  fetchPostsCached: (ids: string[]) => Promise<Map<string, Record<string, unknown>>>;
  tradeDiag?: CommunityMessengerBootstrapDiagnostics;
  cpuMergeMsRef?: { ms: number };
}): Promise<number> {
  const { userId, missing, fetchPostsCached, tradeDiag, cpuMergeMsRef } = args;
  const t0 = performance.now();
  let deferred = 0;
  const withPostId: CommunityMessengerRoomSummary[] = [];
  for (const s of missing) {
    const postId = trimText((s.contextMeta as { postId?: string })?.postId);
    if (!postId) {
      deferred += 1;
      continue;
    }
    withPostId.push(s);
  }
  if (tradeDiag) tradeDiag.bootstrapLiteDeferredHydrationCount = deferred;

  const postIds = dedupeIds(
    withPostId.map((s) => trimText((s.contextMeta as { postId?: string })?.postId)).filter(Boolean)
  );
  if (!postIds.length) return Math.round(performance.now() - t0);

  const postById = await fetchPostsCached(postIds);
  const emptyCategoryById = new Map<string, TradeChatCategoryMetaLike>();
  const tCpu = performance.now();
  for (const s of withPostId) {
    const m = s.contextMeta;
    if (!m || m.kind !== "trade") continue;
    const postId = trimText(m.postId);
    const pcid = trimText(m.productChatId);
    if (!postId) continue;
    const post = postById.get(postId);
    const priceRaw = post?.price;
    const price =
      typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
    const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
    const sellerIdFromPost = trimText((post as { user_id?: unknown })?.user_id);
    const role: "seller" | "buyer" =
      sellerIdFromPost && sellerIdFromPost === userId ? "seller" : "buyer";
    s.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
      productChatId: pcid || postId,
      postId,
      post: post as Record<string, unknown> | null | undefined,
      price: price != null && !Number.isNaN(price) ? price : null,
      currency,
      role,
      categoryById: emptyCategoryById,
      sellerListingStateRaw: post?.seller_listing_state,
      postStatus: (post?.status as string | undefined) ?? null,
      thumbnailUrl:
        firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>) ??
        (typeof m.thumbnailUrl === "string" ? m.thumbnailUrl : null),
    });
  }
  if (cpuMergeMsRef) cpuMergeMsRef.ms += performance.now() - tCpu;
  return Math.round(performance.now() - t0);
}

/** `community_messenger_rooms.direct_key` — 거래 스레드 원장 키 (`trade_pc:` / `trade_item:`). */
type ParsedTradeMessengerDirectKey =
  | { kind: "trade_pc"; productChatId: string }
  | { kind: "trade_item"; itemTradeChatRoomId: string };

function parseTradeMessengerDirectKey(
  directKey: string | null | undefined
): ParsedTradeMessengerDirectKey | null {
  const t = trimText(directKey);
  if (!t) return null;
  if (t.startsWith("trade_pc:")) {
    const id = trimText(t.slice("trade_pc:".length));
    return id ? { kind: "trade_pc", productChatId: id } : null;
  }
  if (t.startsWith("trade_item:")) {
    const id = trimText(t.slice("trade_item:".length));
    return id ? { kind: "trade_item", itemTradeChatRoomId: id } : null;
  }
  return null;
}

function isMessengerAuthoritativeTradeDirectKey(directKey: string | null | undefined): boolean {
  return parseTradeMessengerDirectKey(directKey) != null;
}

/** room 행 `direct_key` → mega RPC 인자(trade_pc / item_trade). */
function extractTradeDirectKeyIdsFromRoomRows(
  roomRows: ReadonlyArray<{ direct_key?: string | null }>
): { pcIds: string[]; itemTradeRoomIds: string[] } {
  const pcIds: string[] = [];
  const itemTradeRoomIds: string[] = [];
  for (const row of roomRows) {
    const p = parseTradeMessengerDirectKey(row.direct_key);
    if (!p) continue;
    if (p.kind === "trade_pc") pcIds.push(p.productChatId);
    else itemTradeRoomIds.push(p.itemTradeChatRoomId);
  }
  return { pcIds: dedupeIds(pcIds), itemTradeRoomIds: dedupeIds(itemTradeRoomIds) };
}

type HomeSyncMegaDirectKeysBundleFetchResult = {
  data: unknown;
  error: unknown;
  leaderRpcWallMs: number;
  lookupWallMs: number;
  megaMapSyncMs: number;
  megaInflightOrRpcWaitMs: number;
  cacheReason: "row_cache_hit" | "row_cache_singleflight_join" | "rpc_cold";
  singleflightJoinCount: number;
  cacheKey: string;
};

type TradeEnrichBootstrapSharedCtx = {
  trace?: HomeSyncTrace;
  tradeDiag?: CommunityMessengerBootstrapDiagnostics;
  /** bootstrap lite: `Promise.all` 구간에서 선행 시작한 mega RPC — enrich 에서 재호출 금지 */
  megaBundlePrefetchPromise?: Promise<HomeSyncMegaDirectKeysBundleFetchResult>;
  /** `listCommunityMessengerMyChatsAndGroups` + 양수 `roomListCap`(home-sync) — prod full 도 mega RPC 허용 */
  homeSyncMegaBundleForDirectKeys?: boolean;
  categoryLoader: {
    ensureForPosts(posts: Iterable<Record<string, unknown>>): Promise<void>;
    getMergedMap(): Map<string, TradeChatCategoryMetaLike>;
    lastEnsureCategoryUsedDb: boolean;
    peekCategoryTableSingleflightJoins(): number;
  };
  fetchPostsCached: (idsRaw: string[]) => Promise<Map<string, Record<string, unknown>>>;
  /** HS3-FINAL: mega-RPC jsonb 응답을 객체로 정규화(문자열 JSON · 형식 오류 시 null). */
  directKeysPrefetchedPosts?: Map<string, Record<string, unknown>>;
};

function parseHomeSyncCriticalMegaBundleRpcPayload(raw: unknown): {
  itemLedger: Array<Record<string, unknown>>;
  tradePcFromKey: Array<Record<string, unknown>>;
  posts: Array<Record<string, unknown>>;
} | null {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const arr = (x: unknown): Array<Record<string, unknown>> =>
    Array.isArray(x) ? (x as Array<Record<string, unknown>>) : [];
  return {
    itemLedger: arr(o.itemLedger),
    tradePcFromKey: arr(o.tradePcFromKey),
    posts: arr(o.posts),
  };
}

function shouldAttachTradeDirectKeysBreakdown(trace: HomeSyncTrace | undefined): boolean {
  if (!trace || !homeSyncTraceMeterEnabled(trace)) return false;
  const tok = trimText(trace.token);
  return tok === "trade-chat-list-meta" || tok.startsWith("home-sync-");
}

function computeDirectKeysCategorySlotDiag(
  posts: Iterable<Record<string, unknown>> | undefined
): Pick<
  HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown,
  | "direct_keys_category_ids_count"
  | "direct_keys_unique_category_ids_count"
  | "direct_keys_duplicate_category_ids_count"
> {
  if (!posts) {
    return {
      direct_keys_category_ids_count: 0,
      direct_keys_unique_category_ids_count: 0,
      direct_keys_duplicate_category_ids_count: 0,
    };
  }
  const raw = [...posts]
    .map((p) => tradePostCategoryId(p))
    .map((id) => trimText(id))
    .filter((id) => id.length > 0);
  const unique = new Set(raw);
  return {
    direct_keys_category_ids_count: raw.length,
    direct_keys_unique_category_ids_count: unique.size,
    direct_keys_duplicate_category_ids_count: Math.max(0, raw.length - unique.size),
  };
}

function computeDirectKeysBridgeSlotDiag(
  pcKeySlots: string[],
  itemRoomKeySlots: string[]
): Pick<
  HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown,
  | "direct_keys_bridge_ids_count"
  | "direct_keys_unique_bridge_ids_count"
  | "direct_keys_duplicate_bridge_ids_count"
> {
  const pcSlots = pcKeySlots.length;
  const rmSlots = itemRoomKeySlots.length;
  const uniquePc = dedupeIds(pcKeySlots).length;
  const uniqueRm = dedupeIds(itemRoomKeySlots).length;
  return {
    direct_keys_bridge_ids_count: pcSlots + rmSlots,
    direct_keys_unique_bridge_ids_count: uniquePc + uniqueRm,
    direct_keys_duplicate_bridge_ids_count:
      Math.max(0, pcSlots - uniquePc) + Math.max(0, rmSlots - uniqueRm),
  };
}

type TradeDirectKeysListMetaDiagSlice = Pick<
  HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown,
  | "direct_keys_category_ids_count"
  | "direct_keys_unique_category_ids_count"
  | "direct_keys_duplicate_category_ids_count"
  | "direct_keys_bridge_ids_count"
  | "direct_keys_unique_bridge_ids_count"
  | "direct_keys_duplicate_bridge_ids_count"
  | "direct_keys_category_cache_hit"
  | "direct_keys_bridge_cache_hit"
  | "direct_keys_singleflight_hit"
  | "direct_keys_duplicate_merge_count"
  | "direct_keys_map_rebuild_count"
  | "direct_keys_duplicate_normalize_count"
  | "direct_keys_bridge_attach_iterations"
  | "direct_keys_category_attach_iterations"
  | "direct_keys_object_spread_count"
  | "direct_keys_hot_cpu_loop"
  | "direct_keys_hidden_sequential_wait_ms"
  | "direct_keys_lookup_rebuild_count"
  | "direct_keys_apply_loop_ms"
  | "direct_keys_cache_key"
  | "direct_keys_normalized_cache_key"
  | "direct_keys_cache_reason"
  | "direct_keys_singleflight_key"
  | "direct_keys_singleflight_join_count"
  | "direct_keys_cache_ttl_ms"
  | "direct_keys_cache_store_ms"
  | "direct_keys_cache_lookup_ms"
  | "direct_keys_mega_map_sync_ms"
  | "direct_keys_mega_inflight_or_rpc_wait_ms"
  | "direct_keys_lookup_reuse_hit"
  | "direct_keys_lookup_cpu_ms"
  | "direct_keys_normalize_cpu_ms"
  | "direct_keys_key_build_cpu_ms"
  | "direct_keys_bridge_cache_hit_after"
  | "direct_keys_category_cache_hit_after"
  | "direct_keys_category_batch_singleflight_joins"
>;

function directKeysListMetaOptionalDiagFromInput(
  diag: Partial<TradeDirectKeysListMetaDiagSlice>
): Partial<HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown> {
  const o: Partial<HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown> = {};
  if (diag.direct_keys_cache_key != null) o.direct_keys_cache_key = diag.direct_keys_cache_key;
  if (diag.direct_keys_normalized_cache_key != null) {
    o.direct_keys_normalized_cache_key = diag.direct_keys_normalized_cache_key;
  }
  if (diag.direct_keys_cache_reason != null) o.direct_keys_cache_reason = diag.direct_keys_cache_reason;
  if (diag.direct_keys_singleflight_key != null) o.direct_keys_singleflight_key = diag.direct_keys_singleflight_key;
  if (diag.direct_keys_singleflight_join_count != null) {
    o.direct_keys_singleflight_join_count = diag.direct_keys_singleflight_join_count;
  }
  if (diag.direct_keys_cache_ttl_ms != null) o.direct_keys_cache_ttl_ms = diag.direct_keys_cache_ttl_ms;
  if (diag.direct_keys_cache_store_ms != null) o.direct_keys_cache_store_ms = diag.direct_keys_cache_store_ms;
  if (diag.direct_keys_cache_lookup_ms != null) o.direct_keys_cache_lookup_ms = diag.direct_keys_cache_lookup_ms;
  if (diag.direct_keys_bridge_cache_hit_after != null) {
    o.direct_keys_bridge_cache_hit_after = diag.direct_keys_bridge_cache_hit_after;
  }
  if (diag.direct_keys_category_cache_hit_after != null) {
    o.direct_keys_category_cache_hit_after = diag.direct_keys_category_cache_hit_after;
  }
  if (diag.direct_keys_category_batch_singleflight_joins != null) {
    o.direct_keys_category_batch_singleflight_joins = diag.direct_keys_category_batch_singleflight_joins;
  }
  if (diag.direct_keys_mega_map_sync_ms != null) o.direct_keys_mega_map_sync_ms = diag.direct_keys_mega_map_sync_ms;
  if (diag.direct_keys_mega_inflight_or_rpc_wait_ms != null) {
    o.direct_keys_mega_inflight_or_rpc_wait_ms = diag.direct_keys_mega_inflight_or_rpc_wait_ms;
  }
  if (diag.direct_keys_lookup_reuse_hit != null) o.direct_keys_lookup_reuse_hit = diag.direct_keys_lookup_reuse_hit;
  if (diag.direct_keys_lookup_cpu_ms != null) o.direct_keys_lookup_cpu_ms = diag.direct_keys_lookup_cpu_ms;
  if (diag.direct_keys_normalize_cpu_ms != null) o.direct_keys_normalize_cpu_ms = diag.direct_keys_normalize_cpu_ms;
  if (diag.direct_keys_key_build_cpu_ms != null) o.direct_keys_key_build_cpu_ms = diag.direct_keys_key_build_cpu_ms;
  return o;
}

function attachTradeDirectKeysListMetaBreakdown(
  trace: HomeSyncTrace | undefined,
  input: {
    path: HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown["direct_keys_path"];
    totalWallMs: number;
    targetRooms: number;
    tradePcIdsCount: number;
    itemTradeRoomIdsCount: number;
    postIdsCount: number;
    fetchPostsMs: number;
    fetchBridgeMs: number;
    fetchProductChatMs: number;
    fetchCategoryMs: number;
    parallelPhase1WallMs: number;
    parallelPhase2WallMs: number;
    queryCount: number;
    /** 미지정 시 `phase1+phase2+category` — mega 등은 bundle+posts+category 로 전달 */
    cpuBaselineMs?: number;
    diag?: Partial<TradeDirectKeysListMetaDiagSlice>;
  }
): void {
  if (!shouldAttachTradeDirectKeysBreakdown(trace) || !trace) return;
  const tr = trace;
  const total = ms(input.totalWallMs);
  const fetchPosts = ms(input.fetchPostsMs);
  const fetchBridge = ms(input.fetchBridgeMs);
  const fetchPc = ms(input.fetchProductChatMs);
  const fetchCat = ms(input.fetchCategoryMs);
  const p1 = ms(input.parallelPhase1WallMs);
  const p2 = ms(input.parallelPhase2WallMs);
  const parallelWait = p1 + p2;
  const baseline =
    input.cpuBaselineMs != null ? ms(input.cpuBaselineMs) : parallelWait + fetchCat;
  const cpu = Math.max(0, total - baseline);
  const tpfd = tr.deepSteps.tradePostsFetchDetail as HomeSyncDeepStepsTradePostsFetchDetail | undefined;
  const cacheHit = Boolean(tpfd?.cacheHit);
  const cands: Array<[string, number]> = [
    ["direct_keys_fetch_posts_ms", fetchPosts],
    ["direct_keys_fetch_bridge_ms", fetchBridge],
    ["direct_keys_fetch_product_chat_ms", fetchPc],
    ["direct_keys_fetch_category_ms", fetchCat],
    ["direct_keys_parallel_wait_ms", parallelWait],
    ["direct_keys_cpu_ms", cpu],
  ];
  let topK = cands[0][0];
  let topV = cands[0][1];
  for (const [k, v] of cands) {
    if (v > topV) {
      topK = k;
      topV = v;
    }
  }
  const diag = input.diag ?? {};
  const orch = {
    direct_keys_duplicate_merge_count: diag.direct_keys_duplicate_merge_count ?? 0,
    direct_keys_map_rebuild_count: diag.direct_keys_map_rebuild_count ?? 0,
    direct_keys_duplicate_normalize_count: diag.direct_keys_duplicate_normalize_count ?? 0,
    direct_keys_bridge_attach_iterations: diag.direct_keys_bridge_attach_iterations ?? 0,
    direct_keys_category_attach_iterations: diag.direct_keys_category_attach_iterations ?? 0,
    direct_keys_object_spread_count: diag.direct_keys_object_spread_count ?? 0,
    direct_keys_hot_cpu_loop: diag.direct_keys_hot_cpu_loop ?? 0,
    direct_keys_hidden_sequential_wait_ms: diag.direct_keys_hidden_sequential_wait_ms ?? 0,
    direct_keys_lookup_rebuild_count: diag.direct_keys_lookup_rebuild_count ?? 0,
    direct_keys_apply_loop_ms: diag.direct_keys_apply_loop_ms ?? 0,
    direct_keys_lookup_rebuild_count_after: diag.direct_keys_lookup_rebuild_count ?? 0,
    direct_keys_map_rebuild_count_after: diag.direct_keys_map_rebuild_count ?? 0,
  };
  const out: HomeSyncDeepStepsTradeDirectKeysListMetaBreakdown = {
    direct_keys_total_ms: total,
    direct_keys_path: input.path,
    direct_keys_post_ids_count: Math.max(0, Math.round(Number(input.postIdsCount))),
    direct_keys_room_ids_count: Math.max(0, Math.round(Number(input.targetRooms))),
    direct_keys_trade_pc_ids_count: Math.max(0, Math.round(Number(input.tradePcIdsCount))),
    direct_keys_item_trade_room_ids_count: Math.max(0, Math.round(Number(input.itemTradeRoomIdsCount))),
    direct_keys_fetch_posts_ms: fetchPosts,
    direct_keys_fetch_bridge_ms: fetchBridge,
    direct_keys_fetch_product_chat_ms: fetchPc,
    direct_keys_fetch_category_ms: fetchCat,
    direct_keys_fetch_seller_ms: 0,
    direct_keys_cache_lookup_ms: diag.direct_keys_cache_lookup_ms ?? 0,
    direct_keys_cache_hit_count: tpfd ? (cacheHit ? 1 : 0) : 0,
    direct_keys_cache_miss_count: tpfd ? (cacheHit ? 0 : 1) : 0,
    direct_keys_query_count: Math.max(0, Math.round(Number(input.queryCount))),
    direct_keys_parallel_wait_ms: parallelWait,
    direct_keys_cpu_ms: cpu,
    direct_keys_top_bottleneck: topK,
    direct_keys_top_bottleneck_ms: topV,
    direct_keys_top_bottleneck_percent: total > 0 ? Math.round((topV / total) * 1000) / 10 : 0,
    direct_keys_category_ids_count: diag.direct_keys_category_ids_count ?? 0,
    direct_keys_unique_category_ids_count: diag.direct_keys_unique_category_ids_count ?? 0,
    direct_keys_duplicate_category_ids_count: diag.direct_keys_duplicate_category_ids_count ?? 0,
    direct_keys_bridge_ids_count: diag.direct_keys_bridge_ids_count ?? 0,
    direct_keys_unique_bridge_ids_count: diag.direct_keys_unique_bridge_ids_count ?? 0,
    direct_keys_duplicate_bridge_ids_count: diag.direct_keys_duplicate_bridge_ids_count ?? 0,
    direct_keys_category_cache_hit: Boolean(diag.direct_keys_category_cache_hit),
    direct_keys_bridge_cache_hit: Boolean(diag.direct_keys_bridge_cache_hit),
    direct_keys_posts_row_cache_hit: Boolean(tpfd?.cacheHit),
    direct_keys_posts_row_cache_miss: tpfd ? (tpfd.cacheHit ? 0 : 1) : 0,
    direct_keys_singleflight_hit: Boolean(diag.direct_keys_singleflight_hit),
    ...orch,
    ...directKeysListMetaOptionalDiagFromInput(diag),
  };
  tr.deepSteps.tradeDirectKeysListMetaBreakdown = out;
}

/**
 * 거래 메신저 방의 **원장 키(`direct_key`)** 로만 상품·썸네일을 맞춘다.
 * 기존 Phase A(JSON의 productChatId)·Phase D(상대 peer 로만 추정) 가 다른 글의 썸네일을 섞어 쓰던 문제 방지.
 */
async function enrichTradeRoomContextMetaFromDirectKeys(
  userId: string,
  summaries: CommunityMessengerRoomSummary[],
  shared?: TradeEnrichBootstrapSharedCtx
): Promise<void> {
  const sb = getSupabaseOrNull();
  if (!sb) return;

  const targets = summaries.filter(
    (s) => s.roomType === "direct" && parseTradeMessengerDirectKey(s.messengerDirectKey) != null
  );
  if (!targets.length) return;

  if (shared) {
    shared.directKeysPrefetchedPosts = undefined;
  }

  const deepSteps = homeSyncTraceMeterEnabled(shared?.trace);
  const dkBreakdown = shouldAttachTradeDirectKeysBreakdown(shared?.trace);
  const tDirectWall = deepSteps ? performance.now() : 0;

  const pcIdsFromKey: string[] = [];
  const itemTradeRoomIds: string[] = [];
  const roomToParsed = new Map<string, ParsedTradeMessengerDirectKey>();

  for (const s of targets) {
    const p = parseTradeMessengerDirectKey(s.messengerDirectKey);
    if (!p) continue;
    roomToParsed.set(s.id, p);
    if (p.kind === "trade_pc") pcIdsFromKey.push(p.productChatId);
    else itemTradeRoomIds.push(p.itemTradeChatRoomId);
  }

  /** HS3-FINAL: mega RPC — critical·full home-sync(dev trace)·`roomListCap` home-sync(prod full 포함). list-meta 는 legacy bridge 만(중복 mega RTT 방지). */
  const listMetaDirectKeysToken = trimText(shared?.trace?.token ?? "") === "trade-chat-list-meta";
  const megaHomeSyncEligible =
    Boolean(shared?.fetchPostsCached && shared?.categoryLoader && sb) &&
    !listMetaDirectKeysToken &&
    (shared?.trace?.tier === "critical" ||
      shared?.trace?.tier === "full" ||
      shared?.homeSyncMegaBundleForDirectKeys === true);
  if (
    megaHomeSyncEligible &&
    (pcIdsFromKey.length > 0 || itemTradeRoomIds.length > 0)
  ) {
    const tMega = performance.now();
    let megaBundleCacheStoreMs = 0;
    try {
      const tDkNorm0 = performance.now();
      const wantedPcPre = dedupeIds(pcIdsFromKey);
      const wantedRoomsPre = dedupeIds(itemTradeRoomIds);
      const dkNormalizeCpuMs = performance.now() - tDkNorm0;
      const tMegaResolve = performance.now();
      const mf = shared.megaBundlePrefetchPromise
        ? await shared.megaBundlePrefetchPromise
        : await fetchHomeSyncMegaDirectKeysBundleCached(sb, wantedPcPre, wantedRoomsPre);
      const megaPrefetchWaitMs = shared.megaBundlePrefetchPromise
        ? performance.now() - tMegaResolve
        : 0;
      const isBootstrapLiteMega = trimText(shared?.trace?.token ?? "") === "bootstrap-lite";
      if (shared.tradeDiag && isBootstrapLiteMega) {
        shared.tradeDiag.bootstrapLiteDirectKeysMegaRpcMs = Math.round(mf.leaderRpcWallMs);
        shared.tradeDiag.bootstrapLiteDirectKeysMegaCacheReason = mf.cacheReason;
        shared.tradeDiag.bootstrapLiteDirectKeysPrefetchWaitMs = Math.round(megaPrefetchWaitMs);
        shared.tradeDiag.bootstrapLiteDirectKeysMegaNetworkMs = Math.round(mf.leaderRpcWallMs);
      }
      const megaData = mf.data;
      const megaErr = mf.error;
      if (!megaErr && megaData != null) {
        const bundleRpcMsRaw = mf.leaderRpcWallMs;
        const parsedRoot = parseHomeSyncCriticalMegaBundleRpcPayload(megaData);
        if (!parsedRoot && process.env.NODE_ENV === "development" && messengerVerboseTraceConsoleEnabled()) {
          console.warn(
            "[home-sync-fail] HS3 FINAL directKeys still multi-RTT — mega_bundle_parse_failed"
          );
        }
        if (parsedRoot) {
        const root = parsedRoot;
        const dkNormParse = typeof megaData === "string" ? 1 : 0;
        let dkDupMerge = 0;
        const dkMapRebuild = 1;
        let bridgeAttachIterations = 0;
        const pcByIdMega = new Map<string, { post_id: string; seller_id: string; buyer_id: string }>();
        for (const row of root.tradePcFromKey) {
          const id = trimText(row.id);
          const postId = trimText(row.post_id);
          const sellerId = trimText(row.seller_id);
          const buyerId = trimText(row.buyer_id);
          if (!id || !postId || !sellerId || !buyerId) continue;
          bridgeAttachIterations += 1;
          if (pcByIdMega.has(id)) dkDupMerge += 1;
          pcByIdMega.set(id, { post_id: postId, seller_id: sellerId, buyer_id: buyerId });
        }
        const crByIdMega = new Map<string, { item_id: string; seller_id: string; buyer_id: string }>();
        const pcIdByTripleMega = new Map<string, string>();
        for (const row of root.itemLedger) {
          const rid = trimText(row.room_id);
          const itemId = trimText(row.item_id);
          const sellerId = trimText(row.seller_id);
          const buyerId = trimText(row.buyer_id);
          if (!rid || !itemId || !sellerId || !buyerId) continue;
          bridgeAttachIterations += 1;
          if (crByIdMega.has(rid)) dkDupMerge += 1;
          crByIdMega.set(rid, { item_id: itemId, seller_id: sellerId, buyer_id: buyerId });
          const pcRowId = trimText(row.pc_id);
          const pcPostId = trimText(row.pc_post_id);
          const pcSellerId = trimText(row.pc_seller_id);
          const pcBuyerId = trimText(row.pc_buyer_id);
          if (pcRowId && pcPostId && pcSellerId && pcBuyerId) {
            const k = `${pcPostId}\t${pcSellerId}\t${pcBuyerId}`;
            if (pcIdByTripleMega.has(k)) dkDupMerge += 1;
            else pcIdByTripleMega.set(k, pcRowId);
          }
        }
        const postByIdMega = new Map<string, Record<string, unknown>>();
        for (const p of root.posts) {
          const id = trimText((p as { id?: unknown }).id);
          if (!id) continue;
          if (postByIdMega.has(id)) dkDupMerge += 1;
          postByIdMega.set(id, p as Record<string, unknown>);
        }
        const wantedPc = dedupeIds(pcIdsFromKey);
        const wantedRooms = dedupeIds(itemTradeRoomIds);
        const ledgerPcOk = wantedPc.every((id) => pcByIdMega.has(id));
        const ledgerCrOk = wantedRooms.every((id) => crByIdMega.has(id));
        const expectedPostIds = dedupeIds([
          ...[...pcByIdMega.values()].map((v) => v.post_id),
          ...[...crByIdMega.values()].map((v) => v.item_id),
        ]);
        const postsOk =
          expectedPostIds.length === 0 ||
          expectedPostIds.every((pid) => postByIdMega.has(pid));
        const megaIntegrityOk = ledgerPcOk && ledgerCrOk && postsOk;
        const allPostIdsMega = dedupeIds([...postByIdMega.keys()]);

        if (!megaIntegrityOk && process.env.NODE_ENV === "development" && messengerVerboseTraceConsoleEnabled()) {
          console.warn(
            "[home-sync-fail] HS3 FINAL directKeys still multi-RTT — mega_bundle_incomplete",
            {
              ledgerPcOk,
              ledgerCrOk,
              postsOk,
              wantedPcCount: wantedPc.length,
              pcRowCount: pcByIdMega.size,
              wantedRoomsCount: wantedRooms.length,
              crRowCount: crByIdMega.size,
              expectedPostIdsCount: expectedPostIds.length,
              postRowCount: postByIdMega.size,
            }
          );
        }

        if (megaIntegrityOk && allPostIdsMega.length > 0) {
        const tMegaCacheStore0 = performance.now();
        try {
          directKeysMegaBundleCache.set(mf.cacheKey, {
            expiresAt: Date.now() + DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS,
            raw: megaData,
          });
        } catch {
          /* ignore */
        }
        megaBundleCacheStoreMs = performance.now() - tMegaCacheStore0;
        shared.directKeysPrefetchedPosts = postByIdMega;
        const postByIdResolved = postByIdMega;
        const postsFetchMsMega = 0;
        const postsStartAfterMsMega = 0;
        if (shared.trace && !isBootstrapLiteMega) {
          mergeHomeSyncTradePostsFetchDetail(shared.trace, {
            postIdsCount: allPostIdsMega.length,
            postIdsDedupeCount: allPostIdsMega.length,
            queryCount: 0,
            cacheHit: true,
            usedSelect: TRADE_CHAT_LIST_POST_SELECT_CRITICAL,
            selectColumnCount: TRADE_CHAT_LIST_POST_SELECT_CRITICAL.split(",")
              .map((s) => s.trim())
              .filter(Boolean).length,
            fallbackAttemptCount: 0,
            fallbackFailedCount: 0,
            queryMsTotal: 0,
          });
        }
        const tCat0 = performance.now();
        let categoryByIdMega: Map<string, TradeChatCategoryMetaLike>;
        if (isBootstrapLiteMega) {
          categoryByIdMega = new Map();
        } else {
          await shared.categoryLoader.ensureForPosts(postByIdResolved.values());
          categoryByIdMega = shared.categoryLoader.getMergedMap();
        }
        const categoryEnsureMsMega = isBootstrapLiteMega ? 0 : performance.now() - tCat0;
        const megaCategoryTableSfJoins = shared.categoryLoader.peekCategoryTableSingleflightJoins();

        const applyMega = (
          summary: CommunityMessengerRoomSummary,
          productChatIdForMeta: string,
          postId: string,
          sellerId: string,
          buyerId: string
        ) => {
          const post = postByIdResolved.get(postId);
          const priceRaw = post?.price;
          const price =
            typeof priceRaw === "number" && Number.isFinite(priceRaw)
              ? priceRaw
              : priceRaw != null
                ? Number(priceRaw)
                : null;
          const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
          const role: "seller" | "buyer" = userId === sellerId ? "seller" : "buyer";
          summary.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
            productChatId: productChatIdForMeta,
            postId,
            post: post as Record<string, unknown> | null | undefined,
            price: price != null && !Number.isNaN(price) ? price : null,
            currency,
            role,
            categoryById: categoryByIdMega,
            sellerListingStateRaw: post?.seller_listing_state,
            postStatus: (post?.status as string | undefined) ?? null,
            thumbnailUrl: firstPostThumbnailForMessengerTradeList(post),
            tradeMetaBuildTrace: homeSyncTraceMeterEnabled(shared?.trace) ? shared!.trace : undefined,
          });
        };
        const tApplyMega = performance.now();
        for (const s of targets) {
          const parsed = roomToParsed.get(s.id);
          if (!parsed) continue;
          if (parsed.kind === "trade_pc") {
            const pc = pcByIdMega.get(parsed.productChatId);
            if (!pc?.post_id) continue;
            applyMega(s, parsed.productChatId, pc.post_id, pc.seller_id, pc.buyer_id);
            continue;
          }
          const cr = crByIdMega.get(parsed.itemTradeChatRoomId);
          if (!cr?.item_id) continue;
          const tripleKey = `${cr.item_id}\t${cr.seller_id}\t${cr.buyer_id}`;
          const resolvedPc = trimText(pcIdByTripleMega.get(tripleKey));
          const pcidForMeta = resolvedPc || parsed.itemTradeChatRoomId;
          applyMega(s, pcidForMeta, cr.item_id, cr.seller_id, cr.buyer_id);
        }
        const applyLoopMsMega = performance.now() - tApplyMega;
        if (shared.tradeDiag && isBootstrapLiteMega) {
          shared.tradeDiag.bootstrapLiteDirectKeysParseApplyMs = Math.round(
            dkNormalizeCpuMs + applyLoopMsMega
          );
        }

        const wallMsEndMega = performance.now() - tDirectWall;
        if (
          isBootstrapLiteMega &&
          messengerVerboseTraceConsoleEnabled() &&
          process.env.NODE_ENV === "development"
        ) {
          // eslint-disable-next-line no-console -- gated bootstrap lite direct_keys breakdown
          console.debug(
            "[cm-bootstrap-lite-direct-keys]",
            JSON.stringify({
              mega_rpc_ms: Math.round(mf.leaderRpcWallMs),
              mega_cache_reason: mf.cacheReason,
              mega_prefetch_wait_ms: Math.round(megaPrefetchWaitMs),
              mega_parse_apply_ms: Math.round(dkNormalizeCpuMs + applyLoopMsMega),
              mega_lookup_wall_ms: Math.round(mf.lookupWallMs),
              direct_keys_wall_ms: Math.round(wallMsEndMega),
            })
          );
        }
        const megaSlotDiag = computeDirectKeysCategorySlotDiag(postByIdResolved.values());
        const megaHiddenSequential = Math.max(
          0,
          Math.round(wallMsEndMega - bundleRpcMsRaw - postsFetchMsMega - categoryEnsureMsMega - applyLoopMsMega)
        );
        const megaHotCpu = targets.length > 0 && roomToParsed.size > targets.length + 3 ? 1 : 0;
        const parallelEfficiencyMsRaw = Math.max(
          0,
          Math.round(bundleRpcMsRaw + postsFetchMsMega + categoryEnsureMsMega - wallMsEndMega)
        );

        if (
          process.env.NODE_ENV === "development" &&
          messengerVerboseTraceConsoleEnabled() &&
          deepSteps &&
          shared.trace?.tier === "critical"
        ) {
          if (wallMsEndMega > 350) {
            console.warn("[home-sync-fail] HS3 directKeys target missed", {
              directKeys_wallMs: Math.round(wallMsEndMega),
              bundleRpcMs: Math.round(bundleRpcMsRaw),
              effectiveRttCount: 1,
            });
          }
        }

        if (deepSteps && shared.trace) {
          shared.trace.deepSteps.tradeDirectKeysDetail = {
            wallMs: ms(wallMsEndMega),
            pcFromKeyQueryMs: 0,
            chatRoomsQueryMs: 0,
            pcCandidatesQueryMs: 0,
            postsFetchMs: ms(postsFetchMsMega),
            categoryEnsureMs: ms(categoryEnsureMsMega),
            bundleRpcMs: ms(bundleRpcMsRaw),
            phase1WallMs: 0,
            phase2WallMs: 0,
            postsStartAfterMs: ms(postsStartAfterMsMega),
            pcCandidatesStartAfterMs: 0,
            categoryAfterPostsMs: ms(categoryEnsureMsMega),
            phaseDependencyReason:
              shared?.trace?.tier === "critical"
                ? "critical_mega_bundle_rpc"
                : shared?.trace?.tier === "full"
                  ? "full_mega_bundle_rpc"
                  : "home_sync_mega_bundle_rpc",
            effectiveRttCount: 1,
            parallelEfficiencyMs: ms(parallelEfficiencyMsRaw),
            direct_keys_duplicate_merge_count: dkDupMerge,
            direct_keys_map_rebuild_count: dkMapRebuild,
            direct_keys_duplicate_normalize_count: dkNormParse,
            direct_keys_bridge_attach_iterations: bridgeAttachIterations,
            direct_keys_category_attach_iterations: megaSlotDiag.direct_keys_unique_category_ids_count,
            direct_keys_object_spread_count: 0,
            direct_keys_hot_cpu_loop: megaHotCpu,
            direct_keys_hidden_sequential_wait_ms: megaHiddenSequential,
            direct_keys_lookup_rebuild_count: dkMapRebuild,
            direct_keys_lookup_rebuild_count_after: dkMapRebuild,
            direct_keys_map_rebuild_count_after: dkMapRebuild,
            direct_keys_apply_loop_ms: Math.round(applyLoopMsMega),
            direct_keys_cache_key: mf.cacheKey.length > 200 ? mf.cacheKey.slice(0, 200) : mf.cacheKey,
            direct_keys_normalized_cache_key: mf.cacheKey,
            direct_keys_cache_reason: mf.cacheReason,
            direct_keys_singleflight_key: mf.cacheKey,
            direct_keys_singleflight_join_count: mf.singleflightJoinCount,
            direct_keys_cache_ttl_ms: DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS,
            direct_keys_cache_store_ms: ms(megaBundleCacheStoreMs),
            direct_keys_cache_lookup_ms: ms(mf.megaMapSyncMs),
            direct_keys_mega_map_sync_ms: Math.round(mf.megaMapSyncMs),
            direct_keys_mega_inflight_or_rpc_wait_ms: Math.round(mf.megaInflightOrRpcWaitMs),
            direct_keys_lookup_reuse_hit: mf.cacheReason !== "rpc_cold",
            direct_keys_lookup_cpu_ms: Math.round(mf.megaMapSyncMs),
            direct_keys_normalize_cpu_ms: Math.round(dkNormalizeCpuMs),
            direct_keys_key_build_cpu_ms: 0,
            direct_keys_bridge_cache_hit_after:
              mf.cacheReason === "row_cache_hit" || mf.cacheReason === "row_cache_singleflight_join",
            direct_keys_category_cache_hit_after: !shared.categoryLoader.lastEnsureCategoryUsedDb,
            direct_keys_category_batch_singleflight_joins: megaCategoryTableSfJoins,
            mega_bundle_integrity_ok: true,
            mega_bundle_integrity_ledger_pc_ok: true,
            mega_bundle_integrity_ledger_cr_ok: true,
            mega_bundle_integrity_posts_ok: true,
          };
        }
        if (dkBreakdown && shared.trace) {
          const postQ = Number(shared.trace.deepSteps.tradePostsFetchDetail?.queryCount ?? 0);
          attachTradeDirectKeysListMetaBreakdown(shared.trace, {
            path: "mega_bundle",
            totalWallMs: wallMsEndMega,
            targetRooms: targets.length,
            tradePcIdsCount: wantedPc.length,
            itemTradeRoomIdsCount: wantedRooms.length,
            postIdsCount: allPostIdsMega.length,
            fetchPostsMs: postsFetchMsMega,
            fetchBridgeMs: bundleRpcMsRaw,
            fetchProductChatMs: 0,
            fetchCategoryMs: categoryEnsureMsMega,
            parallelPhase1WallMs: 0,
            parallelPhase2WallMs: 0,
            queryCount: 1 + (Number.isFinite(postQ) ? postQ : 0),
            cpuBaselineMs: bundleRpcMsRaw + postsFetchMsMega + categoryEnsureMsMega,
            diag: {
              ...megaSlotDiag,
              ...computeDirectKeysBridgeSlotDiag(pcIdsFromKey, itemTradeRoomIds),
              direct_keys_category_cache_hit: !shared.categoryLoader.lastEnsureCategoryUsedDb,
              direct_keys_bridge_cache_hit:
                mf.cacheReason === "row_cache_hit" || mf.cacheReason === "row_cache_singleflight_join",
              direct_keys_singleflight_hit:
                mf.singleflightJoinCount > 0 || mf.cacheReason === "row_cache_singleflight_join",
              direct_keys_duplicate_merge_count: dkDupMerge,
              direct_keys_map_rebuild_count: dkMapRebuild,
              direct_keys_duplicate_normalize_count: dkNormParse,
              direct_keys_bridge_attach_iterations: bridgeAttachIterations,
              direct_keys_category_attach_iterations: megaSlotDiag.direct_keys_unique_category_ids_count,
              direct_keys_object_spread_count: 0,
              direct_keys_hot_cpu_loop: megaHotCpu,
              direct_keys_hidden_sequential_wait_ms: megaHiddenSequential,
              direct_keys_lookup_rebuild_count: dkMapRebuild,
              direct_keys_apply_loop_ms: Math.round(applyLoopMsMega),
              direct_keys_cache_key: mf.cacheKey.length > 200 ? mf.cacheKey.slice(0, 200) : mf.cacheKey,
              direct_keys_normalized_cache_key: mf.cacheKey,
              direct_keys_cache_reason: mf.cacheReason,
              direct_keys_singleflight_key: mf.cacheKey,
              direct_keys_singleflight_join_count: mf.singleflightJoinCount,
              direct_keys_cache_ttl_ms: DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS,
              direct_keys_cache_store_ms: megaBundleCacheStoreMs,
              direct_keys_cache_lookup_ms: mf.megaMapSyncMs,
              direct_keys_mega_map_sync_ms: Math.round(mf.megaMapSyncMs),
              direct_keys_mega_inflight_or_rpc_wait_ms: Math.round(mf.megaInflightOrRpcWaitMs),
              direct_keys_lookup_reuse_hit: mf.cacheReason !== "rpc_cold",
              direct_keys_lookup_cpu_ms: Math.round(mf.megaMapSyncMs),
              direct_keys_normalize_cpu_ms: Math.round(dkNormalizeCpuMs),
              direct_keys_key_build_cpu_ms: 0,
              direct_keys_bridge_cache_hit_after:
                mf.cacheReason === "row_cache_hit" || mf.cacheReason === "row_cache_singleflight_join",
              direct_keys_category_cache_hit_after: !shared.categoryLoader.lastEnsureCategoryUsedDb,
              direct_keys_category_batch_singleflight_joins: megaCategoryTableSfJoins,
            },
          });
        }
        if (shared) {
          shared.directKeysPrefetchedPosts = undefined;
        }
        return;
        } else if (deepSteps && shared?.trace && !megaIntegrityOk) {
          const wallMsPartial = performance.now() - tDirectWall;
          shared.trace.deepSteps.tradeDirectKeysDetail = {
            wallMs: ms(wallMsPartial),
            pcFromKeyQueryMs: 0,
            chatRoomsQueryMs: 0,
            pcCandidatesQueryMs: 0,
            postsFetchMs: 0,
            categoryEnsureMs: 0,
            bundleRpcMs: ms(bundleRpcMsRaw),
            phaseDependencyReason: "mega_bundle_incomplete_legacy_fallback",
            mega_bundle_integrity_ok: false,
            mega_bundle_integrity_ledger_pc_ok: ledgerPcOk,
            mega_bundle_integrity_ledger_cr_ok: ledgerCrOk,
            mega_bundle_integrity_posts_ok: postsOk,
          };
        }
        }
      }
    } catch (megaCatch) {
      if (process.env.NODE_ENV === "development" && messengerVerboseTraceConsoleEnabled()) {
        console.warn(
          "[home-sync] home_sync_direct_keys_critical_bundle failed — legacy directKeys path",
          megaCatch
        );
      }
    }
    if (shared) {
      shared.directKeysPrefetchedPosts = undefined;
    }
  }

  const pcById = new Map<string, { post_id: string; seller_id: string; buyer_id: string }>();
  let pcFromKeyQueryMs = 0;
  const crById = new Map<string, { item_id: string; seller_id: string; buyer_id: string }>();
  let chatRoomsQueryMs = 0;

  const pcIdByTriple = new Map<string, string>();
  let legDupMerge = 0;
  const legMapRebuild = 1;
  let itemTradeLedgerBundleRpcMs = 0;
  let usedItemTradeLedgerBundleRpc = false;

  const tDirectKeysPhase1Start = deepSteps ? performance.now() : 0;
  /** tDirectWall 대비 · RPC 또는 legacy pcCandidates SQL 시작 시각(단일 소스) */
  let pcCandidatesStartAfterMsRaw = 0;

  const dkPhase1BridgeDiag = {
    pcIn: { cacheHit: false, singleflight: false },
    itemRpc: { cacheHit: false, singleflight: false },
    chatFb: { cacheHit: false, singleflight: false },
  };

  /** HS3 / HS3-RETRY: trade_pc · trade_item 입력이 분리되어 Phase1 에서 병렬. item_trade 는 번들 RPC 로 chat+pc 후보 1RTT. */
  await Promise.all([
    (async () => {
      if (!pcIdsFromKey.length) return;
      const tQ = deepSteps ? performance.now() : 0;
      const pcs = await fetchDirectKeysProductChatsByInIdsCached(sb, pcIdsFromKey, dkPhase1BridgeDiag.pcIn);
      if (deepSteps) pcFromKeyQueryMs = performance.now() - tQ;
      for (const row of pcs) {
        const id = trimText(row.id);
        const postId = trimText(row.post_id);
        const sellerId = trimText(row.seller_id);
        const buyerId = trimText(row.buyer_id);
        if (!id || !postId || !sellerId || !buyerId) continue;
        if (pcById.has(id)) legDupMerge += 1;
        pcById.set(id, { post_id: postId, seller_id: sellerId, buyer_id: buyerId });
      }
    })(),
    (async () => {
      if (!itemTradeRoomIds.length) return;
      pcCandidatesStartAfterMsRaw = deepSteps ? performance.now() - tDirectWall : 0;
      const tRpc0 = deepSteps ? performance.now() : 0;
      try {
        const bundleRows = await fetchDirectKeysItemTradeLedgerRowsCached(sb, itemTradeRoomIds, dkPhase1BridgeDiag.itemRpc);
        if (deepSteps) itemTradeLedgerBundleRpcMs = performance.now() - tRpc0;
        usedItemTradeLedgerBundleRpc = true;
        chatRoomsQueryMs = itemTradeLedgerBundleRpcMs;
        for (const row of bundleRows) {
          const rid = trimText(row.room_id);
          const itemId = trimText(row.item_id);
          const sellerId = trimText(row.seller_id);
          const buyerId = trimText(row.buyer_id);
          if (!rid || !itemId || !sellerId || !buyerId) continue;
          if (crById.has(rid)) legDupMerge += 1;
          crById.set(rid, { item_id: itemId, seller_id: sellerId, buyer_id: buyerId });
          const pcRowId = trimText(row.pc_id);
          const pcPostId = trimText(row.pc_post_id);
          const pcSellerId = trimText(row.pc_seller_id);
          const pcBuyerId = trimText(row.pc_buyer_id);
          if (pcRowId && pcPostId && pcSellerId && pcBuyerId) {
            const k = `${pcPostId}\t${pcSellerId}\t${pcBuyerId}`;
            if (pcIdByTriple.has(k)) legDupMerge += 1;
            else pcIdByTriple.set(k, pcRowId);
          }
        }
      } catch (bundleRpcErr) {
        usedItemTradeLedgerBundleRpc = false;
        itemTradeLedgerBundleRpcMs = 0;
        if (process.env.NODE_ENV === "development" && messengerVerboseTraceConsoleEnabled()) {
          console.warn(
            "[home-sync] home_sync_direct_keys_item_trade_rows unavailable — legacy chat_rooms + pcCandidates split",
            bundleRpcErr
          );
        }
        const tQ = deepSteps ? performance.now() : 0;
        const crsRows = await fetchDirectKeysChatRoomsItemTradeFallbackCached(
          sb,
          itemTradeRoomIds,
          dkPhase1BridgeDiag.chatFb
        );
        if (deepSteps) chatRoomsQueryMs = performance.now() - tQ;
        for (const row of crsRows) {
          const id = trimText(row.id);
          const itemId = trimText(row.item_id);
          const sellerId = trimText(row.seller_id);
          const buyerId = trimText(row.buyer_id);
          if (!id || !itemId || !sellerId || !buyerId) continue;
          if (crById.has(id)) legDupMerge += 1;
          crById.set(id, { item_id: itemId, seller_id: sellerId, buyer_id: buyerId });
        }
      }
    })(),
  ]);

  const tAfterDirectKeysPhase1 = deepSteps ? performance.now() : 0;
  const phase1WallMsRaw = deepSteps ? tAfterDirectKeysPhase1 - tDirectKeysPhase1Start : 0;

  const postIdsFromCr = dedupeIds([...crById.values()].map((v) => v.item_id).filter(Boolean));
  let pcCandidatesQueryMs = 0;

  const allPostIds = dedupeIds([
    ...[...pcById.values()].map((v) => v.post_id),
    ...[...crById.values()].map((v) => v.item_id),
  ].filter(Boolean));

  if (!allPostIds.length) {
    if (dkBreakdown && shared?.trace) {
      let qEarly = 0;
      if (pcIdsFromKey.length) qEarly += 1;
      if (itemTradeRoomIds.length) qEarly += 1;
      const bridgeEarly = usedItemTradeLedgerBundleRpc
        ? itemTradeLedgerBundleRpcMs
        : itemTradeRoomIds.length
          ? chatRoomsQueryMs
          : 0;
      attachTradeDirectKeysListMetaBreakdown(shared.trace, {
        path: "early_exit",
        totalWallMs: performance.now() - tDirectWall,
        targetRooms: targets.length,
        tradePcIdsCount: dedupeIds(pcIdsFromKey).length,
        itemTradeRoomIdsCount: dedupeIds(itemTradeRoomIds).length,
        postIdsCount: 0,
        fetchPostsMs: 0,
        fetchBridgeMs: bridgeEarly,
        fetchProductChatMs: pcFromKeyQueryMs,
        fetchCategoryMs: 0,
        parallelPhase1WallMs: phase1WallMsRaw,
        parallelPhase2WallMs: 0,
        queryCount: qEarly,
        cpuBaselineMs: phase1WallMsRaw,
        diag: {
          ...computeDirectKeysCategorySlotDiag(undefined),
          ...computeDirectKeysBridgeSlotDiag(pcIdsFromKey, itemTradeRoomIds),
          direct_keys_category_cache_hit: false,
          direct_keys_bridge_cache_hit:
            (!pcIdsFromKey.length || dkPhase1BridgeDiag.pcIn.cacheHit) &&
            (!itemTradeRoomIds.length ||
              (usedItemTradeLedgerBundleRpc
                ? dkPhase1BridgeDiag.itemRpc.cacheHit
                : dkPhase1BridgeDiag.chatFb.cacheHit)),
          direct_keys_singleflight_hit:
            dkPhase1BridgeDiag.pcIn.singleflight ||
            dkPhase1BridgeDiag.itemRpc.singleflight ||
            dkPhase1BridgeDiag.chatFb.singleflight,
          direct_keys_cache_key: `early|pc:${directKeysStableKeyFromIds(pcIdsFromKey)}|rm:${directKeysStableKeyFromIds(itemTradeRoomIds)}`.slice(0, 220),
          direct_keys_normalized_cache_key: `early|pc:${directKeysStableKeyFromIds(pcIdsFromKey)}|rm:${directKeysStableKeyFromIds(itemTradeRoomIds)}`,
          direct_keys_cache_reason: "early_exit_no_posts",
          direct_keys_singleflight_key: `early|pc:${directKeysStableKeyFromIds(pcIdsFromKey)}|rm:${directKeysStableKeyFromIds(itemTradeRoomIds)}`,
          direct_keys_singleflight_join_count:
            (dkPhase1BridgeDiag.pcIn.singleflight ? 1 : 0) +
            (dkPhase1BridgeDiag.itemRpc.singleflight ? 1 : 0) +
            (dkPhase1BridgeDiag.chatFb.singleflight ? 1 : 0),
          direct_keys_cache_ttl_ms: DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS,
          direct_keys_cache_store_ms: 0,
          direct_keys_cache_lookup_ms: 0,
          direct_keys_bridge_cache_hit_after:
            (!pcIdsFromKey.length || dkPhase1BridgeDiag.pcIn.cacheHit) &&
            (!itemTradeRoomIds.length ||
              (usedItemTradeLedgerBundleRpc
                ? dkPhase1BridgeDiag.itemRpc.cacheHit
                : dkPhase1BridgeDiag.chatFb.cacheHit)),
          direct_keys_category_cache_hit_after: false,
          direct_keys_category_batch_singleflight_joins: 0,
        },
      });
    }
    return;
  }

  let postsFetchMs = 0;
  let categoryEnsureMs = 0;
  let postById: Map<string, Record<string, unknown>>;
  let categoryById: Map<string, TradeChatCategoryMetaLike>;

  const tDirectKeysPhase2Start = deepSteps ? performance.now() : 0;
  let postsStartAfterMsRaw = deepSteps ? performance.now() - tDirectWall : 0;

  /** HS3: posts 는 Phase1 맵만으로 postIds 확정. 번들 RPC 사용 시 pcCandidates 별도 쿼리 생략. */
  await Promise.all([
    (async () => {
      if (usedItemTradeLedgerBundleRpc || !postIdsFromCr.length) return;
      pcCandidatesStartAfterMsRaw = deepSteps ? performance.now() - tDirectWall : 0;
      const tQ = deepSteps ? performance.now() : 0;
      const { data: pcCandidates } = await (sb as any)
        .from("product_chats")
        .select("id, post_id, seller_id, buyer_id")
        .in("post_id", postIdsFromCr);
      if (deepSteps) pcCandidatesQueryMs = performance.now() - tQ;
      for (const row of (pcCandidates ?? []) as Array<Record<string, unknown>>) {
        const pid = trimText(row.post_id);
        const sid = trimText(row.seller_id);
        const bid = trimText(row.buyer_id);
        const id = trimText(row.id);
        if (!pid || !sid || !bid || !id) continue;
        const k = `${pid}\t${sid}\t${bid}`;
        if (pcIdByTriple.has(k)) legDupMerge += 1;
        else pcIdByTriple.set(k, id);
      }
    })(),
    (async () => {
      postsStartAfterMsRaw = deepSteps ? performance.now() - tDirectWall : 0;
      if (shared) {
        const tP = deepSteps ? performance.now() : 0;
        postById = await shared.fetchPostsCached(allPostIds);
        if (deepSteps) postsFetchMs = performance.now() - tP;
      } else {
        const tP = deepSteps ? performance.now() : 0;
        /**
         * HS2: 본 분기는 `shared` 미전달 standalone 호출용 fallback path.
         * 현재 호출처는 1곳(라인 4650)이며 항상 `shared` 와 함께 호출하므로 사실상 미사용.
         * critical tier 마커는 위 `if (shared)` 경로의 `fetchPostsCached` → `fetchTradeChatListPostRowsByIds(.., trace)` 로 전파된다.
         */
        postById = await fetchTradeChatListPostRowsByIds(sb, allPostIds);
        if (deepSteps) postsFetchMs = performance.now() - tP;
      }
    })(),
  ]);

  const tAfterDirectKeysPhase2 = deepSteps ? performance.now() : 0;
  const phase2WallMsRaw = deepSteps ? tAfterDirectKeysPhase2 - tDirectKeysPhase2Start : 0;

  if (shared) {
    const tC0 = deepSteps ? performance.now() : 0;
    await shared.categoryLoader.ensureForPosts(postById!.values());
    categoryById = shared.categoryLoader.getMergedMap();
    if (deepSteps) categoryEnsureMs = performance.now() - tC0;
  } else {
    const tC0 = deepSteps ? performance.now() : 0;
    categoryById = await loadTradeChatCategoryMetaByPostRows(sb, postById!.values());
    if (deepSteps) categoryEnsureMs = performance.now() - tC0;
  }

  const categoryAfterPostsMsRaw = deepSteps ? categoryEnsureMs : 0;

  const serialQueryPartsOnly =
    pcFromKeyQueryMs + chatRoomsQueryMs + pcCandidatesQueryMs + postsFetchMs;
  const effectiveParallelGainMsRaw = Math.max(
    0,
    Math.round(serialQueryPartsOnly - phase1WallMsRaw - phase2WallMsRaw)
  );

  const applyForPost = (
    summary: CommunityMessengerRoomSummary,
    productChatIdForMeta: string,
    postId: string,
    sellerId: string,
    buyerId: string
  ) => {
    const post = postById.get(postId);
    const priceRaw = post?.price;
    const price =
      typeof priceRaw === "number" && Number.isFinite(priceRaw)
        ? priceRaw
        : priceRaw != null
          ? Number(priceRaw)
          : null;
    const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
    const role: "seller" | "buyer" = userId === sellerId ? "seller" : "buyer";
    summary.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
      productChatId: productChatIdForMeta,
      postId,
      post: post as Record<string, unknown> | null | undefined,
      price: price != null && !Number.isNaN(price) ? price : null,
      currency,
      role,
      categoryById,
      sellerListingStateRaw: post?.seller_listing_state,
      postStatus: (post?.status as string | undefined) ?? null,
      thumbnailUrl: firstPostThumbnailForMessengerTradeList(post),
      tradeMetaBuildTrace: homeSyncTraceMeterEnabled(shared?.trace) ? shared!.trace : undefined,
    });
  };

  const tApplyLeg = performance.now();
  for (const s of targets) {
    const parsed = roomToParsed.get(s.id);
    if (!parsed) continue;
    if (parsed.kind === "trade_pc") {
      const pc = pcById.get(parsed.productChatId);
      if (!pc?.post_id) continue;
      applyForPost(s, parsed.productChatId, pc.post_id, pc.seller_id, pc.buyer_id);
      continue;
    }
    const cr = crById.get(parsed.itemTradeChatRoomId);
    if (!cr?.item_id) continue;
    const tripleKey = `${cr.item_id}\t${cr.seller_id}\t${cr.buyer_id}`;
    const resolvedPc = trimText(pcIdByTriple.get(tripleKey));
    const pcidForMeta = resolvedPc || parsed.itemTradeChatRoomId;
    applyForPost(s, pcidForMeta, cr.item_id, cr.seller_id, cr.buyer_id);
  }

  const applyLoopMsLeg = performance.now() - tApplyLeg;
  const wallMsEndRaw = performance.now() - tDirectWall;
  const legSlotDiag = computeDirectKeysCategorySlotDiag(postById!.values());
  const legHiddenSequential = Math.max(
    0,
    Math.round(wallMsEndRaw - phase1WallMsRaw - phase2WallMsRaw - postsFetchMs - categoryEnsureMs - applyLoopMsLeg)
  );
  const legHotCpu = targets.length > 0 && roomToParsed.size > targets.length + 3 ? 1 : 0;
  const legBridgeAttach = pcById.size + crById.size + pcIdByTriple.size;
  const legacyDkStableKey = `legacy|pc:${directKeysStableKeyFromIds(pcIdsFromKey)}|rm:${directKeysStableKeyFromIds(itemTradeRoomIds)}`;
  const legacyBridgeAggHit =
    (!pcIdsFromKey.length || dkPhase1BridgeDiag.pcIn.cacheHit) &&
    (!itemTradeRoomIds.length ||
      (usedItemTradeLedgerBundleRpc ? dkPhase1BridgeDiag.itemRpc.cacheHit : dkPhase1BridgeDiag.chatFb.cacheHit));
  const legacySfJoinCount =
    (dkPhase1BridgeDiag.pcIn.singleflight ? 1 : 0) +
    (dkPhase1BridgeDiag.itemRpc.singleflight ? 1 : 0) +
    (dkPhase1BridgeDiag.chatFb.singleflight ? 1 : 0);
  const legacySfAggHit = legacySfJoinCount > 0;

  if (
    process.env.NODE_ENV === "development" &&
    messengerVerboseTraceConsoleEnabled() &&
    deepSteps &&
    shared?.trace?.tier === "critical"
  ) {
    const tpfd = shared.trace.deepSteps?.tradePostsFetchDetail;
    const miss350 = wallMsEndRaw > 350;
    const missPcCandSum =
      pcCandidatesQueryMs > 0 && wallMsEndRaw >= postsFetchMs + pcCandidatesQueryMs * 0.8;
    const badFallback = (tpfd?.fallbackAttemptCount ?? 0) > 0;
    const badQueryCount = (tpfd?.queryCount ?? 0) > 1;
    if (miss350 || missPcCandSum || badFallback || badQueryCount) {
      console.warn("[home-sync-fail] HS3 directKeys target missed", {
        directKeys_wallMs: Math.round(wallMsEndRaw),
        directKeys_chatRoomsQueryMs: Math.round(chatRoomsQueryMs),
        directKeys_pcCandidatesQueryMs: Math.round(pcCandidatesQueryMs),
        directKeys_postsFetchMs: Math.round(postsFetchMs),
        phase1WallMs: Math.round(phase1WallMsRaw),
        phase2WallMs: Math.round(phase2WallMsRaw),
        postsStartAfterMs: Math.round(postsStartAfterMsRaw),
        pcCandidatesStartAfterMs: Math.round(pcCandidatesStartAfterMsRaw),
        categoryAfterPostsMs: Math.round(categoryAfterPostsMsRaw),
        itemTradeLedgerBundleRpcMs: Math.round(itemTradeLedgerBundleRpcMs),
        usedItemTradeLedgerBundleRpc,
        fallbackAttemptCount: tpfd?.fallbackAttemptCount ?? null,
        tradePostsQueryCount: tpfd?.queryCount ?? null,
      });
    }
    if (
      shared.trace?.tier === "critical" &&
      phase1WallMsRaw > 5 &&
      phase2WallMsRaw > 5 &&
      wallMsEndRaw > 350
    ) {
      console.warn("[home-sync-fail] HS3 FINAL directKeys still multi-RTT", {
        directKeys_wallMs: Math.round(wallMsEndRaw),
        phase1WallMs: Math.round(phase1WallMsRaw),
        phase2WallMs: Math.round(phase2WallMsRaw),
        directKeys_effectiveRttCount: 2,
      });
    }
  }

  if (deepSteps && shared?.trace) {
    const detail: HomeSyncDeepStepsTradeDirectKeys = {
      wallMs: ms(wallMsEndRaw),
      pcFromKeyQueryMs: ms(pcFromKeyQueryMs),
      chatRoomsQueryMs: ms(chatRoomsQueryMs),
      pcCandidatesQueryMs: ms(pcCandidatesQueryMs),
      postsFetchMs: ms(postsFetchMs),
      categoryEnsureMs: ms(categoryEnsureMs),
      ...(itemTradeLedgerBundleRpcMs > 0 ? { itemTradeLedgerBundleRpcMs: ms(itemTradeLedgerBundleRpcMs) } : {}),
      ...(phase1WallMsRaw > 0 ? { phase1WallMs: ms(phase1WallMsRaw) } : {}),
      ...(phase2WallMsRaw > 0 ? { phase2WallMs: ms(phase2WallMsRaw) } : {}),
      ...(postsStartAfterMsRaw > 0 ? { postsStartAfterMs: ms(postsStartAfterMsRaw) } : {}),
      ...(pcCandidatesStartAfterMsRaw > 0 ? { pcCandidatesStartAfterMs: ms(pcCandidatesStartAfterMsRaw) } : {}),
      ...(categoryAfterPostsMsRaw > 0 ? { categoryAfterPostsMs: ms(categoryAfterPostsMsRaw) } : {}),
      ...(effectiveParallelGainMsRaw > 0 ? { effectiveParallelGainMs: ms(effectiveParallelGainMsRaw) } : {}),
      ...(shared.trace?.tier === "critical"
        ? {
            effectiveRttCount: 2,
            phaseDependencyReason: "legacy_parallel_phase1_then_phase2_posts_pcCand",
          }
        : {}),
      direct_keys_duplicate_merge_count: legDupMerge,
      direct_keys_map_rebuild_count: legMapRebuild,
      direct_keys_duplicate_normalize_count: 0,
      direct_keys_bridge_attach_iterations: legBridgeAttach,
      direct_keys_category_attach_iterations: legSlotDiag.direct_keys_unique_category_ids_count,
      direct_keys_object_spread_count: 0,
      direct_keys_hot_cpu_loop: legHotCpu,
      direct_keys_hidden_sequential_wait_ms: legHiddenSequential,
      direct_keys_lookup_rebuild_count: legMapRebuild,
      direct_keys_lookup_rebuild_count_after: legMapRebuild,
      direct_keys_map_rebuild_count_after: legMapRebuild,
      direct_keys_apply_loop_ms: Math.round(applyLoopMsLeg),
      direct_keys_cache_key: legacyDkStableKey.length > 200 ? legacyDkStableKey.slice(0, 200) : legacyDkStableKey,
      direct_keys_normalized_cache_key: legacyDkStableKey,
      direct_keys_cache_reason: legacyBridgeAggHit ? "bridge_row_snapshot_hit" : "bridge_rpc_cold",
      direct_keys_singleflight_key: legacyDkStableKey,
      direct_keys_singleflight_join_count: legacySfJoinCount,
      direct_keys_cache_ttl_ms: DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS,
      direct_keys_cache_store_ms: 0,
      direct_keys_cache_lookup_ms: 0,
      direct_keys_bridge_cache_hit_after: legacyBridgeAggHit,
      direct_keys_category_cache_hit_after: !shared.categoryLoader.lastEnsureCategoryUsedDb,
      direct_keys_category_batch_singleflight_joins: 0,
    };
    shared.trace.deepSteps.tradeDirectKeysDetail = detail;
    if (dkBreakdown) {
      let legQ = (pcIdsFromKey.length ? 1 : 0) + (itemTradeRoomIds.length ? 1 : 0);
      if (postIdsFromCr.length && !usedItemTradeLedgerBundleRpc) legQ += 1;
      const tPostQ = Number(shared.trace.deepSteps.tradePostsFetchDetail?.queryCount ?? 0);
      legQ += Number.isFinite(tPostQ) ? tPostQ : 0;
      const bridgeLegacy = itemTradeRoomIds.length
        ? usedItemTradeLedgerBundleRpc
          ? itemTradeLedgerBundleRpcMs
          : chatRoomsQueryMs
        : 0;
      attachTradeDirectKeysListMetaBreakdown(shared.trace, {
        path: "legacy_parallel",
        totalWallMs: wallMsEndRaw,
        targetRooms: targets.length,
        tradePcIdsCount: dedupeIds(pcIdsFromKey).length,
        itemTradeRoomIdsCount: dedupeIds(itemTradeRoomIds).length,
        postIdsCount: allPostIds.length,
        fetchPostsMs: postsFetchMs,
        fetchBridgeMs: bridgeLegacy,
        fetchProductChatMs: pcFromKeyQueryMs + pcCandidatesQueryMs,
        fetchCategoryMs: categoryEnsureMs,
        parallelPhase1WallMs: phase1WallMsRaw,
        parallelPhase2WallMs: phase2WallMsRaw,
        queryCount: legQ,
        cpuBaselineMs: phase1WallMsRaw + phase2WallMsRaw + categoryEnsureMs,
        diag: {
          ...legSlotDiag,
          ...computeDirectKeysBridgeSlotDiag(pcIdsFromKey, itemTradeRoomIds),
          direct_keys_category_cache_hit: !shared.categoryLoader.lastEnsureCategoryUsedDb,
          direct_keys_bridge_cache_hit: legacyBridgeAggHit,
          direct_keys_singleflight_hit: legacySfAggHit,
          direct_keys_duplicate_merge_count: legDupMerge,
          direct_keys_map_rebuild_count: legMapRebuild,
          direct_keys_duplicate_normalize_count: 0,
          direct_keys_bridge_attach_iterations: legBridgeAttach,
          direct_keys_category_attach_iterations: legSlotDiag.direct_keys_unique_category_ids_count,
          direct_keys_object_spread_count: 0,
          direct_keys_hot_cpu_loop: legHotCpu,
          direct_keys_hidden_sequential_wait_ms: legHiddenSequential,
          direct_keys_lookup_rebuild_count: legMapRebuild,
          direct_keys_apply_loop_ms: Math.round(applyLoopMsLeg),
          direct_keys_cache_key: legacyDkStableKey.length > 200 ? legacyDkStableKey.slice(0, 200) : legacyDkStableKey,
          direct_keys_normalized_cache_key: legacyDkStableKey,
          direct_keys_cache_reason: legacyBridgeAggHit ? "bridge_row_snapshot_hit" : "bridge_rpc_cold",
          direct_keys_singleflight_key: legacyDkStableKey,
          direct_keys_singleflight_join_count: legacySfJoinCount,
          direct_keys_cache_ttl_ms: DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS,
          direct_keys_cache_store_ms: 0,
          direct_keys_cache_lookup_ms: 0,
          direct_keys_bridge_cache_hit_after: legacyBridgeAggHit,
          direct_keys_category_cache_hit_after: !shared.categoryLoader.lastEnsureCategoryUsedDb,
          direct_keys_category_batch_singleflight_joins: 0,
        },
      });
    }
  }
}

/** 요약의 trade productChatId 들에 대한 단일 seed 조회(Phase A 와 seller hydrate warm 공유). */
async function fetchSeedProductChatsForTradeEnrich(
  sb: any,
  productChatIds: string[],
  msRef?: { ms: number }
): Promise<
  Map<
    string,
    {
      post_id: string;
      seller_id: string;
      buyer_id: string;
      /** Phase B 에서 `product_chats` 중복 조회를 줄이기 위한 CM 방 링크 */
      community_messenger_room_id?: string;
    }
  >
> {
  const map = new Map<
    string,
    {
      post_id: string;
      seller_id: string;
      buyer_id: string;
      community_messenger_room_id?: string;
    }
  >();
  const ids = dedupeIds(productChatIds);
  if (!ids.length || !sb) return map;
  const t0 = msRef ? performance.now() : 0;
  const { data: pcs } = await sb
    .from("product_chats")
    .select("id, post_id, seller_id, buyer_id, community_messenger_room_id")
    .in("id", ids);
  if (msRef) msRef.ms += performance.now() - t0;
  for (const row of (pcs ?? []) as Array<Record<string, unknown>>) {
    const id = trimText(row.id);
    const post_id = trimText(row.post_id);
    const seller_id = trimText(row.seller_id);
    const buyer_id = trimText(row.buyer_id);
    if (!id || !post_id || !seller_id || !buyer_id) continue;
    const cmrid = trimText(row.community_messenger_room_id);
    map.set(id, {
      post_id,
      seller_id,
      buyer_id,
      ...(cmrid ? { community_messenger_room_id: cmrid } : {}),
    });
  }
  return map;
}

function warmSellerPcMapFromSeed(
  seed: Map<string, { post_id: string; seller_id: string; buyer_id: string }>
): Map<string, { seller_id: string; post_id: string }> {
  const out = new Map<string, { seller_id: string; post_id: string }>();
  for (const [id, row] of seed) {
    out.set(id, { seller_id: row.seller_id, post_id: row.post_id });
  }
  return out;
}

/**
 * 거래 탭 목록 4행 — `product_chats.seller_id` 우선, 없으면 `posts.user_id` 로 프로필 라벨을 배치 조회해 `contextMeta.sellerDisplayName` 에 넣는다.
 * tier·unread·입장 경로는 바꾸지 않고 `enrichTradeRoomContextMetaForBootstrap` 마지막에만 실행한다.
 */
async function hydrateTradeListSellerDisplayNamesForSummaries(
  sb: unknown,
  summaries: CommunityMessengerRoomSummary[],
  trace?: HomeSyncTrace,
  opts?: { warmPcMapPromise?: Promise<Map<string, { seller_id: string; post_id: string }>> | null }
): Promise<void> {
  const deepSteps = homeSyncTraceMeterEnabled(trace);
  const tTop = deepSteps ? performance.now() : 0;
  const tradeRows = summaries.filter((s) => s.contextMeta?.kind === "trade");
  if (!tradeRows.length) return;

  const listMetaProfileObs = trimText(trace?.token ?? "") === "trade-chat-list-meta";
  const profileRowStats: FetchProfilesByIdsRowStats | undefined =
    listMetaProfileObs && trace
      ? { rowCacheHits: 0, rowCacheMisses: 0, singleflightJoined: false }
      : undefined;

  const tDeduce = deepSteps ? performance.now() : 0;
  const productChatIds = dedupeIds(
    tradeRows.map((s) => trimText(s.contextMeta?.productChatId)).filter(Boolean)
  );
  const sellerIdsDedupeMs = deepSteps ? performance.now() - tDeduce : 0;
  const pcById = new Map<string, { seller_id: string; post_id: string }>();
  const tPcFetch = deepSteps ? performance.now() : 0;
  const warmPromise = opts?.warmPcMapPromise;
  const warmMap = warmPromise ? await warmPromise.catch(() => new Map()) : null;
  for (const [id, row] of warmMap?.entries() ?? []) {
    pcById.set(id, row);
  }
  const missingPcIds = productChatIds.filter((id) => !pcById.has(id));
  const sellerWarmSeedHitAll = missingPcIds.length === 0;
  if (missingPcIds.length) {
    const { data: pcs } = await (sb as any)
      .from("product_chats")
      .select("id, seller_id, post_id")
      .in("id", missingPcIds);
    for (const row of (pcs ?? []) as Array<{ id?: unknown; seller_id?: unknown; post_id?: unknown }>) {
      const id = trimText(row.id);
      const seller_id = trimText(row.seller_id);
      const post_id = trimText(row.post_id);
      if (!id || !seller_id) continue;
      pcById.set(id, { seller_id, post_id });
    }
  }
  const prefetchProductChatsMs = deepSteps ? performance.now() - tPcFetch : 0;

  // posts 조회는 "seller_id 를 product_chats 에서 못 얻는 경우"에만 필요하다.
  // (기능 동일: seller_id 우선순위는 유지하되 불필요한 posts fetch를 줄인다)
  const postIdsNeedingAuthor = dedupeIds(
    tradeRows
      .map((s) => {
        const meta = s.contextMeta;
        if (!meta || meta.kind !== "trade") return "";
        const pcid = trimText(meta.productChatId);
        if (pcid) {
          const pc = pcById.get(pcid);
          if (pc?.seller_id) return "";
        }
        return trimText(meta.postId);
      })
      .filter(Boolean)
  );
  const tPostsFetch = deepSteps ? performance.now() : 0;
  /**
   * HS2: seller profile attach 단계의 posts 보충 조회도 critical 마커 전파.
   * (critical tier 라면 fixed select 1회 — fallback chain 진입 금지)
   */
  const postById =
    postIdsNeedingAuthor.length > 0
      ? await fetchTradeChatListPostRowsByIds(sb, postIdsNeedingAuthor, trace)
      : new Map();
  const postsFetchMs = deepSteps ? performance.now() - tPostsFetch : 0;

  const roomToSellerId = new Map<string, string>();
  const sellerIds = new Set<string>();
  for (const s of tradeRows) {
    const meta = s.contextMeta;
    if (!meta || meta.kind !== "trade") continue;
    const pcid = trimText(meta.productChatId);
    const postId = trimText(meta.postId);
    let sellerUid = "";
    if (pcid) {
      const pc = pcById.get(pcid);
      if (pc?.seller_id) sellerUid = pc.seller_id;
    }
    if (!sellerUid && postId) {
      const post = postById.get(postId);
      sellerUid = trimText((post as { user_id?: unknown } | undefined)?.user_id);
    }
    if (sellerUid) {
      roomToSellerId.set(s.id, sellerUid);
      sellerIds.add(sellerUid);
    }
  }
  if (!sellerIds.size) return;

  const tSellerProfiles = deepSteps ? performance.now() : 0;
  const labelByUserId = await fetchProfilesByIds(
    [...sellerIds],
    profileRowStats,
    TRADE_META_SELLER_PROFILE_ROW_TTL_MS
  );
  const sellerProfilesFetchMs = deepSteps ? performance.now() - tSellerProfiles : 0;

  const tAttach = deepSteps ? performance.now() : 0;
  for (const s of tradeRows) {
    const sellerUid = roomToSellerId.get(s.id);
    if (!sellerUid) continue;
    const prev = s.contextMeta;
    if (!prev || prev.kind !== "trade") continue;
    const label = profileLabel(labelByUserId.get(sellerUid), sellerUid).trim();
    if (!label) continue;
    prev.sellerDisplayName = label;
  }
  const attachCpuMs = deepSteps ? performance.now() - tAttach : 0;

  if (deepSteps && trace) {
    trace.deepSteps.sellerProfileAttachBreakdown = {
      tradeRows: ms(tradeRows.length),
      productChatIds: ms(productChatIds.length),
      postIdsNeedingAuthor: ms(postIdsNeedingAuthor.length),
      sellerIds: ms(sellerIds.size),
      sellerIdsDedupeMs: ms(sellerIdsDedupeMs),
      prefetchProductChatsMs: ms(prefetchProductChatsMs),
      postsFetchMs: ms(postsFetchMs),
      sellerProfilesFetchMs: ms(sellerProfilesFetchMs),
      attachCpuMs: ms(attachCpuMs),
      totalMs: ms(performance.now() - tTop),
      sellerProfilesFetchLikelyCached: ms(sellerProfilesFetchMs) <= 10,
    };

    if (listMetaProfileObs) {
      const spd = trace.deepSteps.sellerProfileAttachBreakdown;
      const sellerSlotCount = tradeRows.length;
      const uniqueSellers = sellerIds.size;
      const prefetchMs = ms(spd.prefetchProductChatsMs);
      const postsMs = ms(spd.postsFetchMs);
      const sellMs = ms(spd.sellerProfilesFetchMs);
      const attachMs = ms(spd.attachCpuMs);
      let shTop = "prefetch_product_chats";
      let shTopMs = prefetchMs;
      if (postsMs > shTopMs) {
        shTop = "posts_for_author";
        shTopMs = postsMs;
      }
      if (sellMs > shTopMs) {
        shTop = "profiles_table_fetch";
        shTopMs = sellMs;
      }
      if (attachMs > shTopMs) {
        shTop = "seller_label_attach_cpu";
        shTopMs = attachMs;
      }
      const rs = profileRowStats!;
      const profileTop =
        rs.rowCacheMisses === 0 && uniqueSellers > 0
          ? "row_cache_only"
          : sellMs >= postsMs && sellMs >= prefetchMs
            ? "profiles_table_fetch"
            : "mixed";

      trace.deepSteps.tradeListMetaProfileHydrateStats = {
        trade_meta_profile_ids_count: uniqueSellers,
        trade_meta_unique_profile_ids_count: uniqueSellers,
        trade_meta_duplicate_profile_ids_count: Math.max(0, sellerSlotCount - uniqueSellers),
        trade_meta_seller_ids_count: sellerSlotCount,
        trade_meta_unique_seller_ids_count: uniqueSellers,
        trade_meta_profile_cache_hit: uniqueSellers > 0 && rs.rowCacheMisses === 0,
        trade_meta_seller_cache_hit: sellerWarmSeedHitAll,
        trade_meta_profiles_fetch_row_cache_hits: rs.rowCacheHits,
        trade_meta_profiles_fetch_row_cache_misses: rs.rowCacheMisses,
        trade_meta_profile_fetch_singleflight_hit: rs.singleflightJoined,
        trade_meta_profiles_fetch_top_bottleneck: profileTop,
        trade_meta_seller_hydrate_top_bottleneck: shTop,
      };
    }
  }
}

async function enrichTradeRoomContextMetaForBootstrap(
  userId: string,
  summaries: CommunityMessengerRoomSummary[],
  tradeDiag?: CommunityMessengerBootstrapDiagnostics,
  trace?: HomeSyncTrace,
  opts?: {
    tradeCategoryFetchMode?: "full" | "fallback_only";
    /** home-sync 한정: `roomListCap` 과 함께 전달되면 mega direct_keys RPC 허용(prod full 포함) */
    homeSyncMegaBundleForDirectKeys?: boolean;
    /** trade-chat-list-meta: direct_keys 썸네일·제목만 — seed/bridge/category/seller 직렬 구간 생략 */
    tradeListMetaUltraLight?: boolean;
    /**
     * `?lite=1` bootstrap: mega direct_keys + critical posts + fallback_only category.
     * Phase D(peer pair) 생략 — `useTradeChatListMetaHydration` 이 잔여 방 보강.
     */
    bootstrapLiteFastEnrich?: boolean;
    /** bootstrap lite: `getCommunityMessengerBootstrap` `Promise.all` 선행 mega — 중복 RPC 금지 */
    megaBundlePrefetchPromise?: Promise<HomeSyncMegaDirectKeysBundleFetchResult>;
  }
): Promise<void> {
  const sb = getSupabaseOrNull();
  if (!sb) return;

  const listMetaBreakdown = trimText(trace?.token ?? "") === "trade-chat-list-meta";
  const listMetaOrch = listMetaBreakdown
    ? {
        summaryByRoomId: new Map<string, CommunityMessengerRoomSummary>(),
        contextMetaAssigns: 0,
        phaseBIterations: 0,
        phaseCIterations: 0,
        phaseDIterations: 0,
        tPhaseBEnd: 0,
        tPhaseCStart: 0,
        mapRebuildCount: 0,
      }
    : null;
  if (listMetaOrch) {
    for (const s of summaries) {
      const id = trimText(s.id);
      if (id) listMetaOrch.summaryByRoomId.set(id, s);
    }
  }
  let lmDirectMs = 0;
  let lmSeedMs = 0;
  let lmPhaseABridgeParallelMs = 0;
  let lmPhaseBMs = 0;
  let lmPhaseCMs = 0;
  let lmPhaseDMs = 0;
  let lmSellerHydrateMs = 0;
  /** trade-chat-list-meta: contextMeta 실제 할당이 일어난 횟수(스캔 대비) */
  let phaseBMetaAssignsEffective = 0;
  let phaseCMetaAssignsEffective = 0;
  let phaseDMetaAssignsEffective = 0;
  let phaseCEntriesScanWidth = 0;
  /** Phase A + bridge/ledger 선행 병렬 블록 벽시계 — trade meta 관측용 */
  let phaseAAndBridgeParallelWallMs = 0;

  const deepSteps = homeSyncTraceMeterEnabled(trace);
  const tTop = deepSteps ? performance.now() : 0;
  let tradePostsFetchMs = 0;
  let categoryFetchMs = 0;
  let sellerProfileAttachMs = 0;
  let cpuMergeMs = 0;
  let bridgePhaseBPcByRoomMs = 0;
  let bridgePhaseCLedgerMs = 0;
  let bridgePhaseBcLedgerParallelWallMs = 0;
  let bridgePhaseCPcCandidatesMs = 0;
  let bridgePhaseDPairPcMs = 0;
  let phaseASeedMissProductChatsMs = 0;
  let phaseDPeerIndexCpuMs = 0;
  let phaseBSyncMapCpuMs = 0;
  let phaseCSyncLedgerMapCpuMs = 0;
  let phaseCSyncPcTripleCpuMs = 0;
  let phaseAPrePostsSyncCpuMs = 0;
  let tradeEnrichPhaseTargetsPrepCpuMs = 0;
  let phaseDFinalMergeCpuMs = 0;
  /** 동일 방에 trade contextMeta 재할당 횟수(진단) — 의미 변경 없음 */
  let duplicateTradeRoomApplies = 0;
  /** trade-chat-list-meta: Phase B 에서 이미 contextMeta 를 쓴 rid — Phase C 에서 touch 중복 제거 */
  const tradeListMetaRoomIdMetaAttachedAtPhaseB = new Set<string>();
  /** trade-chat-list-meta — Phase C ledger 병합 대상 행 수(스캔 지표) */
  let tradeListMetaPhaseCTargetScan = 0;
  const tradeRoomMetaPassSet = new Set<string>();
  const touchTradeRoomMeta = (roomId: string) => {
    const r = trimText(roomId);
    if (!r || !deepSteps) return;
    if (tradeRoomMetaPassSet.has(r)) duplicateTradeRoomApplies += 1;
    tradeRoomMetaPassSet.add(r);
  };

  const categoryLoader = new TradeCategoryMetaRequestLoader(
    sb,
    trace,
    opts?.tradeCategoryFetchMode ?? "full",
    true
  );

  const bootstrapLiteFast = opts?.bootstrapLiteFastEnrich === true;
  let bootstrapLiteHeavyPipelineRan = false;
  let bootstrapTradePostsFetchMs = 0;
  let bootstrapTradeCategoryFetchMs = 0;
  let bootstrapTradeCpuMergeMs = 0;
  let bootstrapTradeNormalizeMs = 0;
  let bootstrapTradeHiddenFallbackMs = 0;

  // 요청 스코프 posts 캐시: Phase A/B/C/D에서 같은 postId를 중복 조회하지 않게 한다.
  // (응답/기능 동일, tradePostsFetchMs만 타겟)
  const postRowCacheById = new Map<string, Record<string, unknown>>();
  const enrichBootstrapCtx: TradeEnrichBootstrapSharedCtx = {
    trace,
    tradeDiag,
    megaBundlePrefetchPromise: opts?.megaBundlePrefetchPromise,
    homeSyncMegaBundleForDirectKeys:
      opts?.homeSyncMegaBundleForDirectKeys === true || bootstrapLiteFast,
    categoryLoader,
    directKeysPrefetchedPosts: undefined,
    fetchPostsCached: async () => new Map(),
  };
  enrichBootstrapCtx.fetchPostsCached = async (
    idsRaw: string[]
  ): Promise<Map<string, Record<string, unknown>>> => {
    const ids = dedupeIds(idsRaw);
    if (!ids.length) return new Map();
    const missing: string[] = [];
    const out = new Map<string, Record<string, unknown>>();
    const pref = enrichBootstrapCtx.directKeysPrefetchedPosts;
    for (const id of ids) {
      const seeded = pref?.get(id);
      if (seeded) {
        postRowCacheById.set(id, seeded);
        out.set(id, seeded);
        continue;
      }
      const hit = postRowCacheById.get(id);
      if (hit) out.set(id, hit);
      else missing.push(id);
    }
    if (missing.length) {
      const tPostsFetch = tradeDiag || deepSteps ? performance.now() : 0;
      const fetched = await fetchTradeChatListPostRowsByIds(sb, missing, trace);
      if (tradeDiag || deepSteps) {
        const postsWall = performance.now() - tPostsFetch;
        bootstrapTradePostsFetchMs += postsWall;
        if (deepSteps) tradePostsFetchMs += postsWall;
        const tpd = trace?.deepSteps.tradePostsFetchDetail;
        if (bootstrapLiteFast && tpd && (tpd.fallbackAttemptCount ?? 0) > 0) {
          bootstrapTradeHiddenFallbackMs += postsWall;
        }
      }
      for (const [id, row] of fetched.entries()) {
        postRowCacheById.set(id, row);
        out.set(id, row);
      }
    }
    return out;
  };

  const liteHeavyTargetCountBefore = bootstrapLiteFast
    ? tradeSummariesBootstrapLiteHeavyTargetBeforeDirectKeys(summaries).length
    : 0;

  const tDirect = performance.now();
  await enrichTradeRoomContextMetaFromDirectKeys(userId, summaries, enrichBootstrapCtx);
  const directWallMs = performance.now() - tDirect;
  tradeDiag && (tradeDiag.enrichTradeDirectKeysMs = Math.round(directWallMs));
  if (listMetaBreakdown) lmDirectMs = directWallMs;

  const flushBootstrapTradeEnrichDiag = (heavyPipelineSkipped: boolean) => {
    if (!tradeDiag) return;
    tradeDiag.enrichTradePostsFetchMs = Math.round(bootstrapTradePostsFetchMs);
    tradeDiag.enrichTradeCategoryFetchMs = Math.round(bootstrapTradeCategoryFetchMs);
    tradeDiag.enrichTradeCpuMergeMs = Math.round(bootstrapTradeCpuMergeMs);
    tradeDiag.enrichTradeNormalizeMs = Math.round(bootstrapTradeNormalizeMs);
    tradeDiag.enrichTradeHiddenFallbackMs = Math.round(bootstrapTradeHiddenFallbackMs);
    if (bootstrapLiteFast) {
      tradeDiag.bootstrapLiteTradeHeavyPipelineSkipped = heavyPipelineSkipped
        ? true
        : !bootstrapLiteHeavyPipelineRan;
    }
  };

  if (bootstrapLiteFast) {
    const missingAfter = tradeSummariesBootstrapLiteMissingAfterDirectKeys(summaries);
    if (tradeDiag) {
      tradeDiag.bootstrapLiteHeavyTargetCountBefore = liteHeavyTargetCountBefore;
      tradeDiag.bootstrapLiteHeavyTargetCountAfterDirectKeys = missingAfter.length;
      tradeDiag.bootstrapLiteHeavyTargetReasonsTop = bootstrapLiteHeavyTargetReasonsTopFromSummaries(missingAfter);
      tradeDiag.bootstrapLiteMiddlePipelineBlocked = true;
      tradeDiag.bootstrapLiteDeferredHydrationCount = 0;
    }

    if (missingAfter.length > 0 && tradeDiag) {
      /** 첫 페인트: mega/direct_keys 이후에도 부족한 방은 background(`useTradeChatListMetaHydration`) — lite 에서 posts RTT 는 warm 1ms 유지 */
      tradeDiag.bootstrapLiteDeferredHydrationCount += missingAfter.length;
      tradeDiag.bootstrapLiteMissingOnlyBatchMs = 0;
    }

    flushBootstrapTradeEnrichDiag(true);
    if (deepSteps && trace) {
      const totalRounded = ms(performance.now() - tTop);
      const dkWall = ms(trace.deepSteps.tradeDirectKeysDetail?.wallMs ?? directWallMs);
      const batchWall = ms(tradeDiag?.bootstrapLiteMissingOnlyBatchMs ?? 0);
      trace.deepSteps.tradeMetaEnrich = {
        tradePostsFetchMs: ms(bootstrapTradePostsFetchMs),
        categoryFetchMs: 0,
        sellerProfileAttachMs: 0,
        sellerProfileAttach: {
          tradeRows: 0,
          productChatIds: 0,
          postIdsNeedingAuthor: 0,
          sellerIds: 0,
          sellerIdsDedupeMs: 0,
          prefetchProductChatsMs: 0,
          postsFetchMs: 0,
          sellerProfilesFetchMs: 0,
          attachCpuMs: 0,
          totalMs: 0,
          sellerProfilesFetchLikelyCached: true,
        },
        cpuMergeMs: ms(bootstrapTradeCpuMergeMs),
        totalMs: totalRounded,
        rooms: ms(summaries.length),
        tradeCategoryFetchMode: "fallback_only",
        categoryDbSkipped: true,
        duplicateTradeMergeCount: 0,
        seedProductChatsMs: 0,
        directKeys: trace.deepSteps.tradeDirectKeysDetail,
        explainedComponentsMs: ms(dkWall + batchWall),
        explainedPlusCategoryParallelMs: ms(dkWall + batchWall),
        residualGapAfterCategoryMs: Math.max(0, totalRounded - dkWall - batchWall),
        gapMs: Math.max(0, totalRounded - dkWall - batchWall),
        tradeMetaCacheHit: missingAfter.length === 0,
        tradeMetaCacheMissReason: missingAfter.length > 0 ? "lite_missing_only_batch" : null,
        tradeMetaTopBottleneck: batchWall >= dkWall ? "lite_missing_only_batch" : "direct_keys",
        tradeMetaTopBottleneckMs: Math.max(dkWall, batchWall),
      };
    }
    return;
  }

  if (opts?.tradeListMetaUltraLight) {
    if (deepSteps && trace) {
      const totalRounded = ms(performance.now() - tTop);
      const dkWall = ms(trace.deepSteps.tradeDirectKeysDetail?.wallMs ?? directWallMs);
      trace.deepSteps.tradeMetaEnrich = {
        tradePostsFetchMs: 0,
        categoryFetchMs: 0,
        sellerProfileAttachMs: 0,
        sellerProfileAttach: {
          tradeRows: 0,
          productChatIds: 0,
          postIdsNeedingAuthor: 0,
          sellerIds: 0,
          sellerIdsDedupeMs: 0,
          prefetchProductChatsMs: 0,
          postsFetchMs: 0,
          sellerProfilesFetchMs: 0,
          attachCpuMs: 0,
          totalMs: 0,
          sellerProfilesFetchLikelyCached: true,
        },
        cpuMergeMs: 0,
        totalMs: totalRounded,
        rooms: ms(summaries.length),
        tradeCategoryFetchMode: "fallback_only",
        categoryDbSkipped: true,
        duplicateTradeMergeCount: 0,
        seedProductChatsMs: 0,
        directKeys: trace.deepSteps.tradeDirectKeysDetail,
        explainedComponentsMs: dkWall,
        explainedPlusCategoryParallelMs: dkWall,
        residualGapAfterCategoryMs: Math.max(0, totalRounded - dkWall),
        gapMs: Math.max(0, totalRounded - dkWall),
        tradeMetaCacheHit: true,
        tradeMetaCacheMissReason: null,
        tradeMetaDuplicateRoomCount: 0,
        tradeMetaDuplicatePostCount: 0,
        tradeMetaDuplicateSellerCount: 0,
        tradeMetaParallelWaitMs: 0,
        tradeMetaQueryCount: 0,
        tradeMetaSingleflightHit: false,
        tradeMetaTopBottleneck: "direct_keys",
        tradeMetaTopBottleneckMs: dkWall,
      };
      if (listMetaBreakdown) {
        const dkOnly = Math.round(lmDirectMs);
        trace.deepSteps.tradeListMetaEnrichBootstrapBreakdown = {
          enrich_direct_keys_ms: dkOnly,
          enrich_seed_product_chats_ms: 0,
          enrich_phase_a_bridge_parallel_ms: 0,
          enrich_parallel_wait_ms: 0,
          enrich_phase_b_ms: 0,
          enrich_phase_c_ms: 0,
          enrich_phase_d_ms: 0,
          enrich_seller_display_hydrate_wall_ms: 0,
          enrich_load_post_ms: 0,
          enrich_category_fetch_wall_ms: 0,
          enrich_partner_fetch_ms: 0,
          enrich_trade_state_ms: 0,
          enrich_cpu_merge_tracked_ms: 0,
          enrich_query_count_approx: 0,
          enrich_gap_ms: Math.max(0, totalRounded - dkOnly),
          enrich_top_bottleneck: "enrich_direct_keys_ms",
          enrich_top_bottleneck_ms: dkOnly,
          enrich_top_bottleneck_percent: totalRounded > 0 ? Math.round((dkOnly / totalRounded) * 1000) / 10 : 0,
          trade_list_meta_ultra_light: 1,
        };
      }
    }
    return;
  }

  const tPrepSeedIds = deepSteps ? performance.now() : 0;
  const tradeSeedPcIds = dedupeIds(
    summaries
      .filter((s) => s.contextMeta?.kind === "trade")
      .map((s) => trimText(s.contextMeta?.productChatId))
      .filter(Boolean)
  );
  if (deepSteps) tradeEnrichPhaseTargetsPrepCpuMs += performance.now() - tPrepSeedIds;
  const seedMsRef = deepSteps ? { ms: 0 } : undefined;
  const tLmSeed = listMetaBreakdown ? performance.now() : 0;
  const summaryPostIdsForCat = dedupeIds(
    summaries
      .filter((s) => s.contextMeta?.kind === "trade")
      .map((s) => trimText((s.contextMeta as { postId?: string })?.postId))
      .filter(Boolean)
  );
  const summaryPostIdSetForCat = new Set(summaryPostIdsForCat);
  const categoryPrimeSummaryWallAccumulator = { ms: 0 };
  const categoryPrimeSummaryOnlyPromise =
    listMetaBreakdown && summaryPostIdsForCat.length
      ? (async (): Promise<void> => {
          const tPrime0 = performance.now();
          try {
            const byId = new Map<string, Record<string, unknown>>();
            const missing: string[] = [];
            for (const id of summaryPostIdsForCat) {
              const row = postRowCacheById.get(id);
              if (row) byId.set(id, row);
              else missing.push(id);
            }
            if (missing.length) {
              const fetched = await enrichBootstrapCtx.fetchPostsCached(missing);
              for (const [id, row] of fetched.entries()) byId.set(id, row);
            }
            if (!byId.size) return;
            await categoryLoader.ensureForPosts(byId.values());
          } finally {
            categoryPrimeSummaryWallAccumulator.ms = performance.now() - tPrime0;
          }
        })()
      : Promise.resolve();

  let seedPcById: Map<
    string,
    {
      post_id: string;
      seller_id: string;
      buyer_id: string;
      community_messenger_room_id?: string;
    }
  >;
  if (listMetaBreakdown && summaryPostIdsForCat.length) {
    const [seedMap] = await Promise.all([
      fetchSeedProductChatsForTradeEnrich(sb as any, tradeSeedPcIds, seedMsRef),
      categoryPrimeSummaryOnlyPromise,
    ]);
    seedPcById = seedMap;
  } else {
    seedPcById = await fetchSeedProductChatsForTradeEnrich(sb as any, tradeSeedPcIds, seedMsRef);
  }
  if (listMetaBreakdown) {
    lmSeedMs = seedMsRef ? Math.round(seedMsRef.ms) : Math.round(performance.now() - tLmSeed);
  }

  const sellerPcWarmPromise = Promise.resolve(warmSellerPcMapFromSeed(seedPcById));

  /** Phase A+bridge 와 겹쳐 trade post 행으로 카테고리 모듈 캐시를 미리 채운다(응답 의미 동일). */
  let categoryPrimeParallelWallMs = categoryPrimeSummaryWallAccumulator.ms;
  const tradeEarlyCategoryPostIds = listMetaBreakdown
    ? dedupeIds(
        [...seedPcById.values()]
          .map((r) => trimText(String((r as { post_id?: unknown }).post_id ?? "")))
          .filter(Boolean)
          .filter((pid) => !summaryPostIdSetForCat.has(pid))
      )
    : dedupeIds([
        ...summaries
          .filter((s) => s.contextMeta?.kind === "trade")
          .map((s) => trimText((s.contextMeta as { postId?: string })?.postId))
          .filter(Boolean),
        ...[...seedPcById.values()].map((r) => trimText(String((r as { post_id?: unknown }).post_id ?? ""))).filter(Boolean),
      ]);
  const categoryParallelPrimePromise = (async (): Promise<void> => {
    const tPrime = performance.now();
    try {
      if (!tradeEarlyCategoryPostIds.length) return;
      const byId = new Map<string, Record<string, unknown>>();
      const missing: string[] = [];
      for (const id of tradeEarlyCategoryPostIds) {
        const row = postRowCacheById.get(id);
        if (row) byId.set(id, row);
        else missing.push(id);
      }
      if (missing.length) {
        const fetched = await enrichBootstrapCtx.fetchPostsCached(missing);
        for (const [id, row] of fetched.entries()) byId.set(id, row);
      }
      if (!byId.size) return;
      await categoryLoader.ensureForPosts(byId.values());
    } finally {
      categoryPrimeParallelWallMs += performance.now() - tPrime;
    }
  })();

  /**
   * Phase B/C 선행 브리지(시드 + summaries 만으로 결정) — Phase A 와 **병렬**로 RTT 겹침.
   * Phase A 가 summary `productChatId` 로 메타를 먼저 채워도, 여기서 쓰는 `tradeMessengerListThumbnailMissing`
   * 판정은 동일 summaries 스냅샷 기준이라 결과·의미는 기존 직렬 순서와 동일하다.
   */
  const tPrepBridgeParallel = deepSteps ? performance.now() : 0;
  const roomLinkedTargets = summaries.filter(
    (s) =>
      s.roomType === "direct" &&
      (tradeMessengerListThumbnailMissing(s) || tradeMessengerTradeListMetaNeedsPcHydration(s))
  );
  const roomIdsForPcLookup = dedupeIds(roomLinkedTargets.map((s) => s.id));
  const roomIdsForPcLookupSet = new Set(roomIdsForPcLookup);
  const pcByMessengerRoomId = new Map<string, { pcid: string; postId: string; sellerId: string; buyerId: string }>();
  for (const [pcid, row] of seedPcById) {
    const rid = trimText(row.community_messenger_room_id ?? "");
    if (!rid || !roomIdsForPcLookupSet.has(rid)) continue;
    if (!pcByMessengerRoomId.has(rid)) {
      pcByMessengerRoomId.set(rid, {
        pcid,
        postId: row.post_id,
        sellerId: row.seller_id,
        buyerId: row.buyer_id,
      });
    }
  }
  const roomIdsStillNeedingPcByRoom = roomIdsForPcLookup.filter((rid) => !pcByMessengerRoomId.has(rid));
  const roomIdsLedgerSuperset = dedupeIds(
    summaries.filter((s) => s.roomType === "direct" && tradeMessengerListThumbnailMissing(s)).map((s) => s.id)
  );
  if (deepSteps) tradeEnrichPhaseTargetsPrepCpuMs += performance.now() - tPrepBridgeParallel;

  let ledgerRowsSpeculative: Array<Record<string, unknown>> = [];
  let pcRowsByRoom: Array<Record<string, unknown>> = [];
  /** Phase C — `chat_rooms` ledger 를 messenger room id 로 1회만 인덱싱(Phase C 에서 crByRoomId 재구축 생략). */
  const ledgerByMessengerRoomId = new Map<
    string,
    { crId: string; postId: string; sellerId: string; buyerId: string }
  >();
  const needsBridgeBQuery = roomIdsStillNeedingPcByRoom.length > 0;
  const needsLedgerPrefetch = roomIdsLedgerSuperset.length > 0;
  const bridgeLedgerPromise = (async (): Promise<void> => {
    if (!(needsBridgeBQuery || needsLedgerPrefetch)) return;
    bootstrapLiteHeavyPipelineRan = true;
    const tParallelBcLedger = deepSteps ? performance.now() : 0;
    let innerBridgeBMs = 0;
    let innerLedgerMs = 0;
    const sbAny = sb as any;
    const [pcRows, ledgerRows] = await Promise.all([
      (async (): Promise<Array<Record<string, unknown>>> => {
        if (!needsBridgeBQuery) return [];
        const t0 = performance.now();
        const { data } = await sbAny
          .from("product_chats")
          .select("id, post_id, seller_id, buyer_id, community_messenger_room_id")
          .in("community_messenger_room_id", roomIdsStillNeedingPcByRoom);
        innerBridgeBMs = performance.now() - t0;
        return ((data ?? []) as Array<Record<string, unknown>>);
      })(),
      (async (): Promise<Array<Record<string, unknown>>> => {
        if (!needsLedgerPrefetch) return [];
        const t0 = performance.now();
        const { data } = await sbAny
          .from("chat_rooms")
          .select("id, item_id, seller_id, buyer_id, community_messenger_room_id")
          .eq("room_type", "item_trade")
          .in("community_messenger_room_id", roomIdsLedgerSuperset);
        innerLedgerMs = performance.now() - t0;
        return ((data ?? []) as Array<Record<string, unknown>>);
      })(),
    ]);
    pcRowsByRoom = pcRows;
    ledgerRowsSpeculative = ledgerRows;
    for (const row of ledgerRowsSpeculative as Array<Record<string, unknown>>) {
      const rid = trimText(row.community_messenger_room_id);
      const postId = trimText(row.item_id);
      const sellerId = trimText(row.seller_id);
      const buyerId = trimText(row.buyer_id);
      const crId = trimText(row.id);
      if (!rid || !postId || !sellerId || !buyerId || !crId) continue;
      if (!ledgerByMessengerRoomId.has(rid)) {
        ledgerByMessengerRoomId.set(rid, { crId, postId, sellerId, buyerId });
      }
    }
    if (listMetaOrch && ledgerByMessengerRoomId.size > 0) {
      listMetaOrch.mapRebuildCount += 1;
    }
    if (deepSteps) {
      bridgePhaseBcLedgerParallelWallMs = performance.now() - tParallelBcLedger;
      bridgePhaseBPcByRoomMs = innerBridgeBMs;
      bridgePhaseCLedgerMs = innerLedgerMs;
    }
  })();

  const phaseAParallelPromise = (async (): Promise<void> => {
    /** Phase A: `summary` JSON(v1)에 `productChatId`가 있을 때 — 기존 경로 (direct_key 거래방은 제외: 원장은 Phase 0) */
    const tPrepPhaseA = deepSteps || tradeDiag ? performance.now() : 0;
    const targetsFromSummaryMeta = summaries.filter(
      (s) =>
        s.contextMeta?.kind === "trade" &&
        Boolean(s.contextMeta.productChatId?.trim()) &&
        !isMessengerAuthoritativeTradeDirectKey(s.messengerDirectKey)
    );
    const productChatIds =
      targetsFromSummaryMeta.length > 0
        ? dedupeIds(targetsFromSummaryMeta.map((s) => s.contextMeta?.productChatId?.trim() ?? "").filter(Boolean))
        : [];
    if (deepSteps) tradeEnrichPhaseTargetsPrepCpuMs += performance.now() - tPrepPhaseA;
    if (targetsFromSummaryMeta.length && productChatIds.length) {
      bootstrapLiteHeavyPipelineRan = true;
      const byPcId = new Map<string, { postId: string; sellerId: string; buyerId: string }>();
      const missingSeedPcIds: string[] = [];
      const tPhaseASeedLookup = deepSteps ? performance.now() : 0;
      for (const pcid of productChatIds) {
        const row = seedPcById.get(pcid);
        if (row) {
          byPcId.set(pcid, { postId: row.post_id, sellerId: row.seller_id, buyerId: row.buyer_id });
        } else {
          missingSeedPcIds.push(pcid);
        }
      }
      if (deepSteps) phaseAPrePostsSyncCpuMs += performance.now() - tPhaseASeedLookup;
      if (missingSeedPcIds.length) {
        const tSeedMiss = deepSteps ? performance.now() : 0;
        const { data: pcs } = await (sb as any)
          .from("product_chats")
          .select("id, post_id, seller_id, buyer_id")
          .in("id", missingSeedPcIds);
        if (deepSteps) phaseASeedMissProductChatsMs += performance.now() - tSeedMiss;
        const tPhaseAMergeMiss = deepSteps ? performance.now() : 0;
        for (const row of (pcs ?? []) as Array<{ id?: unknown; post_id?: unknown; seller_id?: unknown; buyer_id?: unknown }>) {
          const pcid = trimText(row.id);
          const postId = trimText(row.post_id);
          const sellerId = trimText(row.seller_id);
          const buyerId = trimText(row.buyer_id);
          if (!pcid || !postId || !sellerId || !buyerId) continue;
          byPcId.set(pcid, { postId, sellerId, buyerId });
        }
        if (deepSteps) phaseAPrePostsSyncCpuMs += performance.now() - tPhaseAMergeMiss;
      }
      const tPhaseAPostIds = deepSteps ? performance.now() : 0;
      const postIds = dedupeIds([...byPcId.values()].map((v) => v.postId));
      if (deepSteps) phaseAPrePostsSyncCpuMs += performance.now() - tPhaseAPostIds;
      const tPostsA = deepSteps ? performance.now() : 0;
      const postById = await enrichBootstrapCtx.fetchPostsCached(postIds);
      if (deepSteps) tradePostsFetchMs += performance.now() - tPostsA;
      const tCatA = deepSteps ? performance.now() : 0;
      await Promise.all([
        categoryLoader.ensureForPosts(postById.values()),
        sellerPcWarmPromise,
      ]);
      const categoryById = categoryLoader.getMergedMap();
      if (deepSteps) categoryFetchMs += performance.now() - tCatA;

      const tCpuA = deepSteps ? performance.now() : 0;
      for (const s of targetsFromSummaryMeta) {
        const pcid = s.contextMeta?.productChatId?.trim() ?? "";
        const pc = byPcId.get(pcid);
        if (!pc) continue;
        const post = postById.get(pc.postId);
        const priceRaw = post?.price;
        const price =
          typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
        const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
        const role: "seller" | "buyer" = userId === pc.sellerId ? "seller" : "buyer";
        touchTradeRoomMeta(s.id);
        if (listMetaOrch) listMetaOrch.contextMetaAssigns += 1;
        s.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
          productChatId: pcid,
          postId: pc.postId,
          post: post as Record<string, unknown> | null | undefined,
          price: price != null && !Number.isNaN(price) ? price : null,
          currency,
          role,
          categoryById,
          sellerListingStateRaw: post?.seller_listing_state,
          postStatus: (post?.status as string | undefined) ?? null,
          thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>),
          tradeMetaBuildTrace: homeSyncTraceMeterEnabled(trace) ? trace : undefined,
        });
      }
      if (deepSteps) cpuMergeMs += performance.now() - tCpuA;
    }
  })();

  const tPhaseAAndBridgeParallel = performance.now();
  await Promise.all([phaseAParallelPromise, bridgeLedgerPromise, categoryParallelPrimePromise]);
  phaseAAndBridgeParallelWallMs = performance.now() - tPhaseAAndBridgeParallel;
  if (bootstrapLiteFast && phaseAAndBridgeParallelWallMs > 0) {
    bootstrapLiteHeavyPipelineRan = true;
  }
  if (listMetaBreakdown) lmPhaseABridgeParallelMs = phaseAAndBridgeParallelWallMs;

  /** Phase B 대상 room id 만 순회(썸네일·PC 보강 필요 + pc 맵 히트). */
  const getSummaryByRoomId = (() => {
    let fb: Map<string, CommunityMessengerRoomSummary> | null = null;
    return (rid: string): CommunityMessengerRoomSummary | undefined => {
      if (listMetaOrch) return listMetaOrch.summaryByRoomId.get(rid);
      if (!fb) {
        fb = new Map();
        for (const s of summaries) {
          const id = trimText(s.id);
          if (id) fb.set(id, s);
        }
      }
      return fb.get(rid);
    };
  })();
  const phaseBProcessRoomIds = roomIdsForPcLookup.filter((rid) => {
    const s = getSummaryByRoomId(rid);
    if (!s) return false;
    return tradeMessengerListThumbnailMissing(s) || tradeMessengerTradeListMetaNeedsPcHydration(s);
  });

  /**
   * Phase B: `product_chats.community_messenger_room_id` 로 연결된 CM 방 → posts 썸네일·제목·카테고리.
   * (위에서 product_chats·chat_rooms 선조회를 Phase A 와 병렬 완료 — 여기서는 병합·posts fetch 만)
   *
   * Phase B `product_chats` 와 Phase C 선행 `chat_rooms`(ledger) 조회는 RTT 를 겹치기 위해 Promise.all 로 묶는다.
   * Ledger 는 Phase B 이전의「썸네일 미비 direct 방」id 상한으로 선조회하고, Phase C 에서 post-B `stillNeedThumb` 로 필터한다.
   */
  const tLmB = listMetaBreakdown ? performance.now() : 0;
  if (roomIdsForPcLookup.length || pcRowsByRoom.length) {
    bootstrapLiteHeavyPipelineRan = true;
    const tSyncB = deepSteps ? performance.now() : 0;
    for (const row of pcRowsByRoom as Array<{
      id?: unknown;
      post_id?: unknown;
      seller_id?: unknown;
      buyer_id?: unknown;
      community_messenger_room_id?: unknown;
    }>) {
      const rid = trimText(row.community_messenger_room_id);
      const pcid = trimText(row.id);
      const postId = trimText(row.post_id);
      const sellerId = trimText(row.seller_id);
      const buyerId = trimText(row.buyer_id);
      if (!rid || !pcid || !postId || !sellerId || !buyerId) continue;
      if (!pcByMessengerRoomId.has(rid)) {
        pcByMessengerRoomId.set(rid, { pcid, postId, sellerId, buyerId });
      }
    }
    if (deepSteps) phaseBSyncMapCpuMs += performance.now() - tSyncB;
    if (pcByMessengerRoomId.size) {
      const postIdsB = dedupeIds([...pcByMessengerRoomId.values()].map((v) => v.postId));
      const tPostsB = deepSteps ? performance.now() : 0;
      const postByIdB = await enrichBootstrapCtx.fetchPostsCached(postIdsB);
      if (deepSteps) tradePostsFetchMs += performance.now() - tPostsB;
      const tCatB = deepSteps ? performance.now() : 0;
      await Promise.all([
        categoryLoader.ensureForPosts(postByIdB.values()),
        sellerPcWarmPromise,
      ]);
      const categoryByIdB = categoryLoader.getMergedMap();
      if (deepSteps) categoryFetchMs += performance.now() - tCatB;

      let hydrateCheckLoggedOnce = false;
      const tCpuB = deepSteps ? performance.now() : 0;
      if (listMetaOrch) {
        for (const rid of phaseBProcessRoomIds) {
          const pc = pcByMessengerRoomId.get(rid);
          const s = listMetaOrch.summaryByRoomId.get(rid);
          if (!pc || !s) continue;
          listMetaOrch.phaseBIterations += 1;
          phaseBMetaAssignsEffective += 1;
          tradeListMetaRoomIdMetaAttachedAtPhaseB.add(rid);
          const post = postByIdB.get(pc.postId);
          const priceRaw = post?.price;
          const price =
            typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
          const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
          const role: "seller" | "buyer" = userId === pc.sellerId ? "seller" : "buyer";
          const nextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
            productChatId: pc.pcid,
            postId: pc.postId,
            post: post as Record<string, unknown> | null | undefined,
            price: price != null && !Number.isNaN(price) ? price : null,
            currency,
            role,
            categoryById: categoryByIdB,
            sellerListingStateRaw: post?.seller_listing_state,
            postStatus: (post?.status as string | undefined) ?? null,
            thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>),
            tradeMetaBuildTrace: homeSyncTraceMeterEnabled(trace) ? trace : undefined,
          });
          touchTradeRoomMeta(s.id);
          if (listMetaOrch) listMetaOrch.contextMetaAssigns += 1;
          s.contextMeta = nextMeta;

          if (
            typeof process !== "undefined" &&
            process.env.NODE_ENV === "development" &&
            samarketMessengerTraceLogEnabled() &&
            hydrateCheckLoggedOnce === false
          ) {
            hydrateCheckLoggedOnce = true;
            console.info("[trade-list-hydrate-check]", {
              roomId: s.id,
              productChatId: pc.pcid,
              productChatRoomId: s.id,
              postId: pc.postId,
              postFound: Boolean(post),
              postTitle: typeof (post as any)?.title === "string" ? String((post as any).title) : null,
              postPrice: (post as any)?.price ?? null,
              postCategory: (post as any)?.category ?? null,
              postCategoryKey: (post as any)?.category_key ?? null,
              postTradeType: (post as any)?.trade_type ?? null,
              postListingType: (post as any)?.listing_type ?? null,
              finalCategoryMenuLabel: (nextMeta as any)?.categoryMenuLabel ?? null,
              finalHeadline: (nextMeta as any)?.headline ?? null,
              finalPriceText: (nextMeta as any)?.priceLabel ?? null,
            });
          }
        }
      } else {
        for (const rid of phaseBProcessRoomIds) {
          const pc = pcByMessengerRoomId.get(rid);
          const s = getSummaryByRoomId(rid);
          if (!pc || !s) continue;
          const post = postByIdB.get(pc.postId);
          const priceRaw = post?.price;
          const price =
            typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
          const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
          const role: "seller" | "buyer" = userId === pc.sellerId ? "seller" : "buyer";
          const nextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
            productChatId: pc.pcid,
            postId: pc.postId,
            post: post as Record<string, unknown> | null | undefined,
            price: price != null && !Number.isNaN(price) ? price : null,
            currency,
            role,
            categoryById: categoryByIdB,
            sellerListingStateRaw: post?.seller_listing_state,
            postStatus: (post?.status as string | undefined) ?? null,
            thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>),
            tradeMetaBuildTrace: homeSyncTraceMeterEnabled(trace) ? trace : undefined,
          });
          touchTradeRoomMeta(s.id);
          s.contextMeta = nextMeta;

          if (
            typeof process !== "undefined" &&
            process.env.NODE_ENV === "development" &&
            samarketMessengerTraceLogEnabled() &&
            hydrateCheckLoggedOnce === false
          ) {
            hydrateCheckLoggedOnce = true;
            console.info("[trade-list-hydrate-check]", {
              roomId: s.id,
              productChatId: pc.pcid,
              productChatRoomId: s.id,
              postId: pc.postId,
              postFound: Boolean(post),
              postTitle: typeof (post as any)?.title === "string" ? String((post as any).title) : null,
              postPrice: (post as any)?.price ?? null,
              postCategory: (post as any)?.category ?? null,
              postCategoryKey: (post as any)?.category_key ?? null,
              postTradeType: (post as any)?.trade_type ?? null,
              postListingType: (post as any)?.listing_type ?? null,
              finalCategoryMenuLabel: (nextMeta as any)?.categoryMenuLabel ?? null,
              finalHeadline: (nextMeta as any)?.headline ?? null,
              finalPriceText: (nextMeta as any)?.priceLabel ?? null,
            });
          }
        }
      }
      if (deepSteps) cpuMergeMs += performance.now() - tCpuB;
    }
  }
  if (listMetaBreakdown) lmPhaseBMs = performance.now() - tLmB;
  if (listMetaOrch) listMetaOrch.tPhaseBEnd = performance.now();

  /**
   * Phase C: `product_chats` 행이 없거나 CM id 미기입이어도 `chat_rooms`(item_trade) + `item_id` → `posts` 로 썸네일.
   * (기존 Phase B 끝의 `return` 이 이 경로를 영구 차단하던 문제 수정)
   */
  /**
   * Phase C: `chat_rooms`(item_trade) 의 `community_messenger_room_id` → posts 썸네일.
   * (링크 행이 없어도 아래 Phase D 로 계속한다 — 예전 `return` 이 후속 보강을 막던 문제)
   */
  const tPrepPhaseC = deepSteps ? performance.now() : 0;
  const stillNeedThumb = summaries.filter((s) => s.roomType === "direct" && tradeMessengerListThumbnailMissing(s));
  const roomIdsLedger = dedupeIds(stillNeedThumb.map((s) => s.id));
  if (deepSteps) tradeEnrichPhaseTargetsPrepCpuMs += performance.now() - tPrepPhaseC;

  const tLmC = listMetaBreakdown ? performance.now() : 0;
  if (roomIdsLedger.length) {
    bootstrapLiteHeavyPipelineRan = true;
    if (listMetaOrch) {
      listMetaOrch.tPhaseCStart = performance.now();
    }

    const tSyncCL = deepSteps ? performance.now() : 0;
    const phaseCEntries: Array<{
      rid: string;
      cr: { crId: string; postId: string; sellerId: string; buyerId: string };
    }> = [];
    for (const rid of roomIdsLedger) {
      const cr = ledgerByMessengerRoomId.get(rid);
      if (cr) phaseCEntries.push({ rid, cr });
    }
    if (deepSteps) phaseCSyncLedgerMapCpuMs += performance.now() - tSyncCL;

    tradeListMetaPhaseCTargetScan = phaseCEntries.length;
    phaseCEntriesScanWidth = phaseCEntries.length;

    if (phaseCEntries.length) {
      const postIdsLedger = dedupeIds(phaseCEntries.map((e) => e.cr.postId));
      let postFetchWallMs = 0;
      const postLedgerPromise = (async () => {
        const t0 = performance.now();
        const m = await enrichBootstrapCtx.fetchPostsCached(postIdsLedger);
        postFetchWallMs = performance.now() - t0;
        return m;
      })();
      const pcCandidatesPromise = (async (): Promise<Array<Record<string, unknown>>> => {
        if (!postIdsLedger.length) return [];
        const tBridgeCC = performance.now();
        const { data: pcCandidates } = await (sb as any)
          .from("product_chats")
          .select("id, post_id, seller_id, buyer_id")
          .in("post_id", postIdsLedger);
        if (deepSteps) bridgePhaseCPcCandidatesMs += performance.now() - tBridgeCC;
        return (pcCandidates ?? []) as Array<Record<string, unknown>>;
      })();

      const [postLedgerById, pcCandidates] = await Promise.all([postLedgerPromise, pcCandidatesPromise]);
      if (deepSteps) tradePostsFetchMs += postFetchWallMs;

      const tCatC = deepSteps ? performance.now() : 0;
      await Promise.all([categoryLoader.ensureForPosts(postLedgerById.values()), sellerPcWarmPromise]);
      const categoryLedgerById = categoryLoader.getMergedMap();
      if (deepSteps) categoryFetchMs += performance.now() - tCatC;

      const pcIdByTriple = new Map<string, string>();
      if (pcCandidates.length) {
        const tSyncCT = deepSteps ? performance.now() : 0;
        for (const row of pcCandidates) {
          const pid = trimText(row.post_id);
          const sid = trimText(row.seller_id);
          const bid = trimText(row.buyer_id);
          const id = trimText(row.id);
          if (!pid || !sid || !bid || !id) continue;
          const k = `${pid}\t${sid}\t${bid}`;
          if (!pcIdByTriple.has(k)) pcIdByTriple.set(k, id);
        }
        if (deepSteps) phaseCSyncPcTripleCpuMs += performance.now() - tSyncCT;
      }

      const tCpuC = deepSteps ? performance.now() : 0;
      if (listMetaOrch) {
        for (const { rid, cr } of phaseCEntries) {
          const s = listMetaOrch.summaryByRoomId.get(rid);
          if (!s) continue;
          if (!tradeMessengerListThumbnailMissing(s)) continue;
          listMetaOrch.phaseCIterations += 1;
          phaseCMetaAssignsEffective += 1;
          const post = postLedgerById.get(cr.postId);
          const tripleKey = `${cr.postId}\t${cr.sellerId}\t${cr.buyerId}`;
          const resolvedPc = trimText(pcIdByTriple.get(tripleKey));
          const pcidForMeta = resolvedPc || cr.crId;
          const priceRaw = post?.price;
          const price =
            typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
          const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
          const role: "seller" | "buyer" = userId === cr.sellerId ? "seller" : "buyer";
          if (!tradeListMetaRoomIdMetaAttachedAtPhaseB.has(rid)) {
            touchTradeRoomMeta(s.id);
          }
          listMetaOrch.contextMetaAssigns += 1;
          s.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
            productChatId: pcidForMeta,
            postId: cr.postId,
            post: post as Record<string, unknown> | null | undefined,
            price: price != null && !Number.isNaN(price) ? price : null,
            currency,
            role,
            categoryById: categoryLedgerById,
            sellerListingStateRaw: post?.seller_listing_state,
            postStatus: (post?.status as string | undefined) ?? null,
            thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>),
            tradeMetaBuildTrace: homeSyncTraceMeterEnabled(trace) ? trace : undefined,
          });
        }
      } else {
        for (const { rid, cr } of phaseCEntries) {
          const s = getSummaryByRoomId(rid);
          if (!s) continue;
          if (!tradeMessengerListThumbnailMissing(s)) continue;
          const post = postLedgerById.get(cr.postId);
          const tripleKey = `${cr.postId}\t${cr.sellerId}\t${cr.buyerId}`;
          const resolvedPc = trimText(pcIdByTriple.get(tripleKey));
          const pcidForMeta = resolvedPc || cr.crId;
          const priceRaw = post?.price;
          const price =
            typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
          const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
          const role: "seller" | "buyer" = userId === cr.sellerId ? "seller" : "buyer";
          touchTradeRoomMeta(s.id);
          s.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
            productChatId: pcidForMeta,
            postId: cr.postId,
            post: post as Record<string, unknown> | null | undefined,
            price: price != null && !Number.isNaN(price) ? price : null,
            currency,
            role,
            categoryById: categoryLedgerById,
            sellerListingStateRaw: post?.seller_listing_state,
            postStatus: (post?.status as string | undefined) ?? null,
            thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>),
            tradeMetaBuildTrace: homeSyncTraceMeterEnabled(trace) ? trace : undefined,
          });
        }
      }
      if (deepSteps) cpuMergeMs += performance.now() - tCpuC;
    }
  }
  if (listMetaBreakdown) lmPhaseCMs = performance.now() - tLmC;

  /**
   * Phase D: CM 방·ledger·product_chats.community_messenger_room_id 가 비어 있어도
   * **판매자·구매자 쌍**으로 `product_chats` 를 찾아 목록 썸네일을 맞춘다.
   * (방 입장은 `summary` 의 productChatId 로 상세를 타지만, 목록 enrich 만 실패하던 케이스)
   */
  const tPrepPhaseD = deepSteps ? performance.now() : 0;
  const stillAfterC = summaries.filter(
    (s) =>
      communityMessengerSummaryEligibleForPhaseDTradeEnrich(s) &&
      tradeMessengerListThumbnailMissing(s)
  );
  const peersForPair = dedupeIds(
    stillAfterC.map((s) => (typeof s.peerUserId === "string" ? s.peerUserId.trim() : "")).filter(Boolean)
  );
  if (deepSteps) tradeEnrichPhaseTargetsPrepCpuMs += performance.now() - tPrepPhaseD;
  const tLmD = listMetaBreakdown ? performance.now() : 0;
  if (!bootstrapLiteFast && peersForPair.length) {
    bootstrapLiteHeavyPipelineRan = true;
    type PcPairRow = {
      id: string;
      postId: string;
      sellerId: string;
      buyerId: string;
      updatedAt: string;
      cmRoomId: string;
    };
    const tBridgeD = deepSteps ? performance.now() : 0;
    const [{ data: pcSellerMe }, { data: pcBuyerMe }] = await Promise.all([
      (sb as any)
        .from("product_chats")
        .select("id, post_id, seller_id, buyer_id, updated_at, community_messenger_room_id")
        .eq("seller_id", userId)
        .in("buyer_id", peersForPair),
      (sb as any)
        .from("product_chats")
        .select("id, post_id, seller_id, buyer_id, updated_at, community_messenger_room_id")
        .eq("buyer_id", userId)
        .in("seller_id", peersForPair),
    ]);
    if (deepSteps) bridgePhaseDPairPcMs += performance.now() - tBridgeD;
    const tPeerIx = deepSteps ? performance.now() : 0;
    const byPeer = new Map<string, PcPairRow[]>();
    const pushRow = (row: Record<string, unknown>) => {
      const id = trimText(row.id);
      const postId = trimText(row.post_id);
      const sellerId = trimText(row.seller_id);
      const buyerId = trimText(row.buyer_id);
      if (!id || !postId || !sellerId || !buyerId) return;
      const peer = userId === sellerId ? buyerId : userId === buyerId ? sellerId : "";
      if (!peer || !peersForPair.includes(peer)) return;
      const rec: PcPairRow = {
        id,
        postId,
        sellerId,
        buyerId,
        updatedAt: trimText(row.updated_at) || "",
        cmRoomId: trimText(row.community_messenger_room_id),
      };
      const list = byPeer.get(peer) ?? [];
      list.push(rec);
      byPeer.set(peer, list);
    };
    for (const row of (pcSellerMe ?? []) as Array<Record<string, unknown>>) pushRow(row);
    for (const row of (pcBuyerMe ?? []) as Array<Record<string, unknown>>) pushRow(row);

    const pickPcForRoom = (roomId: string, peer: string): PcPairRow | null => {
      const list = byPeer.get(peer);
      if (!list?.length) return null;
      const linked = list.find((r) => r.cmRoomId && r.cmRoomId === roomId);
      if (linked) return linked;
      const sorted = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return sorted[0] ?? null;
    };

    const postIdsPair = dedupeIds(
      stillAfterC
        .map((s) => {
          const peer = trimText(s.peerUserId);
          if (!peer) return "";
          const pc = pickPcForRoom(s.id, peer);
          return pc?.postId ?? "";
        })
        .filter(Boolean)
    );
    if (deepSteps) phaseDPeerIndexCpuMs += performance.now() - tPeerIx;

    if (postIdsPair.length) {
      const tPostsD = deepSteps ? performance.now() : 0;
      const postPairById = await enrichBootstrapCtx.fetchPostsCached(postIdsPair);
      if (deepSteps) tradePostsFetchMs += performance.now() - tPostsD;
      const tCatD = deepSteps ? performance.now() : 0;
      await Promise.all([
        categoryLoader.ensureForPosts(postPairById.values()),
        sellerPcWarmPromise,
      ]);
      const categoryPairById = categoryLoader.getMergedMap();
      if (deepSteps) categoryFetchMs += performance.now() - tCatD;

      const tCpuD = deepSteps ? performance.now() : 0;
      for (const s of stillAfterC) {
        if (!tradeMessengerListThumbnailMissing(s)) continue;
        const peer = trimText(s.peerUserId);
        if (!peer) continue;
        const pc = pickPcForRoom(s.id, peer);
        if (!pc) continue;
        if (listMetaOrch) {
          listMetaOrch.phaseDIterations += 1;
          phaseDMetaAssignsEffective += 1;
        }
        const post = postPairById.get(pc.postId);
        const priceRaw = post?.price;
        const price =
          typeof priceRaw === "number" && Number.isFinite(priceRaw) ? priceRaw : priceRaw != null ? Number(priceRaw) : null;
        const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
        const role: "seller" | "buyer" = userId === pc.sellerId ? "seller" : "buyer";
        touchTradeRoomMeta(s.id);
        if (listMetaOrch) listMetaOrch.contextMetaAssigns += 1;
        s.contextMeta = buildTradeMessengerListContextMetaFromLoadedPost({
          productChatId: pc.id,
          postId: pc.postId,
          post: post as Record<string, unknown> | null | undefined,
          price: price != null && !Number.isNaN(price) ? price : null,
          currency,
          role,
          categoryById: categoryPairById,
          sellerListingStateRaw: post?.seller_listing_state,
          postStatus: (post?.status as string | undefined) ?? null,
          thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown>),
          tradeMetaBuildTrace: homeSyncTraceMeterEnabled(trace) ? trace : undefined,
        });
      }
      if (deepSteps) phaseDFinalMergeCpuMs += performance.now() - tCpuD;
    }
  }
  if (listMetaBreakdown) lmPhaseDMs = performance.now() - tLmD;

  const tLmSeller = listMetaBreakdown ? performance.now() : 0;
  const tSeller = performance.now();
  const tSellerDeep = deepSteps ? performance.now() : 0;
  await hydrateTradeListSellerDisplayNamesForSummaries(sb, summaries, trace, {
    warmPcMapPromise: sellerPcWarmPromise,
  });
  if (listMetaBreakdown) lmSellerHydrateMs = performance.now() - tLmSeller;
  tradeDiag && (tradeDiag.enrichTradeSellerHydrateMs = Math.round(performance.now() - tSeller));
  if (deepSteps) sellerProfileAttachMs += performance.now() - tSellerDeep;

  if (tradeDiag) {
    bootstrapTradeCpuMergeMs += cpuMergeMs;
    bootstrapTradeCategoryFetchMs += categoryFetchMs;
    bootstrapTradeNormalizeMs += tradeEnrichPhaseTargetsPrepCpuMs;
    flushBootstrapTradeEnrichDiag(false);
  }

  if (deepSteps && trace) {
    const sellerProfileAttach = trace.deepSteps.sellerProfileAttachBreakdown ?? {
      tradeRows: 0,
      productChatIds: 0,
      postIdsNeedingAuthor: 0,
      sellerIds: 0,
      sellerIdsDedupeMs: 0,
      prefetchProductChatsMs: 0,
      postsFetchMs: 0,
      sellerProfilesFetchMs: 0,
      attachCpuMs: 0,
      totalMs: 0,
      sellerProfilesFetchLikelyCached: false,
    };
    const fetchMode = opts?.tradeCategoryFetchMode ?? "full";
    const categoryDbSkipped = fetchMode === "fallback_only";
    const categoryDetailRaw = trace.deepSteps.categoryFetchDetail;
    let categoryDetail: HomeSyncDeepStepsCategoryFetchDetail | undefined;
    if (categoryDetailRaw != null) {
      if (categoryDbSkipped) categoryDetailRaw.dbSkipped = true;
      categoryDetail = categoryDetailRaw;
    } else if (categoryDbSkipped) {
      categoryDetail = {
        categoryCacheHitCount: 0,
        categoryCacheMissCount: 0,
        tradeCategoryCacheHitCount: 0,
        tradeCategoryCacheMissCount: 0,
        categoriesQueryCount: 0,
        tradeCategoriesQueryCount: 0,
        categoriesIdsCount: 0,
        tradeCategoriesIdsCount: 0,
        selectFallbackAttemptCount: 0,
        selectFallbackFailedCount: 0,
        queryMsByTable: { categoriesMs: 0, tradeCategoriesMs: 0 },
        dbSkipped: true,
      };
    }
    const tradePostsDetail = trace.deepSteps.tradePostsFetchDetail;
    const bridgeBcLedgerForExplainedSum =
      bridgePhaseBcLedgerParallelWallMs > 0
        ? bridgePhaseBcLedgerParallelWallMs
        : bridgePhaseBPcByRoomMs + bridgePhaseCLedgerMs;
    const bridgeSum =
      bridgeBcLedgerForExplainedSum + bridgePhaseCPcCandidatesMs + bridgePhaseDPairPcMs;
    const dkWall = ms(trace.deepSteps.tradeDirectKeysDetail?.wallMs ?? 0);
    const bridgeQueries = ms(bridgeSum);
    const seedPm = ms(seedMsRef?.ms ?? 0);
    const postsFm = ms(tradePostsFetchMs);
    const sellerAm = ms(sellerProfileAttachMs);
    const cpuM = ms(cpuMergeMs);
    const phaseAMiss = ms(phaseASeedMissProductChatsMs);
    const phaseDPeer = ms(phaseDPeerIndexCpuMs);
    const phaseBSync = ms(phaseBSyncMapCpuMs);
    const phaseCSyncL = ms(phaseCSyncLedgerMapCpuMs);
    const phaseCSyncT = ms(phaseCSyncPcTripleCpuMs);
    const phaseAPreSync = ms(phaseAPrePostsSyncCpuMs);
    const targetsPrep = ms(tradeEnrichPhaseTargetsPrepCpuMs);
    const phaseDMerge = ms(phaseDFinalMergeCpuMs);
    const explainedComponentsMs = ms(
      dkWall +
        bridgeQueries +
        seedPm +
        postsFm +
        sellerAm +
        cpuM +
        phaseAMiss +
        phaseDPeer +
        phaseBSync +
        phaseCSyncL +
        phaseCSyncT +
        phaseAPreSync +
        targetsPrep +
        phaseDMerge
    );
    const totalRounded = ms(performance.now() - tTop);
    const gapMs = Math.round(totalRounded - explainedComponentsMs);
    const catParallel = ms(categoryFetchMs);
    const explainedPlusCategoryParallelMs = ms(explainedComponentsMs + catParallel);
    const residualGapAfterCategoryMs = Math.round(totalRounded - explainedPlusCategoryParallelMs);
    const explainedComponentsDetail: HomeSyncDeepStepsTradeMetaExplainedComponentsDetail = {
      directKeysWallMs: dkWall,
      tradePcBridgeQueriesMs: bridgeQueries,
      seedProductChatsMs: seedPm,
      tradePostsFetchMs: postsFm,
      sellerProfileAttachMs: sellerAm,
      cpuMergeMs: cpuM,
      phaseASeedMissProductChatsMs: phaseAMiss,
      phaseDPeerIndexCpuMs: phaseDPeer,
      phaseBSyncMapCpuMs: phaseBSync,
      phaseCSyncLedgerMapCpuMs: phaseCSyncL,
      phaseCSyncPcTripleCpuMs: phaseCSyncT,
      phaseAPrePostsSyncCpuMs: phaseAPreSync,
      tradeEnrichPhaseTargetsPrepCpuMs: targetsPrep,
      phaseDFinalMergeCpuMs: phaseDMerge,
    };
    if (fetchMode === "full") {
      explainedComponentsDetail.categoryFetchMsExcludedFromExplainedSum = catParallel;
      explainedComponentsDetail.tradePostsQueryMsTotalExcludedFromExplainedSum = ms(
        tradePostsDetail?.queryMsTotal ?? 0
      );
    }
    const catFb = Number(categoryDetail?.selectFallbackAttemptCount ?? 0);
    const postFb = Number(tradePostsDetail?.fallbackAttemptCount ?? 0);
    const tradeSummaries = summaries.filter((s) => s.contextMeta?.kind === "trade");
    const tradeRoomIds = tradeSummaries.map((s) => trimText(s.id)).filter(Boolean);
    const tradeMetaDuplicateRoomCount = Math.max(0, tradeRoomIds.length - new Set(tradeRoomIds).size);
    const tradePostIds = tradeSummaries.map((s) => trimText(s.contextMeta?.postId)).filter(Boolean);
    const tradeMetaDuplicatePostCount = Math.max(0, tradePostIds.length - new Set(tradePostIds).size);
    const postsDetailCacheHit = tradePostsDetail?.cacheHit === true;
    const catMissTotal =
      (categoryDetail?.categoryCacheMissCount ?? 0) + (categoryDetail?.tradeCategoryCacheMissCount ?? 0);
    const catHitTotal =
      (categoryDetail?.categoryCacheHitCount ?? 0) + (categoryDetail?.tradeCategoryCacheHitCount ?? 0);
    const tradeMetaCacheHit = Boolean(
      postsDetailCacheHit && (categoryDbSkipped || catMissTotal === 0)
    );
    let tradeMetaCacheMissReason: string | null = null;
    if (!tradeMetaCacheHit) {
      const parts: string[] = [];
      if (!postsDetailCacheHit) parts.push("posts_row_cache_miss");
      if (!categoryDbSkipped && catMissTotal > 0) parts.push(`category_table_miss:${catMissTotal}`);
      if (!categoryDbSkipped && catHitTotal === 0 && catMissTotal === 0) parts.push("category_counters_empty");
      tradeMetaCacheMissReason = parts.length ? parts.join("|") : "unknown";
    }
    const trRows = Number(sellerProfileAttach.tradeRows ?? 0);
    const trSellers = Number(sellerProfileAttach.sellerIds ?? 0);
    const tradeMetaDuplicateSellerCount = Math.max(0, trRows - trSellers);

    let tradeMetaQueryCount =
      (tradePostsDetail?.queryCount ?? 0) +
      (Number(categoryDetail?.categoriesQueryCount) || 0) +
      (Number(categoryDetail?.tradeCategoriesQueryCount) || 0);
    if (peersForPair.length) tradeMetaQueryCount += 2;
    if (needsBridgeBQuery) tradeMetaQueryCount += 1;
    if (needsLedgerPrefetch) tradeMetaQueryCount += 1;

    const parW = ms(phaseAAndBridgeParallelWallMs);
    const topCands: Array<[string, number]> = [
      ["direct_keys", dkWall],
      ["seed_product_chats", seedPm],
      ["trade_posts_fetch", postsFm],
      ["category_fetch", catParallel],
      ["seller_profile_attach", sellerAm],
      ["trade_pc_bridge_queries", bridgeQueries],
      ["cpu_merge", cpuM],
      ["phase_a_bridge_parallel_wait", parW],
    ];
    let tradeMetaTopBottleneck = topCands[0][0];
    let tradeMetaTopBottleneckMs = topCands[0][1];
    for (const [k, v] of topCands) {
      if (v > tradeMetaTopBottleneckMs) {
        tradeMetaTopBottleneck = k;
        tradeMetaTopBottleneckMs = v;
      }
    }

    const tmb = trace.deepSteps.tradeMetaBuildFromPostDetail;
    const tradeCpuFromBuilderMs =
      (tmb?.productCategoryDisplayCpuMs ?? 0) +
      (tmb?.headlineCpuMs ?? 0) +
      (tmb?.categoryMenuLabelCpuMs ?? 0) +
      (tmb?.messengerSnapshotCpuMs ?? 0);
    const tradePhaseCpuMs =
      phaseAPrePostsSyncCpuMs +
      phaseBSyncMapCpuMs +
      phaseCSyncLedgerMapCpuMs +
      phaseCSyncPcTripleCpuMs +
      phaseDPeerIndexCpuMs +
      phaseDFinalMergeCpuMs +
      tradeEnrichPhaseTargetsPrepCpuMs +
      phaseASeedMissProductChatsMs;
    if (samarketMessengerTraceLogEnabled()) {
      let tradePayloadBytes = 0;
      for (const s of summaries) {
        if (s.contextMeta?.kind === "trade") {
          try {
            tradePayloadBytes += JSON.stringify(s.contextMeta).length;
          } catch {
            /* ignore */
          }
        }
      }
      console.info("[trade-enrich-breakdown]", {
        trade_query_count: tradePostsDetail?.queryCount ?? 0,
        fallback_attempt_count: postFb + catFb,
        schema_detect_ms: ms(tradePostsDetail?.schemaColdDetectWallMs ?? 0),
        trade_posts_fetch_ms: postsFm,
        trade_merge_ms: cpuM,
        trade_cpu_ms: ms(tradeCpuFromBuilderMs + tradePhaseCpuMs),
        trade_payload_kb: Math.round(tradePayloadBytes / 1024),
        duplicate_trade_keys: duplicateTradeRoomApplies,
        trade_meta_enrich_total_ms: totalRounded,
        tier: trace.tier ?? null,
      });
    }
    trace.deepSteps.tradeMetaEnrich = {
      tradePostsFetchMs: ms(tradePostsFetchMs),
      tradePostsDetail,
      categoryFetchMs: catParallel,
      categoryDetail,
      sellerProfileAttachMs: ms(sellerProfileAttachMs),
      sellerProfileAttach,
      cpuMergeMs: ms(cpuMergeMs),
      totalMs: totalRounded,
      rooms: ms(summaries.length),
      tradeCategoryFetchMode: fetchMode,
      categoryDbSkipped,
      duplicateTradeMergeCount: duplicateTradeRoomApplies,
      seedProductChatsMs: ms(seedMsRef?.ms ?? 0),
      directKeys: trace.deepSteps.tradeDirectKeysDetail,
      tradePcBridgeBreakdown: {
        phaseBPcByRoomMs: ms(bridgePhaseBPcByRoomMs),
        phaseCLedgerMs: ms(bridgePhaseCLedgerMs),
        phaseCPcCandidatesMs: ms(bridgePhaseCPcCandidatesMs),
        phaseDPairPcMs: ms(bridgePhaseDPairPcMs),
        ...(bridgePhaseBcLedgerParallelWallMs > 0
          ? { phaseBcLedgerParallelWallMs: ms(bridgePhaseBcLedgerParallelWallMs) }
          : {}),
      },
      tradePcBridgeQueriesMs: bridgeQueries,
      explainedComponentsMs,
      explainedPlusCategoryParallelMs,
      residualGapAfterCategoryMs,
      gapMs,
      explainedComponentsDetail,
      tradeMetaCacheHit,
      tradeMetaCacheMissReason,
      tradeMetaDuplicateRoomCount,
      tradeMetaDuplicatePostCount,
      tradeMetaDuplicateSellerCount,
      tradeMetaParallelWaitMs: parW,
      tradeMetaQueryCount,
      tradeMetaSingleflightHit: Boolean(
        Number(trace.deepSteps.categoryFetchDetail?.category_singleflight_join_count ?? 0) > 0
      ),
      tradeMetaTopBottleneck,
      tradeMetaTopBottleneckMs,
    };
    if (listMetaBreakdown) {
      const serialSum =
        lmDirectMs +
        lmSeedMs +
        lmPhaseABridgeParallelMs +
        lmPhaseBMs +
        lmPhaseCMs +
        lmPhaseDMs +
        lmSellerHydrateMs;
      const gapMsLm = Math.max(0, Math.round(totalRounded - serialSum));
      let enrichQ =
        (tradePostsDetail?.queryCount ?? 0) +
        (Number(categoryDetail?.categoriesQueryCount) || 0) +
        (Number(categoryDetail?.tradeCategoriesQueryCount) || 0);
      if (peersForPair.length) enrichQ += 2;
      if (needsBridgeBQuery) enrichQ += 1;
      if (needsLedgerPrefetch) enrichQ += 1;
      const cands: Array<[string, number]> = [
        ["enrich_direct_keys_ms", Math.round(lmDirectMs)],
        ["enrich_seed_product_chats_ms", Math.round(lmSeedMs)],
        ["enrich_parallel_wait_ms", Math.round(lmPhaseABridgeParallelMs)],
        ["enrich_phase_b_ms", Math.round(lmPhaseBMs)],
        ["enrich_phase_c_ms", Math.round(lmPhaseCMs)],
        ["enrich_phase_d_ms", Math.round(lmPhaseDMs)],
        ["enrich_seller_display_hydrate_wall_ms", Math.round(lmSellerHydrateMs)],
        ["enrich_load_post_ms", postsFm],
        ["enrich_category_fetch_wall_ms", catParallel],
        ["enrich_partner_fetch_ms", ms(bridgePhaseDPairPcMs)],
        ["enrich_trade_state_ms", ms(seedMsRef?.ms ?? 0)],
        ["enrich_cpu_merge_tracked_ms", cpuM],
      ];
      let topK = cands[0][0];
      let topV = cands[0][1];
      for (const [k, v] of cands) {
        if (v > topV) {
          topK = k;
          topV = v;
        }
      }
      if (gapMsLm > topV) {
        topK = "enrich_gap_ms";
        topV = gapMsLm;
      }
      const orchPhaseTransitionMs =
        listMetaOrch && listMetaOrch.tPhaseCStart > 0 && listMetaOrch.tPhaseBEnd > 0
          ? Math.max(0, Math.round(listMetaOrch.tPhaseCStart - listMetaOrch.tPhaseBEnd))
          : 0;
      const orchRoomLoops = listMetaOrch
        ? listMetaOrch.phaseBIterations + listMetaOrch.phaseCIterations + listMetaOrch.phaseDIterations
        : 0;
      const catSfJoins = Number(trace.deepSteps.categoryFetchDetail?.category_singleflight_join_count ?? 0);
      const catDetailReuseHit = Boolean(trace.deepSteps.categoryFetchDetail?.category_lookup_reuse_hit);
      const enrichParallelDepCount = tradeEarlyCategoryPostIds.length > 0 ? 3 : 2;
      const parWall = lmPhaseABridgeParallelMs;
      let enrichParallelBlockingGroup = "no_category_prime";
      if (tradeEarlyCategoryPostIds.length > 0) {
        const prime = categoryPrimeParallelWallMs;
        if (parWall > 0 && prime >= parWall * 0.45 && prime >= 40) enrichParallelBlockingGroup = "category_prime_dominant";
        else if (prime >= 120) enrichParallelBlockingGroup = "category_prime_wall_high";
        else enrichParallelBlockingGroup = "phase_a_bridge_or_low_prime";
      }
      const orchRoomLoopEffective =
        phaseBMetaAssignsEffective + phaseCMetaAssignsEffective + phaseDMetaAssignsEffective;
      const orchAttachPassCount =
        (phaseBMetaAssignsEffective > 0 ? 1 : 0) +
        (phaseCMetaAssignsEffective > 0 ? 1 : 0) +
        (phaseDMetaAssignsEffective > 0 ? 1 : 0);
      const orchAttachPassCountAfter =
        (phaseBMetaAssignsEffective + phaseCMetaAssignsEffective > 0 ? 1 : 0) +
        (phaseDMetaAssignsEffective > 0 ? 1 : 0);
      const orchSummaryScanAfter =
        phaseBProcessRoomIds.length + phaseCEntriesScanWidth + stillAfterC.length;
      const orchCpuHot =
        listMetaOrch &&
        (listMetaOrch.phaseBIterations > summaries.length * 4 ||
          listMetaOrch.phaseCIterations > summaries.length * 4 ||
          listMetaOrch.phaseDIterations > summaries.length * 4)
          ? 1
          : 0;
      trace.deepSteps.tradeListMetaEnrichBootstrapBreakdown = {
        enrich_direct_keys_ms: Math.round(lmDirectMs),
        enrich_seed_product_chats_ms: Math.round(lmSeedMs),
        enrich_phase_a_bridge_parallel_ms: Math.round(lmPhaseABridgeParallelMs),
        enrich_parallel_wait_ms: Math.round(lmPhaseABridgeParallelMs),
        enrich_parallel_dependency_count: enrichParallelDepCount,
        enrich_parallel_blocking_group: enrichParallelBlockingGroup,
        enrich_category_prime_parallel_ms: Math.round(categoryPrimeParallelWallMs),
        enrich_parallel_blocking_group_after: enrichParallelBlockingGroup,
        enrich_parallel_wait_after: Math.round(lmPhaseABridgeParallelMs),
        enrich_dependency_count_after: enrichParallelDepCount,
        enrich_attach_cpu_ms: Math.round(lmPhaseBMs + lmPhaseCMs + lmPhaseDMs),
        enrich_attach_network_wait_ms: Math.round(catParallel + ms(bridgePhaseBcLedgerParallelWallMs)),
        enrich_phase_b_ms: Math.round(lmPhaseBMs),
        enrich_phase_c_ms: Math.round(lmPhaseCMs),
        enrich_phase_d_ms: Math.round(lmPhaseDMs),
        enrich_seller_display_hydrate_wall_ms: Math.round(lmSellerHydrateMs),
        enrich_load_post_ms: postsFm,
        enrich_category_fetch_wall_ms: catParallel,
        enrich_partner_fetch_ms: ms(bridgePhaseDPairPcMs),
        enrich_trade_state_ms: ms(seedMsRef?.ms ?? 0),
        enrich_cpu_merge_tracked_ms: cpuM,
        enrich_query_count_approx: enrichQ,
        enrich_gap_ms: gapMsLm,
        enrich_top_bottleneck: topK,
        enrich_top_bottleneck_ms: topV,
        enrich_top_bottleneck_percent: totalRounded > 0 ? Math.round((topV / totalRounded) * 1000) / 10 : 0,
        ...(listMetaOrch
          ? {
              orchestration_summaries_total: summaries.length,
              orchestration_room_loop_count: orchRoomLoops,
              orchestration_duplicate_room_loop_count: duplicateTradeRoomApplies,
              orchestration_merge_iteration_count: listMetaOrch.contextMetaAssigns,
              orchestration_map_rebuild_count: listMetaOrch.mapRebuildCount,
              orchestration_phase_b_iterations: listMetaOrch.phaseBIterations,
              orchestration_phase_c_iterations: listMetaOrch.phaseCIterations,
              orchestration_phase_d_iterations: listMetaOrch.phaseDIterations,
              orchestration_phase_b_naive_summaries_scan: phaseBProcessRoomIds.length,
              orchestration_phase_c_naive_summaries_scan: tradeListMetaPhaseCTargetScan,
              orchestration_phase_transition_wait_ms: orchPhaseTransitionMs,
              orchestration_direct_keys_merge_ms: 0,
              orchestration_patch_merge_ms: 0,
              orchestration_summary_merge_ms: 0,
              orchestration_trade_state_merge_ms: ms(seedMsRef?.ms ?? 0),
              orchestration_duplicate_normalize_count: 0,
              orchestration_cpu_hot_loop: orchCpuHot,
              orchestration_room_loop_count_after: orchRoomLoopEffective,
              orchestration_duplicate_room_loop_count_after: duplicateTradeRoomApplies,
              orchestration_map_rebuild_count_after: listMetaOrch.mapRebuildCount,
              orchestration_phase_b_naive_summaries_scan_after: phaseBProcessRoomIds.length,
              orchestration_phase_c_naive_summaries_scan_after: tradeListMetaPhaseCTargetScan,
              orchestration_phase_transition_wait_ms_after: orchPhaseTransitionMs,
              orchestration_attach_pass_count: orchAttachPassCount,
              orchestration_attach_pass_count_after: orchAttachPassCountAfter,
              orchestration_summary_scan_after: orchSummaryScanAfter,
              orchestration_duplicate_loop_after: duplicateTradeRoomApplies,
              orchestration_parallel_wait_after: Math.round(lmPhaseABridgeParallelMs),
              orchestration_attach_merge_ms: Math.round(lmPhaseBMs + lmPhaseCMs + lmPhaseDMs),
              orchestration_lookup_reuse_hit: catSfJoins > 0 || catDetailReuseHit,
            }
          : {}),
      };
    }
  }
  await enrichCommerceChatRoomLifecycleForList(sb, summaries);
}

export async function listCommunityMessengerFriends(userId: string): Promise<CommunityMessengerProfileLite[]> {
  const { listCommunityMessengerFriendsFromSsot } = await import(
    "@/lib/community-messenger/friendship/list-community-messenger-friends-ssot"
  );
  return listCommunityMessengerFriendsFromSsot(userId);
}

export async function addCommunityMessengerFriendSaved(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  return addFriendSaved(userId, targetUserId);
}

export async function resolveCommunityMessengerUserForSocial(
  viewerUserId: string,
  input: { publicId?: string; targetUserId?: string }
): Promise<{
  ok: boolean;
  profile?: CommunityMessengerProfileLite & {
    publicId: string | null;
    canMessage: boolean;
    canCall: boolean;
    isFriend: boolean;
    isBlockedByMe: boolean;
  };
  error?: string;
}> {
  const viewer = trimText(viewerUserId);
  let targetId = trimText(input.targetUserId);
  if (!targetId && input.publicId) {
    const resolved = await resolveUserByPublicId(input.publicId);
    if (!resolved) return { ok: false, error: "user_not_found" };
    targetId = resolved.id;
  }
  if (!viewer || !targetId) return { ok: false, error: "bad_target" };
  if (viewer === targetId) return { ok: false, error: "self" };

  const [profiles, guard] = await Promise.all([
    hydrateProfiles(viewer, [targetId]),
    resolveDirectInteractionGuard(viewer, targetId),
  ]);
  const base = profiles[0];
  if (!base) return { ok: false, error: "user_not_found" };

  const publicId =
    base.subtitle?.startsWith("@") ? base.subtitle.slice(1) : base.subtitle?.replace(/^@/, "") || null;

  return {
    ok: true,
    profile: {
      ...base,
      publicId,
      canMessage: guard.canMessage,
      canCall: guard.canCall,
      isFriend: guard.isFriend,
      isBlockedByMe: guard.isBlockedByMe,
    },
  };
}

export async function startCommunityMessengerDirectChat(
  userId: string,
  input: { publicId?: string; targetUserId?: string }
): Promise<{
  ok: boolean;
  roomId?: string;
  created?: boolean;
  targetProfile?: CommunityMessengerProfileLite;
  error?: string;
}> {
  const resolved = await resolveCommunityMessengerUserForSocial(userId, input);
  if (!resolved.ok || !resolved.profile) {
    logSocialRelationEvent("direct_room_start_blocked", {
      reason: resolved.error ?? "unknown",
    });
    return { ok: false, error: resolved.error ?? "cannot_start_chat" };
  }
  const targetId = resolved.profile.id;
  if (!resolved.profile.canMessage) {
    logSocialRelationEvent("direct_room_start_blocked", { reason: "blocked_or_restricted" });
    return { ok: false, error: "cannot_start_chat" };
  }

  const basePairKey = directKeyFor(userId, targetId);
  const sb = getSupabaseOrNull();
  let created = true;
  if (sb) {
    const { data: existing } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id")
      .eq("room_type", "direct")
      .eq("direct_key", basePairKey)
      .maybeSingle();
    if (existing?.id) created = false;
  }

  const roomOut = await ensureGeneralFriendDirectRoom(userId, targetId);
  if (!roomOut.ok || !roomOut.roomId) {
    logSocialRelationEvent("direct_room_start_blocked", { reason: roomOut.error ?? "room_failed" });
    return { ok: false, error: roomOut.error ?? "cannot_start_chat" };
  }

  logSocialRelationEvent("direct_room_started_by_public_id", {
    targetUserId: targetId,
    created: created ? "1" : "0",
  });

  return {
    ok: true,
    roomId: roomOut.roomId,
    created,
    targetProfile: resolved.profile,
  };
}

export async function listCommunityMessengerBlockedProfiles(
  userId: string
): Promise<CommunityMessengerProfileLite[]> {
  const blockedIds = await listBlockedByMeIds(userId);
  return hydrateProfiles(userId, blockedIds);
}

export {
  resolveUserByPublicId,
  resolveDirectInteractionGuard,
  blockUserSocial,
  unblockUserSocial,
  addFriendSaved,
  removeFriendSaved,
  listBlockedByMeIds,
  listFriendSavedIds,
};

export async function searchCommunityMessengerUsers(
  userId: string,
  query: string
): Promise<CommunityMessengerProfileLite[]> {
  const { searchCommunityMessengerUsersRanked } = await import(
    "@/lib/community-messenger/user-public-id-search"
  );
  const ranked = await searchCommunityMessengerUsersRanked(userId, query);
  return ranked.map((row) => ({
    id: row.id,
    label: row.displayName,
    subtitle: row.publicId ? `@${row.publicId}` : undefined,
    avatarUrl: row.avatarUrl,
    following: false,
    blocked: row.isBlockedByMe || row.isBlockedByPeer,
    isFriend: row.isFriend,
    isFavoriteFriend: false,
  }));
}

/**
 * Canonical Telegram-style contact add — viewer-local friend row only.
 * No pending request, no peer notification, no mutual acceptance.
 */
export async function addCommunityMessengerFriendContact(
  userId: string,
  targetUserId: string
): Promise<{
  ok: boolean;
  error?: string;
}> {
  const target = trimText(targetUserId);
  if (!target || target === userId) return { ok: false, error: "bad_target" };
  if (!(await ensureNoBlockedEitherWay(userId, target))) {
    return { ok: false, error: "blocked_target" };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const { isFriendSavedByOwner } = await import("@/lib/community-messenger/friendship-resolver");
    if (await isFriendSavedByOwner(sb, userId, target)) {
      return { ok: true };
    }
  }

  const added = await addFriendSaved(userId, target);
  if (!added.ok) return { ok: false, error: added.error ?? "friend_add_failed" };
  return { ok: true };
}

/** @deprecated Use `addCommunityMessengerFriendContact` — name retained for route compat. */
export async function sendCommunityMessengerFriendRequest(
  userId: string,
  targetUserId: string,
  note?: string
): Promise<{
  ok: boolean;
  request?: CommunityMessengerFriendRequest;
  error?: string;
  /** @deprecated Contact transition — always undefined */
  mergedFromIncoming?: boolean;
  directRoomId?: string;
  /** @deprecated */
  retryAfterMs?: number;
}> {
  void note;
  const result = await addCommunityMessengerFriendContact(userId, targetUserId);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

/** @deprecated Friend request accept/reject retired — Telegram Contact LOCK. */
export async function respondCommunityMessengerFriendRequest(
  _userId: string,
  _requestId: string,
  _action: "accept" | "reject" | "cancel"
): Promise<{ ok: boolean; error?: string; directRoomId?: string; acceptedPeerUserId?: string }> {
  return { ok: false, error: "friend_request_retired" };
}

/**
 * @deprecated Friend request respond-by-requester retired.
 */
export async function respondIncomingCommunityMessengerFriendRequestByRequester(
  _userId: string,
  _requesterId: string,
  _action: "accept" | "reject"
): Promise<{ ok: boolean; error?: string; directRoomId?: string; acceptedPeerUserId?: string }> {
  return { ok: false, error: "friend_request_retired" };
}

/** @deprecated Outgoing cancel retired — Contact has no pending requests. */
export async function cancelOutgoingCommunityMessengerFriendRequestByAddressee(
  _userId: string,
  _addresseeId: string
): Promise<{ ok: boolean; error?: string; didCancel?: boolean }> {
  return { ok: false, error: "friend_request_retired", didCancel: false };
}

async function isFriend(userId: string, targetUserId: string): Promise<boolean> {
  if (await isFriendSavedByMe(userId, targetUserId)) return true;
  if (!allowCommunityMessengerFriendInMemoryDevFallback()) return false;
  const ids = await listAcceptedFriendIds(userId);
  return ids.includes(targetUserId);
}

/** 그룹 생성·초대 대상 검증 — mutual friend SSOT + 차단·프로필. */
export async function validateCommunityMessengerGroupTargets(
  userId: string,
  memberIds: string[]
): Promise<{ ok: true; memberIds: string[] } | { ok: false; error: string }> {
  const { validateGroupInviteTargets } = await import("@/lib/community-messenger/group/group-room-service");
  return validateGroupInviteTargets(userId, memberIds, getSupabaseOrNull());
}

export async function toggleCommunityMessengerFavoriteFriend(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; isFavorite?: boolean; error?: string }> {
  const target = trimText(targetUserId);
  if (!target || !(await isFriend(userId, target))) {
    return { ok: false, error: "friend_required" };
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: selectError } = await (sb as any)
      .from("community_friend_favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("target_user_id", target)
      .maybeSingle();
    if (!selectError || !isMissingTableError(selectError)) {
      if (existing?.id) {
        const { error } = await (sb as any).from("community_friend_favorites").delete().eq("id", existing.id);
        if (!error) return { ok: true, isFavorite: false };
      } else {
        const { error } = await (sb as any).from("community_friend_favorites").insert({
          user_id: userId,
          target_user_id: target,
        });
        if (!error) return { ok: true, isFavorite: true };
      }
    }
  }

  const dev = getDevState();
  const favorites = dev.favoriteFriends.get(userId) ?? new Set<string>();
  if (favorites.has(target)) {
    favorites.delete(target);
    dev.favoriteFriends.set(userId, favorites);
    return { ok: true, isFavorite: false };
  }
  favorites.add(target);
  dev.favoriteFriends.set(userId, favorites);
  return { ok: true, isFavorite: true };
}

export async function toggleCommunityMessengerHiddenFriend(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; isHidden?: boolean; error?: string }> {
  const target = trimText(targetUserId);
  if (!target || !(await isFriend(userId, target))) {
    return { ok: false, error: "friend_required" };
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: existing, error: selectError } = await (sb as any)
      .from("user_relationships")
      .select("id")
      .eq("user_id", userId)
      .eq("target_user_id", target)
      .or("relation_type.eq.hidden,type.eq.hidden")
      .maybeSingle();
    if (!selectError || !isMissingTableError(selectError)) {
      if (existing?.id) {
        const { error } = await (sb as any).from("user_relationships").delete().eq("id", existing.id);
        if (!error) return { ok: true, isHidden: false };
        return { ok: false, error: String(error.message ?? "friend_hide_update_failed") };
      }
      const { error } = await (sb as any).from("user_relationships").insert({
        user_id: userId,
        target_user_id: target,
        type: "hidden",
        relation_type: "hidden",
      });
      if (!error) return { ok: true, isHidden: true };
      return { ok: false, error: String(error.message ?? "friend_hide_update_failed") };
    }
  }

  const dev = getDevState();
  const hidden = dev.hiddenFriends.get(userId) ?? new Set<string>();
  if (hidden.has(target)) {
    hidden.delete(target);
    dev.hiddenFriends.set(userId, hidden);
    return { ok: true, isHidden: false };
  }
  hidden.add(target);
  dev.hiddenFriends.set(userId, hidden);
  return { ok: true, isHidden: true };
}

export async function removeCommunityMessengerFriend(
  userId: string,
  targetUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const target = trimText(targetUserId);
  if (!target) return { ok: false, error: "bad_target" };
  const out = await removeFriendSaved(userId, target);
  if (!out.ok) return out;

  const sb = getSupabaseOrNull();
  if (sb) {
    const { error: favoriteDeleteError } = await (sb as any)
      .from("community_friend_favorites")
      .delete()
      .or(
        `and(user_id.eq.${userId},target_user_id.eq.${target}),and(user_id.eq.${target},target_user_id.eq.${userId})`
      );
    if (favoriteDeleteError && !isMissingTableError(favoriteDeleteError)) {
      return { ok: false, error: String(favoriteDeleteError.message ?? "friend_favorite_cleanup_failed") };
    }
    const { error: hiddenDeleteError } = await (sb as any)
      .from("user_relationships")
      .delete()
      .eq("user_id", userId)
      .eq("target_user_id", target)
      .or("relation_type.eq.hidden,type.eq.hidden");
    if (hiddenDeleteError && !isMissingTableError(hiddenDeleteError)) {
      return { ok: false, error: String(hiddenDeleteError.message ?? "friend_hidden_cleanup_failed") };
    }
    return { ok: true };
  }

  const dev = getDevState();
  dev.favoriteFriends.get(userId)?.delete(target);
  dev.favoriteFriends.get(target)?.delete(userId);
  dev.hiddenFriends.get(userId)?.delete(target);
  return { ok: true };
}

/**
 * 커뮤니티 차단(`user_relationships.blocked`) 시 친구·요청·즐겨찾기·숨김 관계를 정리합니다.
 * 차단 행 자체는 호출 측에서 이미 반영된 뒤 호출하는 것을 전제로 합니다.
 */
export async function cleanupCommunityMessengerFriendGraphOnBlock(
  blockerUserId: string,
  blockedUserId: string
): Promise<{ ok: boolean; error?: string }> {
  const a = trimText(blockerUserId);
  const b = trimText(blockedUserId);
  if (!a || !b || a === b) return { ok: false, error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (sb) {
    // Telegram unilateral: only remove blocker's own contact row. Do not delete peer→blocker friend.
    await (sb as any)
      .from("user_social_relations")
      .delete()
      .eq("owner_user_id", a)
      .eq("target_user_id", b)
      .eq("relation_type", "friend");

    const { error: favoriteDeleteError } = await (sb as any)
      .from("community_friend_favorites")
      .delete()
      .or(`and(user_id.eq.${a},target_user_id.eq.${b}),and(user_id.eq.${b},target_user_id.eq.${a})`);
    if (favoriteDeleteError && !isMissingTableError(favoriteDeleteError)) {
      return { ok: false, error: String(favoriteDeleteError.message ?? "friend_favorite_cleanup_failed") };
    }

    for (const [uid, tid] of [
      [a, b],
      [b, a],
    ] as const) {
      const { error: hiddenDeleteError } = await (sb as any)
        .from("user_relationships")
        .delete()
        .eq("user_id", uid)
        .eq("target_user_id", tid)
        .or("relation_type.eq.hidden,type.eq.hidden");
      if (hiddenDeleteError && !isMissingTableError(hiddenDeleteError)) {
        return { ok: false, error: String(hiddenDeleteError.message ?? "friend_hidden_cleanup_failed") };
      }
    }

    return { ok: true };
  }

  const dev = getDevState();
  dev.favoriteFriends.get(a)?.delete(b);
  dev.favoriteFriends.get(b)?.delete(a);
  dev.hiddenFriends.get(a)?.delete(b);
  dev.hiddenFriends.get(b)?.delete(a);
  return { ok: true };
}

async function verifyUserIsProductChatCounterpart(
  userId: string,
  peerUserId: string,
  productChatId: string
): Promise<boolean> {
  const pid = trimText(productChatId);
  if (!pid) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
  const { data } = await (sb as any)
    .from("product_chats")
    .select("seller_id, buyer_id")
    .eq("id", pid)
    .maybeSingle();
  if (!data) return false;
  const seller = trimText((data as { seller_id?: unknown }).seller_id);
  const buyer = trimText((data as { buyer_id?: unknown }).buyer_id);
  if (!seller || !buyer) return false;
  return (
    (userId === seller && peerUserId === buyer) || (userId === buyer && peerUserId === seller)
  );
}

async function verifyUserIsItemTradeRoomCounterpart(
  userId: string,
  peerUserId: string,
  itemTradeChatRoomId: string
): Promise<boolean> {
  const cid = trimText(itemTradeChatRoomId);
  if (!cid) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
  const { data } = await (sb as any)
    .from("chat_rooms")
    .select("room_type, seller_id, buyer_id")
    .eq("id", cid)
    .maybeSingle();
  if (!data) return false;
  const rt = String((data as { room_type?: unknown }).room_type ?? "");
  if (rt !== "item_trade") return false;
  const seller = trimText((data as { seller_id?: unknown }).seller_id);
  const buyer = trimText((data as { buyer_id?: unknown }).buyer_id);
  if (!seller || !buyer) return false;
  return (
    (userId === seller && peerUserId === buyer) || (userId === buyer && peerUserId === seller)
  );
}

async function verifyUserIsStoreOrderChatCounterpart(
  userId: string,
  peerUserId: string,
  storeOrderId: string
): Promise<boolean> {
  const oid = trimText(storeOrderId);
  if (!oid) return false;
  const sb = getSupabaseOrNull();
  if (!sb) return false;
  const { data } = await (sb as any)
    .from("store_orders")
    .select("buyer_user_id, stores(owner_user_id)")
    .eq("id", oid)
    .maybeSingle();
  if (!data) return false;
  const buyer = trimText((data as { buyer_user_id?: unknown }).buyer_user_id);
  const stores = (data as { stores?: { owner_user_id?: unknown } | Array<{ owner_user_id?: unknown }> | null }).stores;
  const store = Array.isArray(stores) ? stores[0] : stores;
  const owner = trimText(store?.owner_user_id);
  if (!buyer || !owner) return false;
  return (
    (userId === buyer && peerUserId === owner) || (userId === owner && peerUserId === buyer)
  );
}

/**
 * `direct_key` 로 찾은 기존 방 — INSERT 없이 재사용할 때 양쪽 `community_messenger_participants` 가
 * 모두 있는지 보장한다(과거 레이스·부분 롤백으로 한쪽만 남은 경우 판매자 목록에 방이 안 보임).
 */
async function ensureDirectMessengerRoomParticipantsForPair(
  sb: any,
  roomId: string,
  openerUserId: string,
  peerUserId: string
): Promise<void> {
  const rid = trimText(roomId);
  const opener = trimText(openerUserId);
  const peer = trimText(peerUserId);
  if (!rid || !opener || !peer) return;
  const { data: rows, error } = await sb
    .from("community_messenger_participants")
    .select("user_id, role")
    .eq("room_id", rid);
  if (error && !isMissingTableError(error)) return;
  const present = new Map<string, "owner" | "admin" | "member">();
  for (const row of (rows ?? []) as Array<{ user_id?: string; role?: string }>) {
    const uid = trimText(row.user_id);
    if (!uid) continue;
    const r = row.role;
    const role: "owner" | "admin" | "member" =
      r === "owner" || r === "admin" ? (r as "owner" | "admin") : "member";
    present.set(uid, role);
  }
  const hasOwner = [...present.values()].some((role) => role === "owner");
  const toInsert: Array<{ room_id: string; user_id: string; role: "owner" | "member" }> = [];
  if (!present.has(opener)) {
    toInsert.push({ room_id: rid, user_id: opener, role: hasOwner ? "member" : "owner" });
  }
  if (!present.has(peer)) {
    toInsert.push({ room_id: rid, user_id: peer, role: "member" });
  }
  if (!toInsert.length) return;
  const { error: insErr } = await sb.from("community_messenger_participants").insert(toInsert);
  if (insErr && !isUniqueViolationError(insErr)) {
    /* 로그 없이 무시 — 운영은 재시도·다음 ensure 에서 보정 */
  }
}

/** Telegram-style general friend DM — sorted-pair `direct_key` only; trade/store_order 와 분리. */
export async function ensureGeneralFriendDirectRoom(
  userId: string,
  peerUserId: string
): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const peerId = trimText(peerUserId);
  if (!peerId || peerId === userId) return { ok: false, error: "bad_peer" };
  if (!(await ensureNoBlockedEitherWay(userId, peerId))) {
    return { ok: false, error: "blocked_target" };
  }
  const guard = await resolveDirectInteractionGuard(userId, peerId);
  if (!guard.canMessage) {
    return { ok: false, error: guard.reason === "blocked" ? "blocked_target" : "cannot_start_chat" };
  }

  const basePairKey = directKeyFor(userId, peerId);
  const sb = getSupabaseOrNull();
  if (sb) {
    const loadExistingGeneralRoomId = async (): Promise<string | null> => {
      const { data, error } = await (sb as any)
        .from("community_messenger_rooms")
        .select("id, direct_key")
        .eq("room_type", "direct")
        .eq("direct_key", basePairKey)
        .maybeSingle();
      if (error && !isMissingTableError(error)) return null;
      const row = data as { id?: string; direct_key?: string } | null;
      const id = trimText(row?.id);
      const dk = trimText(row?.direct_key);
      if (!id || !isMessengerGeneralFriendDirectKey(dk)) return null;
      return id;
    };

    let existingId = await loadExistingGeneralRoomId();
    if (existingId) {
      await ensureDirectMessengerRoomParticipantsForPair(sb, existingId, userId, peerId);
      return { ok: true, roomId: existingId };
    }

    const gdDomain = plannedColumnsForGeneralDirect(userId, peerId);
    const gdCols = roomDomainInsertColumns(gdDomain);
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .insert({
        room_type: "direct",
        room_status: "active",
        is_readonly: false,
        created_by: userId,
        direct_key: basePairKey,
        chat_domain: gdCols.chat_domain,
        domain_identity: gdCols.domain_identity,
        domain_identity_key: gdCols.domain_identity_key,
        title: "",
        last_message: "",
        last_message_type: "system",
      })
      .select("id")
      .single();

    if (!roomError && room?.id) {
      const roomId = room.id as string;
      const { error: participantError } = await (sb as any).from("community_messenger_participants").insert([
        { room_id: roomId, user_id: userId, role: "owner" },
        { room_id: roomId, user_id: peerId, role: "member" },
      ]);
      if (!participantError) {
        return { ok: true, roomId };
      }
      await (sb as any).from("community_messenger_rooms").delete().eq("id", roomId);
      return { ok: false, error: String(participantError.message ?? "room_participant_create_failed") };
    }

    if (isUniqueViolationError(roomError)) {
      existingId = await loadExistingGeneralRoomId();
      if (existingId) {
        await ensureDirectMessengerRoomParticipantsForPair(sb, existingId, userId, peerId);
        return { ok: true, roomId: existingId };
      }
    }
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_create_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const existing = dev.rooms.find(
    (room) => room.roomType === "direct" && room.directKey === basePairKey
  );
  if (existing) return { ok: true, roomId: existing.id };

  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    summary: "",
    avatarUrl: null,
    createdBy: userId,
    ownerUserId: userId,
    memberLimit: 2,
    isDiscoverable: false,
    allowMemberInvite: false,
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: false,
    allowAdminKick: false,
    allowAdminEditNotice: false,
    allowMemberUpload: true,
    allowMemberCall: true,
    passwordHash: null,
    directKey: basePairKey,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  dev.participants.push(
    {
      id: randomUUID(),
      roomId,
      userId,
      role: "owner",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: createdAt,
    },
    {
      id: randomUUID(),
      roomId,
      userId: peerId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: createdAt,
    }
  );
  return { ok: true, roomId };
}

export async function ensureCommunityMessengerDirectRoom(
  userId: string,
  peerUserId: string,
  options?: {
    productChatId?: string;
    storeOrderId?: string;
    itemTradeChatRoomId?: string;
    /** trade domain identity — item × seller × buyer (long-form SSOT) */
    tradeItemId?: string;
    tradeSellerId?: string;
    tradeBuyerId?: string;
  }
): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const peerId = trimText(peerUserId);
  if (!peerId || peerId === userId) return { ok: false, error: "bad_peer" };
  const itemTradeChatRoomId = trimText(options?.itemTradeChatRoomId ?? "");
  const productChatId = trimText(options?.productChatId ?? "");
  const storeOrderId = trimText(options?.storeOrderId ?? "");
  const tradeItemId = trimText(options?.tradeItemId ?? "");
  const tradeSellerId = trimText(options?.tradeSellerId ?? "");
  const tradeBuyerId = trimText(options?.tradeBuyerId ?? "");
  let allowWithoutFriend = false;
  if (itemTradeChatRoomId) {
    allowWithoutFriend = await verifyUserIsItemTradeRoomCounterpart(userId, peerId, itemTradeChatRoomId);
  } else if (productChatId) {
    allowWithoutFriend = await verifyUserIsProductChatCounterpart(userId, peerId, productChatId);
  } else if (storeOrderId) {
    allowWithoutFriend = await verifyUserIsStoreOrderChatCounterpart(userId, peerId, storeOrderId);
  }
  if (!(await ensureNoBlockedEitherWay(userId, peerId))) {
    return { ok: false, error: "blocked_target" };
  }
  if (!allowWithoutFriend) {
    const guard = await resolveDirectInteractionGuard(userId, peerId);
    if (!guard.canMessage) {
      return { ok: false, error: guard.reason === "blocked" ? "blocked_target" : "cannot_start_chat" };
    }
  }
  const basePairKey = directKeyFor(userId, peerId);
  /** 거래·주문은 친구 DM(`basePairKey`)과 동일 키를 쓰지 않음 — 물품별·스레드별 방 유지 */
  const directKey =
    itemTradeChatRoomId !== ""
      ? `trade_item:${itemTradeChatRoomId}`
      : productChatId !== ""
        ? `trade_pc:${productChatId}`
        : storeOrderId !== ""
          ? `store_order:${storeOrderId}`
          : basePairKey;
  const legacyStoreOrderDirectKey = storeOrderId !== "" ? `trade_order:${storeOrderId}` : "";
  const tradeLookupKeys = dedupeIds([
    ...(itemTradeChatRoomId ? [`trade_item:${itemTradeChatRoomId}`] : []),
    ...(productChatId ? [`trade_pc:${productChatId}`] : []),
  ]);
  const isCommerceEnsure = tradeLookupKeys.length > 0 || storeOrderId !== "";
  let plannedDomain: PlannedRoomDomainColumns | null = null;
  if (storeOrderId) {
    plannedDomain = plannedColumnsForStoreOrderRoom(storeOrderId);
  } else if (tradeItemId && tradeSellerId && tradeBuyerId) {
    plannedDomain = plannedColumnsForTrade(tradeItemId, tradeSellerId, tradeBuyerId);
  } else if (!isCommerceEnsure) {
    plannedDomain = plannedColumnsForGeneralDirect(userId, peerId);
  }
  const correlationId = newDomainSeparationCorrelationId();
  const sb = getSupabaseOrNull();
  if (sb) {
    const directKeyLookupSet = dedupeIds([
      ...tradeLookupKeys,
      ...(legacyStoreOrderDirectKey ? [directKey, legacyStoreOrderDirectKey] : [directKey]),
    ]);
    const pickCanonicalTradeRoomId = (
      rows: Array<{ id?: unknown; direct_key?: unknown; chat_domain?: unknown }>
    ): string | null => {
      if (!rows.length) return null;
      const usable = rows.filter((r) => {
        const dk = trimText(r.direct_key);
        const domain = trimText(r.chat_domain);
        if (domain === "general_direct" || domain === "group") return false;
        if (isMessengerGeneralFriendDirectKey(dk)) return false;
        return true;
      });
      const pool = usable.length ? usable : rows;
      const itemRow = pool.find((r) => trimText(r.direct_key).startsWith("trade_item:"));
      if (itemRow?.id) return String(itemRow.id);
      const pcRow = pool.find((r) => trimText(r.direct_key).startsWith("trade_pc:"));
      if (pcRow?.id) return String(pcRow.id);
      const soRow = pool.find((r) => {
        const dk = trimText(r.direct_key);
        return dk.startsWith("store_order:") || dk.startsWith("trade_order:");
      });
      if (soRow?.id) return String(soRow.id);
      const first = pool[0]?.id;
      return typeof first === "string" ? first : null;
    };
    const loadExistingRoomId = async () => {
      const { data } = await (sb as any)
        .from("community_messenger_rooms")
        .select("id, direct_key, chat_domain")
        .eq("room_type", "direct")
        .in("direct_key", directKeyLookupSet)
        .order("created_at", { ascending: true })
        .limit(Math.min(8, directKeyLookupSet.length + 2));
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
        id?: unknown;
        direct_key?: unknown;
        chat_domain?: unknown;
      }>;
      return pickCanonicalTradeRoomId(rows);
    };
    const { data: existingRows, error: existingError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, direct_key, chat_domain")
      .eq("room_type", "direct")
      .in("direct_key", directKeyLookupSet)
      .order("created_at", { ascending: true })
      .limit(Math.min(8, directKeyLookupSet.length + 2));
    const existingList = (Array.isArray(existingRows) ? existingRows : existingRows ? [existingRows] : []) as Array<{
      id?: unknown;
      direct_key?: unknown;
      chat_domain?: unknown;
    }>;
    const existingId = pickCanonicalTradeRoomId(existingList);
    const existing = existingId ? { id: existingId } : null;
    if (existing?.id && !existingError) {
      const rid = existing.id as string;
      const hit = existingList.find((r) => String(r.id) === rid);
      if (isCommerceEnsure && hit && isMessengerGeneralFriendDirectKey(trimText(hit.direct_key))) {
        traceDomainSeparation({
          correlationId,
          phase: "ensure_direct",
          function: "ensureCommunityMessengerDirectRoom",
          reason: "rejected_general_as_trade",
          roomId: rid,
          directKey: trimText(hit.direct_key),
        });
      } else {
        await ensureDirectMessengerRoomParticipantsForPair(sb, rid, userId, peerId);
        traceDomainSeparation({
          correlationId,
          phase: "ensure_direct",
          function: "ensureCommunityMessengerDirectRoom",
          created: false,
          roomId: rid,
          directKey,
          chatDomain: plannedDomain?.chat_domain ?? (trimText(hit?.chat_domain) || null),
          domainIdentity: plannedDomain?.domain_identity ?? null,
        });
        return { ok: true, roomId: rid };
      }
    }
    if (!existing || isMissingTableError(existingError)) {
      if (isCommerceEnsure && !plannedDomain) {
        return { ok: false, error: "trade_identity_required" };
      }
      const insertRow: Record<string, unknown> = {
        room_type: "direct",
        room_status: "active",
        is_readonly: false,
        created_by: userId,
        direct_key: directKey,
        title: "",
        last_message: "",
        last_message_type: "system",
      };
      if (plannedDomain) {
        const cols = roomDomainInsertColumns(plannedDomain);
        insertRow.chat_domain = cols.chat_domain;
        insertRow.domain_identity = cols.domain_identity;
        insertRow.domain_identity_key = cols.domain_identity_key;
      }
      const { data: room, error: roomError } = await (sb as any)
        .from("community_messenger_rooms")
        .insert(insertRow)
        .select("id")
        .single();
      if (!roomError) {
        const roomId = room.id as string;
        const { error: participantError } = await (sb as any).from("community_messenger_participants").insert([
          { room_id: roomId, user_id: userId, role: "owner" },
          { room_id: roomId, user_id: peerId, role: "member" },
        ]);
        if (!participantError) {
          traceDomainSeparation({
            correlationId,
            phase: "ensure_direct",
            function: "ensureCommunityMessengerDirectRoom",
            created: true,
            roomId,
            directKey,
            chatDomain: (insertRow.chat_domain as string) ?? null,
            domainIdentity: (insertRow.domain_identity_key as string) ?? (insertRow.domain_identity as string) ?? null,
          });
          return { ok: true, roomId };
        }
        await (sb as any).from("community_messenger_rooms").delete().eq("id", roomId);
        return { ok: false, error: String(participantError.message ?? "room_participant_create_failed") };
      }
      if (isUniqueViolationError(roomError)) {
        const roomId =
          (await loadExistingRoomId()) ||
          (plannedDomain
            ? await (async () => {
                const { data } = await (sb as any)
                  .from("community_messenger_rooms")
                  .select("id")
                  .eq("domain_identity_key", plannedDomain.domain_identity)
                  .maybeSingle();
                const id = trimText((data as { id?: unknown } | null)?.id);
                return id || null;
              })()
            : null);
        if (roomId) {
          await ensureDirectMessengerRoomParticipantsForPair(sb, roomId, userId, peerId);
          return { ok: true, roomId };
        }
      }
      if (!isMissingTableError(roomError)) {
        return { ok: false, error: String(roomError.message ?? "room_create_failed") };
      }
    }
    if (isUniqueViolationError(existingError)) {
      const roomId = await loadExistingRoomId();
      if (roomId) {
        await ensureDirectMessengerRoomParticipantsForPair(sb, roomId, userId, peerId);
        return { ok: true, roomId };
      }
    }
    if (existingError && !isMissingTableError(existingError)) {
      return { ok: false, error: String(existingError.message ?? "room_lookup_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const existing = dev.rooms.find((room) => room.roomType === "direct" && room.directKey === directKey);
  if (existing) return { ok: true, roomId: existing.id };
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
    summary: "",
    avatarUrl: null,
    createdBy: userId,
    ownerUserId: userId,
    memberLimit: 2,
    isDiscoverable: false,
    allowMemberInvite: false,
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: false,
    allowAdminKick: false,
    allowAdminEditNotice: false,
    allowMemberUpload: true,
    allowMemberCall: true,
    passwordHash: null,
    directKey,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  dev.participants.push(
    {
      id: randomUUID(),
      roomId,
      userId,
      role: "owner",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: createdAt,
    },
    {
      id: randomUUID(),
      roomId,
      userId: peerId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: createdAt,
    }
  );
  return { ok: true, roomId };
}

export type EnsureCommunityMessengerDirectRoomFromProductChatTradeLink = {
  itemTradeChatRoomId?: string | null;
  /** 호출부가 이미 `product_chats` 행을 확보한 경우 `resolveProductChat` DB 왕복 생략 */
  prefetchedProductChat?: ProductChatRow | null;
  /**
   * 거래 entry/resolve 핫패스 — `rooms.summary` 거래 메타 보강은 응답 후 `after()` (PC·CR FK 는 동기 유지).
   * 메신저 UI에서 방을 직접 만드는 경로는 기본(동기) hydrate.
   */
  deferSummaryHydration?: boolean;
};

export async function ensureCommunityMessengerDirectRoomFromProductChat(
  userId: string,
  roomIdOrProductChat: string,
  tradeLink?: EnsureCommunityMessengerDirectRoomFromProductChatTradeLink
): Promise<{ ok: boolean; roomId?: string; peerUserId?: string; error?: string }> {
  const rid = trimText(roomIdOrProductChat);
  if (!rid) return { ok: false, error: "bad_room" };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const pref = tradeLink?.prefetchedProductChat ?? null;
  const resolved: ResolveProductChatResult | null =
    pref && trimText(pref.id) === rid
      ? {
          productChat: pref,
          productChatId: pref.id,
          messengerRoomId:
            typeof pref.community_messenger_room_id === "string" && pref.community_messenger_room_id.trim()
              ? pref.community_messenger_room_id.trim()
              : null,
        }
      : await resolveProductChat(sb as any, rid);
  if (!resolved) return { ok: false, error: "product_chat_not_found" };
  const pc = resolved.productChat;
  const seller = trimText(pc.seller_id);
  const buyer = trimText(pc.buyer_id);
  const productChatId = resolved.productChatId;
  if (!seller || !buyer) return { ok: false, error: "product_chat_invalid" };
  if (userId !== seller && userId !== buyer) return { ok: false, error: "not_participant" };
  const peer = userId === seller ? buyer : seller;
  const ledgerCrId = trimText(tradeLink?.itemTradeChatRoomId ?? resolved.ledgerChatRoomId ?? "");
  const tradeItemId = trimText((pc as { post_id?: unknown }).post_id);
  const out = await ensureCommunityMessengerDirectRoom(userId, peer, {
    productChatId,
    ...(ledgerCrId ? { itemTradeChatRoomId: ledgerCrId } : {}),
    ...(tradeItemId
      ? { tradeItemId, tradeSellerId: seller, tradeBuyerId: buyer }
      : {}),
  });
  if (!out.ok || !out.roomId) return { ok: false, error: out.error ?? "room_failed" };
  /** `rooms.summary` 거래 메타 — 목록·방 카드. entry resolve 는 defer(응답 RTT 제외), 그 외는 동기 */
  const runSummaryHydrate = () =>
    hydrateTradeMessengerRoomSummaryFromProductChat(userId, productChatId, out.roomId!, pc).catch(() => {});
  if (tradeLink?.deferSummaryHydration) {
    after(runSummaryHydrate);
  } else {
    await runSummaryHydrate();
  }
  const sbPersist = getSupabaseOrNull();
  /** item_trade 행이 있으면 `chat_rooms` FK만 고정 — 없으면 레거시로 PC 에 메신저 id 기록 */
  if (sbPersist && ledgerCrId) {
    await syncChatRoomMessengerLink(sbPersist as never, ledgerCrId, out.roomId);
  }
  /** item_trade 여부와 무관하게 `product_chats` 원장에 CM 방 id 고정 — 목록 enrich Phase B 조인에 필수 */
  if (sbPersist) {
    await persistProductChatMessengerRoomId(sbPersist as never, productChatId, out.roomId);
  }
  return { ok: true, roomId: out.roomId, peerUserId: peer };
}

export async function ensureCommunityMessengerDirectRoomFromStoreOrderChat(
  userId: string,
  orderId: string
): Promise<{ ok: boolean; roomId?: string; peerUserId?: string; error?: string }> {
  const oid = trimText(orderId);
  if (!oid) return { ok: false, error: "bad_order" };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "server_unavailable" };
  const { data } = await (sb as any)
    .from("store_orders")
    .select("id, order_no, store_id, buyer_user_id, order_status, fulfillment_type, payment_amount, total_amount, stores(store_name, owner_user_id, profile_image_url)")
    .eq("id", oid)
    .maybeSingle();
  if (!data) return { ok: false, error: "store_order_not_found" };
  const orderRow = data as {
    id?: unknown;
    order_no?: unknown;
    store_id?: unknown;
    buyer_user_id?: unknown;
    order_status?: unknown;
    fulfillment_type?: unknown;
    payment_amount?: unknown;
    total_amount?: unknown;
    stores?:
      | { store_name?: unknown; owner_user_id?: unknown; profile_image_url?: unknown }
      | Array<{ store_name?: unknown; owner_user_id?: unknown; profile_image_url?: unknown }>
      | null;
  };
  const storeRow = Array.isArray(orderRow.stores) ? orderRow.stores[0] : orderRow.stores;
  const buyer = trimText(orderRow.buyer_user_id);
  const owner = trimText(storeRow?.owner_user_id);
  if (!buyer || !owner) return { ok: false, error: "order_chat_invalid" };
  if (userId !== buyer && userId !== owner) return { ok: false, error: "not_participant" };
  const peer = userId === buyer ? owner : buyer;
  const out = await ensureCommunityMessengerDirectRoom(userId, peer, { storeOrderId: oid });
  if (!out.ok || !out.roomId) return { ok: false, error: out.error ?? "room_failed" };
  const storeName = trimText(storeRow?.store_name) || cmServiceT("cm_svc_store_fallback");
  const orderNo = trimText(orderRow.order_no);
  const status = trimText(orderRow.order_status);
  const fulfillmentType = trimText(orderRow.fulfillment_type);
  const amountRaw = Number(orderRow.payment_amount ?? orderRow.total_amount ?? 0);
  const profileUrl = trimText(storeRow?.profile_image_url as string | undefined);
  const contextMeta: CommunityMessengerRoomContextMetaV1 = {
    v: 1,
    kind: "delivery",
    storeOrderId: oid,
    orderNo,
    storeId: trimText(orderRow.store_id),
    storeDisplayName: storeName,
    fulfillmentType,
    headline: cmStoreOrderHeadline(storeName, orderNo),
    ...(profileUrl ? { thumbnailUrl: profileUrl } : {}),
    ...(Number.isFinite(amountRaw) && amountRaw >= 0 ? { priceLabel: `₱${amountRaw.toLocaleString("en-US")}` } : {}),
    ...(status ? { stepLabel: buyerOrderStatusLabel(status) || status } : {}),
  };
  await updateCommunityMessengerRoomContextMeta({ userId, roomId: out.roomId, contextMeta }).catch(() => ({ ok: false }));
  return { ok: true, roomId: out.roomId, peerUserId: peer };
}

/**
 * `store_orders.community_messenger_room_id` — 주문·메신저 1:1 연결(선택 컬럼, 마이그레이션 후 동작).
 * 실패해도 방 생성·딥링크는 이미 성공한 상태이므로 호출부는 best-effort 로 둔다.
 */
export async function syncStoreOrderCommunityMessengerRoomId(input: {
  userId: string;
  storeOrderId: string;
  communityMessengerRoomId: string;
}): Promise<{ ok: boolean }> {
  const oid = trimText(input.storeOrderId);
  const cmRoomId = trimText(input.communityMessengerRoomId);
  const uid = trimText(input.userId);
  if (!oid || !cmRoomId || !uid) return { ok: false };
  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false };

  const { data: ocr } = await (sb as any)
    .from("store_orders")
    .select("buyer_user_id, stores(owner_user_id)")
    .eq("id", oid)
    .maybeSingle();
  if (!ocr) return { ok: false };
  const buyer = trimText((ocr as { buyer_user_id?: unknown }).buyer_user_id);
  const stores = (ocr as { stores?: { owner_user_id?: unknown } | Array<{ owner_user_id?: unknown }> | null }).stores;
  const storeRow = Array.isArray(stores) ? stores[0] : stores;
  const owner = trimText(storeRow?.owner_user_id);
  if (uid !== buyer && uid !== owner) return { ok: false };

  const { error } = await (sb as any).from("store_orders").update({ community_messenger_room_id: cmRoomId }).eq("id", oid);
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false };
    }
    return { ok: false };
  }
  return { ok: true };
}

export async function createPrivateGroupRoom(input: {
  userId: string;
  title: string;
  memberIds: string[];
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const sb = getSupabaseOrNull();
  if (sb) {
    const { createGroupRoom } = await import("@/lib/community-messenger/group/group-room-service");
    return createGroupRoom({ userId: input.userId, title: input.title, memberIds: input.memberIds });
  }
  const memberIds = dedupeIds([input.userId, ...input.memberIds]);
  if (memberIds.length < 2) return { ok: false, error: "members_required" };
  const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
  if (!memberValidation.ok) return memberValidation;
  const title = await resolveCommunityMessengerGroupTitle(input.userId, memberIds, input.title);

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "private_group",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title,
    summary: "",
    avatarUrl: null,
    createdBy: input.userId,
    ownerUserId: input.userId,
    memberLimit: memberIds.length,
    isDiscoverable: false,
    allowMemberInvite: true,
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: true,
    allowAdminKick: true,
    allowAdminEditNotice: true,
    allowMemberUpload: true,
    allowMemberCall: true,
    passwordHash: null,
    directKey: null,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  for (const memberId of memberIds) {
    dev.participants.push({
      id: randomUUID(),
      roomId,
      userId: memberId,
      role: memberId === input.userId ? "owner" : "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: createdAt,
    });
  }
  return { ok: true, roomId };
}

export async function createOpenGroupRoom(input: {
  userId: string;
  title: string;
  summary?: string;
  password?: string;
  memberLimit?: number;
  isDiscoverable?: boolean;
  joinPolicy?: Extract<CommunityMessengerRoomJoinPolicy, "password" | "free">;
  identityPolicy?: CommunityMessengerRoomIdentityPolicy;
  creatorIdentityMode?: CommunityMessengerIdentityMode;
  creatorAliasProfile?: Partial<CommunityMessengerRoomAliasProfile> | null;
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const title = trimText(input.title);
  const summary = trimText(input.summary);
  const password = trimText(input.password);
  const memberLimit = Math.min(1000, Math.max(2, Math.floor(Number(input.memberLimit ?? 200) || 200)));
  const isDiscoverable = input.isDiscoverable !== false;
  const joinPolicy = input.joinPolicy === "free" ? "free" : "password";
  const identityPolicy = input.identityPolicy === "real_name" ? "real_name" : "alias_allowed";
  const creatorIdentityMode =
    input.creatorIdentityMode === "alias" && identityPolicy === "alias_allowed" ? "alias" : "real_name";
  if (!title) return { ok: false, error: "title_required" };
  if (joinPolicy === "password" && !password) return { ok: false, error: "password_required" };
  if (creatorIdentityMode === "alias" && !trimText(input.creatorAliasProfile?.displayName)) {
    return { ok: false, error: "alias_name_required" };
  }
  const passwordHash = joinPolicy === "password" ? hashMeetingPassword(password) : null;
  const sb = getSupabaseOrNull();
  if (sb) {
    /** Pre-allocate id so group:{roomId} + chat_domain are atomic (prod NOT NULL). */
    const roomId = randomUUID();
    const domainCols = roomDomainInsertColumns(plannedColumnsForGroup(roomId));
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .insert({
        id: roomId,
        room_type: "open_group",
        room_status: "active",
        visibility: "public",
        join_policy: joinPolicy,
        identity_policy: identityPolicy,
        is_readonly: false,
        created_by: input.userId,
        owner_user_id: input.userId,
        title,
        summary,
        password_hash: passwordHash,
        member_limit: memberLimit,
        is_discoverable: isDiscoverable,
        allow_member_invite: false,
        notice_text: "",
        allow_admin_invite: false,
        allow_admin_kick: false,
        allow_admin_edit_notice: false,
        allow_member_upload: true,
        allow_member_call: true,
        last_message: "",
        last_message_type: "system",
        chat_domain: domainCols.chat_domain,
        domain_identity: domainCols.domain_identity,
        domain_identity_key: domainCols.domain_identity_key,
      })
      .select("id")
      .single();
    if (!roomError) {
      const insertedId = (room.id as string) || roomId;
      const { error: participantError } = await (sb as any).from("community_messenger_participants").insert({
        room_id: insertedId,
        user_id: input.userId,
        role: "owner",
      });
      if (!participantError) {
        const roomProfile = await upsertRoomIdentityProfile({
          userId: input.userId,
          roomId: insertedId,
          identityMode: creatorIdentityMode,
          aliasProfile: input.creatorAliasProfile,
        });
        if (roomProfile.ok) return { ok: true, roomId: insertedId };
        return roomProfile;
      }
      await (sb as any).from("community_messenger_rooms").delete().eq("id", insertedId);
      return { ok: false, error: String(participantError.message ?? "open_group_participant_create_failed") };
    }
    if (!isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "open_group_create_failed") };
    }
    return { ok: false, error: "messenger_migration_required" };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const roomId = randomUUID();
  const createdAt = nowIso();
  dev.rooms.unshift({
    id: roomId,
    roomType: "open_group",
    roomStatus: "active",
    visibility: "public",
    joinPolicy,
    identityPolicy,
    isReadonly: false,
    title,
    summary,
    avatarUrl: null,
    createdBy: input.userId,
    ownerUserId: input.userId,
    memberLimit,
    isDiscoverable,
    allowMemberInvite: false,
    noticeText: "",
    noticeUpdatedAt: null,
    noticeUpdatedBy: null,
    allowAdminInvite: false,
    allowAdminKick: false,
    allowAdminEditNotice: false,
    allowMemberUpload: true,
    allowMemberCall: true,
    passwordHash,
    directKey: null,
    lastMessage: "",
    lastMessageAt: createdAt,
    lastMessageType: "system",
  });
  dev.participants.push({
    id: randomUUID(),
    roomId,
    userId: input.userId,
    role: "owner",
    unreadCount: 0,
    isMuted: false,
    isPinned: false,
    isArchived: false,
    joinedAt: createdAt,
  });
  const roomProfile = await upsertRoomIdentityProfile({
    userId: input.userId,
    roomId,
    identityMode: creatorIdentityMode,
    aliasProfile: input.creatorAliasProfile,
  });
  if (!roomProfile.ok) return roomProfile;
  return { ok: true, roomId };
}

export async function createCommunityMessengerGroupRoom(input: {
  userId: string;
  title: string;
  memberIds: string[];
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  return createPrivateGroupRoom(input);
}

export async function inviteCommunityMessengerGroupMembers(input: {
  userId: string;
  roomId: string;
  memberIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const memberIds = dedupeIds(input.memberIds);
  if (!roomId || !memberIds.length) return { ok: false, error: "members_required" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { inviteGroupMembers } = await import("@/lib/community-messenger/group/group-room-service");
    return inviteGroupMembers({ userId: input.userId, roomId, memberIds });
  }

const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (room.roomStatus !== "active" || room.isReadonly) return { ok: false, error: "room_unavailable" };
  const memberValidation = await validateCommunityMessengerGroupTargets(input.userId, memberIds);
  if (!memberValidation.ok) return memberValidation;
  const me = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!me) return { ok: false, error: "forbidden" };
  const isOwner = room.ownerUserId === input.userId || me.role === "owner";
  const canInvite = isOwner || (me.role === "admin" ? room.allowAdminInvite !== false : room.allowMemberInvite);
  if (!canInvite) return { ok: false, error: "forbidden" };
  for (const memberId of memberIds) {
    if (dev.participants.some((row) => row.roomId === roomId && row.userId === memberId)) continue;
    dev.participants.push({
      id: randomUUID(),
      roomId,
      userId: memberId,
      role: "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: nowIso(),
    });
  }
  const invited = await hydrateProfiles(input.userId, memberIds);
  const labels = invited.map((item) => item.label).filter(Boolean).join(", ");
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: cmMgmtMemberInviteContent(labels),
  });
  return { ok: true };
}

export async function updateCommunityMessengerPrivateGroupNotice(input: {
  userId: string;
  roomId: string;
  noticeText: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const noticeText = trimText(input.noticeText).slice(0, 2000);
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_update_group_notice", {
      p_room_id: roomId,
      p_notice_text: noticeText,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: cmMgmtNoticeContent(noticeText),
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || (room.roomType !== "private_group" && room.roomType !== "open_group")) {
    return { ok: false, error: "not_group_room" };
  }
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!me) return { ok: false, error: "forbidden" };
  const canEdit = me.role === "owner" || (me.role === "admin" && room.allowAdminEditNotice !== false);
  if (!canEdit) return { ok: false, error: "forbidden" };
  room.noticeText = noticeText;
  room.noticeUpdatedAt = nowIso();
  room.noticeUpdatedBy = input.userId;
  const createdAt = nowIso();
  dev.messages.push({
    id: randomUUID(),
    roomId,
    senderId: null,
    messageType: "system",
    content: cmMgmtNoticeContent(noticeText),
    metadata: {},
    createdAt,
  });
  room.lastMessage = cmMgmtNoticeContent(noticeText);
  room.lastMessageAt = createdAt;
  room.lastMessageType = "system";
  return { ok: true };
}

export async function updateCommunityMessengerPrivateGroupPermissions(input: {
  userId: string;
  roomId: string;
  allowMemberInvite?: boolean;
  allowAdminInvite?: boolean;
  allowAdminKick?: boolean;
  allowAdminEditNotice?: boolean;
  allowMemberUpload?: boolean;
  allowMemberCall?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_update_group_permissions", {
      p_room_id: roomId,
      p_allow_member_invite: input.allowMemberInvite ?? null,
      p_allow_admin_invite: input.allowAdminInvite ?? null,
      p_allow_admin_kick: input.allowAdminKick ?? null,
      p_allow_admin_edit_notice: input.allowAdminEditNotice ?? null,
      p_allow_member_upload: input.allowMemberUpload ?? null,
      p_allow_member_call: input.allowMemberCall ?? null,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: cmMgmtPermissionsContent(),
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (room.ownerUserId !== input.userId) return { ok: false, error: "forbidden" };
  if (typeof input.allowMemberInvite === "boolean") room.allowMemberInvite = input.allowMemberInvite;
  if (typeof input.allowAdminInvite === "boolean") room.allowAdminInvite = input.allowAdminInvite;
  if (typeof input.allowAdminKick === "boolean") room.allowAdminKick = input.allowAdminKick;
  if (typeof input.allowAdminEditNotice === "boolean") room.allowAdminEditNotice = input.allowAdminEditNotice;
  if (typeof input.allowMemberUpload === "boolean") room.allowMemberUpload = input.allowMemberUpload;
  if (typeof input.allowMemberCall === "boolean") room.allowMemberCall = input.allowMemberCall;
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: cmMgmtPermissionsContent(),
  });
  return { ok: true };
}

export async function setCommunityMessengerGroupMemberRole(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
  nextRole: "admin" | "member";
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_set_group_member_role", {
      p_room_id: roomId,
      p_target_user_id: targetUserId,
      p_next_role: input.nextRole,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        const target = (await hydrateProfiles(input.userId, [targetUserId]))[0];
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: cmMgmtAdminRoleContent(input.nextRole, target?.label),
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  const target = dev.participants.find((item) => item.roomId === roomId && item.userId === targetUserId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (!me || !target) return { ok: false, error: "target_not_found" };
  if (me.role !== "owner" || target.role === "owner" || room.ownerUserId === targetUserId) return { ok: false, error: "forbidden" };
  target.role = input.nextRole;
  const targetProfile = (await hydrateProfiles(input.userId, [targetUserId]))[0];
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: cmMgmtAdminRoleContent(input.nextRole, targetProfile?.label),
  });
  return { ok: true };
}

export async function transferCommunityMessengerGroupOwner(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data, error } = await (sb as any).rpc("community_messenger_transfer_group_owner", {
      p_room_id: roomId,
      p_next_owner_user_id: targetUserId,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || row.ok) {
        const target = (await hydrateProfiles(input.userId, [targetUserId]))[0];
        await appendCommunityMessengerSystemMessage({
          userId: input.userId,
          roomId,
          content: cmMgmtOwnerTransferContent(target?.label),
        });
        return { ok: true };
      }
      return { ok: false, error: String(row.error ?? "update_failed") };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  const target = dev.participants.find((item) => item.roomId === roomId && item.userId === targetUserId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (!me || !target) return { ok: false, error: "target_not_found" };
  if (room.ownerUserId !== input.userId || me.role !== "owner") return { ok: false, error: "forbidden" };
  if (targetUserId === input.userId) return { ok: false, error: "same_owner" };
  if (target.role === "owner" || room.ownerUserId === targetUserId) return { ok: false, error: "owner_immutable" };
  room.ownerUserId = targetUserId;
  me.role = "admin";
  target.role = "owner";
  const targetProfile = (await hydrateProfiles(input.userId, [targetUserId]))[0];
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: cmMgmtOwnerTransferContent(targetProfile?.label),
  });
  return { ok: true };
}

export async function kickCommunityMessengerGroupMember(input: {
  userId: string;
  roomId: string;
  targetUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const targetUserId = trimText(input.targetUserId);
  if (!roomId || !targetUserId) return { ok: false, error: "bad_target" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { kickGroupMember } = await import("@/lib/community-messenger/group/group-room-service");
    return kickGroupMember({ userId: input.userId, roomId, targetUserId });
  }

const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const me = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  const target = dev.participants.find((item) => item.roomId === roomId && item.userId === targetUserId);
  if (!room || room.roomType !== "private_group") return { ok: false, error: "not_group_room" };
  if (!me || !target) return { ok: false, error: "target_not_found" };
  if (target.userId === input.userId || target.role === "owner" || room.ownerUserId === targetUserId) return { ok: false, error: "forbidden" };
  const canKick = me.role === "owner" || (me.role === "admin" && room.allowAdminKick !== false && target.role === "member");
  if (!canKick) return { ok: false, error: "forbidden" };
  dev.participants = dev.participants.filter((item) => !(item.roomId === roomId && item.userId === targetUserId));
  const targetProfile = (await hydrateProfiles(input.userId, [targetUserId]))[0];
  await appendCommunityMessengerSystemMessage({
    userId: input.userId,
    roomId,
    content: cmMgmtMemberKickContent(targetProfile?.label),
  });
  return { ok: true };
}

export async function joinOpenGroupRoomWithPassword(input: {
  userId: string;
  roomId: string;
  password?: string;
  identityMode?: CommunityMessengerIdentityMode;
  aliasProfile?: Partial<CommunityMessengerRoomAliasProfile> | null;
}): Promise<{ ok: boolean; roomId?: string; error?: string }> {
  const roomId = trimText(input.roomId);
  const password = trimText(input.password);
  const identityMode = input.identityMode === "alias" ? "alias" : "real_name";
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select(
        "id, room_type, room_status, join_policy, identity_policy, is_readonly, title, summary, owner_user_id, member_limit, is_discoverable, password_hash"
      )
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room) {
      if (room.room_type !== "open_group") return { ok: false, error: "not_open_group_room" };
      if ((room.room_status ?? "active") !== "active" || room.is_readonly === true) return { ok: false, error: "room_unavailable" };
      const joinPolicy = normalizeRoomJoinPolicy(room.join_policy, "open_group");
      const identityPolicy = normalizeRoomIdentityPolicy(room.identity_policy, "open_group");
      if (joinPolicy === "password") {
        if (!password) return { ok: false, error: "password_required" };
        if (!verifyMeetingPassword(password, room.password_hash)) return { ok: false, error: "invalid_password" };
      }
      if (identityPolicy !== "alias_allowed" && identityMode === "alias") return { ok: false, error: "forbidden" };
      /**
       * `count: "exact"` can be expensive for large rooms (it may scan/index-walk).
       * We only need to know "is it full?" — use limit+1 as a cheap existence check.
       */
      const { data: participantHead, error: participantHeadError } = await (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .limit(Number(room.member_limit ?? 0) > 0 ? Math.max(1, Number(room.member_limit ?? 0)) + 1 : 1);
      if (participantHeadError && !isMissingTableError(participantHeadError)) {
        return { ok: false, error: String(participantHeadError.message ?? "participant_count_failed") };
      }
      const memberLimit = Number(room.member_limit ?? 0);
      if (memberLimit > 0 && (participantHead?.length ?? 0) > memberLimit) return { ok: false, error: "room_full" };
      const existingJoin = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id, left_at, role")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle();
      if (existingJoin?.error && !isMissingTableError(existingJoin.error)) {
        return { ok: false, error: String(existingJoin.error.message ?? "join_failed") };
      }
      const existingRow = existingJoin?.data as
        | { user_id?: string; left_at?: string | null; role?: string | null }
        | null
        | undefined;
      if (existingRow && existingRow.left_at == null) {
        const roomProfileActive = await upsertRoomIdentityProfile({
          userId: input.userId,
          roomId,
          identityMode,
          aliasProfile: input.aliasProfile,
        });
        if (roomProfileActive.ok) return { ok: true, roomId };
        return roomProfileActive;
      }
      // Rejoin: member unless still the room owner_user_id (never restore stale admin).
      const joinRole = input.userId === room.owner_user_id ? "owner" : "member";
      let error: { message?: string } | null = null;
      if (existingRow) {
        const upd = await (sb as any)
          .from("community_messenger_participants")
          .update({ left_at: null, role: joinRole })
          .eq("room_id", roomId)
          .eq("user_id", input.userId)
          .not("left_at", "is", null);
        error = upd.error;
      } else {
        const ins = await (sb as any).from("community_messenger_participants").insert({
          room_id: roomId,
          user_id: input.userId,
          role: joinRole,
          left_at: null,
        });
        error = ins.error;
      }
      if (!error) {
        const roomProfile = await upsertRoomIdentityProfile({
          userId: input.userId,
          roomId,
          identityMode,
          aliasProfile: input.aliasProfile,
        });
        if (roomProfile.ok) return { ok: true, roomId };
        return roomProfile;
      }
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "join_failed") };
    }
    return { ok: false, error: "messenger_migration_required" };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "open_group") return { ok: false, error: "not_open_group_room" };
  if (room.roomStatus !== "active" || room.isReadonly) return { ok: false, error: "room_unavailable" };
  if (room.joinPolicy === "password") {
    if (!password) return { ok: false, error: "password_required" };
    if (!verifyMeetingPassword(password, room.passwordHash)) return { ok: false, error: "invalid_password" };
  }
  if (room.identityPolicy !== "alias_allowed" && identityMode === "alias") return { ok: false, error: "forbidden" };
  const memberCount = dev.participants.filter((participant) => participant.roomId === roomId).length;
  if (room.memberLimit && memberCount >= room.memberLimit) return { ok: false, error: "room_full" };
  if (!dev.participants.some((participant) => participant.roomId === roomId && participant.userId === input.userId)) {
    dev.participants.push({
      id: randomUUID(),
      roomId,
      userId: input.userId,
      role: input.userId === room.ownerUserId ? "owner" : "member",
      unreadCount: 0,
      isMuted: false,
      isPinned: false,
      isArchived: false,
      joinedAt: nowIso(),
    });
  }
  const roomProfile = await upsertRoomIdentityProfile({
    userId: input.userId,
    roomId,
    identityMode,
    aliasProfile: input.aliasProfile,
  });
  if (!roomProfile.ok) return roomProfile;
  return { ok: true, roomId };
}

export async function updateOpenGroupRoomSettings(input: {
  userId: string;
  roomId: string;
  title?: string;
  summary?: string;
  password?: string;
  memberLimit?: number;
  isDiscoverable?: boolean;
  joinPolicy?: Extract<CommunityMessengerRoomJoinPolicy, "password" | "free">;
  identityPolicy?: CommunityMessengerRoomIdentityPolicy;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const title = trimText(input.title);
  const summary = trimText(input.summary);
  const password = trimText(input.password);
  const sb = getSupabaseOrNull();
  const patch: Record<string, unknown> = {
    updated_at: nowIso(),
  };
  if (title) patch.title = title;
  if (typeof input.summary === "string") patch.summary = summary;
  if (password) patch.password_hash = hashMeetingPassword(password);
  if (typeof input.memberLimit === "number" && Number.isFinite(input.memberLimit)) {
    patch.member_limit = Math.min(1000, Math.max(2, Math.floor(input.memberLimit)));
  }
  if (typeof input.isDiscoverable === "boolean") patch.is_discoverable = input.isDiscoverable;
  if (input.joinPolicy === "free" || input.joinPolicy === "password") patch.join_policy = input.joinPolicy;
  if (input.identityPolicy === "real_name" || input.identityPolicy === "alias_allowed") {
    patch.identity_policy = input.identityPolicy;
  }
  if (input.joinPolicy === "free") patch.password_hash = null;
  if (input.joinPolicy === "password" && !password) return { ok: false, error: "password_required" };

  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, owner_user_id")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room) {
      if (room.room_type !== "open_group") return { ok: false, error: "not_open_group_room" };
      if (trimText(room.owner_user_id) !== input.userId) return { ok: false, error: "forbidden" };
      const { error } = await (sb as any).from("community_messenger_rooms").update(patch).eq("id", roomId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "update_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room || room.roomType !== "open_group") return { ok: false, error: "not_open_group_room" };
  if (room.ownerUserId !== input.userId) return { ok: false, error: "forbidden" };
  if (title) room.title = title;
  if (typeof input.summary === "string") room.summary = summary;
  if (password) room.passwordHash = hashMeetingPassword(password);
  if (typeof input.memberLimit === "number" && Number.isFinite(input.memberLimit)) {
    room.memberLimit = Math.min(1000, Math.max(2, Math.floor(input.memberLimit)));
  }
  if (typeof input.isDiscoverable === "boolean") room.isDiscoverable = input.isDiscoverable;
  if (input.joinPolicy === "free" || input.joinPolicy === "password") room.joinPolicy = input.joinPolicy;
  if (input.identityPolicy === "real_name" || input.identityPolicy === "alias_allowed") {
    room.identityPolicy = input.identityPolicy;
  }
  if (input.joinPolicy === "free") room.passwordHash = null;
  return { ok: true };
}

export async function leaveCommunityMessengerRoom(input: {
  userId: string;
  roomId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: room, error: roomError } = await (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, owner_user_id")
      .eq("id", roomId)
      .maybeSingle();
    if (roomError && !isMissingTableError(roomError)) {
      return { ok: false, error: String(roomError.message ?? "room_lookup_failed") };
    }
    if (room) {
      if (trimText(room.owner_user_id) === input.userId) return { ok: false, error: "owner_cannot_leave" };
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "leave_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  if (room.ownerUserId === input.userId) return { ok: false, error: "owner_cannot_leave" };
  dev.participants = dev.participants.filter((participant) => !(participant.roomId === roomId && participant.userId === input.userId));
  return { ok: true };
}

export async function updateCommunityMessengerParticipantSettings(input: {
  userId: string;
  roomId: string;
  isMuted?: boolean;
  isPinned?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: participant, error: participantError } = await (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (participantError && !isMissingTableError(participantError)) {
      return { ok: false, error: String(participantError.message ?? "participant_lookup_failed") };
    }
    if (participant) {
      const patch: Record<string, boolean> = {};
      if (typeof input.isMuted === "boolean") patch.is_muted = input.isMuted;
      if (typeof input.isPinned === "boolean") patch.is_pinned = input.isPinned;
      if (Object.keys(patch).length === 0) return { ok: true };
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .update(patch)
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_settings_update_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  if (typeof input.isMuted === "boolean") participant.isMuted = input.isMuted;
  if (typeof input.isPinned === "boolean") participant.isPinned = input.isPinned;
  return { ok: true };
}

/**
 * 거래/배달 목록용 `rooms.summary` JSON(v1) 갱신 — 참가자만, direct·그룹만.
 * 스토어 주문 쪽에서는 `buildMessengerContextMetaFromStoreOrder` 로 만든 뒤 호출.
 */
export async function updateCommunityMessengerRoomContextMeta(input: {
  userId: string;
  roomId: string;
  contextMeta: CommunityMessengerRoomContextMetaV1;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const payload = serializeCommunityMessengerRoomContextMeta(input.contextMeta);
  if (!parseCommunityMessengerRoomContextMeta(payload)) {
    return { ok: false, error: "invalid_context_meta" };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: room }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_type, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !room) return { ok: false, error: "room_not_found" };
    const rt = trimText((room as { room_type?: string | null }).room_type);
    if (rt !== "direct" && rt !== "private_group") {
      return { ok: false, error: "context_meta_room_type" };
    }
    const roomStatus = normalizeRoomStatus((room as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((room as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (isReadonly) return { ok: false, error: "room_readonly" };

    const { error } = await (sb as any)
      .from("community_messenger_rooms")
      .update({ summary: payload, updated_at: nowIso() })
      .eq("id", roomId);
    if (!error) return { ok: true };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "summary_update_failed") };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  const r = dev.rooms.find((item) => item.id === roomId);
  if (!r) return { ok: false, error: "room_not_found" };
  if (r.roomType !== "direct" && r.roomType !== "private_group") {
    return { ok: false, error: "context_meta_room_type" };
  }
  if (r.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (r.isReadonly) return { ok: false, error: "room_readonly" };
  r.summary = payload;
  return { ok: true };
}

export type CommunityMessengerMarkReadDiag = {
  existing_read_fetch_ms?: number;
  message_order_compare_ms?: number;
  rpc_ms?: number;
  legacy_participant_update_ms?: number;
  /** 세부 계측 — `[dev-api-perf]` / 라우트 병합용 */
  mark_read_fetch_existing_ms?: number;
  mark_read_compare_ms?: number;
  mark_read_unread_calc_ms?: number;
  mark_read_db_update_ms?: number;
  /** 실제로는 `item_trade`·`product_chats` 브리지 동기화 구간(레거시 명칭 registry) */
  mark_read_registry_sync_ms?: number;
  mark_read_cache_invalidate_ms?: number;
  mark_read_trade_sync_ms?: number;
  mark_read_duplicate_skip_eval_ms?: number;
  /** markCommunityMessengerRoomAsRead 전체 벽시계 */
  mark_read_total_ms?: number;
  mark_read_rpc_mode?: "open" | "cursor";
  /** 응답 전 동기 대기 불필요 — RPC가 CM 읽음 확정 */
  registry_sync_required_for_response?: 0 | 1;
  /** read ack broadcast 와 무관 — RPC 확정 후 발행 */
  registry_sync_broadcast_dependency?: string;
  registry_sync_background_scheduled?: 0 | 1;
  registry_sync_dedupe_hit?: 0 | 1;
  registry_sync_skipped_reason?: string;
  /** `scheduleItemTradeReadSyncAfterMessengerMark` 호출만 측정 — 실제 브리지는 `after()` */
  registry_sync_schedule_overhead_ms?: number;
  registry_background_coalesce_pending?: 0 | 1;
  registry_background_inflight_key?: string;
  /** 짧은 TTL 스냅샷으로 participant SELECT 생략(동일 커서·unread 0) */
  mark_read_existing_snapshot_cache_hit?: 0 | 1;
  mark_read_existing_snapshot_lookup_ms?: number;
  mark_read_existing_snapshot_reuse?: 0 | 1;
  mark_read_existing_snapshot_singleflight_hit?: 0 | 1;
  /** 스냅샷 TTL/inflight 키(잘림) — `mark-read-participant-snapshot` */
  mark_read_snapshot_cache_key?: string;
  snapshot_cache_hit?: 0 | 1;
  snapshot_request_local_hit?: 0 | 1;
  snapshot_singleflight_hit?: 0 | 1;
  snapshot_lookup_cache_hit?: 0 | 1;
  permission_query_ms?: number;
  permission_cache_lookup_ms?: number;
  permission_db_query_ms?: number;
  permission_profile_join_ms?: number;
  permission_room_fetch_ms?: number;
  permission_canonical_build_ms?: number;
  permission_cache_store_ms?: number;
  permission_source?: string;
  permission_cache_reason?: string;
  db_update_round_trip_ms?: number;
  ack_coalesce_hit?: 0 | 1;
  optimistic_ack_possible?: 0 | 1;
  membership_cache_hit?: 0 | 1;
  /** cold flushOpen open_tail — 단일 combined RPC */
  mark_read_combined_rpc_ms?: number;
  mark_read_combined_rpc_used?: 0 | 1;
  mark_read_combined_rpc_mode?: "open_tail";
  mark_read_fetch_existing_eliminated?: 0 | 1;
  mark_read_db_round_trips?: number;
  mark_read_cold_open_path?: 0 | 1;
  /** PATCH 4 — snapshot fast-path duplicate ack */
  duplicate_fast_path?: 0 | 1;
  fetch_existing_skipped?: 0 | 1;
  snapshot_source?: string;
};

export type CommunityMessengerMarkReadResult = {
  ok: boolean;
  error?: string;
  lastReadAt?: string | null;
  lastReadMessageId?: string | null;
  /** DB/RPC 가 동일 커서로 이미 반영됨 — 갱신·broadcast 생략 */
  duplicateAckSkipped?: boolean;
  broadcastSkipped?: boolean;
  sameLastReadDetected?: boolean;
  lastReadAdvanced?: boolean;
  /** 요청 커서가 저장분보다 과거 — 상태 유지 */
  regressionBlocked?: boolean;
};

/** flushOpen+cursor 문자열 비교 안정화(UUID 대소문자 등) */
function normalizeMessengerReadCursorKey(id: string): string {
  return trimText(id).toLowerCase();
}

async function compareMessengerReadCursorOrder(
  sb: any,
  roomId: string,
  storedMessageId: string,
  requestedMessageId: string
): Promise<"regression" | "advance" | "same" | "unknown"> {
  const { compareMessengerReadCursorOrderCached } = await import(
    "@/lib/community-messenger/mark-read-duplicate-fast-path"
  );
  return compareMessengerReadCursorOrderCached(sb, roomId, storedMessageId, requestedMessageId);
}

export async function markCommunityMessengerRoomAsRead(input: {
  userId: string;
  roomId: string;
  lastReadMessageId?: string;
  /**
   * 카카오식 방 진입 즉시: 서버 꼬리 메시지까지 배치 읽음 + unread 재집계 (뷰포트 불필요).
   * `community_messenger_apply_room_read_mark(p_mode=open)` 사용.
   */
  flushOpen?: boolean;
  diag?: CommunityMessengerMarkReadDiag;
}): Promise<CommunityMessengerMarkReadResult> {
  const tMarkTop = performance.now();
  try {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const requestedLastReadMessageId = trimText(input.lastReadMessageId);
  const flushOpen = input.flushOpen === true;
  const diag = input.diag;

  const { probeMarkReadOpenTailCoalesce, rememberMarkReadOpenTailCoalesce } = await import(
    "@/lib/community-messenger/mark-read-open-tail-coalesce"
  );
  const openCoalesceProbe = probeMarkReadOpenTailCoalesce(input.userId, roomId, {
    flushOpen,
    requestedLastReadMessageId,
  });
  if (diag) {
    diag.ack_coalesce_hit = openCoalesceProbe.ack_coalesce_hit;
    diag.optimistic_ack_possible = 1;
  }
  if (openCoalesceProbe.ack_coalesce_hit) {
    if (diag) {
      diag.mark_read_fetch_existing_ms = 0;
      diag.existing_read_fetch_ms = 0;
      diag.mark_read_db_update_ms = 0;
      diag.mark_read_duplicate_skip_eval_ms = 0;
      diag.snapshot_lookup_cache_hit = 1;
      diag.duplicate_fast_path = 1;
      diag.fetch_existing_skipped = 1;
      diag.snapshot_source = "open_tail_coalesce";
      diag.mark_read_fetch_existing_eliminated = 1;
    }
    if (openCoalesceProbe.snapshot) {
      return {
        ok: true,
        lastReadAt: openCoalesceProbe.snapshot.lastReadAt,
        lastReadMessageId: openCoalesceProbe.snapshot.lastReadMessageId,
        duplicateAckSkipped: true,
        broadcastSkipped: true,
        sameLastReadDetected: true,
        lastReadAdvanced: false,
      };
    }
    return {
      ok: true,
      lastReadAt: null,
      lastReadMessageId: null,
      duplicateAckSkipped: true,
      broadcastSkipped: true,
      sameLastReadDetected: true,
      lastReadAdvanced: false,
    };
  }

  const sb = getSupabaseOrNull();
  if (sb) {
    const { probeMarkReadEarlyDuplicateFastPath } = await import(
      "@/lib/community-messenger/mark-read-duplicate-fast-path"
    );
    const earlyDuplicate = probeMarkReadEarlyDuplicateFastPath({
      userId: input.userId,
      roomId,
      requestedLastReadMessageId,
      flushOpen,
      membershipCacheHit: diag?.membership_cache_hit,
      diag,
    });
    if (earlyDuplicate) {
      return earlyDuplicate;
    }

    const rpcMode: "open" | "cursor" = flushOpen || !requestedLastReadMessageId ? "open" : "cursor";
    const rpcThrough = rpcMode === "cursor" ? requestedLastReadMessageId : null;

    /** cold unread open: TTL 캐시 warm skip만 로컬, 이외는 combined RPC 1RTT (SELECT+open mark 분리 금지) */
    const useColdOpenTailCombinedRpc = flushOpen && !requestedLastReadMessageId;
    if (useColdOpenTailCombinedRpc) {
      const { probeMarkReadParticipantSnapshotCacheOnly } = await import(
        "@/lib/community-messenger/mark-read-participant-snapshot"
      );
      const warmCachedSnap = probeMarkReadParticipantSnapshotCacheOnly(
        input.userId,
        roomId,
        requestedLastReadMessageId,
        flushOpen
      );
      if (warmCachedSnap && warmCachedSnap.unreadCount === 0 && Boolean(warmCachedSnap.lastReadMessageId)) {
        if (diag) {
          diag.mark_read_fetch_existing_ms = 0;
          diag.existing_read_fetch_ms = 0;
          diag.mark_read_existing_snapshot_lookup_ms = 0;
          diag.mark_read_existing_snapshot_cache_hit = 1;
          diag.mark_read_existing_snapshot_reuse = 1;
          diag.snapshot_cache_hit = 1;
          diag.snapshot_lookup_cache_hit = 1;
          diag.mark_read_duplicate_skip_eval_ms = 0;
          diag.mark_read_db_update_ms = 0;
          diag.mark_read_db_round_trips = 0;
          diag.mark_read_combined_rpc_used = 0;
          diag.mark_read_cold_open_path = 0;
          diag.mark_read_rpc_mode = "open";
          diag.duplicate_fast_path = 1;
          diag.fetch_existing_skipped = 1;
          diag.snapshot_source = "memory_snapshot";
          diag.mark_read_fetch_existing_eliminated = 1;
        }
        cmRtReadSyncLog("mark_read_duplicate_same_cursor_skip", {
          roomId,
          viewerUserId: input.userId,
          lastReadMessageId: warmCachedSnap.lastReadMessageId,
          unreadCount: 0,
        });
        storeMarkReadParticipantSnapshotsFromRow(
          input.userId,
          roomId,
          { flushOpen, requestedLastReadMessageId },
          {
            id: warmCachedSnap.participantId,
            last_read_message_id: warmCachedSnap.lastReadMessageId,
            last_read_at: warmCachedSnap.lastReadAt,
            unread_count: 0,
          }
        );
        rememberMarkReadOpenTailCoalesce(
          input.userId,
          roomId,
          warmCachedSnap.lastReadAt,
          warmCachedSnap.lastReadMessageId
        );
        return {
          ok: true,
          lastReadAt: warmCachedSnap.lastReadAt,
          lastReadMessageId: warmCachedSnap.lastReadMessageId,
          duplicateAckSkipped: true,
          broadcastSkipped: true,
          sameLastReadDetected: true,
          lastReadAdvanced: false,
        };
      }

      const tCombinedRpc0 = performance.now();
      const { data: openTailRpcRaw, error: openTailRpcError } = await (sb as any).rpc(
        "community_messenger_apply_room_read_mark_open_tail",
        {
          p_room_id: roomId,
          p_reader_id: input.userId,
          p_client_cursor: null,
        }
      );
      const combinedRpcMs = Math.round(performance.now() - tCombinedRpc0);
      const openTailRpcErrMsg = openTailRpcError
        ? String((openTailRpcError as { message?: string }).message ?? openTailRpcError)
        : "";
      const openTailRpcMissing =
        !!openTailRpcError &&
        (/does not exist/i.test(openTailRpcErrMsg) ||
          /community_messenger_apply_room_read_mark_open_tail/i.test(openTailRpcErrMsg) ||
          openTailRpcErrMsg.toLowerCase().includes("schema cache"));

      if (!openTailRpcMissing) {
        if (diag) {
          diag.mark_read_combined_rpc_used = 1;
          diag.mark_read_combined_rpc_mode = "open_tail";
          diag.mark_read_combined_rpc_ms = combinedRpcMs;
          diag.mark_read_cold_open_path = 1;
          diag.mark_read_fetch_existing_eliminated = 1;
          diag.mark_read_fetch_existing_ms = 0;
          diag.existing_read_fetch_ms = 0;
          diag.mark_read_existing_snapshot_lookup_ms = 0;
          diag.mark_read_db_round_trips = 1;
          diag.rpc_ms = combinedRpcMs;
          diag.mark_read_db_update_ms = combinedRpcMs;
          diag.db_update_round_trip_ms = combinedRpcMs;
          diag.mark_read_rpc_mode = "open";
        }

        const openTailPayload = openTailRpcRaw as {
          ok?: unknown;
          error?: unknown;
          duplicateSkipped?: unknown;
          lastReadAdvanced?: unknown;
          lastReadMessageId?: unknown;
          lastReadAt?: unknown;
          participantId?: unknown;
        } | null;

        if (!openTailRpcError && openTailPayload?.ok === false) {
          const reason = typeof openTailPayload.error === "string" ? openTailPayload.error.trim() : "";
          if (reason === "regression_blocked") {
            cmRtReadSyncLog("mark_read_regression_blocked_skip", {
              roomId,
              viewerUserId: input.userId,
              lastReadMessageId: requestedLastReadMessageId,
              messageId: "",
            });
            return {
              ok: true,
              lastReadAt: null,
              lastReadMessageId: null,
              duplicateAckSkipped: true,
              broadcastSkipped: true,
              regressionBlocked: true,
              lastReadAdvanced: false,
              sameLastReadDetected: false,
            };
          }
          console.error("[mark_read_open_tail_rpc_denied]", {
            roomId,
            userId: input.userId,
            error: reason || openTailPayload.error,
          });
          return { ok: false, error: reason || "room_read_failed" };
        }

        if (openTailRpcError) {
          console.error("[mark_read_open_tail_rpc_error]", {
            roomId,
            userId: input.userId,
            message: openTailRpcErrMsg,
            code: (openTailRpcError as { code?: string })?.code,
          });
          return { ok: false, error: openTailRpcErrMsg || "room_read_failed" };
        }

        if (openTailPayload?.ok === true) {
          const duplicateSkipped = openTailPayload.duplicateSkipped === true;
          const lastReadAdvanced = openTailPayload.lastReadAdvanced === true;
          const cursorId =
            typeof openTailPayload.lastReadMessageId === "string"
              ? trimText(openTailPayload.lastReadMessageId)
              : openTailPayload.lastReadMessageId != null
                ? trimText(String(openTailPayload.lastReadMessageId))
                : null;
          let readAt: string | null = null;
          const rawAt = openTailPayload.lastReadAt;
          if (typeof rawAt === "string" && rawAt.trim()) readAt = rawAt.trim();
          else if (rawAt instanceof Date && !Number.isNaN(rawAt.getTime())) readAt = rawAt.toISOString();
          if (!readAt) readAt = nowIso();
          const participantId =
            typeof openTailPayload.participantId === "string"
              ? trimText(openTailPayload.participantId)
              : openTailPayload.participantId != null
                ? trimText(String(openTailPayload.participantId))
                : "";

          if (duplicateSkipped) {
            cmRtReadSyncLog("mark_read_duplicate_same_cursor_skip", {
              roomId,
              viewerUserId: input.userId,
              lastReadMessageId: cursorId,
              unreadCount: 0,
            });
            if (diag) {
              diag.mark_read_db_update_ms = 0;
              diag.db_update_round_trip_ms = 0;
            }
            storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, {
              id: participantId,
              last_read_message_id: cursorId ?? "",
              last_read_at: readAt,
              unread_count: 0,
            });
            rememberMarkReadOpenTailCoalesce(input.userId, roomId, readAt, cursorId);
            return {
              ok: true,
              lastReadAt: readAt,
              lastReadMessageId: cursorId,
              duplicateAckSkipped: true,
              broadcastSkipped: true,
              sameLastReadDetected: true,
              lastReadAdvanced: false,
            };
          }

          const tBridge0 = performance.now();
          const bridgeSched = scheduleItemTradeReadSyncAfterMessengerMark({
            userId: input.userId,
            communityMessengerRoomId: roomId,
            communityMessengerLastReadMessageId: cursorId,
          });
          const bridgeOverheadMs = performance.now() - tBridge0;
          if (diag) {
            diag.mark_read_trade_sync_ms = 0;
            diag.mark_read_registry_sync_ms = 0;
            diag.registry_sync_required_for_response = 0;
            diag.registry_sync_broadcast_dependency = "none_cm_open_tail_rpc_then_trade_bridge_after_response";
            diag.registry_sync_background_scheduled = bridgeSched.scheduled ? 1 : 0;
            diag.registry_sync_dedupe_hit = bridgeSched.dedupeHit ? 1 : 0;
            diag.registry_sync_skipped_reason = bridgeSched.skippedReason;
            diag.registry_background_coalesce_pending = bridgeSched.inflightCoalesce ? 1 : 0;
            diag.registry_background_inflight_key = bridgeSched.registry_background_inflight_key ?? "";
            diag.registry_sync_schedule_overhead_ms = Math.round(bridgeOverheadMs);
          }
          const tBadge0 = performance.now();
          invalidateOwnerHubBadgeCache(input.userId);
          invalidateHomeSyncSnapshotCache(input.userId);
          invalidateCmBootstrapSnapshotCache(input.userId);
          invalidateFullBootstrapSnapshotCache(input.userId, "message_send");
          invalidateRoomBootstrapSnapshotCacheForViewer(roomId, input.userId);
          if (diag) diag.mark_read_cache_invalidate_ms = Math.round(performance.now() - tBadge0);
          storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, {
            id: participantId,
            last_read_message_id: cursorId ?? "",
            last_read_at: readAt,
            unread_count: 0,
          });
          rememberMarkReadOpenTailCoalesce(input.userId, roomId, readAt, cursorId);
          return {
            ok: true,
            lastReadAt: readAt,
            lastReadMessageId: cursorId,
            lastReadAdvanced: lastReadAdvanced !== false,
          };
        }
      } else if (openTailRpcMissing) {
        console.error("[mark_read_open_tail_rpc_fallback_legacy]", {
          roomId,
          userId: input.userId,
          message: openTailRpcErrMsg,
        });
      }
    }

    const tExist0 = performance.now();
    const partRowRaw = await loadMarkReadParticipantRowWithSnapshotCache(
      sb,
      input.userId,
      roomId,
      requestedLastReadMessageId,
      flushOpen,
      diag
    );
    const partRow = partRowRaw as { last_read_message_id?: unknown; last_read_at?: unknown; unread_count?: unknown; id?: unknown } | null;
    if (diag) {
      diag.existing_read_fetch_ms = Math.round(performance.now() - tExist0);
      diag.mark_read_fetch_existing_ms = diag.existing_read_fetch_ms;
      diag.mark_read_existing_snapshot_lookup_ms = Math.round(performance.now() - tExist0);
      if (diag.mark_read_existing_snapshot_cache_hit === 1) {
        diag.mark_read_fetch_existing_eliminated = 1;
        diag.fetch_existing_skipped = 1;
        if (!diag.snapshot_source) diag.snapshot_source = "memory_snapshot";
      }
      diag.mark_read_rpc_mode = rpcMode;
      if (diag.mark_read_db_round_trips == null) {
        diag.mark_read_db_round_trips = 2;
      }
    }

    const existingLastReadId = trimText((partRow as { last_read_message_id?: unknown } | null)?.last_read_message_id ?? "");
    const existingLastReadAt =
      typeof (partRow as { last_read_at?: unknown } | null)?.last_read_at === "string"
        ? trimText(String((partRow as { last_read_at?: string }).last_read_at))
        : (partRow as { last_read_at?: unknown } | null)?.last_read_at instanceof Date
          ? (partRow as { last_read_at: Date }).last_read_at.toISOString()
          : null;
    const existingUnread = Number((partRow as { unread_count?: unknown } | null)?.unread_count ?? 0) || 0;

    const normReq = requestedLastReadMessageId ? normalizeMessengerReadCursorKey(requestedLastReadMessageId) : "";
    const normExist = existingLastReadId ? normalizeMessengerReadCursorKey(existingLastReadId) : "";

    const tDupEval0 = performance.now();
    /** 클라이언트가 항상 flushOpen 이라도 동일 커서·unread 0 이면 RPC 생략 — 실제 중복 PATCH 방지 */
    const duplicateSameReadState =
      Boolean(normReq && normExist && normReq === normExist && existingUnread === 0) ||
      Boolean(flushOpen && !normReq && existingUnread === 0 && Boolean(existingLastReadId));
    if (diag) {
      diag.mark_read_duplicate_skip_eval_ms = Math.round(performance.now() - tDupEval0);
      diag.mark_read_unread_calc_ms = 0;
      diag.mark_read_compare_ms = diag.message_order_compare_ms ?? 0;
    }

    if (duplicateSameReadState) {
      cmRtReadSyncLog("mark_read_duplicate_same_cursor_skip", {
        roomId,
        viewerUserId: input.userId,
        lastReadMessageId: requestedLastReadMessageId,
        unreadCount: existingUnread,
      });
      if (diag) {
        diag.mark_read_db_update_ms = 0;
        diag.mark_read_registry_sync_ms = 0;
        diag.mark_read_trade_sync_ms = 0;
        diag.mark_read_cache_invalidate_ms = 0;
        diag.duplicate_fast_path = 1;
        diag.fetch_existing_skipped = diag.mark_read_existing_snapshot_cache_hit === 1 ? 1 : 0;
        if (diag.mark_read_existing_snapshot_cache_hit === 1) {
          diag.mark_read_fetch_existing_eliminated = 1;
          diag.snapshot_source = diag.snapshot_source ?? "memory_snapshot";
        }
      }
      storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, partRowRaw);
      if (flushOpen && !normReq) {
        rememberMarkReadOpenTailCoalesce(
          input.userId,
          roomId,
          existingLastReadAt,
          existingLastReadId || null
        );
      }
      return {
        ok: true,
        lastReadAt: existingLastReadAt,
        lastReadMessageId: requestedLastReadMessageId || existingLastReadId || null,
        duplicateAckSkipped: true,
        broadcastSkipped: true,
        sameLastReadDetected: true,
        lastReadAdvanced: false,
      };
    }

    if (normReq && normExist && normReq !== normExist) {
      const tOrd0 = performance.now();
      const ord = await compareMessengerReadCursorOrder(sb, roomId, existingLastReadId, requestedLastReadMessageId);
      const cmpMs = performance.now() - tOrd0;
      if (diag) {
        diag.message_order_compare_ms = Math.round(cmpMs);
        diag.mark_read_compare_ms = Math.round(cmpMs);
      }
      if (ord === "same") {
        cmRtReadSyncLog("mark_read_duplicate_same_cursor_skip", {
          roomId,
          viewerUserId: input.userId,
          lastReadMessageId: requestedLastReadMessageId,
          unreadCount: existingUnread,
        });
        if (diag) {
          diag.mark_read_db_update_ms = 0;
          diag.mark_read_registry_sync_ms = 0;
          diag.mark_read_trade_sync_ms = 0;
          diag.mark_read_cache_invalidate_ms = 0;
          diag.duplicate_fast_path = 1;
        }
        storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, partRowRaw);
        return {
          ok: true,
          lastReadAt: existingLastReadAt,
          lastReadMessageId: existingLastReadId,
          duplicateAckSkipped: true,
          broadcastSkipped: true,
          sameLastReadDetected: true,
          lastReadAdvanced: false,
        };
      }
      if (ord === "regression") {
        cmRtReadSyncLog("mark_read_regression_blocked_skip", {
          roomId,
          viewerUserId: input.userId,
          lastReadMessageId: requestedLastReadMessageId,
          messageId: existingLastReadId,
        });
        if (diag) {
          diag.mark_read_db_update_ms = 0;
          diag.mark_read_registry_sync_ms = 0;
          diag.mark_read_trade_sync_ms = 0;
          diag.mark_read_cache_invalidate_ms = 0;
        }
        storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, partRowRaw);
        return {
          ok: true,
          lastReadAt: existingLastReadAt,
          lastReadMessageId: existingLastReadId,
          duplicateAckSkipped: true,
          broadcastSkipped: true,
          regressionBlocked: true,
          lastReadAdvanced: false,
          sameLastReadDetected: false,
        };
      }
    }

    const tRpc0 = performance.now();
    const { data: rpcRaw, error: rpcError } = await (sb as any).rpc("community_messenger_apply_room_read_mark", {
      p_room_id: roomId,
      p_reader_id: input.userId,
      p_mode: rpcMode,
      p_through_message_id: rpcThrough,
    });
    if (diag) {
      diag.rpc_ms = Math.round(performance.now() - tRpc0);
      diag.mark_read_db_update_ms = diag.rpc_ms ?? 0;
      diag.db_update_round_trip_ms = diag.rpc_ms ?? 0;
    }

    const rpcPayload = rpcRaw as { ok?: unknown; lastReadMessageId?: unknown; lastReadAt?: unknown; error?: unknown } | null;

    if (!rpcError && rpcPayload?.ok === true) {
      const cursorId =
        typeof rpcPayload?.lastReadMessageId === "string"
          ? trimText(rpcPayload.lastReadMessageId)
          : rpcPayload?.lastReadMessageId != null
            ? trimText(String(rpcPayload.lastReadMessageId))
            : null;
      let readAt: string | null = null;
      const rawAt = rpcPayload?.lastReadAt;
      if (typeof rawAt === "string" && rawAt.trim()) readAt = rawAt.trim();
      else if (rawAt instanceof Date && !Number.isNaN(rawAt.getTime())) readAt = rawAt.toISOString();
      if (!readAt) readAt = nowIso();
      const tBridge0 = performance.now();
      const bridgeSched = scheduleItemTradeReadSyncAfterMessengerMark({
        userId: input.userId,
        communityMessengerRoomId: roomId,
        communityMessengerLastReadMessageId: cursorId,
      });
      const bridgeOverheadMs = performance.now() - tBridge0;
      if (diag) {
        diag.mark_read_trade_sync_ms = 0;
        diag.mark_read_registry_sync_ms = 0;
        diag.registry_sync_required_for_response = 0;
        diag.registry_sync_broadcast_dependency = "none_cm_rpc_then_trade_bridge_after_response";
        diag.registry_sync_background_scheduled = bridgeSched.scheduled ? 1 : 0;
        diag.registry_sync_dedupe_hit = bridgeSched.dedupeHit ? 1 : 0;
        diag.registry_sync_skipped_reason = bridgeSched.skippedReason;
        diag.registry_background_coalesce_pending = bridgeSched.inflightCoalesce ? 1 : 0;
        diag.registry_background_inflight_key = bridgeSched.registry_background_inflight_key ?? "";
        diag.registry_sync_schedule_overhead_ms = Math.round(bridgeOverheadMs);
      }
      const tBadge0 = performance.now();
      invalidateOwnerHubBadgeCache(input.userId);
      invalidateHomeSyncSnapshotCache(input.userId);
      invalidateCmBootstrapSnapshotCache(input.userId);
      invalidateFullBootstrapSnapshotCache(input.userId, "mark_read");
      invalidateRoomBootstrapSnapshotCacheForViewer(roomId, input.userId);
      if (diag) diag.mark_read_cache_invalidate_ms = Math.round(performance.now() - tBadge0);
      storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, {
        id: trimText(String((partRow as { id?: unknown } | null)?.id ?? "")),
        last_read_message_id: cursorId ?? "",
        last_read_at: readAt,
        unread_count: 0,
      });
      if (flushOpen && !normReq) {
        rememberMarkReadOpenTailCoalesce(input.userId, roomId, readAt, cursorId);
      }
      return { ok: true, lastReadAt: readAt, lastReadMessageId: cursorId, lastReadAdvanced: true };
    }

    if (!rpcError && rpcPayload?.ok === false) {
      const reason = typeof rpcPayload.error === "string" ? rpcPayload.error.trim() : "";
      console.error("[mark_read_rpc_denied]", { roomId, userId: input.userId, rpcMode, error: reason || rpcPayload.error });
      return { ok: false, error: reason || "room_read_failed" };
    }

    const rpcErrMsg = rpcError ? String((rpcError as { message?: string }).message ?? rpcError) : "";
    const useLegacyParticipantUpdate =
      !!rpcError &&
      (/does not exist/i.test(rpcErrMsg) ||
        /community_messenger_apply_room_read_mark/i.test(rpcErrMsg) ||
        rpcErrMsg.toLowerCase().includes("schema cache"));

    if (rpcError && !useLegacyParticipantUpdate) {
      console.error("[mark_read_rpc_error]", {
        roomId,
        userId: input.userId,
        rpcMode,
        message: rpcErrMsg,
        code: (rpcError as { code?: string })?.code,
      });
      return { ok: false, error: rpcErrMsg || "room_read_failed" };
    }

    if (rpcError && useLegacyParticipantUpdate) {
      console.error("[mark_read_rpc_fallback_legacy]", { roomId, userId: input.userId, message: rpcErrMsg });
    }

    const hasParticipantRow =
      partRow && trimText(String((partRow as { id?: unknown }).id ?? ""));
    const [{ data: participant, error: participantError }, latestMessageResult] = await Promise.all([
      hasParticipantRow
        ? Promise.resolve({ data: partRow as Record<string, unknown>, error: null })
        : (sb as any)
            .from("community_messenger_participants")
            .select("id")
            .eq("room_id", roomId)
            .eq("user_id", input.userId)
            .maybeSingle(),
      requestedLastReadMessageId
        ? (sb as any)
            .from("community_messenger_messages")
            .select("id")
            .eq("room_id", roomId)
            .eq("id", requestedLastReadMessageId)
            .maybeSingle()
        : (sb as any)
            .from("community_messenger_messages")
            .select("id")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);
    if (participantError && !isMissingTableError(participantError)) {
      return { ok: false, error: String(participantError.message ?? "participant_lookup_failed") };
    }
    if (participant) {
      const cursorId = trimText((latestMessageResult?.data as { id?: unknown } | null)?.id ?? "") || null;
      const readAt = nowIso();
      const tLegUp = performance.now();
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .update({ unread_count: 0, last_read_at: readAt, ...(cursorId ? { last_read_message_id: cursorId } : {}) })
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (diag) diag.legacy_participant_update_ms = Math.round(performance.now() - tLegUp);
      if (!error) {
        const tBridgeL0 = performance.now();
        const bridgeSchedL = scheduleItemTradeReadSyncAfterMessengerMark({
          userId: input.userId,
          communityMessengerRoomId: roomId,
          communityMessengerLastReadMessageId: cursorId,
        });
        const bridgeLOverheadMs = performance.now() - tBridgeL0;
        if (diag) {
          diag.mark_read_trade_sync_ms = 0;
          diag.mark_read_registry_sync_ms = 0;
          diag.registry_sync_required_for_response = 0;
          diag.registry_sync_broadcast_dependency = "none_legacy_participant_then_trade_bridge_after_response";
          diag.registry_sync_background_scheduled = bridgeSchedL.scheduled ? 1 : 0;
          diag.registry_sync_dedupe_hit = bridgeSchedL.dedupeHit ? 1 : 0;
          diag.registry_sync_skipped_reason = bridgeSchedL.skippedReason;
          diag.registry_background_coalesce_pending = bridgeSchedL.inflightCoalesce ? 1 : 0;
          diag.registry_background_inflight_key = bridgeSchedL.registry_background_inflight_key ?? "";
          diag.registry_sync_schedule_overhead_ms = Math.round(bridgeLOverheadMs);
          diag.mark_read_db_update_ms = Math.round((diag.rpc_ms ?? 0) + (diag.legacy_participant_update_ms ?? 0));
        }
        const tBadgeL0 = performance.now();
        invalidateOwnerHubBadgeCache(input.userId);
        invalidateHomeSyncSnapshotCache(input.userId);
        invalidateCmBootstrapSnapshotCache(input.userId);
        invalidateFullBootstrapSnapshotCache(input.userId, "mark_read");
        invalidateRoomBootstrapSnapshotCacheForViewer(roomId, input.userId);
        if (diag) diag.mark_read_cache_invalidate_ms = Math.round(performance.now() - tBadgeL0);
        storeMarkReadParticipantSnapshotsFromRow(input.userId, roomId, { flushOpen, requestedLastReadMessageId }, {
          id: trimText(String((participant as { id?: unknown }).id ?? "")),
          last_read_message_id: cursorId ?? "",
          last_read_at: readAt,
          unread_count: 0,
        });
        if (flushOpen && !normReq) {
          rememberMarkReadOpenTailCoalesce(input.userId, roomId, readAt, cursorId);
        }
        return { ok: true, lastReadAt: readAt, lastReadMessageId: cursorId, lastReadAdvanced: true };
      }
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_read_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  participant.unreadCount = 0;
  participant.lastReadAt = nowIso();
  const latest = requestedLastReadMessageId
    ? dev.messages.find((item) => item.roomId === roomId && item.id === requestedLastReadMessageId)
    : [...dev.messages]
        .filter((item) => item.roomId === roomId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
  participant.lastReadMessageId = latest?.id ?? null;
  invalidateOwnerHubBadgeCache(input.userId);
  invalidateHomeSyncSnapshotCache(input.userId);
  invalidateCmBootstrapSnapshotCache(input.userId);
  invalidateFullBootstrapSnapshotCache(input.userId, "mark_read");
  invalidateRoomBootstrapSnapshotCacheForViewer(roomId, input.userId);
  return {
    ok: true,
    lastReadAt: participant.lastReadAt,
    lastReadMessageId: participant.lastReadMessageId ?? null,
    lastReadAdvanced: true,
  };
  } finally {
    if (input.diag) {
      input.diag.mark_read_total_ms = Math.round(performance.now() - tMarkTop);
    }
  }
}

export async function updateCommunityMessengerRoomArchiveState(input: {
  userId: string;
  roomId: string;
  archived: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_not_found" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: participant, error: participantError } = await (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (participantError && !isMissingTableError(participantError)) {
      return { ok: false, error: String(participantError.message ?? "participant_lookup_failed") };
    }
    if (participant) {
      const { error } = await (sb as any)
        .from("community_messenger_participants")
        .update({ is_archived: input.archived })
        .eq("room_id", roomId)
        .eq("user_id", input.userId);
      if (!error) return { ok: true };
      if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "room_archive_update_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((item) => item.id === roomId);
  const participant = dev.participants.find((item) => item.roomId === roomId && item.userId === input.userId);
  if (!room || !participant || "user_id" in participant) return { ok: false, error: "room_not_found" };
  if ("room_type" in room) return { ok: false, error: "room_not_found" };
  participant.isArchived = input.archived;
  return { ok: true };
}


function notifyCommunityMessengerMessageRecipients(
  sb: SupabaseLike,
  args: {
    roomId: string;
    messageId: string;
    senderUserId: string;
    preview: string;
    recipientUserIds: string[];
    directKey?: string | null;
    hasMention?: boolean;
  }
): void {
  void notifyMessagePipeline(sb, {
    roomId: args.roomId,
    messageId: args.messageId,
    senderUserId: args.senderUserId,
    preview: args.preview,
    recipientUserIds: args.recipientUserIds,
    directKey: args.directKey,
    hasMention: args.hasMention,
  }).catch(() => {});
}

export async function upsertCommunityMessengerPresenceSnapshot(
  input: {
    userId: string;
    lastSeenAt?: string | null;
    lastPingAt?: string | null;
    lastActivityAt?: string | null;
    appVisibility?: string | null;
    activeRoomId?: string | null;
    /** 탭/앱 종료 비콘 — DB에서 즉시 OFFLINE 처리 */
    sessionEnd?: boolean;
  },
  /** Route Handler 세션 클라이언트 우선 — 서비스 롤 미설정 환경에서도 RLS(self)로 heartbeat 가능 */
  options?: { supabase?: SupabaseLike | null }
): Promise<{ ok: boolean; error?: string; lastSeenAt?: string | null }> {
  const userId = trimText(input.userId);
  if (!userId) return { ok: false, error: "user_required" };
  const now = nowIso();
  const lastSeenAt = trimText(input.lastSeenAt) || now;
  const sb = options?.supabase ?? getSupabaseOrNull();
  if (sb) {
    const sessionEnd = input.sessionEnd === true;
    const row = sessionEnd
      ? {
          user_id: userId,
          last_seen_at: lastSeenAt,
          updated_at: now,
          last_ping_at: null as string | null,
          presence_state_cached: "offline" satisfies CommunityMessengerPresenceState,
          app_visibility: "background",
        }
      : (() => {
          const lastPingAt = trimText(input.lastPingAt) || now;
          const lastActivityAt = trimText(input.lastActivityAt) || lastPingAt;
          const v = trimText(input.appVisibility).toLowerCase();
          const appVisibility =
            v === "foreground" || v === "background" || v === "unknown" ? v : "unknown";
          const activeRoomId = trimText(input.activeRoomId) || null;
          const derived = derivePresenceFromDbRow({
            nowMs: Date.now(),
            lastPingAtIso: lastPingAt,
            lastActivityAtIso: lastActivityAt,
            lastSeenAtIso: null,
            updatedAtIso: now,
            appVisibility,
          });
          return {
            user_id: userId,
            updated_at: now,
            last_ping_at: lastPingAt,
            last_activity_at: lastActivityAt,
            app_visibility: appVisibility,
            active_room_id: activeRoomId,
            presence_state_cached: derived,
          };
        })();
    const { error } = await (sb as any).from("community_messenger_presence_snapshots").upsert(row, { onConflict: "user_id" });
    if (!error) return { ok: true, lastSeenAt };
    if (!isMissingTableError(error)) {
      return { ok: false, error: String(error.message ?? "presence_upsert_failed") };
    }
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  return { ok: true, lastSeenAt };
}

const COMMUNITY_MESSENGER_SNAPSHOT_MESSAGE_HARD_MAX = 100;

/**
 * 거래 채팅 목록 enrich 전용 posts select.
 *
 * 운영 DB에서 `currency` 컬럼이 없을 수 있어(레거시 스키마), **currency 포함/미포함**을 순차로 시도한다.
 * currency 는 없으면 "PHP"로 폴백한다(표시용 라벨만 필요).
 */
// 최대한 많은 거래 분류 힌트를 같이 로드한다(부동산/중고차/환전/일자리/중고).
// 단, 운영 스키마에 없는 컬럼이 있을 수 있으므로 아래에서 단계적으로 폴백한다.
const TRADE_CHAT_LIST_POST_SELECT_EXTENDED_WITH_CURRENCY =
  "id, title, price, currency, images, thumbnail_url, status, seller_listing_state, trade_category_id, category_id, category, category_key, listing_type, listing_kind, meta, trade_type, user_id";
const TRADE_CHAT_LIST_POST_SELECT_EXTENDED_WITHOUT_TRADE_TYPE_WITH_CURRENCY =
  "id, title, price, currency, images, thumbnail_url, status, seller_listing_state, trade_category_id, category_id, category, category_key, listing_type, listing_kind, meta, user_id";
const TRADE_CHAT_LIST_POST_SELECT_LEGACY_WITH_CURRENCY =
  "id, title, price, currency, images, thumbnail_url, status, seller_listing_state";

const TRADE_CHAT_LIST_POST_SELECT_EXTENDED =
  "id, title, price, images, thumbnail_url, status, seller_listing_state, trade_category_id, category_id, category, category_key, listing_type, listing_kind, meta, trade_type, user_id";
const TRADE_CHAT_LIST_POST_SELECT_EXTENDED_WITHOUT_TRADE_TYPE =
  "id, title, price, images, thumbnail_url, status, seller_listing_state, trade_category_id, category_id, category, category_key, listing_type, listing_kind, meta, user_id";
const TRADE_CHAT_LIST_POST_SELECT =
  "id, title, price, images, thumbnail_url, status, seller_listing_state, trade_category_id, meta, trade_type, user_id";
const TRADE_CHAT_LIST_POST_SELECT_WITHOUT_TRADE_TYPE =
  "id, title, price, images, thumbnail_url, status, seller_listing_state, trade_category_id, meta, user_id";
const TRADE_CHAT_LIST_POST_SELECT_LEGACY =
  "id, title, price, images, thumbnail_url, status, seller_listing_state";

/**
 * **critical tier 전용 고정 select** — schema fallback probing 금지.
 *
 * 운영 DB 마이그레이션으로 보장된 컬럼만 포함:
 * - `id, title, price, status, seller_listing_state, images, thumbnail_url`: LEGACY 셋(모든 환경 보장)
 * - `trade_category_id`: posts FK, 모든 EXTENDED select 에 포함
 * - `trade_type`: 마이그레이션 `20260703140000_posts_trade_job_job_applications.sql` 의
 *   `ADD COLUMN IF NOT EXISTS trade_type text NOT NULL DEFAULT 'product'` 로 보장
 * - `user_id`: posts.user_id (작성자 FK), 모든 EXTENDED 에 포함
 *
 * 사용자 명시 critical 컬럼 셋(`meta` 제외, `images`+`thumbnail_url` 둘 다 포함 —
 * `extractPostThumbnailPathFromPostRow` 가 thumbnail_url 우선·images[0] 폴백을 쓰므로 둘 다 필요).
 *
 * **HS2 핵심**: 실패 시 fallback 진입 금지. dev warn 출력 후 빈 Map 반환.
 * 운영 DB 가 이 컬럼 셋을 만족하지 못하면 즉시 알람을 받고 마이그레이션을 점검하라.
 */
const TRADE_CHAT_LIST_POST_SELECT_CRITICAL =
  "id, title, price, images, thumbnail_url, status, seller_listing_state, trade_category_id, trade_type, user_id";

/**
 * posts 스키마는 배포·마이그레이션 상태에 따라 컬럼이 다를 수 있어
 * 위 select 문자열을 순차로 폴백한다 — **full tier 만**.
 *
 * `tradePostsFetchMs` 병목에서 "폴백 체인 자체"가 매 요청 반복되면 왕복이 누적되므로,
 * 성공한 select 문자열을 프로세스 내에 캐시해 다음 호출부터 1회 쿼리로 고정한다.
 *
 * (기능/응답 스키마 변경 없음 — select 후보 중 하나를 선택하는 로직만 캐시)
 *
 * **CONTRACT (HS2)**: critical tier(`trace?.tier === "critical"`) 는 절대 이 체인에 진입하지 않는다.
 * 진입했다면 `[home-sync-fail] critical fallback forbidden` 가 출력된다.
 */
let resolvedTradeChatListPostSelect: string | null = null;
/** 동일 프로세스에서 컬럼 부족 등으로 실패한 select 후보 — 재시도하지 않음 */
const rejectedTradeChatListPostSelects = new Set<string>();
/** cold 스키마 해석(후보 체인) 동시 1회만 — warm 다발 요청이 각각 6RTT 하지 않게 */
let tradeChatListPostSchemaGate: Promise<void> = Promise.resolve();

async function withTradeChatListPostSchemaGate<T>(run: () => Promise<T>): Promise<T> {
  const prev = tradeChatListPostSchemaGate;
  let done!: () => void;
  tradeChatListPostSchemaGate = new Promise<void>((resolve) => {
    done = resolve;
  });
  await prev;
  try {
    return await run();
  } finally {
    done();
  }
}

const TRADE_CHAT_LIST_POST_SELECT_CANDIDATES: readonly string[] = [
  TRADE_CHAT_LIST_POST_SELECT_EXTENDED_WITH_CURRENCY,
  TRADE_CHAT_LIST_POST_SELECT_EXTENDED_WITHOUT_TRADE_TYPE_WITH_CURRENCY,
  TRADE_CHAT_LIST_POST_SELECT_LEGACY_WITH_CURRENCY,
  TRADE_CHAT_LIST_POST_SELECT_EXTENDED,
  TRADE_CHAT_LIST_POST_SELECT_EXTENDED_WITHOUT_TRADE_TYPE,
  TRADE_CHAT_LIST_POST_SELECT,
  TRADE_CHAT_LIST_POST_SELECT_WITHOUT_TRADE_TYPE,
  TRADE_CHAT_LIST_POST_SELECT_LEGACY,
];

function tradeChatListPostSelectSchemaOk(res: unknown): boolean {
  const r = res as { error?: unknown; data?: unknown } | null | undefined;
  return !(r?.error && r?.data == null);
}

/** fetchTradeChatListPostRowsByIds 요청당 detail 을 trace 에 누적 — 첫 저장은 로컬 detail 참조 재사용, 이후 prev 직접 갱신 */
function mergeHomeSyncTradePostsFetchDetail(
  trace: HomeSyncTrace | undefined,
  detail: {
    postIdsCount: number;
    postIdsDedupeCount: number;
    queryCount: number;
    cacheHit: boolean;
    usedSelect: string | null;
    selectColumnCount: number;
    fallbackAttemptCount: number;
    fallbackFailedCount: number;
    queryMsTotal: number;
    schemaColdDetectWallMs?: number;
  }
) {
  if (!homeSyncTraceMeterEnabled(trace)) return;
  const tr = trace!;
  const sel = detail.usedSelect;
  const colCount =
    typeof sel === "string" && sel.trim()
      ? sel.split(",").map((s) => s.trim()).filter(Boolean).length
      : 0;
  const prev = tr.deepSteps.tradePostsFetchDetail;
  if (!prev) {
    detail.postIdsCount = ms(detail.postIdsCount);
    detail.postIdsDedupeCount = ms(detail.postIdsDedupeCount);
    detail.queryCount = ms(detail.queryCount);
    detail.selectColumnCount = ms(colCount);
    detail.fallbackAttemptCount = ms(detail.fallbackAttemptCount);
    detail.fallbackFailedCount = ms(detail.fallbackFailedCount);
    detail.queryMsTotal = ms(detail.queryMsTotal);
    if (detail.schemaColdDetectWallMs != null) {
      (detail as HomeSyncDeepStepsTradePostsFetchDetail).schemaColdDetectWallMs = ms(
        detail.schemaColdDetectWallMs
      );
    }
    tr.deepSteps.tradePostsFetchDetail = detail as HomeSyncDeepStepsTradePostsFetchDetail;
    return;
  }
  prev.postIdsCount = ms(prev.postIdsCount + detail.postIdsCount);
  prev.postIdsDedupeCount = ms(prev.postIdsDedupeCount + detail.postIdsDedupeCount);
  prev.queryCount = ms(prev.queryCount + detail.queryCount);
  prev.cacheHit = Boolean(prev.cacheHit) || detail.cacheHit;
  prev.usedSelect = sel;
  prev.selectColumnCount = ms(colCount);
  prev.fallbackAttemptCount = ms(prev.fallbackAttemptCount + detail.fallbackAttemptCount);
  prev.fallbackFailedCount = ms(prev.fallbackFailedCount + detail.fallbackFailedCount);
  prev.queryMsTotal = ms(prev.queryMsTotal + detail.queryMsTotal);
  if (detail.schemaColdDetectWallMs != null) {
    prev.schemaColdDetectWallMs = ms((prev.schemaColdDetectWallMs ?? 0) + detail.schemaColdDetectWallMs);
  }
}

/**
 * `enrichTradeRoomContextMetaFromDirectKeys` legacy Phase1 전용: 동일 pc·item_trade room 집합에 대해
 * 짧은 TTL(5~30s, 기본 20s) 스냅샷 + single-flight. RPC/SQL 의미는 해당 시점 조회 결과와 동일 스냅샷.
 * TTL: `SAMARKET_DIRECT_KEYS_BRIDGE_CACHE_TTL_MS` (밀리초, 5000~30000).
 */
const DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS = (() => {
  const raw = Number(process.env.SAMARKET_DIRECT_KEYS_BRIDGE_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 5_000 && raw <= 30_000) return Math.floor(raw);
  return 20_000;
})();

/**
 * `home_sync_direct_keys_critical_bundle` mega 스냅샷 전용 TTL(bridge 레거시 캐시와 분리).
 * 기본을 bridge(20s)보다 길게 두어 critical→full·연속 home-sync 에서 `rpc_cold` 왕복을 줄인다.
 * `SAMARKET_DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS` (밀리초, 12000~60000, 기본 28000).
 */
const DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS = (() => {
  const raw = Number(process.env.SAMARKET_DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS);
  if (Number.isFinite(raw) && raw >= 12_000 && raw <= 60_000) return Math.floor(raw);
  return 28_000;
})();

type DirectKeysBridgeRow = Record<string, unknown>;

const directKeysProductChatsByIdCache = new Map<string, { expiresAt: number; rows: DirectKeysBridgeRow[] }>();
const directKeysProductChatsByIdInflight = new Map<string, Promise<DirectKeysBridgeRow[]>>();

const directKeysItemTradeLedgerRowsCache = new Map<string, { expiresAt: number; rows: DirectKeysBridgeRow[] }>();
const directKeysItemTradeLedgerRowsInflight = new Map<string, Promise<DirectKeysBridgeRow[]>>();

const directKeysChatRoomsItemTradeFallbackCache = new Map<string, { expiresAt: number; rows: DirectKeysBridgeRow[] }>();
const directKeysChatRoomsItemTradeFallbackInflight = new Map<string, Promise<DirectKeysBridgeRow[]>>();

function directKeysStableKeyFromIds(ids: string[]): string {
  return dedupeIds(ids)
    .sort()
    .join("\x1e");
}

type MegaBundleRpcResult = { data: unknown; error: unknown; leaderRpcWallMs: number };

const directKeysMegaBundleCache = new Map<string, { expiresAt: number; raw: unknown }>();
const directKeysMegaBundleInflight = new Map<string, Promise<MegaBundleRpcResult>>();

function directKeysMegaBundleCacheKey(pcIds: string[], roomIds: string[]): string {
  return `mega:v1|pc:${directKeysStableKeyFromIds(pcIds)}|rm:${directKeysStableKeyFromIds(roomIds)}`;
}

/**
 * critical mega RPC — 짧은 TTL 스냅샷 + single-flight.
 * TTL 은 `DIRECT_KEYS_MEGA_BUNDLE_CACHE_TTL_MS`(mega 전용, bridge 레거시와 분리).
 * integrity 검증 후에만 `directKeysMegaBundleCache` 에 기록한다(호출 측).
 */
async function fetchHomeSyncMegaDirectKeysBundleCached(
  sb: any,
  pcIdsRaw: string[],
  roomIdsRaw: string[]
): Promise<HomeSyncMegaDirectKeysBundleFetchResult> {
  const t0 = performance.now();
  const pcIds = dedupeIds(pcIdsRaw);
  const roomIds = dedupeIds(roomIdsRaw);
  const cacheKey = directKeysMegaBundleCacheKey(pcIds, roomIds);
  const now = Date.now();
  pruneByExpiresAtAndMaxSize(directKeysMegaBundleCache, now, 192);
  const megaMapSyncMs = performance.now() - t0;
  const hit = directKeysMegaBundleCache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    const lookupWallMs = performance.now() - t0;
    return {
      data: hit.raw,
      error: null,
      leaderRpcWallMs: 0,
      lookupWallMs,
      megaMapSyncMs,
      megaInflightOrRpcWaitMs: Math.max(0, lookupWallMs - megaMapSyncMs),
      cacheReason: "row_cache_hit",
      singleflightJoinCount: 0,
      cacheKey,
    };
  }
  const infl = directKeysMegaBundleInflight.get(cacheKey);
  if (infl) {
    const tWait = performance.now();
    const r = await infl;
    const lookupWallMs = performance.now() - t0;
    return {
      data: r.data,
      error: r.error,
      leaderRpcWallMs: r.leaderRpcWallMs,
      lookupWallMs,
      megaMapSyncMs,
      megaInflightOrRpcWaitMs: Math.max(0, lookupWallMs - megaMapSyncMs),
      cacheReason: "row_cache_singleflight_join",
      singleflightJoinCount: 1,
      cacheKey,
    };
  }
  const flight = (async (): Promise<MegaBundleRpcResult> => {
    const tr0 = performance.now();
    try {
      const { data, error } = await sb.rpc("home_sync_direct_keys_critical_bundle", {
        p_item_room_ids: roomIds,
        p_trade_pc_ids: pcIds,
      });
      return { data, error: error ?? null, leaderRpcWallMs: performance.now() - tr0 };
    } finally {
      directKeysMegaBundleInflight.delete(cacheKey);
    }
  })();
  directKeysMegaBundleInflight.set(cacheKey, flight);
  const r = await flight;
  const lookupWallMs = performance.now() - t0;
  return {
    data: r.data,
    error: r.error,
    leaderRpcWallMs: r.leaderRpcWallMs,
    lookupWallMs,
    megaMapSyncMs,
    megaInflightOrRpcWaitMs: Math.max(0, lookupWallMs - megaMapSyncMs),
    cacheReason: "rpc_cold",
    singleflightJoinCount: 0,
    cacheKey,
  };
}

async function fetchDirectKeysProductChatsByInIdsCached(
  sb: any,
  pcIdsRaw: string[],
  diag: { cacheHit: boolean; singleflight: boolean }
): Promise<DirectKeysBridgeRow[]> {
  const ids = dedupeIds(pcIdsRaw);
  if (!ids.length) return [];
  const now = Date.now();
  pruneByExpiresAtAndMaxSize(directKeysProductChatsByIdCache, now, 512);
  const key = directKeysStableKeyFromIds(ids);
  const reqCached = peekBridgeProductChatsRequest(key);
  if (reqCached) {
    diag.cacheHit = true;
    return reqCached as DirectKeysBridgeRow[];
  }
  const cached = directKeysProductChatsByIdCache.get(key);
  if (cached && cached.expiresAt > now) {
    diag.cacheHit = true;
    setBridgeProductChatsRequest(key, cached.rows);
    return cached.rows;
  }
  const wait = directKeysProductChatsByIdInflight.get(key);
  if (wait) {
    diag.singleflight = true;
    return wait;
  }
  const inflight = (async () => {
    try {
      const { data: pcs } = await sb
        .from("product_chats")
        .select("id, post_id, seller_id, buyer_id")
        .in("id", ids);
      const rows = (pcs ?? []) as DirectKeysBridgeRow[];
      directKeysProductChatsByIdCache.set(key, {
        expiresAt: Date.now() + DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS,
        rows,
      });
      setBridgeProductChatsRequest(key, rows);
      return rows;
    } finally {
      directKeysProductChatsByIdInflight.delete(key);
    }
  })();
  directKeysProductChatsByIdInflight.set(key, inflight);
  return inflight;
}

async function fetchDirectKeysItemTradeLedgerRowsCached(
  sb: any,
  roomIdsRaw: string[],
  diag: { cacheHit: boolean; singleflight: boolean }
): Promise<DirectKeysBridgeRow[]> {
  const roomIds = dedupeIds(roomIdsRaw);
  if (!roomIds.length) return [];
  const now = Date.now();
  pruneByExpiresAtAndMaxSize(directKeysItemTradeLedgerRowsCache, now, 512);
  const key = directKeysStableKeyFromIds(roomIds);
  const reqCached = peekBridgeItemTradeLedgerRequest(key);
  if (reqCached) {
    diag.cacheHit = true;
    return reqCached as DirectKeysBridgeRow[];
  }
  const cached = directKeysItemTradeLedgerRowsCache.get(key);
  if (cached && cached.expiresAt > now) {
    diag.cacheHit = true;
    setBridgeItemTradeLedgerRequest(key, cached.rows);
    return cached.rows;
  }
  const wait = directKeysItemTradeLedgerRowsInflight.get(key);
  if (wait) {
    diag.singleflight = true;
    return wait;
  }
  const inflight = (async () => {
    try {
      const { data: bundleRows, error: bundleErr } = await sb.rpc("home_sync_direct_keys_item_trade_rows", {
        p_room_ids: roomIds,
      });
      if (bundleErr) throw bundleErr;
      const rows = (bundleRows ?? []) as DirectKeysBridgeRow[];
      directKeysItemTradeLedgerRowsCache.set(key, {
        expiresAt: Date.now() + DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS,
        rows,
      });
      setBridgeItemTradeLedgerRequest(key, rows);
      return rows;
    } finally {
      directKeysItemTradeLedgerRowsInflight.delete(key);
    }
  })();
  directKeysItemTradeLedgerRowsInflight.set(key, inflight);
  return inflight;
}

async function fetchDirectKeysChatRoomsItemTradeFallbackCached(
  sb: any,
  roomIdsRaw: string[],
  diag: { cacheHit: boolean; singleflight: boolean }
): Promise<DirectKeysBridgeRow[]> {
  const roomIds = dedupeIds(roomIdsRaw);
  if (!roomIds.length) return [];
  const now = Date.now();
  pruneByExpiresAtAndMaxSize(directKeysChatRoomsItemTradeFallbackCache, now, 512);
  const key = directKeysStableKeyFromIds(roomIds);
  const reqCached = peekBridgeChatRoomsFallbackRequest(key);
  if (reqCached) {
    diag.cacheHit = true;
    return reqCached as DirectKeysBridgeRow[];
  }
  const cached = directKeysChatRoomsItemTradeFallbackCache.get(key);
  if (cached && cached.expiresAt > now) {
    diag.cacheHit = true;
    setBridgeChatRoomsFallbackRequest(key, cached.rows);
    return cached.rows;
  }
  const wait = directKeysChatRoomsItemTradeFallbackInflight.get(key);
  if (wait) {
    diag.singleflight = true;
    return wait;
  }
  const inflight = (async () => {
    try {
      const { data: crs } = await sb
        .from("chat_rooms")
        .select("id, item_id, seller_id, buyer_id")
        .eq("room_type", "item_trade")
        .in("id", roomIds);
      const rows = (crs ?? []) as DirectKeysBridgeRow[];
      directKeysChatRoomsItemTradeFallbackCache.set(key, {
        expiresAt: Date.now() + DIRECT_KEYS_BRIDGE_SNAPSHOT_TTL_MS,
        rows,
      });
      setBridgeChatRoomsFallbackRequest(key, rows);
      return rows;
    } finally {
      directKeysChatRoomsItemTradeFallbackInflight.delete(key);
    }
  })();
  directKeysChatRoomsItemTradeFallbackInflight.set(key, inflight);
  return inflight;
}

const TRADE_CHAT_CATEGORY_META_CACHE_TTL_MS = 10 * 60_000;
/** trade-meta seller 라벨 attach — `fetchProfilesByIds` row TTL override */
const TRADE_META_SELLER_PROFILE_ROW_TTL_MS = 30_000;
/** 동일 in(id) 배치 결과 재사용 — 20s (bridge mega TTL과 동급, 장기 스테일 금지) */
const TRADE_CATEGORY_BATCH_SNAPSHOT_TTL_MS = 20_000;
// key: `${table}:${id}` (categories / trade_categories) — 같은 id 충돌 방지
const tradeChatCategoryMetaCache = new Map<string, { expiresAt: number; meta: TradeChatCategoryMetaLike }>();
const tradeCategoryBatchRowSnapshotCache = new Map<string, { expiresAt: number; rows: unknown[] }>();
/** 동일 (table, sorted id set) in(...) RTT 를 cross-request·병렬 요청에서 1회로 합친다 — 응답 의미 동일 */
const tradeCategoryTableFetchInflight = new Map<string, Promise<boolean>>();
const tradeChatCategorySelectByTable = new Map<"categories" | "trade_categories", string>();

function tradeCategoryWriteModuleSnapshotFromMerged(
  table: "categories" | "trade_categories",
  stableIds: string[],
  mergedByCategoryKey: Map<string, TradeChatCategoryMetaLike>
): void {
  const exp = Date.now() + TRADE_CHAT_CATEGORY_META_CACHE_TTL_MS;
  for (const id of stableIds) {
    const meta = mergedByCategoryKey.get(id);
    if (!meta) continue;
    const k = table === "trade_categories" ? `trade_categories:${id}` : `categories:${id}`;
    tradeChatCategoryMetaCache.set(k, { expiresAt: exp, meta });
    setTradeMetaCategoryModule(table, id, meta);
  }
}

function tradeCategoryBatchSnapshotKey(table: "categories" | "trade_categories", stableIds: string[]): string {
  return `${table}:batch:${stableIds.join("\x1e")}`;
}

function tradeCategoryMetaRowLooksUsable(meta: TradeChatCategoryMetaLike | undefined): boolean {
  if (!meta) return false;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  const label = typeof meta.label === "string" ? meta.label.trim() : "";
  const slug = typeof meta.slug === "string" ? meta.slug.trim() : "";
  return Boolean(name || label || slug);
}

function tradeCategoryStoreBatchRowSnapshot(
  table: "categories" | "trade_categories",
  stableIds: string[],
  rows: unknown
): void {
  if (!Array.isArray(rows) || !stableIds.length) return;
  const key = tradeCategoryBatchSnapshotKey(table, stableIds);
  tradeCategoryBatchRowSnapshotCache.set(key, {
    expiresAt: Date.now() + TRADE_CATEGORY_BATCH_SNAPSHOT_TTL_MS,
    rows: [...rows],
  });
  pruneByExpiresAtAndMaxSize(tradeCategoryBatchRowSnapshotCache, Date.now(), 384);
}

async function fetchTradeChatListPostRowsByIds(
  sb: any,
  postIds: string[],
  trace?: HomeSyncTrace
): Promise<Map<string, Record<string, unknown>>> {
  const deepSteps = homeSyncTraceMeterEnabled(trace);
  const ids = dedupeIds(postIds);
  if (!ids.length) return new Map();
  const detail = deepSteps
    ? {
        postIdsCount: ms(postIds.length),
        postIdsDedupeCount: ms(ids.length),
        queryCount: 0,
        cacheHit: false,
        usedSelect: null as string | null,
        selectColumnCount: 0,
        fallbackAttemptCount: 0,
        fallbackFailedCount: 0,
        queryMsTotal: 0,
      }
    : null;
  // Prefer currency if available; fall back to legacy schema without it.
  const trySelect = async (select: string) => {
    const t0 = deepSteps ? performance.now() : 0;
    const res = await (sb as any).from(POSTS_TABLE_READ).select(select).in("id", ids);
    if (detail) {
      detail.queryCount += 1;
      detail.queryMsTotal += deepSteps ? performance.now() - t0 : 0;
    }
    return res;
  };

  /**
   * **HS2 critical tier path** — fixed select 1회만, fallback probing 절대 금지.
   *
   * `route.ts` 가 `tier === "critical"` 일 때 항상 `trace.tier = "critical"` 를 채워준다(prod 포함).
   * 여기서 `trace?.tier === "critical"` 면 schema 후보 체인을 건너뛰고 `_CRITICAL` select 1회만 시도.
   *
   * 실패 시:
   *   - dev console.warn (`[home-sync-fail] critical fixed select failed ...`) 로 어떤 컬럼이
   *     누락됐는지 즉시 노출.
   *   - 빈 Map 반환(또는 부분 데이터). full tier fallback 으로 "조용히 보강" 하지 않는다.
   *     운영 DB schema 가 이 컬럼 셋을 만족하지 못하면 마이그레이션 누락이므로 알람 대상.
   *   - critical 첫 시도 실패해도 fallback chain 진입 금지 (사용자 절대 원칙 1·2·3·4·7·8).
   */
  if (trace?.tier === "critical") {
    const res = await trySelect(TRADE_CHAT_LIST_POST_SELECT_CRITICAL);
    const ok = tradeChatListPostSelectSchemaOk(res);
    if (detail) {
      detail.cacheHit = false;
      detail.usedSelect = TRADE_CHAT_LIST_POST_SELECT_CRITICAL;
      // critical 은 정의상 fallbackAttemptCount/fallbackFailedCount 가 0 이어야 한다.
    }
    if (deepSteps && trace && detail) mergeHomeSyncTradePostsFetchDetail(trace, detail);
    if (!ok) {
      const err = (res as { error?: { message?: string; code?: string } } | null)?.error;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[home-sync-fail] critical fixed select failed — schema column mismatch on posts",
          {
            select: TRADE_CHAT_LIST_POST_SELECT_CRITICAL,
            postIds: ids.length,
            pgCode: err?.code ?? null,
            message: err?.message ?? null,
            hint: "Check DB migrations. Critical tier does not silently enrich via fallback.",
          }
        );
      }
      return new Map<string, Record<string, unknown>>();
    }
    return new Map<string, Record<string, unknown>>(
      ((res.data ?? []) as Record<string, unknown>[]).map((p) => [trimText(p.id), p])
    );
  }

  // Warm path: 프로세스에 고정된 스키마면 게이트 밖 단일 RTT (full tier 다발 호출 핵심)
  if (resolvedTradeChatListPostSelect) {
    const res = await trySelect(resolvedTradeChatListPostSelect);
    if (tradeChatListPostSelectSchemaOk(res)) {
      if (detail) {
        detail.cacheHit = true;
        detail.usedSelect = resolvedTradeChatListPostSelect;
      }
      if (deepSteps && trace && detail) mergeHomeSyncTradePostsFetchDetail(trace, detail);
      return new Map<string, Record<string, unknown>>(
        ((res.data ?? []) as Record<string, unknown>[]).map((p) => [trimText(p.id), p])
      );
    }
    resolvedTradeChatListPostSelect = null;
  }

  /**
   * **HS2 invariant**: critical tier(`trace?.tier === "critical"`) 는 위 critical 분기에서
   * 반드시 return 됐어야 한다. 여기 도달했다면 critical 가 아님 — TS narrow 로 자명.
   * (별도 dev assertion 불필요 — 타입 시스템이 이미 보장)
   */
  const coldPack = await withTradeChatListPostSchemaGate(async () => {
    if (resolvedTradeChatListPostSelect) {
      const hit = await trySelect(resolvedTradeChatListPostSelect);
      if (tradeChatListPostSelectSchemaOk(hit)) {
        return {
          rows: (hit.data ?? []) as Record<string, unknown>[],
          usedSel: resolvedTradeChatListPostSelect as string,
          schemaColdWallMs: 0,
        };
      }
      resolvedTradeChatListPostSelect = null;
    }

    let lastRows: Record<string, unknown>[] = [];
    const tCand = deepSteps && detail ? performance.now() : 0;
    for (const sel of TRADE_CHAT_LIST_POST_SELECT_CANDIDATES) {
      if (rejectedTradeChatListPostSelects.has(sel)) continue;

      if (detail) detail.fallbackAttemptCount += 1;
      const attempt = await trySelect(sel);
      lastRows = ((attempt.data ?? []) as Record<string, unknown>[]) ?? [];
      if (tradeChatListPostSelectSchemaOk(attempt)) {
        resolvedTradeChatListPostSelect = sel;
        return {
          rows: lastRows,
          usedSel: sel,
          schemaColdWallMs: tCand ? performance.now() - tCand : 0,
        };
      }
      rejectedTradeChatListPostSelects.add(sel);
      if (detail) detail.fallbackFailedCount += 1;
    }

    return {
      rows: lastRows,
      usedSel: null as string | null,
      schemaColdWallMs: tCand ? performance.now() - tCand : 0,
    };
  });

  if (detail) {
    detail.cacheHit = Boolean(coldPack.usedSel);
    if (coldPack.usedSel) detail.usedSelect = coldPack.usedSel;
    if (coldPack.schemaColdWallMs > 0) {
      (detail as { schemaColdDetectWallMs?: number }).schemaColdDetectWallMs = coldPack.schemaColdWallMs;
    }
  }
  if (deepSteps && trace && detail) mergeHomeSyncTradePostsFetchDetail(trace, detail);

  return new Map<string, Record<string, unknown>>(
    coldPack.rows.map((p) => [trimText(p.id), p])
  );
}

function appendHomeSyncTradeMetaBuildFromPostDetail(
  trace: HomeSyncTrace | undefined,
  delta: HomeSyncDeepStepsTradeMetaBuildFromPostDetail
) {
  if (!homeSyncTraceMeterEnabled(trace)) return;
  const tr = trace!;
  const prev = tr.deepSteps.tradeMetaBuildFromPostDetail;
  if (!prev) {
    tr.deepSteps.tradeMetaBuildFromPostDetail = delta;
    return;
  }
  prev.calls = ms(prev.calls + delta.calls);
  prev.productCategoryDisplayCpuMs = ms(prev.productCategoryDisplayCpuMs + delta.productCategoryDisplayCpuMs);
  prev.headlineCpuMs = ms(prev.headlineCpuMs + delta.headlineCpuMs);
  prev.categoryMenuLabelCpuMs = ms(prev.categoryMenuLabelCpuMs + delta.categoryMenuLabelCpuMs);
  prev.messengerSnapshotCpuMs = ms(prev.messengerSnapshotCpuMs + delta.messengerSnapshotCpuMs);
}

function buildTradeMessengerListContextMetaFromLoadedPost(args: {
  productChatId: string;
  postId: string;
  post: Record<string, unknown> | null | undefined;
  price: number | null;
  currency: string;
  role: "seller" | "buyer";
  categoryById: Map<string, TradeChatCategoryMetaLike>;
  sellerListingStateRaw?: unknown;
  postStatus?: string | null;
  thumbnailUrl?: string | null;
  tradeFlowStatus?: string | null;
  sellerDisplayName?: string | null;
  /** dev home-sync deep-steps: 목록 enrich 에서만 전달 — 빌더 내부 CPU 분해 누적 */
  tradeMetaBuildTrace?: HomeSyncTrace;
}): CommunityMessengerRoomContextMetaV1 {
  const post = args.post;
  const trace = args.tradeMetaBuildTrace;

  const toSnap = (pcl: string | null | undefined, productTitle: string, categoryMenuLabel: string) =>
    buildMessengerContextMetaFromProductChatSnapshot({
      productChatId: args.productChatId,
      postId: args.postId,
      productTitle,
      price: args.price,
      currency: args.currency,
      role: args.role,
      sellerListingStateRaw: args.sellerListingStateRaw,
      postStatus: args.postStatus ?? null,
      thumbnailUrl: args.thumbnailUrl,
      tradeFlowStatus: args.tradeFlowStatus,
      categoryMenuLabel,
      productCategoryLabel: pcl ?? undefined,
      sellerDisplayName: args.sellerDisplayName,
      listDisplayStringsAlreadyNormalized: true,
    });

  if (!homeSyncTraceMeterEnabled(trace)) {
    const pcl = tradeChatProductCategoryDisplayName(post, args.categoryById);
    const productTitle = tradePostHeadlineForMessengerList(post) || cmTradePostTitleFallback();
    const categoryMenuLabel = tradeChatCategoryMenuLabelForPost(post, args.categoryById);
    return toSnap(pcl, productTitle, categoryMenuLabel);
  }

  let t = performance.now();
  const pcl = tradeChatProductCategoryDisplayName(post, args.categoryById);
  const dProd = performance.now() - t;
  t = performance.now();
  const productTitle = tradePostHeadlineForMessengerList(post) || cmTradePostTitleFallback();
  const dHead = performance.now() - t;
  t = performance.now();
  const categoryMenuLabel = tradeChatCategoryMenuLabelForPost(post, args.categoryById);
  const dMenu = performance.now() - t;
  t = performance.now();
  const meta = toSnap(pcl, productTitle, categoryMenuLabel);
  const dSnap = performance.now() - t;
  appendHomeSyncTradeMetaBuildFromPostDetail(trace, {
    calls: 1,
    productCategoryDisplayCpuMs: ms(dProd),
    headlineCpuMs: ms(dHead),
    categoryMenuLabelCpuMs: ms(dMenu),
    messengerSnapshotCpuMs: ms(dSnap),
  });
  return meta;
}

function appendHomeSyncCategoryFetchDetail(trace: HomeSyncTrace | undefined, delta: HomeSyncDeepStepsCategoryFetchDetail) {
  if (!homeSyncTraceMeterEnabled(trace)) return;
  const tr = trace!;
  const prev = tr.deepSteps.categoryFetchDetail;
  if (!prev) {
    tr.deepSteps.categoryFetchDetail = delta;
    return;
  }
  prev.categoryCacheHitCount = ms(prev.categoryCacheHitCount + delta.categoryCacheHitCount);
  prev.categoryCacheMissCount = ms(prev.categoryCacheMissCount + delta.categoryCacheMissCount);
  prev.tradeCategoryCacheHitCount = ms(prev.tradeCategoryCacheHitCount + delta.tradeCategoryCacheHitCount);
  prev.tradeCategoryCacheMissCount = ms(prev.tradeCategoryCacheMissCount + delta.tradeCategoryCacheMissCount);
  prev.categoriesQueryCount = ms(prev.categoriesQueryCount + delta.categoriesQueryCount);
  prev.tradeCategoriesQueryCount = ms(prev.tradeCategoriesQueryCount + delta.tradeCategoriesQueryCount);
  prev.categoriesIdsCount = ms(prev.categoriesIdsCount + delta.categoriesIdsCount);
  prev.tradeCategoriesIdsCount = ms(prev.tradeCategoriesIdsCount + delta.tradeCategoriesIdsCount);
  prev.selectFallbackAttemptCount = ms(prev.selectFallbackAttemptCount + delta.selectFallbackAttemptCount);
  prev.selectFallbackFailedCount = ms(prev.selectFallbackFailedCount + delta.selectFallbackFailedCount);
  prev.queryMsByTable.categoriesMs = ms(prev.queryMsByTable.categoriesMs + delta.queryMsByTable.categoriesMs);
  prev.queryMsByTable.tradeCategoriesMs = ms(
    prev.queryMsByTable.tradeCategoriesMs + delta.queryMsByTable.tradeCategoriesMs
  );
  if (delta.category_singleflight_join_count != null) {
    prev.category_singleflight_join_count = ms(
      (prev.category_singleflight_join_count ?? 0) + delta.category_singleflight_join_count
    );
  }
  if (delta.category_duplicate_fetch_count != null) {
    prev.category_duplicate_fetch_count = ms(
      (prev.category_duplicate_fetch_count ?? 0) + delta.category_duplicate_fetch_count
    );
  }
  if (delta.category_cache_lookup_ms != null) {
    prev.category_cache_lookup_ms = ms((prev.category_cache_lookup_ms ?? 0) + delta.category_cache_lookup_ms);
  }
  if (delta.category_cache_store_ms != null) {
    prev.category_cache_store_ms = ms((prev.category_cache_store_ms ?? 0) + delta.category_cache_store_ms);
  }
  if (delta.category_cache_key != null) prev.category_cache_key = delta.category_cache_key;
  if (delta.normalized_category_cache_key != null) {
    prev.normalized_category_cache_key = delta.normalized_category_cache_key;
  }
  if (delta.category_singleflight_key != null) prev.category_singleflight_key = delta.category_singleflight_key;
  if (delta.category_cache_reason != null) prev.category_cache_reason = delta.category_cache_reason;
  if (delta.category_cache_hit_after != null) {
    prev.category_cache_hit_after = Boolean(prev.category_cache_hit_after) || Boolean(delta.category_cache_hit_after);
  }
  if (delta.category_singleflight_hit != null) {
    prev.category_singleflight_hit = Boolean(prev.category_singleflight_hit) || Boolean(delta.category_singleflight_hit);
  }
  if (delta.category_lookup_reuse_hit != null) {
    prev.category_lookup_reuse_hit = Boolean(prev.category_lookup_reuse_hit) || Boolean(delta.category_lookup_reuse_hit);
  }
  if (delta.category_duplicate_attach_count != null) {
    prev.category_duplicate_attach_count = ms(
      (prev.category_duplicate_attach_count ?? 0) + delta.category_duplicate_attach_count
    );
  }
  if (delta.category_normalize_cpu_ms != null) {
    prev.category_normalize_cpu_ms = ms((prev.category_normalize_cpu_ms ?? 0) + delta.category_normalize_cpu_ms);
  }
  if (delta.category_lookup_wall_ms != null) {
    prev.category_lookup_wall_ms = ms((prev.category_lookup_wall_ms ?? 0) + delta.category_lookup_wall_ms);
  }
  if (delta.category_query_wall_ms != null) {
    prev.category_query_wall_ms = ms((prev.category_query_wall_ms ?? 0) + delta.category_query_wall_ms);
  }
  if (delta.category_postgrest_wait_ms != null) {
    prev.category_postgrest_wait_ms = ms((prev.category_postgrest_wait_ms ?? 0) + delta.category_postgrest_wait_ms);
  }
  if (delta.category_network_wait_ms != null) {
    prev.category_network_wait_ms = ms((prev.category_network_wait_ms ?? 0) + delta.category_network_wait_ms);
  }
  if (delta.category_attach_cpu_ms != null) {
    prev.category_attach_cpu_ms = ms((prev.category_attach_cpu_ms ?? 0) + delta.category_attach_cpu_ms);
  }
  if (delta.category_serialize_ms != null) {
    prev.category_serialize_ms = ms((prev.category_serialize_ms ?? 0) + delta.category_serialize_ms);
  }
  if (delta.category_request_local_trade_skips != null) {
    prev.category_request_local_trade_skips = ms(
      (prev.category_request_local_trade_skips ?? 0) + delta.category_request_local_trade_skips
    );
  }
  if (delta.category_request_local_legacy_skips != null) {
    prev.category_request_local_legacy_skips = ms(
      (prev.category_request_local_legacy_skips ?? 0) + delta.category_request_local_legacy_skips
    );
  }
  if (delta.category_request_local_hit != null) {
    prev.category_request_local_hit = Boolean(prev.category_request_local_hit) || Boolean(delta.category_request_local_hit);
  }
  if (delta.category_process_cache_hit != null) {
    prev.category_process_cache_hit = Boolean(prev.category_process_cache_hit) || Boolean(delta.category_process_cache_hit);
  }
  if (delta.category_cache_store_reason != null) prev.category_cache_store_reason = delta.category_cache_store_reason;
}

/**
 * home-sync trade enrich: 요청 단위로 trade_categories / categories 행을 합치고,
 * 동일 id 재조회를 막는다. 모듈 TTL(`tradeChatCategoryMetaCache`)과 함께 쓴다.
 */
class TradeCategoryMetaRequestLoader {
  private readonly mergedByCategoryKey = new Map<string, TradeChatCategoryMetaLike>();
  private readonly tradeResolved = new Set<string>();
  private readonly legacyResolved = new Set<string>();
  /** 직전 `ensureForPosts` 에서 categories/trade_categories in(...) RTT 가 있었는지 — direct_keys 계측 */
  lastEnsureCategoryUsedDb = false;
  /** 한 요청 내 `fetchTable` singleflight 조인 횟수(누적 append 용) */
  private _categoryEnsureSfJoins = 0;
  /** singleflight 조인으로 리더 fetch 를 건너뛴 id 슬롯 수 근사 */
  private _categoryEnsureDupFetchSlots = 0;

  constructor(
    private readonly sb: any,
    private readonly trace: HomeSyncTrace | undefined,
    private readonly fetchMode: "full" | "fallback_only",
    private readonly accumulateTraceDetail: boolean
  ) {}

  getMergedMap(): Map<string, TradeChatCategoryMetaLike> {
    return this.mergedByCategoryKey;
  }

  /** 직전 `ensureForPosts` 종료 시점의 `fetchTable` singleflight 조인 횟수(진단) */
  peekCategoryTableSingleflightJoins(): number {
    return this._categoryEnsureSfJoins;
  }

  async ensureForPosts(posts: Iterable<Record<string, unknown>>): Promise<void> {
    this.lastEnsureCategoryUsedDb = false;
    this._categoryEnsureSfJoins = 0;
    this._categoryEnsureDupFetchSlots = 0;
    let categoryInflightJoinWaitMs = 0;
    let categoryBatchSnapApplyMs = 0;
    let categoryMergeAttachCpuMs = 0;
    const deepSteps = homeSyncTraceMeterEnabled(this.trace);
    const postList = [...posts];
    const tCatNorm0 = deepSteps ? performance.now() : 0;
    const canonicalIds = dedupeIds(postList.map((post) => tradePostCategoryId(post)));
    const categoryIdNormalizeCpuMs = deepSteps ? performance.now() - tCatNorm0 : 0;
    if (!canonicalIds.length) return;

    if (this.fetchMode === "fallback_only") {
      return;
    }

    const counters = deepSteps
      ? {
          categoryCacheHitCount: 0,
          categoryCacheMissCount: 0,
          tradeCategoryCacheHitCount: 0,
          tradeCategoryCacheMissCount: 0,
          categoriesQueryCount: 0,
          tradeCategoriesQueryCount: 0,
          categoriesIdsCount: 0,
          tradeCategoriesIdsCount: 0,
          selectFallbackAttemptCount: 0,
          selectFallbackFailedCount: 0,
          queryMsByTable: {
            categoriesMs: 0,
            tradeCategoriesMs: 0,
          },
        }
      : null;

    const now = Date.now();
    pruneByExpiresAtAndMaxSize(tradeChatCategoryMetaCache, now, 2000);
    pruneByExpiresAtAndMaxSize(tradeCategoryBatchRowSnapshotCache, now, 512);
    const tCatLookupWallStart = deepSteps ? performance.now() : 0;

    const tradeIds = dedupeIds(
      postList
        .map((p) =>
          typeof (p as { trade_category_id?: unknown }).trade_category_id === "string"
            ? String((p as { trade_category_id?: unknown }).trade_category_id).trim()
            : ""
        )
        .filter(Boolean)
    );
    const categoryIdsOnly = dedupeIds(
      postList
        .filter(
          (p) =>
            !(
              typeof (p as { trade_category_id?: unknown }).trade_category_id === "string" &&
              String((p as { trade_category_id?: unknown }).trade_category_id).trim()
            )
        )
        .map((p) =>
          typeof (p as { category_id?: unknown }).category_id === "string"
            ? String((p as { category_id?: unknown }).category_id).trim()
            : ""
        )
        .filter(Boolean)
    );

    if (counters) {
      counters.tradeCategoriesIdsCount = ms(tradeIds.length);
      counters.categoriesIdsCount = ms(categoryIdsOnly.length);
    }

    let categoryRequestLocalTradeSkips = 0;
    const missingTradeIds: string[] = [];
    for (const id of tradeIds) {
      if (this.tradeResolved.has(id)) {
        categoryRequestLocalTradeSkips += 1;
        continue;
      }
      const moduleMeta = peekTradeMetaCategoryModule("trade_categories", id);
      if (moduleMeta) {
        if (counters) counters.tradeCategoryCacheHitCount += 1;
        this.mergedByCategoryKey.set(id, moduleMeta);
        this.tradeResolved.add(id);
        continue;
      }
      const hit = tradeChatCategoryMetaCache.get(`trade_categories:${id}`);
      if (hit && hit.expiresAt > now) {
        if (counters) counters.tradeCategoryCacheHitCount += 1;
        this.mergedByCategoryKey.set(id, hit.meta);
        setTradeMetaCategoryModule("trade_categories", id, hit.meta);
        this.tradeResolved.add(id);
      } else {
        if (counters) counters.tradeCategoryCacheMissCount += 1;
        missingTradeIds.push(id);
      }
    }

    let categoryRequestLocalLegacySkips = 0;
    const missingCategoryIds: string[] = [];
    for (const id of categoryIdsOnly) {
      if (this.legacyResolved.has(id)) {
        categoryRequestLocalLegacySkips += 1;
        continue;
      }
      const moduleMeta = peekTradeMetaCategoryModule("categories", id);
      if (moduleMeta) {
        if (counters) counters.categoryCacheHitCount += 1;
        this.mergedByCategoryKey.set(id, moduleMeta);
        this.legacyResolved.add(id);
        continue;
      }
      const hit = tradeChatCategoryMetaCache.get(`categories:${id}`);
      if (hit && hit.expiresAt > now) {
        if (counters) counters.categoryCacheHitCount += 1;
        this.mergedByCategoryKey.set(id, hit.meta);
        setTradeMetaCategoryModule("categories", id, hit.meta);
        this.legacyResolved.add(id);
      } else {
        if (counters) counters.categoryCacheMissCount += 1;
        missingCategoryIds.push(id);
      }
    }

    const mergeRows = (rows: unknown) => {
      const tMr = deepSteps ? performance.now() : 0;
      if (!Array.isArray(rows)) return;
      for (const row of rows as Record<string, unknown>[]) {
        const id = trimText(row.id);
        if (!id) continue;
        const prev = this.mergedByCategoryKey.get(id) ?? {};
        this.mergedByCategoryKey.set(id, {
          ...prev,
          name: trimText(row.name) || prev.name,
          label: trimText((row as { label?: unknown }).label) || (prev as { label?: unknown }).label,
          key: trimText((row as { key?: unknown }).key) || (prev as { key?: unknown }).key,
          slug: trimText(row.slug) || prev.slug,
          icon_key: trimText(row.icon_key) || trimText(row.icon) || prev.icon_key,
          icon: trimText(row.icon) || prev.icon,
        });
      }
      if (deepSteps) categoryMergeAttachCpuMs += performance.now() - tMr;
    };

    const missingTradeBeforeDb = missingTradeIds.slice();
    const missingCategoryBeforeDb = missingCategoryIds.slice();

    const applyBatchSnapshotForMissing = (
      table: "categories" | "trade_categories",
      missing: string[],
      resolved: Set<string>,
      mode: "trade" | "legacy"
    ): string[] => {
      if (!missing.length) return missing;
      const stable = [...missing].sort((a, b) => a.localeCompare(b));
      const snap = tradeCategoryBatchRowSnapshotCache.get(tradeCategoryBatchSnapshotKey(table, stable));
      if (!snap || snap.expiresAt <= now || !Array.isArray(snap.rows) || !snap.rows.length) return missing;
      const tSnap = performance.now();
      mergeRows(snap.rows);
      tradeCategoryWriteModuleSnapshotFromMerged(table, stable, this.mergedByCategoryKey);
      const still: string[] = [];
      let recovered = 0;
      for (const id of missing) {
        const meta = this.mergedByCategoryKey.get(id);
        if (tradeCategoryMetaRowLooksUsable(meta)) {
          recovered += 1;
          resolved.add(id);
        } else {
          still.push(id);
        }
      }
      if (counters && recovered > 0) {
        categoryBatchSnapApplyMs += performance.now() - tSnap;
        if (mode === "trade") {
          counters.tradeCategoryCacheMissCount = Math.max(0, counters.tradeCategoryCacheMissCount - recovered);
          counters.tradeCategoryCacheHitCount += recovered;
        } else {
          counters.categoryCacheMissCount = Math.max(0, counters.categoryCacheMissCount - recovered);
          counters.categoryCacheHitCount += recovered;
        }
      }
      return still;
    };

    const missingTradeFin = applyBatchSnapshotForMissing(
      "trade_categories",
      missingTradeIds,
      this.tradeResolved,
      "trade"
    );
    const missingCategoryFin = applyBatchSnapshotForMissing(
      "categories",
      missingCategoryIds,
      this.legacyResolved,
      "legacy"
    );

    const categoryLookupWallMs = deepSteps && tCatLookupWallStart > 0 ? performance.now() - tCatLookupWallStart : 0;

    const fetchTable = async (table: "categories" | "trade_categories", idsForTable: string[]): Promise<boolean> => {
      const stableIds = [...dedupeIds(idsForTable)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      if (!stableIds.length) return false;

      const normalizedInflightKey = `${table}:${stableIds.join("\x1e")}`;

      const existing = tradeCategoryTableFetchInflight.get(normalizedInflightKey);
      if (existing) {
        this._categoryEnsureSfJoins += 1;
        this._categoryEnsureDupFetchSlots += stableIds.length;
        const tJoinWait = deepSteps ? performance.now() : 0;
        await existing;
        if (deepSteps) categoryInflightJoinWaitMs += performance.now() - tJoinWait;
        const nowJoin = Date.now();
        for (const id of stableIds) {
          if (table === "trade_categories") {
            if (this.tradeResolved.has(id)) continue;
            const hit = tradeChatCategoryMetaCache.get(`trade_categories:${id}`);
            if (hit && hit.expiresAt > nowJoin) {
              if (counters) counters.tradeCategoryCacheHitCount += 1;
              this.mergedByCategoryKey.set(id, hit.meta);
              this.tradeResolved.add(id);
            }
          } else {
            if (this.legacyResolved.has(id)) continue;
            const hit = tradeChatCategoryMetaCache.get(`categories:${id}`);
            if (hit && hit.expiresAt > nowJoin) {
              if (counters) counters.categoryCacheHitCount += 1;
              this.mergedByCategoryKey.set(id, hit.meta);
              this.legacyResolved.add(id);
            }
          }
        }
        return false;
      }

      const work = (async (): Promise<boolean> => {
        let leaderIssuedSelect = false;
        if (counters) {
          if (table === "categories") counters.categoriesQueryCount += 1;
          else counters.tradeCategoriesQueryCount += 1;
        }
        const cachedSel = tradeChatCategorySelectByTable.get(table);
        const trySelect = async (sel: string) => {
          leaderIssuedSelect = true;
          const t0 = deepSteps ? performance.now() : 0;
          const res = await (this.sb as any).from(table).select(sel).in("id", stableIds);
          if (counters) {
            const dt = deepSteps ? performance.now() - t0 : 0;
            if (table === "categories") counters.queryMsByTable.categoriesMs += dt;
            else counters.queryMsByTable.tradeCategoriesMs += dt;
          }
          return res;
        };
        if (cachedSel) {
          const cached = await trySelect(cachedSel);
          if (!(cached?.error && cached?.data == null)) {
            mergeRows(cached.data);
            tradeCategoryWriteModuleSnapshotFromMerged(table, stableIds, this.mergedByCategoryKey);
            tradeCategoryStoreBatchRowSnapshot(table, stableIds, cached.data);
            return leaderIssuedSelect;
          }
          tradeChatCategorySelectByTable.delete(table);
        }
        const candidates =
          table === "trade_categories"
            ? [
                /** 로컬/레거시 DB 에서 자주 없는 컬럼(`label`, `icon_key`) 뒤로 — 실패 RTT 누적 방지 */
                "id, name, slug, icon",
                "id, name, slug",
                "id, name, label, key",
                "id, name, slug, icon_key",
              ]
            : ["id, name, label, key", "id, name, label, key, slug, icon_key", "id, name, label, key, slug, icon"];
        let attemptIndex = 0;
        for (const sel of candidates) {
          attemptIndex += 1;
          if (counters) counters.selectFallbackAttemptCount += 1;
          const res = await trySelect(sel);
          if (res?.error && res?.data == null) {
            if (counters) counters.selectFallbackFailedCount += 1;
            if (
              deepSteps &&
              table === "trade_categories" &&
              typeof process !== "undefined" &&
              process.env.NODE_ENV === "development" &&
              messengerVerboseTraceConsoleEnabled() &&
              homeSyncTraceMeterEnabled(this.trace)
            ) {
              try {
                const anyTrace = this.trace as { __cmTradeCategoriesFallbackLogCount?: number };
                const prev =
                  typeof anyTrace.__cmTradeCategoriesFallbackLogCount === "number"
                    ? anyTrace.__cmTradeCategoriesFallbackLogCount
                    : 0;
                if (prev < 2) {
                  anyTrace.__cmTradeCategoriesFallbackLogCount = prev + 1;
                  const err = (res as { error?: unknown }).error ?? null;
                  // eslint-disable-next-line no-console -- dev-only diagnostic for fallback failure reason
                  console.warn("[home-sync-category-fallback]", {
                    token: this.trace!.token,
                    table,
                    attemptedSelect: sel,
                    failedAttemptIndex: attemptIndex,
                    errorCode: (err as { code?: unknown })?.code ?? null,
                    errorMessage: (err as { message?: unknown })?.message ?? null,
                    errorDetails: (err as { details?: unknown })?.details ?? null,
                    errorHint: (err as { hint?: unknown })?.hint ?? null,
                  });
                }
              } catch {
                /* ignore */
              }
            }
            continue;
          }
          tradeChatCategorySelectByTable.set(table, sel);
          mergeRows(res.data);
          tradeCategoryWriteModuleSnapshotFromMerged(table, stableIds, this.mergedByCategoryKey);
          tradeCategoryStoreBatchRowSnapshot(table, stableIds, res.data);
          return leaderIssuedSelect;
        }
        return leaderIssuedSelect;
      })();

      tradeCategoryTableFetchInflight.set(normalizedInflightKey, work);
      work.finally(() => {
        tradeCategoryTableFetchInflight.delete(normalizedInflightKey);
      });
      return await work;
    };

    let categoryPgrestLeaderHit = false;
    if (missingTradeFin.length || missingCategoryFin.length) {
      const r = await Promise.all([
        fetchTable("categories", missingCategoryFin),
        fetchTable("trade_categories", missingTradeFin),
      ]);
      categoryPgrestLeaderHit = Boolean(r[0] || r[1]);
    }
    this.lastEnsureCategoryUsedDb = categoryPgrestLeaderHit;

    const expiresAt = now + TRADE_CHAT_CATEGORY_META_CACHE_TTL_MS;
    for (const id of missingTradeBeforeDb) {
      const meta = this.mergedByCategoryKey.get(id);
      if (meta) tradeChatCategoryMetaCache.set(`trade_categories:${id}`, { expiresAt, meta });
      this.tradeResolved.add(id);
    }
    for (const id of missingCategoryBeforeDb) {
      const meta = this.mergedByCategoryKey.get(id);
      if (meta) tradeChatCategoryMetaCache.set(`categories:${id}`, { expiresAt, meta });
      this.legacyResolved.add(id);
    }

    if (counters && this.trace) {
      counters.queryMsByTable.categoriesMs = ms(counters.queryMsByTable.categoriesMs);
      counters.queryMsByTable.tradeCategoriesMs = ms(counters.queryMsByTable.tradeCategoriesMs);
      const detail = counters as HomeSyncDeepStepsCategoryFetchDetail;
      const missNormKey =
        missingTradeIds.length || missingCategoryIds.length
          ? `trade:${[...missingTradeIds].sort((a, b) => a.localeCompare(b)).join("\x1e")}|leg:${[...missingCategoryIds].sort((a, b) => a.localeCompare(b)).join("\x1e")}`
          : "resolved_pre_fetch";
      detail.category_singleflight_join_count = this._categoryEnsureSfJoins;
      detail.category_duplicate_fetch_count = this._categoryEnsureDupFetchSlots;
      detail.category_cache_lookup_ms = ms(categoryInflightJoinWaitMs);
      detail.category_cache_store_ms = ms(categoryBatchSnapApplyMs);
      detail.normalized_category_cache_key = missNormKey;
      detail.category_cache_key = missNormKey.length > 200 ? missNormKey.slice(0, 200) : missNormKey;
      detail.category_singleflight_key = missNormKey;
      const batchSnapRecoveredSlots =
        missingTradeBeforeDb.length -
          missingTradeFin.length +
          (missingCategoryBeforeDb.length - missingCategoryFin.length);
      const catIdsForDup = postList
        .map((p) => trimText(tradePostCategoryId(p as Record<string, unknown>)))
        .filter(Boolean);
      const catDupAttachSlots = Math.max(0, catIdsForDup.length - new Set(catIdsForDup).size);
      const baseCategoryCacheReason =
        this._categoryEnsureSfJoins > 0
          ? this.lastEnsureCategoryUsedDb
            ? "db_leader+singleflight_join"
            : "singleflight_join"
          : this.lastEnsureCategoryUsedDb
            ? "db_leader"
            : "module_hit";
      detail.category_cache_reason =
        batchSnapRecoveredSlots > 0
          ? `${baseCategoryCacheReason}|batch_snapshot:${batchSnapRecoveredSlots}`
          : baseCategoryCacheReason;
      detail.category_duplicate_attach_count = catDupAttachSlots;
      detail.category_singleflight_hit = this._categoryEnsureSfJoins > 0;
      detail.category_lookup_reuse_hit = batchSnapRecoveredSlots > 0 || this._categoryEnsureSfJoins > 0;
      detail.category_cache_hit_after = !this.lastEnsureCategoryUsedDb;
      detail.category_normalize_cpu_ms = ms(categoryIdNormalizeCpuMs);
      detail.category_lookup_wall_ms = ms(categoryLookupWallMs);
      const catQwall = ms(
        (counters.queryMsByTable.categoriesMs ?? 0) + (counters.queryMsByTable.tradeCategoriesMs ?? 0)
      );
      detail.category_query_wall_ms = catQwall;
      detail.category_postgrest_wait_ms = catQwall;
      detail.category_network_wait_ms = catQwall;
      detail.category_attach_cpu_ms = ms(categoryMergeAttachCpuMs + categoryBatchSnapApplyMs);
      detail.category_serialize_ms = 0;
      detail.category_request_local_trade_skips = ms(categoryRequestLocalTradeSkips);
      detail.category_request_local_legacy_skips = ms(categoryRequestLocalLegacySkips);
      detail.category_request_local_hit =
        categoryRequestLocalTradeSkips + categoryRequestLocalLegacySkips > 0;
      detail.category_process_cache_hit =
        counters.tradeCategoryCacheHitCount + counters.categoryCacheHitCount > 0;
      detail.category_cache_store_reason = `ttl_module_write:${missingTradeBeforeDb.length + missingCategoryBeforeDb.length}|pgrest_leader:${categoryPgrestLeaderHit ? 1 : 0}|sf_joins:${this._categoryEnsureSfJoins}`;
      if (this.accumulateTraceDetail) {
        appendHomeSyncCategoryFetchDetail(this.trace, detail);
      } else {
        this.trace.deepSteps.categoryFetchDetail = detail;
      }
    }
  }
}

async function loadTradeChatCategoryMetaByPostRows(
  sb: any,
  posts: Iterable<Record<string, unknown>>,
  trace?: HomeSyncTrace,
  sharedLoader?: TradeCategoryMetaRequestLoader
): Promise<Map<string, TradeChatCategoryMetaLike>> {
  const loader =
    sharedLoader ?? new TradeCategoryMetaRequestLoader(sb, trace, "full", false);
  await loader.ensureForPosts(posts);
  return loader.getMergedMap();
}

function tradeChatCategoryMenuLabelForPost(
  post: Record<string, unknown> | null | undefined,
  categoryById: Map<string, TradeChatCategoryMetaLike>
): string {
  const category = categoryById.get(tradePostCategoryId(post));
  return resolveTradeChatCategoryLabelForList(post, category);
}

function firstPostThumbnailForMessengerTradeList(post: Record<string, unknown> | null | undefined): string | null {
  return extractPostThumbnailPathFromPostRow(post ?? null);
}

/** enrich 스냅샷용 통화 코드 — 기존과 동일 규칙, `post.currency.trim()` 이중 호출만 제거 */
function tradePostCurrencyCodeOrPhp(post: Record<string, unknown> | null | undefined): string {
  const raw = post?.currency;
  if (typeof raw !== "string") return "PHP";
  const t = raw.trim();
  return t.length > 0 ? t : "PHP";
}

/** product_chats → CM 방 연결 직후 `summary` 에 거래 메타를 넣어 목록·방 UI(`productChatId`)가 맞도록 한다. */
async function hydrateTradeMessengerRoomSummaryFromProductChat(
  userId: string,
  productChatId: string,
  cmRoomId: string,
  prefetchedPc?: ProductChatRow | null
): Promise<void> {
  const sb = getSupabaseOrNull();
  if (!sb) return;
  const { data: roomGate } = await (sb as any)
    .from("community_messenger_rooms")
    .select("direct_key, chat_domain")
    .eq("id", cmRoomId)
    .maybeSingle();
  const gateDk = trimText((roomGate as { direct_key?: unknown } | null)?.direct_key);
  const gateDomain = trimText((roomGate as { chat_domain?: unknown } | null)?.chat_domain);
  if (
    gateDomain === "general_direct" ||
    gateDomain === "group" ||
    gateDomain === "store_order" ||
    isMessengerGeneralFriendDirectKey(gateDk)
  ) {
    traceDomainSeparation({
      correlationId: newDomainSeparationCorrelationId(),
      phase: "hydrate_trade_summary",
      reason: "skipped_non_trade_room",
      roomId: cmRoomId,
      chatDomain: gateDomain || null,
      directKey: gateDk || null,
    });
    return;
  }
  const pc =
    prefetchedPc && String(prefetchedPc.id ?? "").trim() === productChatId.trim()
      ? prefetchedPc
      : (await resolveProductChat(sb as never, productChatId))?.productChat;
  if (!pc) return;
  const postId = String(pc.post_id ?? "").trim();
  const postById = await fetchTradeChatListPostRowsByIds(sb, [postId]);
  const categoryById = await loadTradeChatCategoryMetaByPostRows(sb, postById.values());
  const post = postById.get(postId) ?? null;
  const priceRaw = post?.price;
  const price =
    typeof priceRaw === "number" && Number.isFinite(priceRaw)
      ? priceRaw
      : priceRaw != null
        ? Number(priceRaw)
        : null;
  const currency = tradePostCurrencyCodeOrPhp(post as Record<string, unknown> | null | undefined);
  const seller = trimText((pc as { seller_id?: unknown }).seller_id);
  const role: "seller" | "buyer" = userId === seller ? "seller" : "buyer";
  const sellerUidForList = seller || trimText((post as { user_id?: unknown } | null)?.user_id);
  let sellerDisplayName: string | undefined;
  if (sellerUidForList) {
    const pm = await fetchProfilesByIds([sellerUidForList]);
    const lbl = profileLabel(pm.get(sellerUidForList), sellerUidForList).trim();
    if (lbl) sellerDisplayName = lbl;
  }
  const meta = buildTradeMessengerListContextMetaFromLoadedPost({
    productChatId: productChatId.trim(),
    postId,
    post: post as Record<string, unknown> | null | undefined,
    price: price != null && !Number.isNaN(price) ? price : null,
    currency,
    role,
    categoryById,
    sellerListingStateRaw: (post as any)?.seller_listing_state,
    postStatus: (post as any)?.status ?? null,
    tradeFlowStatus: String(pc.trade_flow_status ?? "chatting"),
    thumbnailUrl: firstPostThumbnailForMessengerTradeList(post as Record<string, unknown> | null | undefined),
    sellerDisplayName: sellerDisplayName ?? null,
  });
  await updateCommunityMessengerRoomContextMeta({
    userId,
    roomId: cmRoomId,
    contextMeta: meta,
  });
}

export type GetCommunityMessengerRoomSnapshotOptions = {
  /** 기본: `COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT` (30) */
  initialMessageLimit?: number;
  /**
   * 기본 true. false면 참가자 전원 프로필 하이드레이션을 생략하고
   * 메시지 발신자·방장·DM 상대 등 최소 집합만 로드한다(`membersDeferred`).
   */
  hydrateFullMemberList?: boolean;
  /**
   * true면 `fetchRoomProfilesByRoomIds`·통화·presence·trade unread 보강을 (대부분의 방에서) 생략하고
   * `bootstrapEnrichmentPending` 을 싣는다. **거래 1:1 방**은 `tradeChatRoomDetail`(상품 카드)만 프로필과 병렬로
   * 첫 스냅샷에 포함하고, 통화·presence·enrich 는 후속 부트스트랩으로 합류한다.
   */
  deferSnapshotSecondary?: boolean;
  /**
   * `critical`: 첫 페인트용 경량 스냅샷(후속 보강 필수).
   * `full`: 기존 전체 스냅샷.
   * `fast`: full 에 가깝되 `tradeChatRoomDetail` 만 스냅샷에서 제외(`fast_full_without_trade_card`).
   * `silent_delta`: `room_silent` 전용 — DB 2쿼리(방+내 참가자)만.
   */
  snapshotTier?: "critical" | "full" | "fast" | "silent_delta";
  diagnostics?: CommunityMessengerRoomSnapshotDiagnostics;
  /** 비프로덕션 — `x-samarket-e2e-room-diag` 로 활성화된 E2E 방 스냅샷 계측 */
  e2eRoomSnapshotDiag?: boolean;
};

const TRADE_ROOM_DETAIL_ENTRY_CACHE_TTL_MS = 8000;
const tradeRoomDetailEntryCache = new Map<string, { expiresAt: number; room: ChatRoom | null }>();

/** CM 방 `summary` JSON 에서 trade + productChatId 를 읽어 거래 상세(상품 카드)를 로드 — 반복 입장 TTL 캐시 */
function tradeChatRoomDetailPromiseFromMessengerRoomRow(
  room: RoomRow | DevRoom,
  userId: string,
  chatRoomDetailLoad?: import("@/lib/chats/server/load-chat-room-detail").LoadChatRoomDetailDiagnostics
): Promise<ChatRoom | null> {
  const raw =
    "room_type" in room
      ? trimText(room.summary ?? "")
      : trimText((room as DevRoom).summary ?? "");
  const meta = parseCommunityMessengerRoomContextMeta(raw);
  if (meta?.kind !== "trade" || !meta.productChatId?.trim()) return Promise.resolve(null);
  const pcid = meta.productChatId.trim();
  const uid = trimText(userId);
  const cacheKey = `${uid}\0${pcid}`;
  const hit = tradeRoomDetailEntryCache.get(cacheKey);
  /**
   * 진단: `loadChatRoomDetailForUser` 를 타지 않으면 `chatRoomDetailLoad.fetchPostRowForChatSellerMatch` 등이
   * 영원히 비어 `#samarket-room-snapshot-diag` JSON 과 불일치한다. `chatRoomDetailLoad` ref 가 넘어온 경우만
   * TTL 캐시 단축을 쓰지 않고 동일 productChatId 로 한 번 더 로드해 진단 필드를 채운다(반환 room 은 동일).
   */
  if (hit && hit.expiresAt > Date.now() && chatRoomDetailLoad == null) return Promise.resolve(hit.room);
  return import("@/lib/chats/server/load-chat-room-detail")
    .then(({ loadChatRoomDetailForUser, finalizeChatRoomDetailLoadDiagnostics }) =>
      loadChatRoomDetailForUser({
        roomId: pcid,
        userId,
        detailScope: "entry",
        diagnostics: chatRoomDetailLoad,
      }).then((res) => {
        if (chatRoomDetailLoad) finalizeChatRoomDetailLoadDiagnostics(chatRoomDetailLoad);
        const r = res.ok ? res.room : null;
        const t = Date.now();
        tradeRoomDetailEntryCache.set(cacheKey, { expiresAt: t + TRADE_ROOM_DETAIL_ENTRY_CACHE_TTL_MS, room: r });
        pruneByExpiresAtAndMaxSize(tradeRoomDetailEntryCache, t, 200);
        return r;
      })
    )
    .catch(() => null);
}

function clampCommunityMessengerSnapshotMessageLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT;
  return Math.min(COMMUNITY_MESSENGER_SNAPSHOT_MESSAGE_HARD_MAX, Math.max(1, n));
}

/** instant/critical 입장 — 카카오/텔레그램형 첫 타임라인 슬라이스(과대 페이로드 방지 상한 30) */
const COMMUNITY_MESSENGER_CRITICAL_MESSAGE_MIN = 20;
const COMMUNITY_MESSENGER_CRITICAL_MESSAGE_MAX = 30;

function effectiveSnapshotMessageLimitForCache(options?: GetCommunityMessengerRoomSnapshotOptions): number {
  if (options?.snapshotTier === "silent_delta") return 0;
  const raw = clampCommunityMessengerSnapshotMessageLimit(options?.initialMessageLimit);
  if (options?.snapshotTier === "critical") {
    return Math.min(
      COMMUNITY_MESSENGER_CRITICAL_MESSAGE_MAX,
      Math.max(COMMUNITY_MESSENGER_CRITICAL_MESSAGE_MIN, raw)
    );
  }
  return raw;
}

/** 동일 방·옵션으로 동시에 들어온 스냅샷 요청을 한 번의 로드로 합침(결과 TTL 캐시는 최신 메시지 누락 방지로 두지 않음) */
type RoomSnapshotInflightEntry = {
  promise: Promise<CommunityMessengerRoomSnapshot | null>;
  /** `loadCommunityMessengerRoomSnapshotUncached` 가 직접 갱신하는 단일 진단 버킷 */
  diagSink: CommunityMessengerRoomSnapshotDiagnostics;
  /** 완료 후 `diagSink` 스냅샷을 각 ref 로 복제(호출자별 객체 유지) */
  diagReplicaRefs: Set<CommunityMessengerRoomSnapshotDiagnostics>;
};

const roomSnapshotInflight = new Map<string, RoomSnapshotInflightEntry>();

/**
 * Dev memory watch: in-process CM service cache entry counts (no payload walk).
 * `instrumentation-dev-memory-watch` 는 `cm-service-cache-footprint-registry` 만 참조하고,
 * 서버에서 본 모듈이 로드될 때 아래 getter 가 등록된다.
 */
export function getCommunityMessengerServiceCacheFootprint(): Record<string, number> {
  return {
    cm_profile_id_row_cache_size: profileIdRowCache.size,
    cm_active_call_session_by_user_room_cache_size: activeCallSessionByUserRoomCache.size,
    cm_direct_keys_product_chats_cache_size: directKeysProductChatsByIdCache.size,
    cm_direct_keys_product_chats_inflight_size: directKeysProductChatsByIdInflight.size,
    cm_direct_keys_item_trade_ledger_cache_size: directKeysItemTradeLedgerRowsCache.size,
    cm_direct_keys_item_trade_ledger_inflight_size: directKeysItemTradeLedgerRowsInflight.size,
    cm_direct_keys_chat_rooms_item_trade_fb_cache_size: directKeysChatRoomsItemTradeFallbackCache.size,
    cm_direct_keys_chat_rooms_item_trade_fb_inflight_size: directKeysChatRoomsItemTradeFallbackInflight.size,
    cm_direct_keys_mega_bundle_cache_size: directKeysMegaBundleCache.size,
    cm_direct_keys_mega_bundle_inflight_size: directKeysMegaBundleInflight.size,
    cm_trade_chat_category_meta_cache_size: tradeChatCategoryMetaCache.size,
    cm_trade_category_batch_row_snapshot_cache_size: tradeCategoryBatchRowSnapshotCache.size,
    cm_trade_category_table_fetch_inflight_size: tradeCategoryTableFetchInflight.size,
    cm_trade_room_detail_entry_cache_size: tradeRoomDetailEntryCache.size,
    cm_room_snapshot_inflight_size: roomSnapshotInflight.size,
  };
}

registerCommunityMessengerServiceCacheFootprintGetter(getCommunityMessengerServiceCacheFootprint);

/** inflight 공유 시 호출자 diagnostics 가 각자 동일 스냅샷을 갖도록 복제 */
function replicateRoomSnapshotDiagnosticsToTargets(
  sink: CommunityMessengerRoomSnapshotDiagnostics,
  targets: ReadonlySet<CommunityMessengerRoomSnapshotDiagnostics>
): void {
  if (!targets.size) return;
  const keys = Object.keys(sink) as (keyof CommunityMessengerRoomSnapshotDiagnostics)[];
  if (!keys.length) return;
  for (const to of targets) {
    for (const k of keys) {
      const v = sink[k];
      if (v === undefined) continue;
      try {
        (to as Record<string, unknown>)[k as string] = structuredClone(v as object) as never;
      } catch {
        (to as Record<string, unknown>)[k as string] = v as never;
      }
    }
  }
}

function messengerRoomSnapshotCacheKey(
  userId: string,
  roomId: string,
  messageLimit: number,
  hydrateFullMemberList: boolean,
  deferSnapshotSecondary: boolean,
  snapshotTier: "critical" | "full" | "fast" | "silent_delta"
): string {
  return `${trimText(userId)}\0${trimText(roomId).toLowerCase()}\0${messageLimit}\0${hydrateFullMemberList ? "1" : "0"}\0${
    deferSnapshotSecondary ? "1" : "0"
  }\0${snapshotTier}`;
}

/** 부트스트랩에서 전원 멤버 프로필을 생략할 때 — 말풍선·헤더에 필요한 최소 user id */
function collectMinimalSnapshotUserIdsForRoomSnapshot(
  userId: string,
  room: RoomRow | DevRoom,
  participants: Array<ParticipantRow | DevParticipant>,
  messages: Array<MessageRow | DevMessage>
): string[] {
  const ids = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const t = trimText(raw);
    if (t) ids.add(t);
  };
  add(userId);
  const isDbRoom = "room_type" in room;
  const roomType = (isDbRoom ? room.room_type : room.roomType) as CommunityMessengerRoomType;
  const ownerUserId = trimText(
    isDbRoom ? (room.owner_user_id ?? room.created_by) : (room.ownerUserId ?? room.createdBy)
  );
  if (ownerUserId) add(ownerUserId);
  if (roomType === "direct") {
    const peer = dedupeParticipantUserIds(participants).find((uid) => uid !== userId);
    if (peer) add(peer);
  }
  for (const message of messages) {
    const sid = "sender_id" in message ? message.sender_id : message.senderId;
    add(sid);
  }
  return [...ids];
}

/**
 * API·Realtime bump 가 항상 `community_messenger_rooms.id`(원장 UUID)를 쓰도록 URL `roomId` 를 단일화한다.
 * 거래·레거시 키(`product_chats` / `chat_rooms` id 등)는 `resolveProductChat`·`ensureCommunityMessengerDirectRoomFromProductChat` 과 동일 규칙으로 CM 방으로 접는다.
 */
export {
  resolveCommunityMessengerCanonicalRoomIdForUser,
  resolveCommunityMessengerCanonicalRoomIdForUserWithBreakdown,
} from "@/lib/community-messenger/server/messenger-room-canonical-resolve-core";

/**
 * 비프로덕션 E2E trade 진단 전용: RSC 첫 응답과 분리한 `GET .../e2e-room-snapshot-diag` 에서 호출해
 * `chatRoomDetailLoad`·`fetchPostRelationAdoptedFrom` 등을 채운다. 거래 방이 아니면 `deferTradeDiagSkipped` 만 표시.
 */
export async function runCommunityMessengerRoomTradeDiagnosticsParallelForE2e(
  userId: string,
  canonicalRoomId: string,
  diagnostics: CommunityMessengerRoomSnapshotDiagnostics
): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const sb = getSupabaseOrNull();
  if (!sb) {
    diagnostics.deferTradeDiagSkipped = true;
    return;
  }
  const id = trimText(canonicalRoomId);
  const uid = trimText(userId);
  if (!id || !uid) {
    diagnostics.deferTradeDiagSkipped = true;
    return;
  }
  diagnostics.chatRoomDetailLoad ??= {};
  const { data: roomData } = await (sb as any)
    .from("community_messenger_rooms")
    .select(
      "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, pinned_message_id, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type"
    )
    .eq("id", id)
    .maybeSingle();
  const roomRow = (roomData as RoomRow | null) ?? null;
  if (!roomRow) {
    diagnostics.deferTradeDiagSkipped = true;
    return;
  }
  const raw =
    "room_type" in roomRow
      ? trimText(roomRow.summary ?? "")
      : trimText((roomRow as DevRoom).summary ?? "");
  const meta = parseCommunityMessengerRoomContextMeta(raw);
  if (meta?.kind !== "trade" || !meta.productChatId?.trim()) {
    diagnostics.deferTradeDiagSkipped = true;
    return;
  }
  await tradeChatRoomDetailPromiseFromMessengerRoomRow(roomRow, uid, diagnostics.chatRoomDetailLoad);
}

/** 스냅샷에 담는 최근 메시지 개수 — `listCommunityMessengerRoomMessagesBefore`와 함께 동작 */
export async function getCommunityMessengerRoomSnapshot(
  userId: string,
  roomId: string,
  options?: GetCommunityMessengerRoomSnapshotOptions
): Promise<CommunityMessengerRoomSnapshot | null> {
  const id = trimText(roomId);
  if (!id) return null;

  if (options?.snapshotTier === "silent_delta") {
    const cacheKey = messengerRoomSnapshotCacheKey(userId, id, 0, false, true, "silent_delta");
    const existing = roomSnapshotInflight.get(cacheKey);
    if (existing) {
      if (options?.diagnostics) {
        existing.diagReplicaRefs.add(options.diagnostics);
      }
      return existing.promise;
    }
    const diagSink: CommunityMessengerRoomSnapshotDiagnostics = {};
    const diagReplicaRefs = new Set<CommunityMessengerRoomSnapshotDiagnostics>();
    if (options?.diagnostics) {
      diagReplicaRefs.add(options.diagnostics);
    }
    const promise = loadCommunityMessengerRoomSilentDeltaSnapshot(userId, id)
      .then((snap) => {
        replicateRoomSnapshotDiagnosticsToTargets(diagSink, diagReplicaRefs);
        return snap;
      })
      .finally(() => {
        roomSnapshotInflight.delete(cacheKey);
      });
    roomSnapshotInflight.set(cacheKey, { promise, diagSink, diagReplicaRefs });
    return promise;
  }

  const messageLimit = effectiveSnapshotMessageLimitForCache(options);
  const hydrateFullMemberList = options?.hydrateFullMemberList !== false;
  const deferSnapshotSecondary = options?.deferSnapshotSecondary === true;
  const snapshotTier: "critical" | "full" | "fast" =
    options?.snapshotTier === "critical"
      ? "critical"
      : options?.snapshotTier === "fast"
        ? "fast"
        : "full";
  /**
   * 계측 ref 가 있어도 inflight 는 유지한다. `load*` 는 공용 `diagSink` 만 갱신하고,
   * 완료 시점에 각 호출자 `options.diagnostics` 로 동일 내용을 복제한다(동시 요청 1회 페치).
   * 진단 소비자가 없을 때도 빈 `diagSink` 를 쓰면 후행 동시 호출자가 붙었을 때 복제 불가하므로 항상 sink 를 둔다.
   */
  const cacheKey = messengerRoomSnapshotCacheKey(
    userId,
    id,
    messageLimit,
    hydrateFullMemberList,
    deferSnapshotSecondary,
    snapshotTier
  );
  const existing = roomSnapshotInflight.get(cacheKey);
  if (existing) {
    if (options?.diagnostics) {
      existing.diagReplicaRefs.add(options.diagnostics);
    }
    return existing.promise;
  }

  const diagSink: CommunityMessengerRoomSnapshotDiagnostics = {};
  const diagReplicaRefs = new Set<CommunityMessengerRoomSnapshotDiagnostics>();
  if (options?.diagnostics) {
    diagReplicaRefs.add(options.diagnostics);
  }

  const promise = loadCommunityMessengerRoomSnapshotUncached(userId, roomId, {
    ...options,
    diagnostics: diagSink,
  })
    .then((snap) => {
      replicateRoomSnapshotDiagnosticsToTargets(diagSink, diagReplicaRefs);
      return snap;
    })
    .finally(() => {
      roomSnapshotInflight.delete(cacheKey);
    });

  roomSnapshotInflight.set(cacheKey, { promise, diagSink, diagReplicaRefs });
  return promise;
}

async function loadCommunityMessengerRoomSnapshotUncached(
  userId: string,
  roomId: string,
  options?: GetCommunityMessengerRoomSnapshotOptions
): Promise<CommunityMessengerRoomSnapshot | null> {
  if (options?.snapshotTier === "silent_delta") return null;
  const tBootstrap0 = performance.now();
  const isCriticalTier = options?.snapshotTier === "critical";
  const isFastTier = options?.snapshotTier === "fast";
  const messageLimit = effectiveSnapshotMessageLimitForCache(options);
  let hydrateFullMemberList = options?.hydrateFullMemberList !== false;
  if (isCriticalTier) {
    /** trade / full 프로필 / normalize 병렬 회피 — 라우트 누락 시에도 critical 은 최소 멤버만 */
    hydrateFullMemberList = false;
  }
  const diagnostics = options?.diagnostics;
  if (diagnostics) {
    diagnostics.snapshotEntryMs = 0;
  }
  if (
    diagnostics &&
    (process.env.MESSENGER_PERF_TRACE_ROOM_SNAPSHOT === "1" ||
      (process.env.NODE_ENV !== "production" && options?.e2eRoomSnapshotDiag === true))
  ) {
    diagnostics.chatRoomDetailLoad ??= {};
  }
  /**
   * `true` 이면 통화·presence 등 2차 묶음을 생략 — 첫 진입은 seed 위주.
   * 거래 1:1 방은 상품 카드(`tradeChatRoomDetail`)만 프로필 하이드레이션과 병렬로 넣어 첫 페인트에 포함한다.
   */
  const deferSecondaryRequested = options?.deferSnapshotSecondary === true;
  /** critical 은 2차(거래·normalize·enrich) 경로에 절대 진입하지 않음 */
  let deferSecondary = Boolean(isCriticalTier);
  let participantsProfilesFetchMs = 0;
  let messagesFetchMs = 0;
  let normalizeMergeMs = 0;
  const id = trimText(roomId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  let room: RoomRow | DevRoom | null = null;
  let participants: Array<ParticipantRow | DevParticipant> = [];
  let messages: Array<MessageRow | DevMessage> = [];
  let snapshotRoomMessageReactionsById = new Map<string, NonNullable<CommunityMessengerMessage["reactions"]>>();
  let roomTotalMemberCount: number | undefined;
  let membersTruncated = false;
  /** `mappedMessages` 이전 DB/데브 행 기준 — 타임라인 `before` 페이지 가능 여부 */
  let snapshotHasMoreOlderMessages = false;
  /** 최근 메시지 fetch 에 실제 사용한 `limit`(스냅샷·클라 이전 메시지 UX) */
  let snapshotBootstrapInitialMessageLimit: number | undefined;
  /** defer seed + Supabase: participants embed 에서 수집한 프로필 — `hydrateProfilesLabelsOnlyWithMap` 의 추가 `fetchProfilesByIds` 를 줄인다. */
  let embeddedProfilesFromParticipantRows = new Map<string, ProfileRow>();
  let snapshotWaveAFromRpc = false;
  const messagesQueryLimitForSnapshot = isCriticalTier
    ? messageLimit
    : deferSecondaryRequested
      ? Math.min(messageLimit, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT)
      : Math.min(messageLimit, 20);
  if (sb && isCriticalTier) {
    const snapWaveA = await tryLoadRoomBootstrapCriticalWaveAFromSnapshot(
      sb as never,
      userId,
      id,
      messagesQueryLimitForSnapshot,
      diagnostics
    );
    if (snapWaveA) {
      snapshotWaveAFromRpc = true;
      room = snapWaveA.waveA.room as RoomRow;
      participants = snapWaveA.waveA.participants as Array<ParticipantRow | DevParticipant>;
      messages = snapWaveA.waveA.messages as Array<MessageRow | DevMessage>;
      embeddedProfilesFromParticipantRows = snapWaveA.waveA.embeddedProfiles as Map<string, ProfileRow>;
      roomTotalMemberCount = snapWaveA.waveA.roomTotalMemberCount;
      membersTruncated = snapWaveA.waveA.membersTruncated;
      snapshotBootstrapInitialMessageLimit = snapWaveA.waveA.snapshotBootstrapInitialMessageLimit;
      snapshotHasMoreOlderMessages = snapWaveA.waveA.snapshotHasMoreOlderMessages;
      messagesFetchMs = 0;
      if (diagnostics) {
        diagnostics.snapshotQueryAParallelEndMs = snapWaveA.breakdown.db_ms;
      }
    } else {
      const { auditLegacyFallbackUsage } = await import("@/lib/ops/legacy-fallback-usage-audit");
      auditLegacyFallbackUsage({
        route: "/api/community-messenger/rooms/[roomId]/bootstrap",
        fallback_branch: "legacy_wave_a_multi_query",
        reason: "unified_rpc_unavailable",
        blocker: id,
      });
      if (process.env.NODE_ENV === "development") {
        // eslint-disable-next-line no-console -- snapshot deploy probe
        console.warn("[room-bootstrap-snapshot-fallback]", {
          room_id: id,
          reason: "unified_rpc_unavailable",
        });
      }
    }
  }
  if (sb && !snapshotWaveAFromRpc) {
    const participantSelectCols =
      "id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, blocked_hidden_at, joined_at, last_read_at, last_read_message_id";
    /**
     * 멤버 전원 로드(`hydrateFullMemberList`)가 아닐 때만 embed — 행 수가 캡으로 한정되어 페이로드가 폭증하지 않음.
     * defer/critical 에 한정하지 않고 기본 full 부트스트랩에도 적용해 `hydrateProfilesLabelsOnlyWithMap` 의 `fetchProfilesByIds` 왕복을 줄인다.
     */
    /** minimal 멤버 경로: 필요 컬럼만 embed — `hydrateProfilesLabelsOnlyWithMap` 에서 bio 없으면 null */
    const participantProfileEmbedSelect = !hydrateFullMemberList
      ? ", profiles!community_messenger_participants_user_id_fkey ( id, nickname, username, avatar_url )"
      : "";
    const participantSelectForBootstrap = participantSelectCols + participantProfileEmbedSelect;
    const participantsQuery = hydrateFullMemberList
      ? (sb as any)
          .from("community_messenger_participants")
          .select(participantSelectForBootstrap)
          .eq("room_id", id)
      : (sb as any)
          .from("community_messenger_participants")
          .select(participantSelectForBootstrap)
          .eq("room_id", id)
          .limit(COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP + 1);

    const myParticipantQuery = !hydrateFullMemberList
      ? (sb as any)
          .from("community_messenger_participants")
          .select(participantSelectForBootstrap)
          .eq("room_id", id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null });

    /** defer seed: `notice_text` 만 제외 — 첫 페인트·textarea 전 공지 본문은 불필요, `bootstrapEnrichmentPending` 경로로 후속 보강 가능. */
    const roomSelectColsDeferSeedNoNoticeBody =
      "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, direct_key, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type, chat_domain, domain_identity";
    const roomSelectColsFull =
      "id, room_type, room_status, visibility, join_policy, identity_policy, is_readonly, direct_key, title, summary, avatar_url, created_by, owner_user_id, member_limit, is_discoverable, allow_member_invite, notice_text, pinned_message_id, notice_updated_at, notice_updated_by, allow_admin_invite, allow_admin_kick, allow_admin_edit_notice, allow_member_upload, allow_member_call, password_hash, last_message, last_message_at, last_message_type, chat_domain, domain_identity";
    const roomSelectForBootstrap =
      deferSecondaryRequested || isCriticalTier ? roomSelectColsDeferSeedNoNoticeBody : roomSelectColsFull;
    const roomQuery = (sb as any)
      .from("community_messenger_rooms")
      .select(roomSelectForBootstrap)
      .eq("id", id)
      .maybeSingle();
    const participantsFetch = (async () => {
      const tParticipants0 = performance.now();
      const participantRes = await participantsQuery;
      let myParticipantData: unknown = null;
      if (!hydrateFullMemberList) {
        if (!participantQueryRowsIncludeViewer(participantRes.data, userId)) {
          const myRes = await myParticipantQuery;
          myParticipantData = myRes.data;
        }
      }
      const dtPart = performance.now() - tParticipants0;
      participantsProfilesFetchMs += dtPart;
      if (diagnostics) {
        diagnostics.participantsSqlFetchMs = Math.round(dtPart);
      }
      return {
        participantData: participantRes.data,
        myParticipantData,
      };
    })();
    /** defer seed RSC: 첫 paint 전 row 수·metadata 페이로드를 줄이기 위해 최근 메시지 fetch 상한만 별도 캡(컬럼 shape 동일). */
    const messagesQueryLimit = isCriticalTier
      ? messageLimit
      : deferSecondaryRequested
        ? Math.min(messageLimit, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT)
        : Math.min(messageLimit, 20);
    const messagesFetch = (async () => {
      const tMessages0 = performance.now();
      const messageRes = await queryCommunityMessengerMessageRowsWithSelectFallback(async (cols) =>
        (sb as any)
          .from("community_messenger_messages")
          .select(cols)
          .eq("room_id", id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(messagesQueryLimit)
      );
      messagesFetchMs = performance.now() - tMessages0;
      return messageRes;
    })();
    const [{ data: roomData }, { participantData, myParticipantData }, { data: messageData }] = await Promise.all([
      roomQuery,
      participantsFetch,
      messagesFetch,
    ]);
    if (diagnostics) {
      diagnostics.snapshotQueryAParallelEndMs = Math.round(performance.now() - tBootstrap0);
    }
    room = (roomData as RoomRow | null) ?? null;
    const listSplit = embeddedProfilesFromParticipantQueryRows(participantData);
    const mineSplit = embeddedProfilesFromParticipantQueryRows(
      myParticipantData && typeof myParticipantData === "object" ? [myParticipantData] : []
    );
    embeddedProfilesFromParticipantRows = new Map<string, ProfileRow>([...listSplit.profiles, ...mineSplit.profiles]);
    let rawParticipantRows = listSplit.rows;
    const myRow = mineSplit.rows[0] ?? null;
    if (myRow?.user_id === userId && !rawParticipantRows.some((p) => p.user_id === userId)) {
      rawParticipantRows = [...rawParticipantRows, myRow];
    }
    // capped 쿼리만 쓸 때도 `user_id = viewer` 단건으로 멤버십을 확정(그룹·비결정적 limit 조합에서 room 을 잘못 null 처리하지 않음)
    if (room && !rawParticipantRows.some((p) => p.user_id === userId)) {
      room = null;
    } else if (room) {
      // `count: exact` 는 불필요하게 비싸다. 부트스트랩은 표시용이므로 기본은 로드된 rows 수로 충분.
      roomTotalMemberCount = rawParticipantRows.length;
      const roomType = (roomData as RoomRow | null)?.room_type as CommunityMessengerRoomType | undefined;
      if (
        roomData &&
        roomType &&
        isCommunityMessengerGroupRoomType(roomType) &&
        rawParticipantRows.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
      ) {
        const sliced = sliceGroupParticipantsForRoomBootstrap(
          rawParticipantRows,
          userId,
          COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
        );
        participants = sliced.rows;
        membersTruncated = sliced.truncated;
      } else if (!hydrateFullMemberList && rawParticipantRows.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP) {
        participants = rawParticipantRows.slice(0, COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP);
        membersTruncated = true;
      } else {
        participants = rawParticipantRows;
      }
      messages = ((messageData ?? []) as MessageRow[]).slice().reverse();
      {
        const rawIncomingCount = ((messageData ?? []) as MessageRow[]).length;
        snapshotBootstrapInitialMessageLimit = messagesQueryLimit;
        snapshotHasMoreOlderMessages = rawIncomingCount >= messagesQueryLimit;
      }
      if (!isCriticalTier) {
        const rawMessageIdsForExtras = messages.map((m) => m.id);
        const authorByMidForExtras = communityMessengerAuthorUserIdByMessageIdForReactions(messages);
        const tMsgExtras0 = performance.now();
        const [bootstrapHideIds, snapshotRoomMessageReactionsByIdResult] = await Promise.all([
          fetchCommunityMessengerHiddenMessageIdsForUser(sb as SupabaseLike, userId, rawMessageIdsForExtras),
          fetchCommunityMessengerReactionAggregatesForMessages(sb as SupabaseLike, rawMessageIdsForExtras, userId, {
            authorUserIdByMessageId: authorByMidForExtras,
          }),
        ]);
        if (diagnostics) {
          diagnostics.messagesPostParallelFetchMs = Math.round(performance.now() - tMsgExtras0);
        }
        messages = messages.filter((m) => !bootstrapHideIds.has(m.id));
        snapshotRoomMessageReactionsById = snapshotRoomMessageReactionsByIdResult;
      }
      /** 읽음 처리는 `PATCH ... mark_read`(클라) 단일 경로 — 부트스트랩 GET 은 읽기 전용 */
    }
  }

  /**
   * 거래 URL이 `chat_rooms` / `product_chats` id 인 경우 — 원장 `community_messenger_room_id` 가 있으면
   * 브리지·ensure 없이 CM 방으로 바로 스냅샷. 없으면 기존 ensure 경로.
   */
  if (!room && sb) {
    const tradeResolved = await resolveProductChat(sb as never, id);
    if (tradeResolved?.messengerRoomId) {
      return getCommunityMessengerRoomSnapshot(userId, tradeResolved.messengerRoomId, {
        ...options,
        diagnostics: undefined,
      });
    }
    const bridged = await ensureCommunityMessengerDirectRoomFromProductChat(userId, id);
    if (bridged.ok && bridged.roomId && bridged.roomId !== id) {
      return getCommunityMessengerRoomSnapshot(userId, bridged.roomId, {
        ...options,
        diagnostics: undefined,
      });
    }
  }

  if (!room) {
    const dev = getDevState();
    room = dev.rooms.find((row) => row.id === id) ?? null;
    if (!room) return null;
    const allRoomParticipants = dev.participants.filter((row) => row.roomId === id);
    if (!allRoomParticipants.some((row) => ("user_id" in row ? row.user_id : row.userId) === userId)) return null;
    roomTotalMemberCount = allRoomParticipants.length;
    if (
      isCommunityMessengerGroupRoomType(room.roomType) &&
      allRoomParticipants.length > COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
    ) {
      const sliced = sliceGroupParticipantsForRoomBootstrap(
        allRoomParticipants,
        userId,
        COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP
      );
      participants = sliced.rows;
      membersTruncated = sliced.truncated;
    } else {
      participants = allRoomParticipants;
    }
    {
      const sorted = dev.messages.filter((row) => row.roomId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const tookAll = sorted.length <= messageLimit;
      messages = tookAll ? sorted : sorted.slice(sorted.length - messageLimit);
      snapshotBootstrapInitialMessageLimit = messageLimit;
      snapshotHasMoreOlderMessages = !tookAll;
    }
    const mine = participants.find((row) => ("user_id" in row ? row.user_id : row.userId) === userId);
    if (mine && !("user_id" in mine)) mine.unreadCount = 0;
  }

  if (diagnostics && !sb) {
    diagnostics.snapshotQueryAParallelEndMs = Math.round(performance.now() - tBootstrap0);
  }

  if (deferSecondaryRequested && room) {
    deferSecondary = true;
  }

  const allMemberIds = dedupeParticipantUserIds(participants);
  const hydrationUserIds = hydrateFullMemberList
    ? allMemberIds
    : collectMinimalSnapshotUserIdsForRoomSnapshot(userId, room, participants, messages);
  /** 1:1 방 peer presence — summary 이후가 아니라 참가자 행만으로 결정해 `hydrateProfiles` 와 동시에 조회(직렬 대기 제거) */
  const earlyDirectPeerUserId = (() => {
    if (!room) return "";
    const rt = ("room_type" in room ? room.room_type : room.roomType) as string;
    if (rt !== "direct") return "";
    for (const p of participants) {
      const uid = trimText(("user_id" in p ? p.user_id : p.userId) ?? "");
      if (uid && uid !== userId) return uid;
    }
    return "";
  })();
  /** 스냅샷 말단 직렬 RTT 제거 — `summary` 이전에 `room.summary` 만으로 거래 여부 판별 후 프로필·거래카드와 병렬 */
  const earlyTradeContextMetaForExitSnapshot = room
    ? parseCommunityMessengerRoomContextMeta(
        trimText("room_type" in room ? String(room.summary ?? "") : String((room as DevRoom).summary ?? ""))
      )
    : null;
  const tradeExitSnapshotPromise =
    isCriticalTier || !(sb && earlyTradeContextMetaForExitSnapshot?.kind === "trade")
      ? Promise.resolve(null)
      : loadTradeProductChatExitSnapshotForMessengerRoom(sb, id, earlyTradeContextMetaForExitSnapshot);
  let tradeProductChatExitForSnapshot: Awaited<ReturnType<typeof loadTradeProductChatExitSnapshotForMessengerRoom>> = null;

  /** 상대 last_read_message_id 의 created_at — 프로필 하이드레이션과 동시에 조회해 직렬 RTT 제거 */
  const bootstrapRoomTypeForPeer = room
    ? (("room_type" in room ? room.room_type : room.roomType) as string)
    : "";
  const bootstrapPeerParticipantForReadCursor =
    bootstrapRoomTypeForPeer === "direct"
      ? participants.find((item) => ("user_id" in item ? item.user_id : item.userId) !== userId)
      : undefined;
  const bootstrapPeerReadCursorIdForFetch = participantLastReadMessageId(bootstrapPeerParticipantForReadCursor);
  const peerReadCursorCreatedAtPromise: Promise<string | null> =
    isCriticalTier || !(sb && bootstrapPeerReadCursorIdForFetch)
      ? Promise.resolve(null)
      : (async () => {
          const t0 = performance.now();
          const { data: peerCursorRow } = await (sb as any)
            .from("community_messenger_messages")
            .select("created_at")
            .eq("room_id", id)
            .eq("id", bootstrapPeerReadCursorIdForFetch)
            .maybeSingle();
          if (diagnostics) {
            diagnostics.peerReadCursorFetchMs = Math.round(performance.now() - t0);
          }
          const ca = (peerCursorRow as { created_at?: string | null } | null)?.created_at;
          return typeof ca === "string" && ca.trim() ? ca.trim() : null;
        })();

  const roomProfileMapPromise = deferSecondary || isCriticalTier
    ? Promise.resolve(new Map<string, RoomProfileRow | DevRoomProfile>())
    : (async () => {
        const t0 = performance.now();
        const r = await fetchRoomProfilesByRoomIds([id]);
        if (diagnostics) {
          diagnostics.fetchRoomProfilesByRoomIdsMs = Math.round(performance.now() - t0);
        }
        return r;
      })();
  const hydratedLabelsPromise = (async () => {
    const t0 = performance.now();
    const r = await hydrateProfilesLabelsOnlyWithMap(userId, hydrationUserIds, {
      includeSelf: true,
      /** participants embed 로 이미 맵이 채워졌으면 `fetchProfilesByIds` 왕복 생략(멤버는 캡으로 한정됨) */
      prefetchedProfiles:
        !hydrateFullMemberList && embeddedProfilesFromParticipantRows.size > 0
          ? embeddedProfilesFromParticipantRows
          : undefined,
    });
    if (diagnostics) {
      diagnostics.hydrateProfilesLabelsOnlyWithMapMs = Math.round(performance.now() - t0);
    }
    return r;
  })();
  /** defer seed: 거래 방 상품 카드만 프로필과 동시에 로드(통화·presence·enrich 는 여전히 후속 부트스트랩) */
  const tradeDetailParallelForDeferSeed =
    deferSecondary && room && !isCriticalTier && !isFastTier
      ? (async () => {
          const t0 = performance.now();
          const r = await tradeChatRoomDetailPromiseFromMessengerRoomRow(room, userId, diagnostics?.chatRoomDetailLoad);
          if (diagnostics) {
            diagnostics.tradeChatRoomDetailBootstrapParallelMs = Math.round(performance.now() - t0);
            diagnostics.normalizeTimelineTradeDetailEndMs = Math.round(performance.now() - tBootstrap0);
          }
          return r;
        })()
      : Promise.resolve(null);
  const tradeExitParallelForDeferSeed = deferSecondary && !isCriticalTier
    ? (async () => {
        const t0 = performance.now();
        const r = await tradeExitSnapshotPromise;
        if (diagnostics) {
          diagnostics.tradeExitSnapshotBootstrapParallelMs = Math.round(performance.now() - t0);
        }
        return r;
      })()
    : Promise.resolve(null);
  /** 첫 페인트: 관계 집합(`getViewerRelationSets`) 없이 라벨·아바타만 — 통화/presence·(비거래 defer 시)거래도크 는 아래 2차에서 */
  const tProfileHydration0 = performance.now();
  const [
    roomProfileMap,
    hydratedLabels,
    tradeDetailFromDeferSeedParallel,
    tradeExitFromDeferSeedParallel,
    peerReadCursorCreatedAtPrefetched,
  ] = await Promise.all([
    roomProfileMapPromise,
    hydratedLabelsPromise,
    tradeDetailParallelForDeferSeed,
    tradeExitParallelForDeferSeed,
    peerReadCursorCreatedAtPromise,
  ]);
  if (deferSecondary) {
    tradeProductChatExitForSnapshot = tradeExitFromDeferSeedParallel;
  }
  participantsProfilesFetchMs += performance.now() - tProfileHydration0;
  if (diagnostics) {
    diagnostics.snapshotQueryBProfilesEndMs = Math.round(performance.now() - tBootstrap0);
  }
  if (diagnostics) {
    diagnostics.snapshotNormalizeStartMs = Math.round(performance.now() - tBootstrap0);
  }
  const tSummary0 = performance.now();
  /** `deferSecondary` slowest 계산용 — `Math.round` 된 timeline 키만으로는 동일 ms 버킷에 묶여 0ms 만 나올 수 있음 */
  let tHiDeferAfterSummary = 0;
  let tHiDeferAfterMembersMap = 0;
  let tHiDeferAfterMessagesMap = 0;
  const summary = buildRoomSummaryFromHydratedMembers(
    userId,
    room,
    participants,
    roomProfileMap,
    hydratedLabels.members,
    {
      totalMemberCount: roomTotalMemberCount ?? participants.length,
    },
    undefined
  );
  const summaryBuildWall = performance.now() - tSummary0;
  normalizeMergeMs += summaryBuildWall;
  if (diagnostics) {
    diagnostics.summaryBuildMs = Math.round(summaryBuildWall);
    diagnostics.normalizeTimelineSummaryEndMs = Math.round(performance.now() - tBootstrap0);
  }
  tHiDeferAfterSummary = performance.now();
  let activeCall: CommunityMessengerCallSession | null = null;
  let tradeChatRoomDetail: ChatRoom | null = deferSecondary
    ? (tradeDetailFromDeferSeedParallel as ChatRoom | null)
    : null;
  let presenceMap = new Map<string, CommunityMessengerPeerPresenceSnapshot>();
  let didFullSecondaryParallel = false;
  /** full 티어 + 2차 미연기 아님: 통화·trade normalize·enrich·exit 스냅샷을 한 번에 병렬 처리 */
  if (!deferSecondary && !isCriticalTier) {
    didFullSecondaryParallel = true;
    const peerFromSummary = trimText(summary.peerUserId ?? "");
    const presenceIds = dedupeIds(
      [earlyDirectPeerUserId, peerFromSummary].map((x) => trimText(x)).filter(Boolean)
    );
    /** trade unread 보강과 통화·도크·presence 는 서로 독립 — 직렬보다 병렬로 총 지연 축소 */
    const enrichPromise = (async () => {
      await enrichTradeRoomContextMetaForBootstrap(userId, [summary], undefined, undefined);
      if (sb) {
        await enrichMessengerTradeUnreadWithLegacyTrade(sb as any, userId, [summary]).catch(() => {});
      }
      if (diagnostics) {
        diagnostics.normalizeTimelineEnrichPathEndMs = Math.round(performance.now() - tBootstrap0);
      }
    })();
    const pCall = getActiveCallSessionForRoom(userId, id).then((r) => {
      if (diagnostics) {
        diagnostics.normalizeTimelineActiveCallEndMs = Math.round(performance.now() - tBootstrap0);
      }
      return r;
    });
    const pTradeExitSnapshot = tradeExitSnapshotPromise;
    const pPresence = (presenceIds.length > 0
      ? getCommunityMessengerPresenceSnapshotsByUserIds(presenceIds)
      : Promise.resolve(new Map<string, CommunityMessengerPeerPresenceSnapshot>())
    ).then((r) => {
      if (diagnostics) {
        diagnostics.normalizeTimelinePresenceEndMs = Math.round(performance.now() - tBootstrap0);
      }
      return r;
    });
    if (isFastTier) {
      tradeChatRoomDetail = null;
      const [, phase2] = await Promise.all([
        enrichPromise,
        Promise.all([pCall, pPresence, pTradeExitSnapshot]),
      ]);
      activeCall = phase2[0] as CommunityMessengerCallSession | null;
      presenceMap = phase2[1] as Map<string, CommunityMessengerPeerPresenceSnapshot>;
      tradeProductChatExitForSnapshot = phase2[2] as Awaited<ReturnType<typeof loadTradeProductChatExitSnapshotForMessengerRoom>>;
      if (diagnostics) {
        diagnostics.normalizeTimelineParallelOuterEndMs = Math.round(performance.now() - tBootstrap0);
        diagnostics.tradeChatRoomDetailNormalizePhaseMs = 0;
        const s = diagnostics.normalizeTimelineSummaryEndMs ?? diagnostics.snapshotNormalizeStartMs ?? 0;
        const cands: Array<[string, number | undefined]> = [
          ["enrichTradeRoomContextMetaForBootstrap_chain", diagnostics.normalizeTimelineEnrichPathEndMs],
          ["getActiveCallSessionForRoom", diagnostics.normalizeTimelineActiveCallEndMs],
          ["fetchPresenceSnapshotsByUserIds", diagnostics.normalizeTimelinePresenceEndMs],
        ];
        let maxN = "";
        let maxMs = -1;
        for (const [n, end] of cands) {
          if (end == null) continue;
          const d = end - s;
          if (d > maxMs) {
            maxMs = d;
            maxN = n;
          }
        }
        if (maxMs >= 0 && maxN) {
          diagnostics.normalizeSlowestNormalizeSubstepName = maxN;
          diagnostics.normalizeSlowestNormalizeSubstepFromSummaryMs = Math.round(maxMs);
        }
      }
    } else {
      const tTradeDetailNorm0 = performance.now();
      const pTrade = tradeChatRoomDetailPromiseFromMessengerRoomRow(room, userId, diagnostics?.chatRoomDetailLoad).then(
        (r) => {
          if (diagnostics) {
            diagnostics.tradeChatRoomDetailNormalizePhaseMs = Math.round(performance.now() - tTradeDetailNorm0);
            diagnostics.normalizeTimelineTradeDetailEndMs = Math.round(performance.now() - tBootstrap0);
          }
          return r;
        }
      );
      const [, phase2] = await Promise.all([enrichPromise, Promise.all([pCall, pTrade, pPresence, pTradeExitSnapshot])]);
      activeCall = phase2[0] as CommunityMessengerCallSession | null;
      tradeChatRoomDetail = phase2[1] as ChatRoom | null;
      presenceMap = phase2[2] as Map<string, CommunityMessengerPeerPresenceSnapshot>;
      tradeProductChatExitForSnapshot = phase2[3] as Awaited<ReturnType<typeof loadTradeProductChatExitSnapshotForMessengerRoom>>;
      if (diagnostics) {
        diagnostics.normalizeTimelineParallelOuterEndMs = Math.round(performance.now() - tBootstrap0);
        const s = diagnostics.normalizeTimelineSummaryEndMs ?? diagnostics.snapshotNormalizeStartMs ?? 0;
        const cands: Array<[string, number | undefined]> = [
          ["enrichTradeRoomContextMetaForBootstrap_chain", diagnostics.normalizeTimelineEnrichPathEndMs],
          ["getActiveCallSessionForRoom", diagnostics.normalizeTimelineActiveCallEndMs],
          ["tradeChatRoomDetailPromiseFromMessengerRoomRow", diagnostics.normalizeTimelineTradeDetailEndMs],
          ["fetchPresenceSnapshotsByUserIds", diagnostics.normalizeTimelinePresenceEndMs],
        ];
        let maxN = "";
        let maxMs = -1;
        for (const [n, end] of cands) {
          if (end == null) continue;
          const d = end - s;
          if (d > maxMs) {
            maxMs = d;
            maxN = n;
          }
        }
        if (maxMs >= 0 && maxN) {
          diagnostics.normalizeSlowestNormalizeSubstepName = maxN;
          diagnostics.normalizeSlowestNormalizeSubstepFromSummaryMs = Math.round(maxMs);
        }
      }
    }
  } else if (room && !isCriticalTier) {
    /**
     * seed(lite) / RSC 첫 응답: 통화·presence·trade context enrich 은 첫 응답에서 await 하지 않는다.
     * 거래 방 상품 카드(`tradeChatRoomDetail`)는 위에서 프로필과 병렬 로드되어 스냅샷에 포함된다.
     * `bootstrapEnrichmentPending` + 클라 `snapshotTier=silent_delta` 사일런트 GET 이 포인터·unread 만 합류한다.
     */
    if (diagnostics) {
      diagnostics.normalizeTimelineParallelOuterEndMs = Math.round(performance.now() - tBootstrap0);
    }
  } else {
    if (diagnostics) {
      diagnostics.normalizeTimelineParallelOuterEndMs = diagnostics.normalizeTimelineSummaryEndMs;
    }
  }
  const tMembersMap0 = performance.now();
  const members = hydratedLabels.members.map((profile) =>
    ({
      ...(resolveRoomProfileLite(profile, roomProfileMap.get(roomProfileKey(id, profile.id))) ?? profile),
      memberRole:
        participants.find((item) => ("user_id" in item ? item.user_id : item.userId) === profile.id)?.role ?? undefined,
    }) satisfies CommunityMessengerProfileLite
  );
  if (diagnostics) {
    diagnostics.membersMapMs = Math.round(performance.now() - tMembersMap0);
  }
  tHiDeferAfterMembersMap = performance.now();
  if (diagnostics) {
    diagnostics.normalizeTimelineMembersMapEndMs = Math.round(performance.now() - tBootstrap0);
  }
  const profileMap = hydratedLabels.profileMap;
  const meParticipant = participants.find(
    (item) => ("user_id" in item ? item.user_id : item.userId) === userId
  ) as ParticipantRow | DevParticipant | undefined;
  const meRole = meParticipant?.role ?? "member";
  const peerParticipant =
    summary.roomType === "direct"
      ? participants.find((item) => ("user_id" in item ? item.user_id : item.userId) !== userId)
      : undefined;
  const peerUserId = trimText(summary.peerUserId ?? "");
  const resolvedPresenceMap = presenceMap;
  const peerReadCursorId = peerParticipant ? participantLastReadMessageId(peerParticipant) : null;
  let peerLastReadMessageCreatedAt: string | null = null;
  if (summary.roomType === "direct" && peerReadCursorId) {
    if (trimText(peerReadCursorId) === trimText(bootstrapPeerReadCursorIdForFetch ?? "")) {
      peerLastReadMessageCreatedAt = peerReadCursorCreatedAtPrefetched;
    } else if (sb && !isCriticalTier) {
      const { data: peerCursorRow } = await (sb as any)
        .from("community_messenger_messages")
        .select("created_at")
        .eq("room_id", id)
        .eq("id", peerReadCursorId)
        .maybeSingle();
      const ca = (peerCursorRow as { created_at?: string | null } | null)?.created_at;
      peerLastReadMessageCreatedAt = typeof ca === "string" && ca.trim() ? ca.trim() : null;
    }
  }
  const readReceipt: CommunityMessengerReadReceipt | null =
    summary.roomType === "direct" && peerParticipant
      ? {
          roomId: id,
          readerUserId: peerUserId || ("user_id" in peerParticipant ? peerParticipant.user_id : peerParticipant.userId),
          lastReadAt: participantLastReadAt(peerParticipant),
          lastReadMessageId: participantLastReadMessageId(peerParticipant),
          lastReadMessageCreatedAt: peerLastReadMessageCreatedAt,
        }
      : null;
  const peerPresence =
    deferSecondary || isCriticalTier || !peerUserId ? null : (resolvedPresenceMap.get(peerUserId) ?? null);

  /** 메시지마다 `members.find` 선형 탐색 제거 — 발신자 id 기준 O(1) */
  const memberByUserId = new Map<string, CommunityMessengerProfileLite>();
  for (const m of members) {
    const mid = m.id;
    if (typeof mid === "string" && mid && !memberByUserId.has(mid)) {
      memberByUserId.set(mid, m);
    }
  }

  const tMappedMessages0 = performance.now();
  const traceMappedMessages = deferSecondary && !!diagnostics;
  const mappedMsgAcc = traceMappedMessages
    ? {
        messageShapeAndMetadata: 0,
        senderLabelResolve: 0,
        voiceEnvelopeWhenVoice: 0,
        messengerImageClientFieldsFromMetadata: 0,
      }
    : null;
  /** 메시지마다 resolveRoomProfileLite·roomProfileKey·profileLabel 체인 반복 제거 */
  const senderIdsInMessages = new Set<string>();
  /** 위 sender 스캔과 동일 값 — map 단계에서 row.sender_* 를 다시 읽지 않음 */
  const messageSenderIdByMi: Array<string | null> = new Array(messages.length);
  /** 스캔 시점과 동일 — map 의 messageShapeAndMetadata 구간에서 message_type·metadata 재읽기 제거 */
  const messageSafeMtByMi: CommunityMessengerMessage["messageType"][] = new Array(messages.length);
  const messageRawMetaByMi: Array<Record<string, unknown> | null | undefined> = new Array(messages.length);
  /** 반환용 room / created — map 에서 rowDb·rowDev 로 room_id·created_at 재읽기 제거 */
  const messageRoomIdByMi: string[] = new Array(messages.length);
  const messageCreatedAtRawByMi: Array<string | null> = new Array(messages.length);
  /** map 의 messageShapeAndMetadata 구간에서 client_message_id 파싱 반복 제거 */
  const messageClientMessageIdByMi: Array<string | null> = new Array(messages.length);
  for (let mi = 0; mi < messages.length; mi += 1) {
    const msg = messages[mi];
    const dbRow = "sender_id" in msg;
    const sid = (dbRow ? msg.sender_id : msg.senderId) ?? null;
    messageSenderIdByMi[mi] = sid;
    if (dbRow) {
      const r = msg as MessageRow;
      messageSafeMtByMi[mi] = r.message_type as CommunityMessengerMessage["messageType"];
      messageRawMetaByMi[mi] = r.metadata;
      messageRoomIdByMi[mi] = r.room_id;
      messageCreatedAtRawByMi[mi] = r.created_at;
    } else {
      const d = msg as DevMessage;
      messageSafeMtByMi[mi] = d.messageType as CommunityMessengerMessage["messageType"];
      messageRawMetaByMi[mi] = d.metadata;
      messageRoomIdByMi[mi] = d.roomId;
      messageCreatedAtRawByMi[mi] = d.createdAt;
    }
    const rm = messageRawMetaByMi[mi];
    let cmid: string | null = null;
    if (rm != null) {
      const rawClientMessageId = rm.client_message_id;
      if (typeof rawClientMessageId === "string") {
        const tClient = rawClientMessageId.trim();
        if (tClient) cmid = tClient;
      }
    }
    messageClientMessageIdByMi[mi] = cmid;
    if (sid) senderIdsInMessages.add(sid);
  }
  const senderLabelByUserId = new Map<string, string>();
  for (const uid of senderIdsInMessages) {
    senderLabelByUserId.set(
      uid,
      resolveRoomProfileLite(memberByUserId.get(uid), roomProfileMap.get(roomProfileKey(id, uid)))?.label ??
        profileLabel(profileMap.get(uid), uid)
    );
  }
  /** `metadata === null` 인 행마다 새 `{}` 할당하지 않음 — 읽기 전용으로만 사용 */
  const emptyMessageMetadata: Record<string, unknown> = {};
  /** 비보이스 메시지마다 `voiceExtra` 용 새 `{}` 할당 방지 — spread 만 하며 변이 없음 */
  const emptyVoiceEnvelopeExtra = {};
  if (traceMappedMessages) {
    resetMessengerImageMetaDiagnosticsCounts();
  }
  const tBeforeMessageMap = performance.now();
  if (diagnostics) {
    diagnostics.messagesPipelinePrepMs = Math.round(tBeforeMessageMap - tMappedMessages0);
  }
  const mappedMessages: CommunityMessengerMessage[] = messages.map((message, mi) => {
    let tStep = performance.now();
    const senderId = messageSenderIdByMi[mi];
    const safeMt = messageSafeMtByMi[mi];
    const rawMeta = messageRawMetaByMi[mi];
    const clientMessageId = messageClientMessageIdByMi[mi];
    const metadata = (rawMeta ?? emptyMessageMetadata) as Record<string, unknown>;
    if (mappedMsgAcc) {
      mappedMsgAcc.messageShapeAndMetadata += performance.now() - tStep;
      tStep = performance.now();
    }
    const senderLabel = senderId
      ? (senderLabelByUserId.get(senderId) ?? profileLabel(profileMap.get(senderId), senderId))
      : cmServiceT("cm_svc_system");
    if (mappedMsgAcc) {
      mappedMsgAcc.senderLabelResolve += performance.now() - tStep;
      tStep = performance.now();
    }
    const rowDb = "sender_id" in message;
    const dfeAt = rowDb ? trimText((message as MessageRow).deleted_for_everyone_at) : "";
    const deletedForEveryone = dfeAt.length > 0;
    const rawContent = trimText(message.content);
    let voiceExtra: object;
    if (safeMt !== "voice" || deletedForEveryone) {
      voiceExtra = emptyVoiceEnvelopeExtra;
    } else {
      const dur = metadata.durationSeconds;
      const peaksIn = metadata.waveformPeaks;
      const mimeIn = metadata.mimeType;
      voiceExtra = {
        voiceDurationSeconds: Math.max(0, Math.floor(Number(dur ?? 0)) || 0),
        voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(peaksIn) ?? null,
        voiceMimeType: trimText(mimeIn as string) || null,
      };
    }
    if (mappedMsgAcc) {
      mappedMsgAcc.voiceEnvelopeWhenVoice += performance.now() - tStep;
      tStep = performance.now();
    }
    const contentTrimmed = deletedForEveryone ? resolveDeletedMessagePlaceholder() : rawContent;
    const imageExtra =
      !isCriticalTier && safeMt === "image" && !deletedForEveryone
        ? messengerImageClientFieldsFromMetadata(safeMt, metadata, rawContent)
        : {};
    if (mappedMsgAcc) {
      mappedMsgAcc.messengerImageClientFieldsFromMetadata += performance.now() - tStep;
    }
    const rdb = rowDb ? (message as MessageRow) : null;
    const replyPieces =
      !isCriticalTier &&
      rdb &&
      trimText(rdb.reply_to_message_id)
        ? {
            replyToMessageId: trimText(rdb.reply_to_message_id) || null,
            ...(trimText(rdb.reply_preview_text) ? { replyPreviewText: trimText(rdb.reply_preview_text) } : {}),
            ...(trimText(rdb.reply_preview_type) ? { replyPreviewType: trimText(rdb.reply_preview_type) } : {}),
            ...(trimText(rdb.reply_sender_label_snapshot)
              ? { replySenderLabelSnapshot: trimText(rdb.reply_sender_label_snapshot) }
              : {}),
          }
        : {};
    const rxList = snapshotRoomMessageReactionsById.get(message.id);
    const reactionPieces = !isCriticalTier && rxList?.length ? { reactions: rxList } : {};
    const dfeField = deletedForEveryone ? { deletedForEveryoneAt: dfeAt } : {};
    return {
      id: message.id,
      roomId: messageRoomIdByMi[mi],
      senderId,
      senderLabel,
      messageType: safeMt,
      content: contentTrimmed,
      createdAt: trimText(messageCreatedAtRawByMi[mi]) || nowIso(),
      metadata: rawMeta ?? null,
      clientMessageId,
      isMine: senderId === userId,
      callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
      callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
      callSessionId: trimText(metadata.sessionId as string) || null,
      ...replyPieces,
      ...dfeField,
      ...voiceExtra,
      ...imageExtra,
      ...reactionPieces,
    };
  });
  if (diagnostics) {
    diagnostics.messagesMapCpuMs = Math.round(performance.now() - tBeforeMessageMap);
  }
  if (mappedMsgAcc && diagnostics) {
    const rounded: Record<string, number> = {};
    let maxN = "";
    let maxV = -1;
    for (const [k, v] of Object.entries(mappedMsgAcc)) {
      const r = Math.round(v * 100) / 100;
      rounded[k] = r;
      if (v > maxV) {
        maxV = v;
        maxN = k;
      }
    }
    diagnostics.mappedMessagesNormalizeSubstepsMs = rounded;
    if (maxN) {
      diagnostics.mappedMessagesSlowestSubstepName = maxN;
      diagnostics.mappedMessagesSlowestSubstepMs = Math.round(maxV * 100) / 100;
    }
    const imgMeta = peekMessengerImageMetaDiagnosticsCounts();
    diagnostics.imageMetaCallCount = imgMeta.imageMetaCallCount;
    diagnostics.imageMetaAlbumCandidateCount = imgMeta.imageMetaAlbumCandidateCount;
    diagnostics.imageMetaAlbumParseElementTotal = imgMeta.imageMetaAlbumParseElementTotal;
    diagnostics.imageMetaSingleFallbackCount = imgMeta.imageMetaSingleFallbackCount;
  }
  tHiDeferAfterMessagesMap = performance.now();
  normalizeMergeMs += performance.now() - tMappedMessages0;
  if (diagnostics) {
    diagnostics.snapshotNormalizeDoneMs = Math.round(performance.now() - tBootstrap0);
    diagnostics.normalizeTimelineMessageMapEndMs = diagnostics.snapshotNormalizeDoneMs;
    if (didFullSecondaryParallel) {
      const ns = diagnostics.snapshotNormalizeStartMs ?? 0;
      const tt = diagnostics.normalizeTimelineTradeDetailEndMs;
      const tc = diagnostics.normalizeTimelineActiveCallEndMs;
      const tp = diagnostics.normalizeTimelinePresenceEndMs;
      const tm = diagnostics.snapshotNormalizeDoneMs;
      if (tt != null) diagnostics.normalizeGapNsToTradeMs = Math.round(tt - ns);
      if (tt != null && tc != null) diagnostics.normalizeGapTradeToCallMs = Math.round(tc - tt);
      if (tc != null && tp != null) diagnostics.normalizeGapCallToPresenceMs = Math.round(tp - tc);
      if (tp != null && tm != null) diagnostics.normalizeGapPresenceToMessageMapMs = Math.round(tm - tp);
      if (tm != null) diagnostics.normalizeGapMessageMapToNormalizeDoneMs = 0;
    }
    /**
     * `deferSecondary` 시드 경로에는 enrich/call/trade/presence 병렬 구간이 없어 위 `didFullSecondaryParallel` 분기가 돌지 않는다.
     * `normalizeTimelineSummaryEndMs` 이후 실제로 도는 members·messages map 구간 중 느린 쪽을 slowest 로 남긴다.
     */
    if (deferSecondary) {
      const dMembersHi = Math.max(0, tHiDeferAfterMembersMap - tHiDeferAfterSummary);
      const dMsgsHi = Math.max(0, tHiDeferAfterMessagesMap - tHiDeferAfterMembersMap);
      const cands: Array<[string, number]> = [
        ["hydratedMembersMapForSnapshot", dMembersHi],
        ["mappedMessagesForSnapshot", dMsgsHi],
      ];
      let maxN = "";
      let maxMs = -1;
      for (const [n, d] of cands) {
        if (d > maxMs) {
          maxMs = d;
          maxN = n;
        }
      }
      if (maxMs >= 0 && maxN) {
        diagnostics.normalizeSlowestNormalizeSubstepName = maxN;
        /** 1ms 미만 구간도 0으로만 보이지 않게 둘째 자리까지 유지 */
        diagnostics.normalizeSlowestNormalizeSubstepFromSummaryMs = Math.round(maxMs * 100) / 100;
      }
    }
  }

  /** `critical` 티어: trade exit·상세·normalize·enrich 없음 — silent full 부트스트랩에서만 채운다 */
  let tradeMessagingForSnapshot: CommunityMessengerTradeMessagingSnapshot | undefined;
  const isGeneralFriendPairDirectKey = isMessengerGeneralFriendDirectKey(summary.messengerDirectKey);
  if (sb && !isCriticalTier && !isGeneralFriendPairDirectKey) {
    let tradePc = tradeProductChatExitForSnapshot;
    if (!tradePc && summary.contextMeta?.kind === "trade") {
      tradePc = await loadTradeProductChatExitSnapshotForMessengerRoom(sb, id, summary.contextMeta, {
        directKey: summary.messengerDirectKey,
      });
    }
    if (
      !tradePc &&
      (tradeChatRoomDetail || earlyTradeContextMetaForExitSnapshot?.kind === "trade")
    ) {
      tradePc = await loadTradeProductChatExitSnapshotForMessengerRoom(sb, id, null, {
        directKey: summary.messengerDirectKey,
      });
    }
    const ev = evaluateTradeMessagingForMessengerRoom({
      viewerUserId: userId,
      roomType: summary.roomType,
      contextMeta: summary.contextMeta ?? null,
      tradeProductChat: tradePc,
    });
    tradeMessagingForSnapshot = {
      productChat: tradePc
        ? {
            sellerId: tradePc.sellerId,
            buyerId: tradePc.buyerId,
            sellerLeftAt: tradePc.sellerLeftAt,
            buyerLeftAt: tradePc.buyerLeftAt,
          }
        : null,
      canSendMessage: ev.canSendMessage,
      denyCode: ev.denyCode,
      denyMessage: ev.denyMessage,
    };
  }

  let unknownPeerNoticeDismissed: boolean | undefined;
  const peerForNotice = trimText(summary.peerUserId ?? "");
  const contextKind = summary.contextMeta?.kind;
  if (
    summary.roomType === "direct" &&
    peerForNotice &&
    contextKind !== "trade" &&
    contextKind !== "delivery"
  ) {
    unknownPeerNoticeDismissed = await isUnknownPeerNoticeDismissed(userId, peerForNotice, id);
  }

  let peerFriendshipState: CommunityMessengerRoomSnapshot["peerFriendshipState"];
  let friendshipDirection: CommunityMessengerRoomSnapshot["friendshipDirection"];
  let pendingFriendshipRequestId: CommunityMessengerRoomSnapshot["pendingFriendshipRequestId"];
  let directCallGate: CommunityMessengerRoomSnapshot["directCallGate"];
  let peerRelationLabel: CommunityMessengerRoomSnapshot["peerRelationLabel"];
  let membersForSnapshot = members;
  const isGeneralDirectRoom =
    summary.roomType === "direct" &&
    Boolean(peerUserId) &&
    isMessengerGeneralFriendDirectKey(summary.messengerDirectKey);
  if (isGeneralDirectRoom && sb) {
    const friendshipResolved = await resolveFriendshipPair(sb, userId, peerUserId);
    const friendshipProjection = projectRoomSnapshotFriendshipFromResolution(friendshipResolved);
    peerFriendshipState = friendshipProjection.peerFriendshipState;
    friendshipDirection = friendshipProjection.friendshipDirection;
    pendingFriendshipRequestId = friendshipProjection.pendingFriendshipRequestId;
    const gateResult = await canStartDirectCallBetweenUsers({
      callerUserId: userId,
      calleeUserId: peerUserId,
      roomId: id,
      callKind: "audio",
      supabase: sb,
      friendshipPreload: friendshipPairResolutionFromResolved(friendshipResolved),
      /** critical/defer 첫 페인트 — participant room 쿼리는 API gate 에 위임 */
      skipRoomCheck: isCriticalTier || deferSecondary,
    });
    directCallGate = directCallGateFromPermissionResult(gateResult);
    peerRelationLabel = gateResult.relationLabel;
    if (friendshipResolved.state === "accepted") {
      membersForSnapshot = members.map((member) =>
        member.id === peerUserId ? { ...member, isFriend: true } : member
      );
    }
  }

  const snapshot = {
    viewerUserId: userId,
    room: {
      ...summary,
      description: cmRoomSnapshotDescription({
        roomType: summary.roomType,
        summary: summary.summary,
        memberCount: summary.memberCount,
      }),
    },
    members: membersForSnapshot,
    ...(hydrateFullMemberList ? {} : { membersDeferred: true as const }),
    ...(membersTruncated ? { membersTruncated: true as const } : {}),
    ...(deferSecondary || isCriticalTier ? { bootstrapEnrichmentPending: true as const } : {}),
    messages: mappedMessages,
    bootstrapInitialMessageLimit: snapshotBootstrapInitialMessageLimit,
    hasMoreOlderMessages: snapshotHasMoreOlderMessages,
    myRole: meRole,
    ...(readReceipt ? { readReceipt } : {}),
    ...(peerPresence ? { peerPresence } : {}),
    activeCall,
    ...(tradeChatRoomDetail ? { tradeChatRoomDetail } : {}),
    ...(tradeMessagingForSnapshot ? { tradeMessaging: tradeMessagingForSnapshot } : {}),
    ...(unknownPeerNoticeDismissed !== undefined ? { unknownPeerNoticeDismissed } : {}),
    ...(peerFriendshipState ? { peerFriendshipState } : {}),
    ...(friendshipDirection ? { friendshipDirection } : {}),
    ...(pendingFriendshipRequestId ? { pendingFriendshipRequestId } : {}),
    ...(directCallGate ? { directCallGate } : {}),
    ...(peerRelationLabel ? { peerRelationLabel } : {}),
  };
  if (diagnostics) {
    diagnostics.messagesFetchMs = Math.round(messagesFetchMs);
    diagnostics.participantsProfilesFetchMs = Math.round(participantsProfilesFetchMs);
    diagnostics.normalizeMergeMs = Math.round(normalizeMergeMs);
    diagnostics.roomBootstrapFetchMs = Math.round(performance.now() - tBootstrap0);
    diagnostics.snapshotPreReturnMs = Math.round(performance.now() - tBootstrap0);
  }
  return snapshot;
}

const COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_DEFAULT = 40;
const COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_MAX = 100;

/** 참가자 목록 페이지 — `sortParticipantsForRoomMemberList` 순서로 offset 슬라이스 (부트스트랩과 동일) */
export async function listCommunityMessengerRoomMembersPage(input: {
  userId: string;
  roomId: string;
  offset?: number;
  limit?: number;
}): Promise<
  | { ok: true; members: CommunityMessengerProfileLite[]; total: number; nextOffset: number | null }
  | { ok: false; error: "room_not_found" | "bad_request" }
> {
  const roomId = trimText(input.roomId);
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const pageLimit = Math.min(
    COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_MAX,
    Math.max(1, Math.floor(Number(input.limit) || COMMUNITY_MESSENGER_ROOM_MEMBERS_PAGE_DEFAULT))
  );
  if (!roomId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();

  const mapPageRowsToMembers = async (
    pageRows: Array<ParticipantRow | DevParticipant>
  ): Promise<CommunityMessengerProfileLite[]> => {
    const memberIds = dedupeParticipantUserIds(pageRows);
    const roomProfileMap = await fetchRoomProfilesByRoomIds([roomId]);
    const hydrated = await hydrateProfilesWithProfileMap(input.userId, memberIds, { includeSelf: true });
    return hydrated.members.map((profile) =>
      ({
        ...(resolveRoomProfileLite(profile, roomProfileMap.get(roomProfileKey(roomId, profile.id))) ?? profile),
        memberRole: pageRows.find((item) => participantRowUserId(item) === profile.id)?.role ?? undefined,
      }) satisfies CommunityMessengerProfileLite
    );
  };

  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: "bad_request" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const all = dev.participants.filter((p) => p.roomId === roomId);
    const sorted = sortParticipantsForRoomMemberList(all);
    const total = sorted.length;
    const pageRows = sorted.slice(offset, offset + pageLimit);
    const members = await mapPageRowsToMembers(pageRows);
    const nextOffset = offset + pageRows.length < total ? offset + pageRows.length : null;
    return { ok: true, members, total, nextOffset };
  }

  const { data: myParticipant } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!myParticipant) return { ok: false, error: "room_not_found" };

  const { data: participantData, error: partErr } = await (sb as any)
    .from("community_messenger_participants")
    .select("id, room_id, user_id, role, unread_count, is_muted, is_pinned, is_archived, joined_at")
    .eq("room_id", roomId);
  if (partErr && !isMissingTableError(partErr)) {
    return { ok: false, error: "bad_request" };
  }
  const raw = (participantData ?? []) as ParticipantRow[];
  const sorted = sortParticipantsForRoomMemberList(raw);
  const total = sorted.length;
  const pageRows = sorted.slice(offset, offset + pageLimit);
  const members = await mapPageRowsToMembers(pageRows);
  const nextOffset = offset + pageRows.length < total ? offset + pageRows.length : null;
  return { ok: true, members, total, nextOffset };
}

const COMMUNITY_MESSENGER_MESSAGE_PAGE_DEFAULT = 50;
const COMMUNITY_MESSENGER_MESSAGE_PAGE_MAX = 100;

/** 스냅샷 초기 윈도우보다 오래된 메시지를 커서(`beforeMessageId`) 기준으로 페이지 로드 */
export async function listCommunityMessengerRoomMessagesBefore(input: {
  userId: string;
  roomId: string;
  beforeMessageId: string;
  limit?: number;
}): Promise<
  { ok: true; messages: CommunityMessengerMessage[]; hasMore: boolean } | { ok: false; error: string }
> {
  const roomId = trimText(input.roomId);
  const beforeMessageId = trimText(input.beforeMessageId);
  const pageLimit = Math.min(
    COMMUNITY_MESSENGER_MESSAGE_PAGE_MAX,
    Math.max(1, Math.floor(Number(input.limit) || COMMUNITY_MESSENGER_MESSAGE_PAGE_DEFAULT))
  );
  if (!roomId || !beforeMessageId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();

  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const anchor = dev.messages.find((m) => m.id === beforeMessageId && m.roomId === roomId);
    if (!anchor) return { ok: false, error: "not_found" };
    const pool = dev.messages
      .filter((m) => m.roomId === roomId && m.createdAt.localeCompare(anchor.createdAt) < 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const page = pool.slice(0, pageLimit + 1);
    const hasMore = page.length > pageLimit;
    const sliced = page.slice(0, pageLimit).reverse();
    const senderIds = dedupeIds(sliced.map((m) => m.senderId).filter((id): id is string => Boolean(id)));
    const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const messages: CommunityMessengerMessage[] = sliced.map((message) => {
      const senderId = message.senderId;
      const isMine = senderId === input.userId;
      const metadata = message.metadata ?? {};
      const safeMt = message.messageType;
      return {
        id: message.id,
        roomId: message.roomId,
        senderId,
        senderLabel: cmSenderDisplayLabel(
          senderId ?? "",
          input.userId,
          senderId ? profileLabel(profileById.get(senderId), senderId) : ""
        ),
        messageType: safeMt,
        content: trimText(message.content),
        createdAt: message.createdAt,
        isMine,
        callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
        callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
        callSessionId: trimText(metadata.sessionId as string) || null,
        ...(safeMt === "voice"
          ? {
              voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
              voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
              voiceMimeType: trimText(metadata.mimeType as string) || null,
            }
          : {}),
        ...(safeMt === "file"
          ? {
              fileName: trimText(metadata.fileName as string) || null,
              fileMimeType: trimText(metadata.mimeType as string) || null,
              fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
            }
          : {}),
        ...(safeMt === "image"
          ? messengerImageClientFieldsFromMetadata(safeMt, metadata as Record<string, unknown>, trimText(message.content))
          : {}),
      };
    });
    return { ok: true, messages, hasMore };
  }

  const { data: myParticipant } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!myParticipant) return { ok: false, error: "room_not_found" };

  const anchorHidden = await fetchCommunityMessengerHiddenMessageIdsForUser(sb as SupabaseLike, input.userId, [
    beforeMessageId,
  ]);
  if (anchorHidden.has(beforeMessageId)) return { ok: false, error: "not_found" };

  const { data: anchorRow, error: anchorErr } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, created_at")
    .eq("id", beforeMessageId)
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .maybeSingle();
  if (anchorErr || !anchorRow) return { ok: false, error: "not_found" };

  const anchorCreatedAt = trimText((anchorRow as { created_at?: string | null }).created_at);
  if (!anchorCreatedAt) return { ok: false, error: "not_found" };

  const { data: rows, error: msgErr } = await queryCommunityMessengerMessageRowsWithSelectFallback((cols) =>
    (sb as any)
      .from("community_messenger_messages")
      .select(cols)
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .lt("created_at", anchorCreatedAt)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageLimit + 1)
  );
  if (msgErr && !isMissingTableError(msgErr)) {
    return { ok: false, error: "load_failed" };
  }

  const raw = (rows ?? []) as MessageRow[];
  const hasMore = raw.length > pageLimit;
  const ascRows = raw.slice(0, pageLimit).reverse();
  const ascMessageIds = ascRows.map((r) => r.id);
  const senderIdsPre = dedupeIds(ascRows.map((r) => trimText(r.sender_id)).filter(Boolean));
  const [rx, hidden, profilePack] = await Promise.all([
    fetchCommunityMessengerReactionAggregatesForMessages(
      sb as SupabaseLike,
      ascMessageIds,
      input.userId,
      { authorUserIdByMessageId: communityMessengerAuthorUserIdByMessageIdForReactions(ascRows) }
    ),
    fetchCommunityMessengerHiddenMessageIdsForUser(sb as SupabaseLike, input.userId, ascMessageIds),
    hydrateProfilesLabelsOnlyWithMap(input.userId, senderIdsPre, {
      includeSelf: true,
      bootstrapLiteFirstPaint: true,
    }),
  ]);
  const visibleRows = ascRows.filter((r) => !hidden.has(r.id));
  const profileById = new Map(profilePack.members.map((m) => [m.id, m]));
  const messages = visibleRows.map((row) =>
    mapCommunityMessengerDbMessageRowToMessage({
      row,
      viewerUserId: input.userId,
      profileById,
      reactions: rx.get(row.id),
    })
  );
  return { ok: true, messages, hasMore };
}

/** `afterMessageId` 보다 새 메시지만 (증분 동기·탭 복귀 갭 메우기). 전체 목록 전송 회피 */
export type CommunityMessengerMessagesAfterPerf = {
  messages_fetch_ms?: number;
  reactions_ms?: number;
  hidden_ms?: number;
  profiles_ms?: number;
  payload_ms?: number;
};

export async function listCommunityMessengerRoomMessagesAfter(input: {
  userId: string;
  roomId: string;
  afterMessageId: string;
  limit?: number;
  /** Route Handler dev breakdown — HTTP 응답에 포함되지 않음 */
  _perf?: CommunityMessengerMessagesAfterPerf;
}): Promise<
  { ok: true; messages: CommunityMessengerMessage[]; hasMore: boolean } | { ok: false; error: string }
> {
  const roomId = trimText(input.roomId);
  const afterMessageId = trimText(input.afterMessageId);
  const pageLimit = Math.min(
    COMMUNITY_MESSENGER_MESSAGE_PAGE_MAX,
    Math.max(1, Math.floor(Number(input.limit) || COMMUNITY_MESSENGER_MESSAGE_PAGE_DEFAULT))
  );
  if (!roomId || !afterMessageId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();

  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const anchor = dev.messages.find((m) => m.id === afterMessageId && m.roomId === roomId);
    if (!anchor) return { ok: false, error: "not_found" };
    const pool = dev.messages
      .filter((m) => {
        if (m.roomId !== roomId) return false;
        if (m.createdAt > anchor.createdAt) return true;
        if (m.createdAt === anchor.createdAt) return m.id.localeCompare(anchor.id) > 0;
        return false;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const page = pool.slice(0, pageLimit + 1);
    const hasMore = page.length > pageLimit;
    const sliced = page.slice(0, pageLimit);
    const senderIds = dedupeIds(sliced.map((m) => m.senderId).filter((id): id is string => Boolean(id)));
    const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const messages: CommunityMessengerMessage[] = sliced.map((message) => {
      const senderId = message.senderId;
      const isMine = senderId === input.userId;
      const metadata = message.metadata ?? {};
      const safeMt = message.messageType;
      return {
        id: message.id,
        roomId: message.roomId,
        senderId,
        senderLabel: cmSenderDisplayLabel(
          senderId ?? "",
          input.userId,
          senderId ? profileLabel(profileById.get(senderId), senderId) : ""
        ),
        messageType: safeMt,
        content: trimText(message.content),
        createdAt: message.createdAt,
        isMine,
        callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
        callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
        callSessionId: trimText(metadata.sessionId as string) || null,
        ...(safeMt === "voice"
          ? {
              voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
              voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
              voiceMimeType: trimText(metadata.mimeType as string) || null,
            }
          : {}),
        ...(safeMt === "file"
          ? {
              fileName: trimText(metadata.fileName as string) || null,
              fileMimeType: trimText(metadata.mimeType as string) || null,
              fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
            }
          : {}),
        ...(safeMt === "image"
          ? messengerImageClientFieldsFromMetadata(safeMt, metadata as Record<string, unknown>, trimText(message.content))
          : {}),
      };
    });
    return { ok: true, messages, hasMore };
  }

  const anchorHiddenAfter = await fetchCommunityMessengerHiddenMessageIdsForUser(sb as SupabaseLike, input.userId, [
    afterMessageId,
  ]);
  if (anchorHiddenAfter.has(afterMessageId)) return { ok: false, error: "not_found" };

  const tRpc0 = typeof performance !== "undefined" ? performance.now() : 0;
  const { data: rpcRows, error: rpcErr } = await (sb as any).rpc("community_messenger_room_messages_after", {
    p_user_id: input.userId,
    p_room_id: roomId,
    p_after_message_id: afterMessageId,
    p_limit: pageLimit + 1,
  });
  const rpcMs = typeof performance !== "undefined" ? Math.round(performance.now() - tRpc0) : 0;
  if (input._perf) input._perf.messages_fetch_ms = rpcMs;
  if (rpcErr) {
    if (isMissingTableError(rpcErr) || String(rpcErr.message ?? "").includes("function") || String(rpcErr.code ?? "") === "42883") {
      return { ok: false, error: "migration_required" };
    }
    return { ok: false, error: "load_failed" };
  }
  const raw = ((rpcRows ?? []) as MessageRow[]).slice();
  const hasMore = raw.length > pageLimit;
  const pageRows = raw.slice(0, pageLimit);
  const pageMessageIds = pageRows.map((r) => r.id);
  const senderIdsPre = dedupeIds(pageRows.map((r) => trimText(r.sender_id)).filter(Boolean));
  const [rx, hidden, profilePack] = await Promise.all([
    (async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      const out = await fetchCommunityMessengerReactionAggregatesForMessages(
        sb as SupabaseLike,
        pageMessageIds,
        input.userId,
        { authorUserIdByMessageId: communityMessengerAuthorUserIdByMessageIdForReactions(pageRows) }
      );
      if (input._perf) input._perf.reactions_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
      return out;
    })(),
    (async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      const out = await fetchCommunityMessengerHiddenMessageIdsForUser(sb as SupabaseLike, input.userId, pageMessageIds);
      if (input._perf) input._perf.hidden_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
      return out;
    })(),
    (async () => {
      const t0 = typeof performance !== "undefined" ? performance.now() : 0;
      const out = await hydrateProfilesLabelsOnlyWithMap(input.userId, senderIdsPre, {
        includeSelf: true,
        bootstrapLiteFirstPaint: true,
      });
      if (input._perf) input._perf.profiles_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0);
      return out;
    })(),
  ]);
  const tPayload0 = typeof performance !== "undefined" ? performance.now() : 0;
  const visibleRows = pageRows.filter((r) => !hidden.has(r.id));
  const profileById = new Map(profilePack.members.map((m) => [m.id, m]));
  const messages = visibleRows.map((row) =>
    mapCommunityMessengerDbMessageRowToMessage({
      row,
      viewerUserId: input.userId,
      profileById,
      reactions: rx.get(row.id),
    })
  );
  if (input._perf) input._perf.payload_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - tPayload0);
  return { ok: true, messages, hasMore };
}

/** Broadcast bump 의 `messageId` 힌트로 1건 증분 로드 — 전체 `after` 페이지보다 가볍다. */
export async function getCommunityMessengerRoomMessageById(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: true; message: CommunityMessengerMessage } | { ok: false; error: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  if (!roomId || !messageId) return { ok: false, error: "bad_request" };
  const sb = getSupabaseOrNull();
  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    const dev = getDevState();
    const mine = dev.participants.some((p) => p.roomId === roomId && p.userId === input.userId);
    if (!mine) return { ok: false, error: "room_not_found" };
    const row = dev.messages.find((m) => m.id === messageId && m.roomId === roomId);
    if (!row) return { ok: false, error: "not_found" };
    const senderIds = dedupeIds([row.senderId].filter((id): id is string => Boolean(id && String(id).trim())));
    const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const senderId = trimText(row.senderId) || null;
    const metadata = row.metadata ?? {};
    const isMine = senderId === input.userId;
    const mt = trimText(row.messageType) as CommunityMessengerMessage["messageType"];
    const safeMt: CommunityMessengerMessage["messageType"] =
      mt === "image" || mt === "file" || mt === "system" || mt === "call_stub" || mt === "voice" || mt === "sticker" || mt === "community_post_share"
        ? mt
        : "text";
    const clientRaw = metadata.client_message_id;
    const clientMessageId =
      typeof clientRaw === "string" && clientRaw.trim()
        ? clientRaw.trim()
        : typeof metadata.clientMessageId === "string" && metadata.clientMessageId.trim()
          ? metadata.clientMessageId.trim()
          : null;
    const message: CommunityMessengerMessage = {
      id: row.id,
      roomId: row.roomId,
      senderId,
      senderLabel: cmSenderDisplayLabel(
        senderId ?? "",
        input.userId,
        senderId ? profileLabel(profileById.get(senderId), senderId) : ""
      ),
      messageType: safeMt,
      content: trimText(row.content),
      createdAt: row.createdAt,
      clientMessageId,
      isMine,
      callKind: trimText(metadata.callKind) as CommunityMessengerCallKind | null,
      callStatus: trimText(metadata.callStatus) as CommunityMessengerCallStatus | null,
      callSessionId: trimText(metadata.sessionId as string) || null,
      ...(safeMt === "voice"
        ? {
            voiceDurationSeconds: Math.max(0, Math.floor(Number(metadata.durationSeconds ?? 0)) || 0),
            voiceWaveformPeaks: parseVoiceWaveformPeaksFromMetadata(metadata.waveformPeaks) ?? null,
            voiceMimeType: trimText(metadata.mimeType as string) || null,
          }
        : {}),
      ...(safeMt === "file"
        ? {
            fileName: trimText(metadata.fileName as string) || null,
            fileMimeType: trimText(metadata.mimeType as string) || null,
            fileSizeBytes: Math.max(0, Math.floor(Number(metadata.fileSizeBytes ?? 0)) || 0),
          }
        : {}),
      ...(safeMt === "image"
        ? messengerImageClientFieldsFromMetadata(safeMt, metadata as Record<string, unknown>, trimText(row.content))
        : {}),
    };
    return { ok: true, message };
  }

  const { data: myParticipant } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!myParticipant) return { ok: false, error: "room_not_found" };

  const hiddenOne = await fetchCommunityMessengerHiddenMessageIdsForUser(sb as SupabaseLike, input.userId, [messageId]);
  if (hiddenOne.has(messageId)) return { ok: false, error: "not_found" };

  const { data: row, error } = await queryCommunityMessengerMessageRowsWithSelectFallback((cols) =>
    (sb as any)
      .from("community_messenger_messages")
      .select(cols)
      .eq("id", messageId)
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .maybeSingle()
  );
  if (error && !isMissingTableError(error)) {
    return { ok: false, error: "load_failed" };
  }
  if (!row) return { ok: false, error: "not_found" };

  const r = row as MessageRow;
  const senderIds = dedupeIds([trimText(r.sender_id)].filter(Boolean));
  const profiles = await hydrateProfiles(input.userId, senderIds, { includeSelf: true });
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const sid = trimText(r.sender_id);
  const rx = await fetchCommunityMessengerReactionAggregatesForMessages(sb as SupabaseLike, [messageId], input.userId, {
    authorUserIdByMessageId: sid ? new Map([[messageId, sid]]) : undefined,
  });
  const message = mapCommunityMessengerDbMessageRowToMessage({
    row: r,
    viewerUserId: input.userId,
    profileById,
    reactions: rx.get(messageId),
  });
  return { ok: true, message };
}

function parseRpcRecipientUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x ?? "").trim()).filter(Boolean);
}

function communityMessengerTextMessageFromRpcRow(
  roomId: string,
  userId: string,
  msg: Record<string, unknown>
): CommunityMessengerMessage {
  const row: MessageRow = {
    id: String(msg.id ?? ""),
    room_id: String(msg.room_id ?? roomId),
    sender_id: typeof msg.sender_id === "string" ? msg.sender_id : userId,
    message_type: "text",
    content: typeof msg.content === "string" ? msg.content : "",
    metadata: typeof msg.metadata === "object" && msg.metadata !== null ? (msg.metadata as Record<string, unknown>) : {},
    created_at: typeof msg.created_at === "string" ? msg.created_at : null,
    reply_to_message_id: typeof msg.reply_to_message_id === "string" ? msg.reply_to_message_id : null,
    reply_preview_text: typeof msg.reply_preview_text === "string" ? msg.reply_preview_text : null,
    reply_preview_type: typeof msg.reply_preview_type === "string" ? msg.reply_preview_type : null,
    reply_sender_label_snapshot: typeof msg.reply_sender_label_snapshot === "string" ? msg.reply_sender_label_snapshot : null,
    deleted_for_everyone_at: typeof msg.deleted_for_everyone_at === "string" ? msg.deleted_for_everyone_at : null,
  };
  return mapCommunityMessengerDbMessageRowToMessage({
    row,
    viewerUserId: userId,
    profileById: new Map(),
  });
}

function isCommunityMessengerSendTextRpcMissing(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: string }).message ?? "")
      : String(err ?? "");
  return /community_messenger_send_text_message|does not exist|schema cache|Could not find|function|42883|PGRST202/i.test(
    msg
  );
}

async function resolveCommunityMessengerReplyFieldsForFallbackInsert(
  sb: SupabaseLike,
  input: { userId: string; roomId: string; replyToMessageId: string }
): Promise<
  | {
      ok: true;
      fields: {
        reply_to_message_id: string;
        reply_preview_text: string;
        reply_preview_type: string;
        reply_sender_label_snapshot: string;
      };
    }
  | { ok: false; error: string }
> {
  const rid = trimText(input.replyToMessageId);
  if (!rid) return { ok: false, error: "reply_target_not_found" };
  const { data: rr, error } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, sender_id, message_type, content, deleted_at, deleted_for_everyone_at")
    .eq("id", rid)
    .eq("room_id", input.roomId)
    .maybeSingle();
  if (error && !isMissingTableError(error)) return { ok: false, error: "reply_resolve_failed" };
  if (!rr) return { ok: false, error: "reply_target_not_found" };
  const mt = trimText((rr as { message_type?: string }).message_type);
  if (!mt || mt === "system") return { ok: false, error: "reply_target_invalid" };
  if (trimText((rr as { deleted_at?: string | null }).deleted_at)) return { ok: false, error: "reply_target_not_found" };
  const sender = trimText((rr as { sender_id?: string | null }).sender_id);
  let label = cmSvcUserDefaultLabel();
  if (sender) {
    const { data: pr } = await (sb as any).from("profiles").select("nickname, username").eq("id", sender).maybeSingle();
    const nick = trimText((pr as { nickname?: string } | null)?.nickname);
    const user = trimText((pr as { username?: string } | null)?.username);
    label = nick || user || label;
  }
  const dfe = trimText((rr as { deleted_for_everyone_at?: string | null }).deleted_for_everyone_at);
  let preview = "";
  if (dfe) preview = cmSvcDeletedMessagePreview();
  else if (mt === "text") preview = trimText((rr as { content?: string }).content).slice(0, 280);
  else preview = `(${mt})`;
  return {
    ok: true,
    fields: {
      reply_to_message_id: rid,
      reply_preview_text: preview,
      reply_preview_type: mt,
      reply_sender_label_snapshot: label,
    },
  };
}

async function trySendCommunityMessengerTextAtomic(
  sb: any,
  input: { userId: string },
  roomId: string,
  content: string,
  clientMessageId: string,
  replyToMessageId?: string | null
): Promise<
  | {
      ok: true;
      message: CommunityMessengerMessage;
      postAckEffects?: import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").CommunityMessengerSendPostAckEffects;
    }
  | { ok: false; error: string }
  | null
> {
  /**
   * 거래 전송 가드·dedupe·unread 는 `community_messenger_send_text_message` RPC 가 단일 트랜잭션으로 처리.
   * 사전 `product_chats` 조회는 ACK RTT 만 늘리므로 atomic 경로에서는 생략한다.
   */
  const createdAt = nowIso();
  const replyRpc = trimText(replyToMessageId ?? "");
  const { data: rpcRaw, error: rpcErr } = await sb.rpc("community_messenger_send_text_message", {
    p_room_id: roomId,
    p_sender_id: input.userId,
    p_content: content,
    p_client_message_id: clientMessageId.length > 0 ? clientMessageId : null,
    p_created_at: createdAt,
    p_reply_to_message_id: replyRpc.length > 0 ? replyRpc : null,
  });
  if (rpcErr) {
    if (isCommunityMessengerSendTextRpcMissing(rpcErr)) return null;
    return { ok: false, error: String(rpcErr.message ?? "message_send_failed") };
  }
  if (rpcRaw == null || typeof rpcRaw !== "object") {
    return { ok: false, error: "message_send_failed" };
  }
  const payload = rpcRaw as Record<string, unknown>;
  if (payload.ok !== true) {
    const err = typeof payload.error === "string" ? payload.error : "message_send_failed";
    if (err === "trade_seller_closed") {
      return { ok: false, error: cmTradeSellerClosedCopy() };
    }
    if (err === "trade_sender_left") {
      return { ok: false, error: cmTradeSenderLeftCopy() };
    }
    if (err === "trade_chat_mode_locked" || err === "trade_flow_not_chatting") {
      return {
        ok: false,
        error:
          err === "trade_chat_mode_locked"
            ? cmTradeChatModeLockedCopy()
            : cmTradeFlowMessageBlockedCopy(),
      };
    }
    return { ok: false, error: err };
  }
  const msgRow = payload.message;
  if (!msgRow || typeof msgRow !== "object") {
    return { ok: false, error: "message_send_failed" };
  }
  const message = communityMessengerTextMessageFromRpcRow(roomId, input.userId, msgRow as Record<string, unknown>);
  if (clientMessageId && !trimText(message.clientMessageId)) {
    message.clientMessageId = clientMessageId;
  }
  const deduped = payload.deduped === true;
  let postAckEffects:
    | import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").CommunityMessengerSendPostAckEffects
    | undefined;
  if (!deduped) {
    const recipientUserIds = parseRpcRecipientUserIds(payload.recipient_user_ids);
    const dk = payload.room_direct_key;
    const directKeyStr = typeof dk === "string" ? dk : dk == null ? null : String(dk);
    const itemTradeLedgerId = itemTradeChatRoomIdFromMessengerDirectKey(directKeyStr);
    postAckEffects = {
      roomId,
      senderUserId: input.userId,
      content,
      recipientUserIds,
      createdAt: message.createdAt,
      itemTradeLedgerId,
      messageId: message.id,
      directKey: directKeyStr,
      roomType: typeof payload.room_type === "string" ? payload.room_type : null,
      hasMention: /@\S/.test(content),
    };
  }
  return { ok: true, message, postAckEffects };
}

/** POST 응답 body 가 비었을 때 `client_message_id` 로 확정 행 재조회. */
export async function findCommunityMessengerMessageByClientId(input: {
  userId: string;
  roomId: string;
  clientMessageId: string;
}): Promise<CommunityMessengerMessage | null> {
  const roomId = trimText(input.roomId);
  const userId = trimText(input.userId);
  const clientMessageId = trimText(input.clientMessageId);
  if (!roomId || !userId || !clientMessageId) return null;
  const sb = getSupabaseOrNull();
  if (!sb) return null;
  const { data, error } = await queryCommunityMessengerMessageRowsWithSelectFallback((cols) =>
    (sb as any)
      .from("community_messenger_messages")
      .select(cols)
      .eq("room_id", roomId)
      .eq("sender_id", userId)
      .filter("metadata->>client_message_id", "eq", clientMessageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  );
  if (error || !data) return null;
  const prof = await hydrateProfiles(userId, [userId], { includeSelf: true });
  const profileById = new Map(prof.map((m) => [m.id, m]));
  return mapCommunityMessengerDbMessageRowToMessage({
    row: data as MessageRow,
    viewerUserId: userId,
    profileById,
  });
}

export async function sendCommunityMessengerMessage(input: {
  userId: string;
  roomId: string;
  content: string;
  clientMessageId?: string;
  replyToMessageId?: string | null;
  /**
   * `POST .../messages` 가 `messengerRoomCanonicalOrJsonError` 로 참가·방 식별을 마친 뒤 호출할 때 true.
   * 동일 RTT 내 `community_messenger_participants` 존재 조회를 한 번 줄인다.
   */
  membershipPreflightDone?: boolean;
}): Promise<{
  ok: boolean;
  message?: CommunityMessengerMessage;
  error?: string;
  postAckEffects?: import("@/lib/community-messenger/server/community-messenger-send-post-ack-effects").CommunityMessengerSendPostAckEffects;
}> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const clientMessageId = trimText(input.clientMessageId ?? "");
  const replyToMessageIdOpt = trimText(input.replyToMessageId ?? "");
  const membershipPreflightDone = input.membershipPreflightDone === true;
  const sb = getSupabaseOrNull();
  if (sb) {
    const blockGate = await assertDirectRoomCommunicationNotBlocked({
      viewerUserId: input.userId,
      roomId,
      supabase: sb,
    });
    if (!blockGate.ok) {
      return { ok: false, error: "blocked_target" };
    }
  }
  if (sb) {
    const atomic = await trySendCommunityMessengerTextAtomic(
      sb,
      { userId: input.userId },
      roomId,
      content,
      clientMessageId,
      replyToMessageIdOpt || null
    );
    if (atomic !== null) {
      if (atomic.ok) {
        return { ok: true, message: atomic.message, postAckEffects: atomic.postAckEffects };
      }
      return { ok: false, error: atomic.error };
    }
    const roomQ = (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_status, is_readonly, direct_key")
      .eq("id", roomId)
      .maybeSingle();
    const dedupeQ =
      clientMessageId !== ""
        ? queryCommunityMessengerMessageRowsWithSelectFallback((cols) =>
            (sb as any)
              .from("community_messenger_messages")
              .select(cols)
              .eq("room_id", roomId)
              .eq("sender_id", input.userId)
              .filter("metadata->>client_message_id", "eq", clientMessageId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          )
        : Promise.resolve({ data: null, error: null });
    const participantQ = membershipPreflightDone
      ? Promise.resolve({ data: { id: "_" }, error: null })
      : (sb as any)
          .from("community_messenger_participants")
          .select("id")
          .eq("room_id", roomId)
          .eq("user_id", input.userId)
          .maybeSingle();
    const [participantRes, roomRes, dedupeRes] = await Promise.all([participantQ, roomQ, dedupeQ]);
    const participant = participantRes.data;
    const roomData = roomRes.data;
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    let tradeSendGuard = await assertMessengerProductChatLinkedSendAllowed(sb, {
      viewerUserId: input.userId,
      messengerRoomId: roomId,
    });
    if (!tradeSendGuard.ok && tradeSendGuard.error === "trade_product_chat_unlinked") {
      const { reconcileMessengerTradeRoomLinkOnSend } = await import(
        "@/lib/trade/reconcile-messenger-trade-room-link-on-send"
      );
      if (await reconcileMessengerTradeRoomLinkOnSend(sb as never, roomId)) {
        tradeSendGuard = await assertMessengerProductChatLinkedSendAllowed(sb, {
          viewerUserId: input.userId,
          messengerRoomId: roomId,
        });
      }
    }
    if (!tradeSendGuard.ok) {
      return { ok: false, error: tradeSendGuard.error };
    }
    if (clientMessageId) {
      const existingRow = dedupeRes.data;
      const existingError = dedupeRes.error;
      if (!existingError && existingRow) {
        const rowFull = existingRow as MessageRow;
        const prof = await hydrateProfiles(
          input.userId,
          dedupeIds([trimText(rowFull.sender_id), input.userId].filter(Boolean)),
          { includeSelf: true }
        );
        const profileByIdDedupe = new Map(prof.map((m) => [m.id, m]));
        return {
          ok: true,
          message: mapCommunityMessengerDbMessageRowToMessage({
            row: rowFull,
            viewerUserId: input.userId,
            profileById: profileByIdDedupe,
          }),
        };
      }
    }
    const createdAt = nowIso();
    const recipientPrefetch = (sb as any)
      .from("community_messenger_participants")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("user_id", input.userId)
      .is("left_at", null)
      .is("blocked_hidden_at", null);
    let replyInsertFields: Record<string, unknown> = {};
    if (replyToMessageIdOpt) {
      const r = await resolveCommunityMessengerReplyFieldsForFallbackInsert(sb as SupabaseLike, {
        userId: input.userId,
        roomId,
        replyToMessageId: replyToMessageIdOpt,
      });
      if (!r.ok) return { ok: false, error: r.error };
      replyInsertFields = r.fields;
    }
    const insertPromise = queryCommunityMessengerMessageRowsWithSelectFallback((cols) =>
      (sb as any)
        .from("community_messenger_messages")
        .insert({
          room_id: roomId,
          sender_id: input.userId,
          message_type: "text",
          content,
          metadata: clientMessageId ? { client_message_id: clientMessageId } : {},
          created_at: createdAt,
          ...replyInsertFields,
        })
        .select(cols)
        .single()
    );
    const [{ data: insertedMessage, error: insertError }, { data: recipientRowsPrefetch }] = await Promise.all([
      insertPromise,
      recipientPrefetch,
    ]);
    if (!insertError && insertedMessage) {
      const insertedMessageId = String((insertedMessage as { id?: unknown }).id ?? "");
      const roomUpdate = (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: content,
          last_message_at: createdAt,
          last_message_type: "text",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const unreadRpc = (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      const senderReadUpdate =
        insertedMessageId !== ""
          ? (sb as any)
              .from("community_messenger_participants")
              .update({
                last_read_at: createdAt,
                last_read_message_id: insertedMessageId,
              })
              .eq("room_id", roomId)
              .eq("user_id", input.userId)
          : Promise.resolve({ data: null, error: null });
      // Trade ledger write authority = post-ack only (`runCommunityMessengerSendPostAckEffects`).
      // Do not mirror here — fallback previously double-inserted chat_messages when post-ack also ran.
      const itemTradeLedgerId = itemTradeChatRoomIdFromMessengerDirectKey(
        (roomData as { direct_key?: unknown }).direct_key
      );
      const postInsertBatch = await Promise.all([roomUpdate, unreadRpc, senderReadUpdate]);
      const unreadRpcError = (postInsertBatch[1] as { error?: { message?: string } | null })?.error;
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const recipientUserIds = ((recipientRowsPrefetch ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      const hasMention = /@\S/.test(content);
      const directKeyStr = String((roomData as { direct_key?: unknown }).direct_key ?? "").trim() || null;
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, recipientUserIds, roomId);
      const insRow = insertedMessage as MessageRow;
      const profIns = await hydrateProfiles(input.userId, [input.userId], { includeSelf: true });
      const profileByIdIns = new Map(profIns.map((m) => [m.id, m]));
      const mapped = mapCommunityMessengerDbMessageRowToMessage({
        row: insRow,
        viewerUserId: input.userId,
        profileById: profileByIdIns,
      });
      if (clientMessageId && !trimText(mapped.clientMessageId)) {
        mapped.clientMessageId = clientMessageId;
      }
      return {
        ok: true,
        message: mapped,
        postAckEffects: {
          roomId,
          senderUserId: input.userId,
          content,
          recipientUserIds,
          createdAt,
          itemTradeLedgerId,
          messageId: insertedMessageId,
          directKey: directKeyStr,
          hasMention,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      const insErr = insertError as { message?: string } | null | undefined;
      return { ok: false, error: String(insErr?.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "text",
    content,
    metadata: clientMessageId ? { client_message_id: clientMessageId } : {},
    createdAt,
  });
  if (room) {
    room.lastMessage = content;
    room.lastMessageAt = createdAt;
    room.lastMessageType = "text";
  }
  for (const participant of dev.participants.filter((row) => row.roomId === roomId)) {
    if (participant.userId === input.userId) {
      participant.unreadCount = 0;
      participant.lastReadAt = createdAt;
      participant.lastReadMessageId = messageId;
    } else {
      participant.unreadCount += 1;
    }
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: cmServiceT("common_me"),
      messageType: "text",
      content,
      createdAt,
      clientMessageId: clientMessageId || null,
      isMine: true,
      callKind: null,
      callStatus: null,
    },
  };
}

async function appendCommunityMessengerSystemMessage(input: {
  userId: string;
  roomId: string;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const sb = getSupabaseOrNull();
  if (sb) {
    const createdAt = nowIso();
    const { error: insertError } = await (sb as any).from("community_messenger_messages").insert({
      room_id: roomId,
      sender_id: null,
      message_type: "system",
      content,
      metadata: {},
      created_at: createdAt,
    });
    if (!insertError) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: content,
          last_message_at: createdAt,
          last_message_type: "system",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      return { ok: true };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }
  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;
  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const createdAt = nowIso();
  dev.messages.push({
    id: randomUUID(),
    roomId,
    senderId: null,
    messageType: "system",
    content,
    metadata: {},
    createdAt,
  });
  room.lastMessage = content;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "system";
  return { ok: true };
}

const COMMUNITY_MESSENGER_IMAGE_ALBUM_MAX = 10;

function communityMessengerImageMessageMetadata(items: CommunityMessengerImageSendItem[]): Record<string, unknown> {
  if (items.length === 1) {
    const f = items[0]!;
    return {
      storagePath: f.originalStoragePath,
      mimeType: f.originalMimeType,
      image_thumb_url: f.chatPublicUrl,
      image_preview_url: f.previewPublicUrl,
      image_original_url: f.originalPublicUrl,
    };
  }
  return {
    image_thumb_urls: items.map((i) => i.chatPublicUrl),
    image_preview_urls: items.map((i) => i.previewPublicUrl),
    image_urls: items.map((i) => i.originalPublicUrl),
    storage_paths: items.map((i) => i.originalStoragePath),
    mime_types: items.map((i) => i.originalMimeType),
    storagePath: items[0]!.originalStoragePath,
    mimeType: items[0]!.originalMimeType,
  };
}

function communityMessengerBuiltImageClientMessage(
  items: CommunityMessengerImageSendItem[],
  createdAt: string,
  id: string,
  roomId: string,
  userId: string
): CommunityMessengerMessage {
  const first = items[0]!;
  const base: CommunityMessengerMessage = {
    id,
    roomId,
    senderId: userId,
    senderLabel: cmServiceT("common_me"),
    messageType: "image",
    content: first.chatPublicUrl,
    createdAt,
    isMine: true,
    callKind: null,
    callStatus: null,
  };
  if (items.length > 1) {
    return {
      ...base,
      imageAlbumUrls: items.map((i) => i.chatPublicUrl),
      imageAlbumPreviewUrls: items.map((i) => i.previewPublicUrl),
      imageAlbumOriginalUrls: items.map((i) => i.originalPublicUrl),
    };
  }
  return {
    ...base,
    imagePreviewUrl: first.previewPublicUrl,
    imageOriginalUrl: first.originalPublicUrl,
  };
}

export async function sendCommunityMessengerImageMessage(input: {
  userId: string;
  roomId: string;
  items: CommunityMessengerImageSendItem[];
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const items = (input.items ?? [])
    .map((it) => ({
      chatPublicUrl: trimText(it.chatPublicUrl),
      previewPublicUrl: trimText(it.previewPublicUrl),
      originalPublicUrl: trimText(it.originalPublicUrl),
      originalStoragePath: trimText(it.originalStoragePath),
      originalMimeType: trimText(it.originalMimeType) || "image/jpeg",
    }))
    .filter(
      (it) =>
        it.chatPublicUrl &&
        it.previewPublicUrl &&
        it.originalPublicUrl &&
        it.originalStoragePath
    );
  if (!roomId || items.length === 0) return { ok: false, error: "content_required" };
  if (items.length > COMMUNITY_MESSENGER_IMAGE_ALBUM_MAX) return { ok: false, error: "too_many_images" };

  const first = items[0]!;
  const metadata = communityMessengerImageMessageMetadata(items);
  const lastPreview = cmLastPreviewPhotoAlbum(items.length);
  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "image",
        content: first.chatPublicUrl,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      const [, unreadRpcResult] = await Promise.all([
        (sb as any)
          .from("community_messenger_rooms")
          .update({
            last_message: lastPreview,
            last_message_at: createdAt,
            last_message_type: "image",
            updated_at: createdAt,
          })
          .eq("id", roomId),
        (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
          p_room_id: roomId,
          p_sender_id: input.userId,
          p_read_at: createdAt,
        }),
      ]);
      const unreadRpcError = unreadRpcResult?.error;
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: imageRecipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId)
        .is("left_at", null)
        .is("blocked_hidden_at", null);
      const imageRecipientUserIds = ((imageRecipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      const mid = String((insertedMessage as { id?: unknown }).id ?? "");
      void notifyCommunityMessengerMessageRecipients(sb as SupabaseLike, {
        roomId,
        messageId: mid,
        senderUserId: input.userId,
        preview: lastPreview,
        recipientUserIds: imageRecipientUserIds,
      });
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, imageRecipientUserIds, roomId);
      return {
        ok: true,
        message: communityMessengerBuiltImageClientMessage(items, createdAt, mid, roomId, input.userId),
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "image",
    content: first.chatPublicUrl,
    metadata,
    createdAt,
  });
  room.lastMessage = lastPreview;
  room.lastMessageAt = createdAt;
  room.lastMessageType = "image";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: communityMessengerBuiltImageClientMessage(items, createdAt, messageId, roomId, input.userId),
  };
}

export async function sendCommunityMessengerStickerMessage(input: {
  userId: string;
  roomId: string;
  content: string;
  clientMessageId?: string;
  stickerItemId?: string;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const path = normalizeCommunityMessengerStickerContent(input.content);
  if (!roomId || !path) return { ok: false, error: "content_required" };
  const clientMessageId = trimText(input.clientMessageId ?? "");
  const stickerItemId = trimText(input.stickerItemId ?? "");
  const metadata: Record<string, unknown> = {};
  if (clientMessageId) metadata.client_message_id = clientMessageId;
  if (stickerItemId) metadata.sticker_item_id = stickerItemId;

  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };

    let stickerTradeGuard = await assertMessengerProductChatLinkedSendAllowed(sb, {
      viewerUserId: input.userId,
      messengerRoomId: roomId,
    });
    if (!stickerTradeGuard.ok && stickerTradeGuard.error === "trade_product_chat_unlinked") {
      const { reconcileMessengerTradeRoomLinkOnSend } = await import(
        "@/lib/trade/reconcile-messenger-trade-room-link-on-send"
      );
      if (await reconcileMessengerTradeRoomLinkOnSend(sb as never, roomId)) {
        stickerTradeGuard = await assertMessengerProductChatLinkedSendAllowed(sb, {
          viewerUserId: input.userId,
          messengerRoomId: roomId,
        });
      }
    }
    if (!stickerTradeGuard.ok) {
      return { ok: false, error: stickerTradeGuard.error };
    }

    if (clientMessageId) {
      const { data: existingRow, error: existingError } = await (sb as any)
        .from("community_messenger_messages")
        .select("id, room_id, sender_id, message_type, content, metadata, created_at")
        .eq("room_id", roomId)
        .eq("sender_id", input.userId)
        .filter("metadata->>client_message_id", "eq", clientMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!existingError && existingRow) {
        return {
          ok: true,
          message: {
            id: String((existingRow as { id?: unknown }).id ?? ""),
            roomId,
            senderId: input.userId,
            senderLabel: cmServiceT("common_me"),
            messageType: "sticker",
            content: String((existingRow as { content?: unknown }).content ?? path),
            createdAt: String((existingRow as { created_at?: unknown }).created_at ?? nowIso()),
            clientMessageId,
            isMine: true,
            callKind: null,
            callStatus: null,
          },
        };
      }
    }

    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "sticker",
        content: path,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: cmLastPreviewSticker(),
          last_message_at: createdAt,
          last_message_type: "sticker",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      const { data: recipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId)
        .is("left_at", null)
        .is("blocked_hidden_at", null);
      const recipientUserIds = ((recipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityMessengerMessageRecipients(sb as SupabaseLike, {
        roomId,
        messageId: String((insertedMessage as { id?: unknown }).id ?? ""),
        senderUserId: input.userId,
        preview: cmLastPreviewSticker(),
        recipientUserIds,
      });
      if (!unreadRpcError) {
        invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, recipientUserIds, roomId);
      }
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: cmServiceT("common_me"),
          messageType: "sticker",
          content: path,
          createdAt,
          clientMessageId: clientMessageId || null,
          isMine: true,
          callKind: null,
          callStatus: null,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "sticker",
    content: path,
    metadata,
    createdAt,
  });
  room.lastMessage = cmLastPreviewSticker();
  room.lastMessageAt = createdAt;
  room.lastMessageType = "sticker";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: cmServiceT("common_me"),
      messageType: "sticker",
      content: path,
      createdAt,
      clientMessageId: clientMessageId || null,
      isMine: true,
      callKind: null,
      callStatus: null,
    },
  };
}

export async function sendCommunityPostShareMessage(input: {
  userId: string;
  roomId: string;
  content: string;
  metadata: Record<string, unknown>;
  clientMessageId?: string;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const content = trimText(input.content);
  if (!roomId || !content) return { ok: false, error: "content_required" };
  const clientMessageId = trimText(input.clientMessageId ?? "");
  const metadata: Record<string, unknown> = { ...input.metadata };
  if (clientMessageId) metadata.client_message_id = clientMessageId;

  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };

    let tradeSendGuard = await assertMessengerProductChatLinkedSendAllowed(sb, {
      viewerUserId: input.userId,
      messengerRoomId: roomId,
    });
    if (!tradeSendGuard.ok && tradeSendGuard.error === "trade_product_chat_unlinked") {
      const { reconcileMessengerTradeRoomLinkOnSend } = await import(
        "@/lib/trade/reconcile-messenger-trade-room-link-on-send"
      );
      if (await reconcileMessengerTradeRoomLinkOnSend(sb as never, roomId)) {
        tradeSendGuard = await assertMessengerProductChatLinkedSendAllowed(sb, {
          viewerUserId: input.userId,
          messengerRoomId: roomId,
        });
      }
    }
    if (!tradeSendGuard.ok) {
      return { ok: false, error: tradeSendGuard.error };
    }

    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "community_post_share",
        content,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      const preview = content.slice(0, 120);
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: preview,
          last_message_at: createdAt,
          last_message_type: "community_post_share",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      const { data: recipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId)
        .is("left_at", null)
        .is("blocked_hidden_at", null);
      const recipientUserIds = ((recipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityMessengerMessageRecipients(sb as SupabaseLike, {
        roomId,
        messageId: String((insertedMessage as { id?: unknown }).id ?? ""),
        senderUserId: input.userId,
        preview,
        recipientUserIds,
      });
      if (!unreadRpcError) {
        invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, recipientUserIds, roomId);
      }
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: cmServiceT("common_me"),
          messageType: "community_post_share",
          content,
          createdAt,
          metadata,
          clientMessageId: clientMessageId || null,
          isMine: true,
          callKind: null,
          callStatus: null,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "community_post_share",
    content,
    metadata,
    createdAt,
  });
  room.lastMessage = content.slice(0, 120);
  room.lastMessageAt = createdAt;
  room.lastMessageType = "community_post_share";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: cmServiceT("common_me"),
      messageType: "community_post_share",
      content,
      metadata,
      createdAt,
      clientMessageId: clientMessageId || null,
      isMine: true,
      callKind: null,
      callStatus: null,
    },
  };
}

export async function sendCommunityMessengerFileMessage(input: {
  userId: string;
  roomId: string;
  filePublicUrl: string;
  storagePath: string;
  fileName: string;
  mimeType?: string;
  fileSizeBytes?: number;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const filePublicUrl = trimText(input.filePublicUrl);
  const storagePath = trimText(input.storagePath);
  const fileName = trimText(input.fileName);
  if (!roomId || !filePublicUrl || !storagePath || !fileName) return { ok: false, error: "content_required" };
  const mimeType = trimText(input.mimeType) || "application/octet-stream";
  const fileSizeBytes = Math.max(0, Math.floor(Number(input.fileSizeBytes ?? 0)) || 0);
  const metadata: Record<string, unknown> = { storagePath, mimeType, fileName, fileSizeBytes };
  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "file",
        content: filePublicUrl,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: cmLastPreviewFile(fileName),
          last_message_at: createdAt,
          last_message_type: "file",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: fileRecipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId)
        .is("left_at", null)
        .is("blocked_hidden_at", null);
      const fileRecipientUserIds = ((fileRecipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityMessengerMessageRecipients(sb as SupabaseLike, {
        roomId,
        messageId: String((insertedMessage as { id?: unknown }).id ?? ""),
        senderUserId: input.userId,
        preview: cmLastPreviewFile(fileName),
        recipientUserIds: fileRecipientUserIds,
      });
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, fileRecipientUserIds, roomId);
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: cmServiceT("common_me"),
          messageType: "file",
          content: filePublicUrl,
          createdAt,
          isMine: true,
          callKind: null,
          callStatus: null,
          fileName,
          fileMimeType: mimeType,
          fileSizeBytes,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "file",
    content: filePublicUrl,
    metadata,
    createdAt,
  });
  room.lastMessage = cmLastPreviewFile(fileName);
  room.lastMessageAt = createdAt;
  room.lastMessageType = "file";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: cmServiceT("common_me"),
      messageType: "file",
      content: filePublicUrl,
      createdAt,
      isMine: true,
      callKind: null,
      callStatus: null,
      fileName,
      fileMimeType: mimeType,
      fileSizeBytes,
    },
  };
}

function messengerLastPreviewFromRow(row: {
  message_type?: string;
  content?: string;
  metadata?: unknown;
}): { preview: string; messageType: string } {
  const mt = trimText(row.message_type);
  if (mt === "voice") return { preview: cmLastPreviewVoice(), messageType: "voice" };
  if (mt === "call_stub") return { preview: cmLastPreviewCall(trimText(row.content)), messageType: "call_stub" };
  if (mt === "image") return { preview: cmLastPreviewImage(), messageType: "image" };
  if (mt === "sticker") return { preview: cmLastPreviewSticker(), messageType: "sticker" };
  if (mt === "community_post_share") {
    return { preview: cmLastPreviewNotification(trimText(row.content)), messageType: "community_post_share" };
  }
  if (mt === "file") {
    return {
      preview: cmLastPreviewFile(
        trimText((row.metadata as { fileName?: string } | undefined)?.fileName)
      ),
      messageType: "file",
    };
  }
  if (mt === "system") return { preview: cmLastPreviewNotification(trimText(row.content)), messageType: "system" };
  const c = trimText(row.content);
  const preview = cmMessagePreviewFallback(c);
  return { preview, messageType: mt || "text" };
}

async function recomputeCommunityMessengerRoomLastMessage(sb: SupabaseLike, roomId: string) {
  const { data: rows } = await (sb as any)
    .from("community_messenger_messages")
    .select("content, created_at, message_type, metadata")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = (rows ?? [])[0] as
    | { content?: string; created_at?: string; message_type?: string; metadata?: unknown }
    | undefined;
  const now = nowIso();
  if (!latest) {
    await (sb as any)
      .from("community_messenger_rooms")
      .update({
        last_message: "",
        last_message_at: now,
        last_message_type: "text",
        updated_at: now,
      })
      .eq("id", roomId);
    return;
  }
  const { preview, messageType } = messengerLastPreviewFromRow(latest);
  const at = trimText(latest.created_at) || now;
  await (sb as any)
    .from("community_messenger_rooms")
    .update({
      last_message: preview,
      last_message_at: at,
      last_message_type: messageType,
      updated_at: now,
    })
    .eq("id", roomId);
}

/** 보낸 사람만 — 음성 메시지 삭제(스토리지 파일 포함) 후 방 미리보기 갱신 */
export async function deleteCommunityMessengerVoiceMessage(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  if (!roomId || !messageId) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: part } = await (sb as any)
      .from("community_messenger_participants")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (!part) return { ok: false, error: "forbidden" };

    const { data: msg, error: msgErr } = await (sb as any)
      .from("community_messenger_messages")
      .select("id, room_id, sender_id, message_type, content, metadata")
      .eq("id", messageId)
      .maybeSingle();
    if (msgErr || !msg) return { ok: false, error: "not_found" };
    if (trimText((msg as { room_id?: string }).room_id) !== roomId) return { ok: false, error: "not_found" };
    if (trimText((msg as { sender_id?: string }).sender_id) !== input.userId) return { ok: false, error: "forbidden" };
    if (trimText((msg as { message_type?: string }).message_type) !== "voice") {
      return { ok: false, error: "unsupported_type" };
    }

    const metadata = (
      (msg as { metadata?: unknown }).metadata && typeof (msg as { metadata?: unknown }).metadata === "object"
        ? ((msg as { metadata?: unknown }).metadata as Record<string, unknown>)
        : {}
    ) as Record<string, unknown>;
    const content = trimText((msg as { content?: string }).content);
    let storagePath = trimText(metadata.storagePath as string);
    if (!storagePath) storagePath = legacyPostImagesPathFromPublicUrl(content) ?? "";
    if (storagePath) {
      await (sb as any).storage.from("post-images").remove([storagePath]);
    }

    const { error: delErr } = await (sb as any).from("community_messenger_messages").delete().eq("id", messageId);
    if (delErr) return { ok: false, error: "delete_failed" };

    await recomputeCommunityMessengerRoomLastMessage(sb, roomId);
    return { ok: true };
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const idx = dev.messages.findIndex((row) => row.id === messageId && row.roomId === roomId);
  if (idx === -1) return { ok: false, error: "not_found" };
  const row = dev.messages[idx]!;
  if (row.senderId !== input.userId) return { ok: false, error: "forbidden" };
  if (row.messageType !== "voice") return { ok: false, error: "unsupported_type" };
  dev.messages.splice(idx, 1);
  const latest = [...dev.messages].filter((m) => m.roomId === roomId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
  if (latest) {
    const { preview, messageType } = messengerLastPreviewFromRow({
      message_type: latest.messageType,
      content: latest.content,
      metadata: latest.metadata,
    });
    room.lastMessage = preview;
    room.lastMessageAt = latest.createdAt;
    room.lastMessageType = messageType as (typeof room)["lastMessageType"];
  } else {
    room.lastMessage = "";
    room.lastMessageAt = nowIso();
    room.lastMessageType = "text";
  }
  return { ok: true };
}

export async function hideCommunityMessengerMessageForMe(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  const userId = trimText(input.userId);
  if (!roomId || !messageId || !userId) return { ok: false, error: "bad_request" };
  const sb = getSupabaseOrNull();
  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    return { ok: true };
  }
  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part) return { ok: false, error: "forbidden" };

  const { data: roomRow } = await (sb as any)
    .from("community_messenger_rooms")
    .select("room_type, summary")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomRow) return { ok: false, error: "room_not_found" };

  const { data: row, error } = await (sb as any)
    .from("community_messenger_messages")
    .select(`${COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT}, deleted_at`)
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (error && !isMissingTableError(error)) return { ok: false, error: "load_failed" };
  if (!row) return { ok: false, error: "not_found" };
  if (trimText((row as { deleted_at?: string | null }).deleted_at)) return { ok: false, error: "not_found" };

  const msgRow = row as MessageRow;
  const roomKind = messageRoomKindForActions({
    roomType: (roomRow as { room_type?: CommunityMessengerRoomType }).room_type as CommunityMessengerRoomType,
    contextMeta: parseCommunityMessengerRoomContextMeta(trimText((roomRow as { summary?: string | null }).summary)),
  });
  const cm = mapCommunityMessengerDbMessageRowToMessage({
    row: msgRow,
    viewerUserId: userId,
    profileById: new Map(),
  });
  if (!canHideMessageForMe(cm, roomKind)) return { ok: false, error: "forbidden" };

  const { error: insErr } = await (sb as any).from("community_messenger_message_user_hides").upsert(
    { user_id: userId, message_id: messageId, hidden_at: nowIso() },
    { onConflict: "user_id,message_id" }
  );
  if (insErr) return { ok: false, error: "hide_failed" };
  return { ok: true };
}

export async function softDeleteCommunityMessengerMessageForEveryone(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  const userId = trimText(input.userId);
  if (!roomId || !messageId || !userId) return { ok: false, error: "bad_request" };
  const sb = getSupabaseOrNull();
  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    return { ok: false, error: "unsupported_type" };
  }
  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part) return { ok: false, error: "forbidden" };

  const { data: roomRow } = await (sb as any)
    .from("community_messenger_rooms")
    .select("room_type, summary")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomRow) return { ok: false, error: "room_not_found" };

  const { data: msg, error: msgErr } = await (sb as any)
    .from("community_messenger_messages")
    .select(`${COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT}, deleted_at`)
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr || !msg) return { ok: false, error: "not_found" };
  if (trimText((msg as { room_id?: string }).room_id) !== roomId) return { ok: false, error: "not_found" };
  if (trimText((msg as { deleted_at?: string | null }).deleted_at)) return { ok: false, error: "not_found" };

  const msgRow = msg as MessageRow;
  const roomKind = messageRoomKindForActions({
    roomType: (roomRow as { room_type?: CommunityMessengerRoomType }).room_type as CommunityMessengerRoomType,
    contextMeta: parseCommunityMessengerRoomContextMeta(trimText((roomRow as { summary?: string | null }).summary)),
  });
  const cm = mapCommunityMessengerDbMessageRowToMessage({ row: msgRow, viewerUserId: userId, profileById: new Map() });
  if (!canDeleteMessageForEveryone(cm, roomKind)) return { ok: false, error: "forbidden" };

  if (trimText(msgRow.deleted_for_everyone_at)) return { ok: true };

  const mt = trimText(msgRow.message_type);
  const metadata = (msgRow.metadata ?? {}) as Record<string, unknown>;
  if (mt === "voice") {
    const contentV = trimText(msgRow.content);
    let storagePath = trimText(metadata.storagePath as string);
    if (!storagePath) storagePath = legacyPostImagesPathFromPublicUrl(contentV) ?? "";
    if (storagePath) {
      await (sb as any).storage.from("post-images").remove([storagePath]);
    }
  }

  const { error: upErr } = await (sb as any)
    .from("community_messenger_messages")
    .update({
      deleted_for_everyone_at: nowIso(),
      content: "",
      metadata: {},
    })
    .eq("id", messageId)
    .eq("room_id", roomId);
  if (upErr) return { ok: false, error: "delete_failed" };

  await recomputeCommunityMessengerRoomLastMessage(sb, roomId);
  return { ok: true };
}

export async function editCommunityMessengerTextMessage(input: {
  userId: string;
  roomId: string;
  messageId: string;
  content: string;
}): Promise<{ ok: true; message: CommunityMessengerMessage } | { ok: false; error: string }> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  const userId = trimText(input.userId);
  const content = trimText(input.content);
  if (!roomId || !messageId || !userId || !content) return { ok: false, error: "bad_request" };
  const sb = getSupabaseOrNull();
  if (!sb) {
    const fb = ensureCommunityMessengerDevFallbackAllowed();
    if (!fb.ok) return { ok: false, error: fb.error ?? "messenger_storage_unavailable" };
    return { ok: false, error: "unsupported_type" };
  }
  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part) return { ok: false, error: "forbidden" };

  const { data: roomRow } = await (sb as any)
    .from("community_messenger_rooms")
    .select("room_type, summary, room_status, is_readonly")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomRow) return { ok: false, error: "room_not_found" };
  if ((roomRow as { room_status?: string }).room_status === "blocked") {
    return { ok: false, error: "room_blocked" };
  }
  if ((roomRow as { is_readonly?: boolean }).is_readonly === true) {
    return { ok: false, error: "room_readonly" };
  }

  const { data: msg, error: msgErr } = await (sb as any)
    .from("community_messenger_messages")
    .select(`${COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT}, deleted_at`)
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (msgErr || !msg) return { ok: false, error: "not_found" };
  if (trimText((msg as { deleted_at?: string | null }).deleted_at)) return { ok: false, error: "not_found" };

  const msgRow = msg as MessageRow;
  if (trimText(msgRow.sender_id) !== userId) return { ok: false, error: "forbidden" };

  const roomKind = messageRoomKindForActions({
    roomType: (roomRow as { room_type?: CommunityMessengerRoomType }).room_type as CommunityMessengerRoomType,
    contextMeta: parseCommunityMessengerRoomContextMeta(trimText((roomRow as { summary?: string | null }).summary)),
  });
  const cm = mapCommunityMessengerDbMessageRowToMessage({ row: msgRow, viewerUserId: userId, profileById: new Map() });
  if (!canEditMessageText(cm, roomKind)) return { ok: false, error: "forbidden" };

  const prevMeta =
    msgRow.metadata && typeof msgRow.metadata === "object" && !Array.isArray(msgRow.metadata)
      ? (msgRow.metadata as Record<string, unknown>)
      : {};
  const { error: upErr } = await (sb as any)
    .from("community_messenger_messages")
    .update({
      content,
      metadata: { ...prevMeta, editedAt: nowIso() },
    })
    .eq("id", messageId)
    .eq("room_id", roomId);
  if (upErr) return { ok: false, error: "edit_failed" };

  const { data: updated, error: reloadErr } = await (sb as any)
    .from("community_messenger_messages")
    .select(COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT)
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (reloadErr || !updated) return { ok: false, error: "load_failed" };

  await recomputeCommunityMessengerRoomLastMessage(sb, roomId);
  const mapped = mapCommunityMessengerDbMessageRowToMessage({
    row: updated as MessageRow,
    viewerUserId: userId,
    profileById: new Map(),
  });
  return { ok: true, message: mapped };
}

export async function toggleCommunityMessengerMessageReaction(input: {
  userId: string;
  roomId: string;
  messageId: string;
  reactionKey: string;
}): Promise<
  { ok: true; reactions: NonNullable<CommunityMessengerMessage["reactions"]> } | { ok: false; error: string }
> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  const userId = trimText(input.userId);
  const reactionKey = trimText(input.reactionKey);
  if (!roomId || !messageId || !userId || !reactionKey) return { ok: false, error: "bad_request" };
  if (!isMessengerQuickReactionKey(reactionKey)) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "messenger_storage_unavailable" };

  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part) return { ok: false, error: "forbidden" };

  const { data: roomRow } = await (sb as any)
    .from("community_messenger_rooms")
    .select("room_type, summary")
    .eq("id", roomId)
    .maybeSingle();
  if (!roomRow) return { ok: false, error: "room_not_found" };

  const { data: msg, error: msgErr } = await (sb as any)
    .from("community_messenger_messages")
    .select(`${COMMUNITY_MESSENGER_MESSAGE_LIST_SELECT}, deleted_at`)
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (msgErr || !msg) return { ok: false, error: "not_found" };
  if (trimText((msg as { deleted_at?: string | null }).deleted_at)) return { ok: false, error: "not_found" };

  const msgRow = msg as MessageRow;
  const authorId = trimText(msgRow.sender_id);
  if (authorId && authorId === userId) return { ok: false, error: "forbidden" };
  const roomKind = messageRoomKindForActions({
    roomType: (roomRow as { room_type?: CommunityMessengerRoomType }).room_type as CommunityMessengerRoomType,
    contextMeta: parseCommunityMessengerRoomContextMeta(trimText((roomRow as { summary?: string | null }).summary)),
  });
  const cm = mapCommunityMessengerDbMessageRowToMessage({ row: msgRow, viewerUserId: userId, profileById: new Map() });
  if (!canReactToMessage(cm, roomKind)) return { ok: false, error: "forbidden" };

  /** 카카오톡식: 동일 메시지에 사용자당 반응 1개 — 다른 이모지 선택 시 교체, 동일 이모지 재선택 시 해제 */
  const { data: mineRow } = await (sb as any)
    .from("community_messenger_message_reactions")
    .select("reaction_key")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .maybeSingle();
  const currentKey = trimText((mineRow as { reaction_key?: string } | null)?.reaction_key);
  const wasOnlyThis = currentKey === reactionKey;

  const { error: delAllE } = await (sb as any)
    .from("community_messenger_message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", userId);
  if (delAllE) return { ok: false, error: "reaction_failed" };

  if (!wasOnlyThis) {
    const { error: insE } = await (sb as any).from("community_messenger_message_reactions").insert({
      message_id: messageId,
      user_id: userId,
      reaction_key: reactionKey,
    });
    if (insE) return { ok: false, error: "reaction_failed" };
  }

  const rx = await fetchCommunityMessengerReactionAggregatesForMessages(sb as SupabaseLike, [messageId], userId, {
    authorUserIdByMessageId: authorId ? new Map([[messageId, authorId]]) : undefined,
  });
  return { ok: true, reactions: rx.get(messageId) ?? [] };
}

export async function listCommunityMessengerMessageReactionParticipants(input: {
  userId: string;
  roomId: string;
  messageId: string;
  reactionKey: string;
}): Promise<
  | { ok: true; users: Array<{ userId: string; label: string }> }
  | { ok: false; error: "bad_request" | "forbidden" | "not_found" | "messenger_storage_unavailable" }
> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  const userId = trimText(input.userId);
  const reactionKey = trimText(input.reactionKey);
  if (!roomId || !messageId || !userId || !reactionKey) return { ok: false, error: "bad_request" };
  if (!isMessengerQuickReactionKey(reactionKey)) return { ok: false, error: "bad_request" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, error: "messenger_storage_unavailable" };

  const { data: part } = await (sb as any)
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!part) return { ok: false, error: "forbidden" };

  const { data: msg, error: msgErr } = await (sb as any)
    .from("community_messenger_messages")
    .select("id, room_id, deleted_at, sender_id")
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (msgErr || !msg) return { ok: false, error: "not_found" };
  if (trimText((msg as { deleted_at?: string | null }).deleted_at)) return { ok: false, error: "not_found" };
  const messageAuthorId = trimText((msg as { sender_id?: string | null }).sender_id);

  const { data: rxRows, error: rxErr } = await (sb as any)
    .from("community_messenger_message_reactions")
    .select("user_id, created_at")
    .eq("message_id", messageId)
    .eq("reaction_key", reactionKey)
    .order("created_at", { ascending: true });
  if (rxErr) return { ok: false, error: "not_found" };

  type RxPart = { user_id?: string; created_at?: string | null };
  const bestByUser = new Map<string, RxPart>();
  for (const row of (rxRows ?? []) as RxPart[]) {
    const uid = trimText(row.user_id);
    if (!uid || uid === messageAuthorId) continue;
    const curAt = trimText(row.created_at) || "";
    const prev = bestByUser.get(uid);
    if (!prev || curAt >= (trimText(prev.created_at) || "")) bestByUser.set(uid, row);
  }
  const uidList = dedupeIds([...bestByUser.keys()]);
  if (!uidList.length) return { ok: true, users: [] };

  const members = await hydrateProfilesLabelsOnly(userId, uidList, { includeSelf: true });
  const labelById = new Map(members.map((m) => [m.id, m.label.trim() || cmSvcUserDefaultLabel()] as const));
  const users = uidList.map((id) => ({ userId: id, label: labelById.get(id) ?? cmSvcUserDefaultLabel() }));
  return { ok: true, users };
}

function legacyPostImagesPathFromPublicUrl(url: string): string | null {
  const raw = trimText(url);
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const key = "/storage/v1/object/public/post-images/";
    const i = u.pathname.indexOf(key);
    if (i === -1) return null;
    return decodeURIComponent(u.pathname.slice(i + key.length));
  } catch {
    return null;
  }
}

/** 방 멤버만 스트리밍 재생 — Storage 비공개·CORS 이슈 회피 */
export async function fetchCommunityMessengerVoicePlaybackBytes(input: {
  userId: string;
  roomId: string;
  messageId: string;
}): Promise<
  | { ok: true; data: Uint8Array; contentType: string; storagePath: string }
  | { ok: false; status: number; error: string }
> {
  const roomId = trimText(input.roomId);
  const messageId = trimText(input.messageId);
  if (!roomId || !messageId) return { ok: false, status: 400, error: "bad_request" };

  const sb = getSupabaseServer();
  const { data: msg, error: msgErr } = await sb
    .from("community_messenger_messages")
    .select("id, room_id, message_type, content, metadata")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr || !msg || trimText((msg as { room_id?: string }).room_id) !== roomId) {
    return { ok: false, status: 404, error: "not_found" };
  }
  if (trimText((msg as { message_type?: string }).message_type) !== "voice") {
    return { ok: false, status: 404, error: "not_found" };
  }
  const { data: part } = await sb
    .from("community_messenger_participants")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!part) return { ok: false, status: 403, error: "forbidden" };

  const metadata = (
    (msg as { metadata?: unknown }).metadata && typeof (msg as { metadata?: unknown }).metadata === "object"
      ? ((msg as { metadata?: unknown }).metadata as Record<string, unknown>)
      : {}
  ) as Record<string, unknown>;
  const content = trimText((msg as { content?: string }).content);
  let storagePath = trimText(metadata.storagePath as string);
  if (!storagePath) storagePath = legacyPostImagesPathFromPublicUrl(content) ?? "";
  if (!storagePath) return { ok: false, status: 404, error: "no_audio_path" };

  const { data: file, error: dlErr } = await sb.storage.from("post-images").download(storagePath);
  if (dlErr || !file) return { ok: false, status: 502, error: "download_failed" };

  const buf = new Uint8Array(await file.arrayBuffer());
  const contentType = trimText(metadata.mimeType as string) || "application/octet-stream";
  return { ok: true, data: buf, contentType, storagePath };
}

export async function sendCommunityMessengerVoiceMessage(input: {
  userId: string;
  roomId: string;
  audioPublicUrl: string;
  storagePath: string;
  durationSeconds: number;
  mimeType: string;
  waveformPeaks?: number[] | null;
}): Promise<{ ok: boolean; message?: CommunityMessengerMessage; error?: string }> {
  const roomId = trimText(input.roomId);
  const audioPublicUrl = trimText(input.audioPublicUrl);
  const storagePath = trimText(input.storagePath);
  if (!roomId || !audioPublicUrl || !storagePath) return { ok: false, error: "content_required" };
  const durationSeconds = Math.max(0, Math.min(600, Math.floor(Number(input.durationSeconds) || 0)));
  const mimeType = trimText(input.mimeType) || "audio/webm";
  const rawPeaks = Array.isArray(input.waveformPeaks)
    ? input.waveformPeaks
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.min(1, Math.max(0, n)))
    : [];
  const waveformPeaksStored =
    rawPeaks.length > 0
      ? rawPeaks.length === COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS
        ? rawPeaks
        : downsampleVoiceWaveformPeaks(rawPeaks, COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS)
      : undefined;
  const metadata: Record<string, unknown> = { durationSeconds, mimeType, storagePath };
  if (waveformPeaksStored && waveformPeaksStored.length > 0) {
    metadata.waveformPeaks = waveformPeaksStored;
  }
  const sb = getSupabaseOrNull();
  if (sb) {
    const [{ data: participant }, { data: roomData }] = await Promise.all([
      (sb as any)
        .from("community_messenger_participants")
        .select("id")
        .eq("room_id", roomId)
        .eq("user_id", input.userId)
        .maybeSingle(),
      (sb as any)
        .from("community_messenger_rooms")
        .select("id, room_status, is_readonly")
        .eq("id", roomId)
        .maybeSingle(),
    ]);
    if (!participant || !roomData) return { ok: false, error: "room_not_found" };
    const roomStatus = normalizeRoomStatus((roomData as { room_status?: unknown }).room_status);
    const isReadonly = Boolean((roomData as { is_readonly?: unknown }).is_readonly);
    if (roomStatus === "blocked") return { ok: false, error: "room_blocked" };
    if (roomStatus === "archived") return { ok: false, error: "room_archived" };
    if (isReadonly) return { ok: false, error: "room_readonly" };
    const createdAt = nowIso();
    const { data: insertedMessage, error: insertError } = await (sb as any)
      .from("community_messenger_messages")
      .insert({
        room_id: roomId,
        sender_id: input.userId,
        message_type: "voice",
        content: audioPublicUrl,
        metadata,
        created_at: createdAt,
      })
      .select("id, room_id, sender_id, message_type, content, metadata, created_at")
      .single();
    if (!insertError && insertedMessage) {
      await (sb as any)
        .from("community_messenger_rooms")
        .update({
          last_message: cmLastPreviewVoice(),
          last_message_at: createdAt,
          last_message_type: "voice",
          updated_at: createdAt,
        })
        .eq("id", roomId);
      const { error: unreadRpcError } = await (sb as any).rpc("community_messenger_apply_unread_for_text_message", {
        p_room_id: roomId,
        p_sender_id: input.userId,
        p_read_at: createdAt,
      });
      if (unreadRpcError) {
        return { ok: false, error: String(unreadRpcError.message ?? "unread_update_failed") };
      }
      const { data: voiceRecipientRows } = await (sb as any)
        .from("community_messenger_participants")
        .select("user_id")
        .eq("room_id", roomId)
        .neq("user_id", input.userId)
        .is("left_at", null)
        .is("blocked_hidden_at", null);
      const voiceRecipientUserIds = ((voiceRecipientRows ?? []) as Array<{ user_id: string }>)
        .map((p) => p.user_id)
        .filter((uid) => Boolean(uid?.trim()));
      void notifyCommunityMessengerMessageRecipients(sb as SupabaseLike, {
        roomId,
        messageId: String((insertedMessage as { id?: unknown }).id ?? ""),
        senderUserId: input.userId,
        preview: cmLastPreviewVoice(),
        recipientUserIds: voiceRecipientUserIds,
      });
      invalidateOwnerHubBadgeForCommunityMessengerPeers(input.userId, voiceRecipientUserIds, roomId);
      return {
        ok: true,
        message: {
          id: String((insertedMessage as { id?: unknown }).id ?? ""),
          roomId,
          senderId: input.userId,
          senderLabel: cmServiceT("common_me"),
          messageType: "voice",
          content: audioPublicUrl,
          createdAt,
          isMine: true,
          callKind: null,
          callStatus: null,
          voiceDurationSeconds: durationSeconds,
          voiceWaveformPeaks: waveformPeaksStored ?? null,
          voiceMimeType: mimeType,
        },
      };
    }
    if (!isMissingTableError(insertError)) {
      return { ok: false, error: String(insertError.message ?? "message_send_failed") };
    }
  }

  const fallback = ensureCommunityMessengerDevFallbackAllowed();
  if (!fallback.ok) return fallback;

  const dev = getDevState();
  const room = dev.rooms.find((row) => row.id === roomId);
  if (!room) return { ok: false, error: "room_not_found" };
  const participant = dev.participants.find((row) => row.roomId === roomId && row.userId === input.userId);
  if (!participant) return { ok: false, error: "room_not_found" };
  if (room.roomStatus === "blocked") return { ok: false, error: "room_blocked" };
  if (room.roomStatus === "archived") return { ok: false, error: "room_archived" };
  if (room.isReadonly) return { ok: false, error: "room_readonly" };
  const createdAt = nowIso();
  const messageId = randomUUID();
  dev.messages.push({
    id: messageId,
    roomId,
    senderId: input.userId,
    messageType: "voice",
    content: audioPublicUrl,
    metadata,
    createdAt,
  });
  room.lastMessage = cmLastPreviewVoice();
  room.lastMessageAt = createdAt;
  room.lastMessageType = "voice";
  for (const p of dev.participants.filter((row) => row.roomId === roomId)) {
    p.unreadCount = p.userId === input.userId ? 0 : p.unreadCount + 1;
  }
  return {
    ok: true,
    message: {
      id: messageId,
      roomId,
      senderId: input.userId,
      senderLabel: cmServiceT("common_me"),
      messageType: "voice",
      content: audioPublicUrl,
      createdAt,
      isMine: true,
      callKind: null,
      callStatus: null,
      voiceDurationSeconds: durationSeconds,
      voiceWaveformPeaks: waveformPeaksStored ?? null,
      voiceMimeType: mimeType,
    },
  };
}

export async function createCommunityMessengerCallLog(input: {
  userId: string;
  roomId?: string | null;
  sessionId?: string | null;
  peerUserId?: string | null;
  callKind: CommunityMessengerCallKind;
  status: CommunityMessengerCallStatus;
  durationSeconds?: number;
  replaceExistingStub?: boolean;
  startedAt?: string | null;
  /** terminal occurred_at — 목록 last_message_at forward-only 권위 */
  endedAt?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const roomId = trimText(input.roomId ?? "") || null;
  const sessionId = trimText(input.sessionId ?? "") || null;
  const peerUserId = trimText(input.peerUserId ?? "") || null;
  const startedAt = await resolveCallSessionStartedAtIso({
    sessionId,
    explicitStartedAt: input.startedAt,
    context: "createCommunityMessengerCallLog",
  });
  const listActivityAt = trimText(input.endedAt ?? "") || startedAt;
  const payload = {
    session_id: sessionId,
    room_id: roomId,
    caller_user_id: input.userId,
    peer_user_id: peerUserId,
    call_kind: input.callKind,
    status: input.status,
    duration_seconds: Math.max(0, Number(input.durationSeconds ?? 0)),
    started_at: startedAt,
  };
  const sb = getSupabaseOrNull();
  if (sb) {
    const { error } = await (sb as any).from("community_messenger_call_logs").insert(payload);
    if (!error) {
      await appendCommunityMessengerCallStubMessage({
        userId: input.userId,
        roomId,
        sessionId,
        callKind: input.callKind,
        status: input.status,
        createdAt: startedAt,
        listActivityAt,
        replaceExisting: input.replaceExistingStub,
        incrementUnread: !input.replaceExistingStub,
        /**
         * CONTRACT: dialing stub 미발행 이후 direct terminal 도 last_message_at bump 필수.
         * (구: replaceExistingStub 이면 bump false — dial 선 bump 전제, 2026-07-29 회귀)
         */
        bumpRoomLastMessageAt: true,
        durationSeconds: input.durationSeconds,
      });
      return { ok: true };
    }
    /** `session_id` 유니크로 로그 행만 막힌 경우에도 채팅 스텁은 갱신해야 함 */
    if (isUniqueViolationError(error) && sessionId) {
      await appendCommunityMessengerCallStubMessage({
        userId: input.userId,
        roomId,
        sessionId,
        callKind: input.callKind,
        status: input.status,
        createdAt: startedAt,
        listActivityAt,
        replaceExisting: input.replaceExistingStub ?? true,
        incrementUnread: false,
        bumpRoomLastMessageAt: true,
        durationSeconds: input.durationSeconds,
      });
      return { ok: true };
    }
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "call_log_failed") };
  }

  const dev = getDevState();
  dev.calls.unshift({
    id: randomUUID(),
    sessionId,
    roomId,
    callerUserId: input.userId,
    peerUserId,
    callKind: input.callKind,
    status: input.status,
    durationSeconds: Math.max(0, Number(input.durationSeconds ?? 0)),
    startedAt,
  });
  await appendCommunityMessengerCallStubMessage({
    userId: input.userId,
    roomId,
    sessionId,
    callKind: input.callKind,
    status: input.status,
    createdAt: startedAt,
    listActivityAt,
    replaceExisting: input.replaceExistingStub,
    incrementUnread: !input.replaceExistingStub,
    bumpRoomLastMessageAt: true,
    durationSeconds: input.durationSeconds,
  });
  return { ok: true };
}

/**
 * 1:1 DM 통화 발신: `getCommunityMessengerRoomSnapshot`(메시지·프로필 전체) 없이
 * 방 메타·참가자 id·진행 중 세션만 병렬 조회해 TTFB 를 줄인다. 그룹방은 기존 스냅샷 경로 유지.
 */
type CallSessionStartResolve =
  | { kind: "fullSnapshot"; snapshot: CommunityMessengerRoomSnapshot; domainEnvelope: RoomDomainEnvelope | null }
  | {
      kind: "directLight";
      peerUserId: string;
      activeCall: CommunityMessengerCallSession | null;
      roomStatus: CommunityMessengerRoomStatus;
      isReadonly: boolean;
      domainEnvelope: RoomDomainEnvelope | null;
    };

async function resolveRoomContextForCallSessionStart(
  userId: string,
  roomId: string
): Promise<CallSessionStartResolve | null> {
  const id = trimText(roomId);
  if (!id) return null;
  const sb = getSupabaseOrNull();
  if (!sb) {
    const snapshot = await getCommunityMessengerRoomSnapshot(userId, roomId);
    if (!snapshot) return null;
    return {
      kind: "fullSnapshot",
      snapshot,
      domainEnvelope: provenCanonicalRoomDomainEnvelopeFromDbRow({
        id,
        chat_domain: snapshot.room.chatDomain,
        domain_identity_key: snapshot.room.domainIdentityKey,
      }),
    };
  }

  const [{ data: roomData, error: roomErr }, activeCall] = await Promise.all([
    (sb as any)
      .from("community_messenger_rooms")
      .select("id, room_type, room_status, is_readonly, chat_domain, domain_identity_key, domain_identity, direct_key")
      .eq("id", id)
      .maybeSingle(),
    getActiveCallSessionForRoom(userId, id),
  ]);

  if (roomErr || !roomData) return null;
  /** Call-session insert SSOT: room columns only (no room_type/direct_key invent). */
  const domainEnvelope = provenCanonicalRoomDomainEnvelopeFromDbRow(roomData as Record<string, unknown>);
  const roomType = (roomData as RoomRow).room_type;
  if (isCommunityMessengerGroupRoomType(roomType)) {
    const snapshot = await getCommunityMessengerRoomSnapshot(userId, roomId);
    if (!snapshot) return null;
    return {
      kind: "fullSnapshot",
      snapshot,
      domainEnvelope,
    };
  }

  const { data: pRows } = await (sb as any)
    .from("community_messenger_participants")
    .select("user_id")
    .eq("room_id", id);
  const memberIds = dedupeIds(
    ((pRows ?? []) as Array<{ user_id?: string | null }>)
      .map((r) => r.user_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0)
  );
  if (!memberIds.includes(userId)) return null;
  const peers = memberIds.filter((uid) => uid !== userId);
  const peerUserId = peers[0] ?? null;
  if (!peerUserId) return null;

  const rawStatus = (roomData as RoomRow).room_status;
  const roomStatus = (rawStatus ?? "active") as CommunityMessengerRoomStatus;
  const isReadonly = (roomData as { is_readonly?: boolean | null }).is_readonly === true;

  return {
    kind: "directLight",
    peerUserId,
    activeCall,
    roomStatus,
    isReadonly,
    domainEnvelope,
  };
}

export type IncomingCallPushBestEffortInput = {
  recipientUserId: string;
  sessionId: string;
  roomId: string;
  callerId: string;
  callKind: CommunityMessengerCallKind;
  startedAt: string;
  domainEnvelope?: RoomDomainEnvelope | null;
};

export async function sendIncomingCallPushBestEffort(input: IncomingCallPushBestEffortInput): Promise<void> {
  const recipient = trimText(input.recipientUserId);
  const sessionId = trimText(input.sessionId);
  const roomId = trimText(input.roomId);
  const callerId = trimText(input.callerId);
  if (!recipient || !sessionId || !roomId || !callerId) return;
  // SSOT_CONTRACT: messenger-call-push-block ensureNoBlockedEitherWay
  if (!(await ensureNoBlockedEitherWay(recipient, callerId))) return;
  const profileMap = await fetchProfilesByIds([callerId]);
  const callerProfile = profileMap.get(callerId);
  const callerLabel =
    trimText(callerProfile?.display_name) ||
    trimText(callerProfile?.nickname) ||
    profileLabel(callerProfile, callerId);
  await sendWebPushForCommunityMessengerIncomingCall({
    recipientUserId: recipient,
    sessionId,
    roomId,
    callerId,
    callKind: input.callKind,
    callerDisplayName: callerLabel,
    callerAvatar: callerProfile?.avatar_url ?? null,
    startedAt: input.startedAt,
    domainEnvelope: input.domainEnvelope ?? null,
  });
}

async function terminateLiveDirectCallSessionsInRoom(
  sb: SupabaseLike,
  actorUserId: string,
  roomId: string
): Promise<void> {
  const rid = trimText(roomId);
  const uid = trimText(actorUserId);
  if (!rid || !uid) return;
  const { data } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, initiator_user_id")
    .eq("room_id", rid)
    .eq("session_mode", "direct")
    .in("status", ["ringing", "active"]);
  const rows = (data ?? []) as Array<{ id?: string; status?: string; initiator_user_id?: string }>;
  for (const row of rows) {
    const sid = trimText(row.id ?? "");
    if (!sid) continue;
    const status = trimText(row.status ?? "");
    const action =
      status === "active"
        ? "end"
        : messengerUserIdsEqual(row.initiator_user_id, uid)
          ? "cancel"
          : "reject";
    await updateCommunityMessengerCallSession({ userId: uid, sessionId: sid, action }).catch(() => {});
  }
}

async function forceEndLiveDirectCallSessionsInRoom(sb: SupabaseLike, roomId: string): Promise<void> {
  const rid = trimText(roomId);
  if (!rid) return;
  const { data } = await (sb as any)
    .from("community_messenger_call_sessions")
    .select("id, status, initiator_user_id, recipient_user_id")
    .eq("room_id", rid)
    .eq("session_mode", "direct")
    .in("status", ["ringing", "active"]);
  const rows = (data ?? []) as Array<{
    id?: string | null;
    status?: string | null;
    initiator_user_id?: string | null;
    recipient_user_id?: string | null;
  }>;
  for (const row of rows) {
    const sid = trimText(row.id);
    const initiator = trimText(row.initiator_user_id);
    if (!sid || !initiator) continue;
    const status = trimText(row.status);
    const action: "cancel" | "end" = status === "ringing" ? "cancel" : "end";
    await updateCommunityMessengerCallSession({
      userId: initiator,
      sessionId: sid,
      action,
      clientEndedReason: "redial_replaced",
    }).catch(() => {});
  }
}

function waitCommunityMessengerCallSessionStart(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitLiveDirectCallSessionClearedInRoom(
  sb: SupabaseLike,
  roomId: string,
  attempts = 4
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (!(await getLiveDirectCallSessionIdInRoom(sb, roomId))) return true;
    await waitCommunityMessengerCallSessionStart(120 + i * 80);
  }
  return !(await getLiveDirectCallSessionIdInRoom(sb, roomId));
}

function resolveIncomingCallPushDispatchInput(
  session: CommunityMessengerCallSession,
  peerUserId: string | null,
  callerUserId: string,
  domainEnvelope?: RoomDomainEnvelope | null
): IncomingCallPushBestEffortInput | null {
  if (session.sessionMode !== "direct" || session.status !== "ringing") return null;
  const recipient = trimText(peerUserId ?? session.recipientUserId ?? "");
  if (!recipient) return null;
  return {
    recipientUserId: recipient,
    sessionId: session.id,
    roomId: session.roomId,
    callerId: callerUserId,
    callKind: session.callKind,
    startedAt: session.startedAt,
    domainEnvelope: domainEnvelope ?? null,
  };
}

export async function startCommunityMessengerCallSession(input: {
  userId: string;
  roomId: string;
  callKind: CommunityMessengerCallKind;
  dialIntent?: "fresh" | "recover";
}): Promise<{
  ok: boolean;
  session?: CommunityMessengerCallSession;
  error?: string;
  reused?: boolean;
  /** 개발 전용 — 클라 `[cm-call-latency] db_insert_or_rpc_done` 분해용 */
  _callStartTimingsMs?: Record<string, number>;
  /** Route `after()` 전용 — HTTP JSON 응답에 포함하지 않음 */
  incomingCallPush?: IncomingCallPushBestEffortInput | null;
}> {
  const roomId = trimText(input.roomId);
  if (!roomId) return { ok: false, error: "room_required" };

  const dialFresh = input.dialIntent === "fresh";

  const recordTimings = process.env.NODE_ENV === "development";
  const timing: Record<string, number> = {};
  const t0 = performance.now();

  const resolved = await resolveRoomContextForCallSessionStart(input.userId, roomId);
  if (recordTimings) timing.resolve_room_context_ms = Math.round(performance.now() - t0);
  if (!resolved) return { ok: false, error: "room_not_found" };

  if (isFourDomainPollutionQuarantineRoom(roomId)) {
    return { ok: false, error: "call_room_quarantined" };
  }

  const callDomainEnvelope = resolved.domainEnvelope;
  if (!callDomainEnvelope) {
    /** Null envelope → refuse insert (no silent domain-less call_sessions). */
    return { ok: false, error: "room_domain_required" };
  }
  if (callDomainEnvelope.roomId !== roomId) {
    return { ok: false, error: "room_domain_mismatch" };
  }

  let snapshot: CommunityMessengerRoomSnapshot | null = null;
  let isGroupRoom: boolean;
  let peerUserId: string | null;
  let activeCallForReuse: CommunityMessengerCallSession | null = null;
  let reusePeerUserId: string | null = null;

  if (resolved.kind === "fullSnapshot") {
    snapshot = resolved.snapshot;
    if (snapshot.room.roomStatus !== "active" || snapshot.room.isReadonly) {
      return { ok: false, error: "room_unavailable" };
    }
    isGroupRoom = isCommunityMessengerGroupRoomType(snapshot.room.roomType);
    peerUserId = isGroupRoom
      ? null
      : trimText(snapshot.room.peerUserId ?? "") || snapshot.members.find((item) => item.id !== input.userId)?.id || null;
    if (!isGroupRoom && !peerUserId) return { ok: false, error: "peer_not_found" };
    if (isGroupRoom && snapshot.members.length > 4) {
      return { ok: false, error: "group_call_limit_exceeded" };
    }
    if (!dialFresh && snapshot.activeCall && !isTerminalCallSessionStatus(snapshot.activeCall.status)) {
      activeCallForReuse = snapshot.activeCall;
      reusePeerUserId = snapshot.room.peerUserId ?? peerUserId;
    }
  } else {
    if (resolved.roomStatus !== "active" || resolved.isReadonly) {
      return { ok: false, error: "room_unavailable" };
    }
    peerUserId = resolved.peerUserId;
    isGroupRoom = false;
    if (!dialFresh && resolved.activeCall && !isTerminalCallSessionStatus(resolved.activeCall.status)) {
      activeCallForReuse = resolved.activeCall;
      reusePeerUserId = resolved.peerUserId;
    }
  }

  if (isGroupRoom && !snapshot) {
    return { ok: false, error: "room_not_found" };
  }

  const sb = getSupabaseOrNull();
  await reconcileUserLiveCallSessions(input.userId, "create_guard");
  if (peerUserId) {
    await reconcileUserLiveCallSessions(peerUserId, "peer_create_guard");
  }
  if (!isGroupRoom && peerUserId) {
    const callKindInput = input.callKind === "video" ? "video" : "audio";
    // SSOT_CONTRACT: messenger-direct-call-start-gate canStartDirectCallBetweenUsers (before reuse)
    const directCallGate = await canStartDirectCallBetweenUsers({
      callerUserId: input.userId,
      calleeUserId: peerUserId,
      roomId,
      callKind: callKindInput,
      supabase: sb,
      gateTag: "api_gate_start",
    });
    if (!directCallGate.allowed) {
      return { ok: false, error: mapDenyCodeToApiError(directCallGate.code) };
    }
  }

  if (activeCallForReuse) {
    return {
      ok: true,
      session: activeCallForReuse,
      reused: true,
      incomingCallPush: resolveIncomingCallPushDispatchInput(
        activeCallForReuse,
        reusePeerUserId,
        input.userId,
        callDomainEnvelope
      ),
    };
  }

  if (!isGroupRoom && sb && !dialFresh) {
    const callerLiveId = await getUserLiveDirectCallSessionId(sb, input.userId, "live");
    if (callerLiveId) {
      const existingCallerSession = await loadDirectCallSessionRowById(sb, input.userId, callerLiveId);
      if (existingCallerSession && !isTerminalCallSessionStatus(existingCallerSession.status)) {
        return { ok: true, session: existingCallerSession, reused: true };
      }
    }
  }

  const tGateStart = performance.now();
  if (!isGroupRoom && sb && dialFresh) {
    await terminateLiveDirectCallSessionsInRoom(sb, input.userId, roomId);
    invalidateActiveCallSessionByUserRoomCacheForRoom(roomId);
    if (!(await waitLiveDirectCallSessionClearedInRoom(sb, roomId))) {
      await terminateLiveDirectCallSessionsInRoom(sb, input.userId, roomId);
      invalidateActiveCallSessionByUserRoomCacheForRoom(roomId);
      if (!(await waitLiveDirectCallSessionClearedInRoom(sb, roomId, 2))) {
        await forceEndLiveDirectCallSessionsInRoom(sb, roomId);
        invalidateActiveCallSessionByUserRoomCacheForRoom(roomId);
        await waitLiveDirectCallSessionClearedInRoom(sb, roomId, 2);
      }
    }
  }
  if (!isGroupRoom && sb) {
    const callGate = await assertMessengerRoomAllowsCommunicationFeature({
      supabase: sb,
      roomId,
      feature: input.callKind === "video" ? "video_call" : "voice_call",
      requesterUserId: input.userId,
    });
    if (!callGate.ok) {
      return { ok: false, error: callGate.error };
    }
  }

  const startedAt = nowIso();
  if (sb) {
    const callPolicy = await getMessengerCallAdminPolicyCached();
    await terminalStaleRingingDirectSessionsForUser(sb, input.userId, callPolicy).catch(() => 0);
    if (peerUserId) {
      await terminalStaleRingingDirectSessionsForUser(sb, peerUserId, callPolicy).catch(() => 0);
    }
    if (!isGroupRoom) {
      if (dialFresh) {
        if (await getLiveDirectCallSessionIdInRoom(sb, roomId)) {
          await forceEndLiveDirectCallSessionsInRoom(sb, roomId);
          invalidateActiveCallSessionByUserRoomCacheForRoom(roomId);
          if (!(await waitLiveDirectCallSessionClearedInRoom(sb, roomId, 2))) {
            return { ok: false, error: "call_session_start_failed" };
          }
        }
        if (await getLiveDirectCallSessionIdInRoom(sb, roomId)) {
          return { ok: false, error: "call_session_start_failed" };
        }
        if (await userHasLiveDirectCallSessionOutsideRoom(sb, input.userId, roomId)) {
          return { ok: false, error: "peer_busy" };
        }
        if (peerUserId && (await userHasLiveDirectCallSessionOutsideRoom(sb, peerUserId, roomId))) {
          return { ok: false, error: "peer_busy" };
        }
      } else {
        const callerBusy = await userHasLiveDirectCallSession(sb, input.userId);
        if (callerBusy) {
          return { ok: false, error: "peer_busy" };
        }
        if (peerUserId) {
          const peerBusy = await userHasLiveDirectCallSession(sb, peerUserId);
          if (peerBusy) {
            return { ok: false, error: "peer_busy" };
          }
        }
      }
    }
    if (recordTimings) timing.pre_insert_gate_ms = Math.round(performance.now() - tGateStart);
    const tDbStart = performance.now();
    /** CONTRACT: chat_domain + domain_identity_key required on same insert as room_id (no post-update attach). */
    const insertWithDomain = {
      room_id: roomId,
      initiator_user_id: input.userId,
      recipient_user_id: peerUserId,
      session_mode: isGroupRoom ? "group" : "direct",
      max_participants: isGroupRoom ? 4 : 2,
      call_kind: input.callKind,
      status: "ringing",
      started_at: startedAt,
      updated_at: startedAt,
      chat_domain: callDomainEnvelope.chatDomain,
      domain_identity_key: callDomainEnvelope.domainIdentityKey,
    };
    const { data, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .insert(insertWithDomain)
      /** PostgREST 반환 최소화 — mapCallSession 은 insert 페이로드와 합쳐 구성 */
      .select("id, status, created_at")
      .single();
    /** No domain-less fallback insert — schema/domain errors fail closed. */
    if (!error && data) {
      const rowMin = data as { id: string; status: string; created_at: string | null };
      const inserted: CallSessionRow = {
        id: rowMin.id,
        room_id: roomId,
        initiator_user_id: input.userId,
        recipient_user_id: peerUserId,
        session_mode: isGroupRoom ? "group" : "direct",
        max_participants: isGroupRoom ? 4 : 2,
        call_kind: input.callKind,
        status: rowMin.status as CommunityMessengerCallSessionStatus,
        started_at: startedAt,
        answered_at: null,
        ended_at: null,
        ended_reason: null,
        created_at: rowMin.created_at ?? startedAt,
        chat_domain: callDomainEnvelope.chatDomain,
        domain_identity_key: callDomainEnvelope.domainIdentityKey,
      };
      const participantRows = isGroupRoom
        ? snapshot!.members.map((member) => ({
            session_id: inserted.id,
            room_id: roomId,
            user_id: member.id,
            participation_status: member.id === input.userId ? "joined" : "invited",
            joined_at: member.id === input.userId ? startedAt : null,
            left_at: null,
            created_at: startedAt,
          }))
        : [
            {
              session_id: inserted.id,
              room_id: roomId,
              user_id: input.userId,
              participation_status: "joined",
              joined_at: startedAt,
              left_at: null,
              created_at: startedAt,
            },
            {
              session_id: inserted.id,
              room_id: roomId,
              user_id: peerUserId,
              participation_status: "invited",
              joined_at: null,
              left_at: null,
              created_at: startedAt,
            },
          ];
      const { error: participantInsertError } = await (sb as any)
        .from("community_messenger_call_session_participants")
        .insert(participantRows);
      if (participantInsertError) {
        await (sb as any).from("community_messenger_call_sessions").delete().eq("id", inserted.id);
        return { ok: false, error: String(participantInsertError.message ?? "call_session_participants_insert_failed") };
      }
      /**
       * CONTRACT (1:1 direct): do NOT publish in-flight dialing call_stub on start.
       * Realtime dialing stub reached iOS messenger before VoIP/CallKit ("발신 중" race).
       * Outgoing UI uses Native session state; messenger history is written on terminal only
       * (`ensureTerminalCallStub` / `createCommunityMessengerCallLog`).
       */
      await appendCommunityMessengerCallSessionEvent(sb, {
        sessionId: inserted.id,
        actorUserId: input.userId,
        eventType: "ringing",
        payload: { call_kind: input.callKind, session_mode: isGroupRoom ? "group" : "direct" },
      });
      const syntheticParticipantRows: CallSessionParticipantRow[] = participantRows
        .filter((row): row is typeof row & { user_id: string } => typeof row.user_id === "string" && row.user_id.length > 0)
        .map((row) => ({
          id: `local:${inserted.id}:${row.user_id}`,
          session_id: inserted.id,
          room_id: row.room_id,
          user_id: row.user_id,
          participation_status: row.participation_status as CommunityMessengerCallParticipantStatus,
          joined_at: row.joined_at,
          left_at: row.left_at,
          created_at: row.created_at,
        }));
      if (recordTimings) timing.db_insert_rpc_ms = Math.round(performance.now() - tDbStart);
      const tMapStart = performance.now();
      const mappedSession = await mapCallSession(
        input.userId,
        inserted as CallSessionRow,
        syntheticParticipantRows,
        undefined,
        true,
        "labels_only"
      );
      if (recordTimings) timing.map_session_ms = Math.round(performance.now() - tMapStart);
      return {
        ok: true,
        session: mappedSession,
        ...(recordTimings ? { _callStartTimingsMs: timing } : {}),
        incomingCallPush:
          !isGroupRoom && peerUserId
            ? resolveIncomingCallPushDispatchInput(
                mappedSession,
                peerUserId,
                input.userId,
                callDomainEnvelope
              )
            : null,
      };
    }
    if (error && isUniqueViolationError(error)) {
      let existing = await getActiveCallSessionForRoom(input.userId, roomId);
      if (existing) {
        if (dialFresh && !isGroupRoom && sb && existing.status === "ringing") {
          const now = nowIso();
          const { data: bumped } = await (sb as any)
            .from("community_messenger_call_sessions")
            .update({ started_at: now, updated_at: now })
            .eq("id", existing.id)
            .eq("status", "ringing")
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
            )
            .maybeSingle();
          if (bumped) {
            invalidateActiveCallSessionByUserRoomCacheForRoom(roomId);
            existing = await mapCallSession(input.userId, bumped as CallSessionRow);
          }
        }
        return {
          ok: true,
          session: existing,
          reused: true,
          incomingCallPush: dialFresh
            ? resolveIncomingCallPushDispatchInput(
                existing,
                peerUserId,
                input.userId,
                callDomainEnvelope
              )
            : undefined,
        };
      }
    }
    if (!isMissingTableError(error)) {
      return { ok: false, error: String(error.message ?? "call_session_start_failed") };
    }
  }

  if (!snapshot && !isGroupRoom) {
    snapshot = await getCommunityMessengerRoomSnapshot(input.userId, roomId);
  }

  const existingDevLive = dialFresh ? null : await getActiveCallSessionForRoom(input.userId, roomId);
  if (existingDevLive) {
    return { ok: true, session: existingDevLive, reused: true };
  }

  if (!snapshot) {
    return { ok: false, error: "room_not_found" };
  }

  const dev = getDevState();
  const session: DevCallSession = {
    id: randomUUID(),
    roomId,
    sessionMode: isGroupRoom ? "group" : "direct",
    initiatorUserId: input.userId,
    recipientUserId: peerUserId,
    callKind: input.callKind,
    status: "ringing",
    startedAt,
    answeredAt: null,
    endedAt: null,
    createdAt: startedAt,
    participants: snapshot.members
      .filter((member) => (isGroupRoom ? true : member.id === input.userId || member.id === peerUserId))
      .map((member) => ({
        id: randomUUID(),
        sessionId: "",
        roomId,
        userId: member.id,
        participationStatus: member.id === input.userId ? "joined" : "invited",
        joinedAt: member.id === input.userId ? startedAt : null,
        leftAt: null,
        createdAt: startedAt,
      })),
  };
  session.participants = session.participants.map((item) => ({ ...item, sessionId: session.id }));
  dev.callSessions.unshift(session);
  /** Dev path mirrors prod — no dialing stub on start (terminal history only). */
  const mappedDevSession = await mapCallSession(input.userId, session);
  return {
    ok: true,
    session: mappedDevSession,
    incomingCallPush:
      !isGroupRoom && peerUserId
        ? resolveIncomingCallPushDispatchInput(
            mappedDevSession,
            peerUserId,
            input.userId,
            callDomainEnvelope
          )
        : null,
  };
}

/** 1:1 voice → video: `call_kind` 를 video 로 (링 중 발신자가 바꾸거나, 연결 후 인콜 업그레이드). */
export async function upgradeCommunityMessengerCallSessionToVideo(input: {
  userId: string;
  sessionId: string;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  if (!sessionId) return { ok: false, error: "session_required" };
  const uid = trimText(input.userId);
  if (!uid) return { ok: false, error: "forbidden" };

  const sessionSelect =
    "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at";

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(sessionSelect)
      .eq("id", sessionId)
      .maybeSingle();
    if (!row) return { ok: false, error: "not_found" };
    const session = row as CallSessionRow;
    if ((session.session_mode ?? "direct") !== "direct") {
      return { ok: false, error: "bad_action" };
    }
    const recip = trimText(session.recipient_user_id ?? "");
    const isParty =
      messengerUserIdsEqual(session.initiator_user_id, uid) || (recip.length > 0 && messengerUserIdsEqual(recip, uid));
    if (!isParty) return { ok: false, error: "forbidden" };
    if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
    if (session.call_kind === "video") {
      return { ok: true, session: await mapCallSession(uid, session) };
    }
    if (session.call_kind !== "voice") return { ok: false, error: "bad_action" };

    const videoGate = await assertMessengerRoomAllowsCommunicationFeature({
      supabase: sb,
      roomId: trimText(session.room_id ?? ""),
      feature: "video_call",
      requesterUserId: uid,
    });
    if (!videoGate.ok) {
      return { ok: false, error: videoGate.error };
    }

    const now = nowIso();
    const { data: updated, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .update({ call_kind: "video", updated_at: now })
      .eq("id", sessionId)
      .select(sessionSelect)
      .single();
    if (error || !updated) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";
      return { ok: false, error: message || "call_session_update_failed" };
    }
    return { ok: true, session: await mapCallSession(uid, updated as CallSessionRow) };
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };
  if (session.sessionMode !== "direct") return { ok: false, error: "bad_action" };
  const r = session.recipientUserId ? trimText(session.recipientUserId) : "";
  const isParty =
    messengerUserIdsEqual(session.initiatorUserId, uid) || (r.length > 0 && messengerUserIdsEqual(r, uid));
  if (!isParty) return { ok: false, error: "forbidden" };
  if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
  if (session.callKind === "video") {
    return { ok: true, session: await mapCallSession(uid, session) };
  }
  if (session.callKind !== "voice") return { ok: false, error: "bad_action" };
  session.callKind = "video";
  return { ok: true, session: await mapCallSession(uid, session) };
}

/** 1:1 video → voice: 세션 call_kind 를 voice 로 (영상만 끄는 UX 의 서버 상태) */
export async function downgradeCommunityMessengerCallSessionToVoice(input: {
  userId: string;
  sessionId: string;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  if (!sessionId) return { ok: false, error: "session_required" };
  const uid = trimText(input.userId);
  if (!uid) return { ok: false, error: "forbidden" };

  const sessionSelect =
    "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at";

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(sessionSelect)
      .eq("id", sessionId)
      .maybeSingle();
    if (!row) return { ok: false, error: "not_found" };
    const session = row as CallSessionRow;
    if ((session.session_mode ?? "direct") !== "direct") {
      return { ok: false, error: "bad_action" };
    }
    const recip = trimText(session.recipient_user_id ?? "");
    const isParty =
      messengerUserIdsEqual(session.initiator_user_id, uid) || (recip.length > 0 && messengerUserIdsEqual(recip, uid));
    if (!isParty) return { ok: false, error: "forbidden" };
    if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
    if (session.call_kind === "voice") {
      return { ok: true, session: await mapCallSession(uid, session) };
    }
    if (session.call_kind !== "video") return { ok: false, error: "bad_action" };

    const now = nowIso();
    const { data: updated, error } = await (sb as any)
      .from("community_messenger_call_sessions")
      .update({ call_kind: "voice", updated_at: now })
      .eq("id", sessionId)
      .select(sessionSelect)
      .single();
    if (error || !updated) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";
      return { ok: false, error: message || "call_session_update_failed" };
    }
    return { ok: true, session: await mapCallSession(uid, updated as CallSessionRow) };
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };
  if (session.sessionMode !== "direct") return { ok: false, error: "bad_action" };
  const r = session.recipientUserId ? trimText(session.recipientUserId) : "";
  const isParty =
    messengerUserIdsEqual(session.initiatorUserId, uid) || (r.length > 0 && messengerUserIdsEqual(r, uid));
  if (!isParty) return { ok: false, error: "forbidden" };
  if (session.status !== "active" && session.status !== "ringing") return { ok: false, error: "bad_action" };
  if (session.callKind === "voice") {
    return { ok: true, session: await mapCallSession(uid, session) };
  }
  if (session.callKind !== "video") return { ok: false, error: "bad_action" };
  session.callKind = "voice";
  return { ok: true, session: await mapCallSession(uid, session) };
}

export async function updateCommunityMessengerCallSession(input: {
  userId: string;
  sessionId: string;
  action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed";
  durationSeconds?: number;
  /** Agora/P2P 조인 실패 등 — `ended` 시 DB `ended_reason` (CHECK 없음) */
  clientEndedReason?: string;
  /** First-answer-wins claim — callee deviceId (`user_devices.device_id` or native stable id) */
  answeredDeviceId?: string | null;
}): Promise<{ ok: boolean; session?: CommunityMessengerCallSession; error?: string }> {
  const sessionId = trimText(input.sessionId);
  if (!sessionId) return { ok: false, error: "session_required" };
  const clientDurationSeconds = Math.max(0, Number(input.durationSeconds ?? 0));
  const resolveTerminalDurationSeconds = (
    session: CallSessionRow | DevCallSession,
    mapped: CommunityMessengerCallSession,
  ): number => {
    const answeredAt =
      mapped.answeredAt ||
      ("answered_at" in session
        ? trimText(session.answered_at ?? "")
        : trimText((session as DevCallSession).answeredAt ?? "")) ||
      null;
    const endedAt =
      mapped.endedAt ||
      ("ended_at" in session
        ? trimText(session.ended_at ?? "")
        : trimText((session as DevCallSession).endedAt ?? "")) ||
      null;
    return resolveAuthoritativeCallDurationSeconds({
      clientDurationSeconds,
      answeredAt,
      endedAt,
    });
  };
  const terminalLogStatus = (mapped: CommunityMessengerCallSession): CommunityMessengerCallStatus =>
    mapped.status === "ended"
      ? "ended"
      : mapped.status === "rejected"
        ? "rejected"
        : mapped.status === "cancelled"
          ? "cancelled"
          : "missed";
  const ensureTerminalCallStub = async (
    session: CallSessionRow | DevCallSession,
    mapped: CommunityMessengerCallSession
  ) => {
    if (!isTerminalCallSessionStatus(mapped.status)) return;
    const sessionStartedAt =
      "started_at" in session
        ? trimText(session.started_at ?? "")
        : trimText(session.startedAt ?? "");
    const stubCreatedAt =
      sessionStartedAt ||
      (await resolveCallSessionStartedAtIso({
        sessionId,
        context: "ensureTerminalCallStub",
      }));
    const listActivityAt =
      trimText(mapped.endedAt ?? "") ||
      ("ended_at" in session
        ? trimText(session.ended_at ?? "")
        : trimText(session.endedAt ?? "")) ||
      nowIso();
    await appendCommunityMessengerCallStubMessage({
      userId: "initiator_user_id" in session ? session.initiator_user_id : session.initiatorUserId,
      roomId: "room_id" in session ? session.room_id : session.roomId,
      sessionId,
      callKind: "call_kind" in session ? session.call_kind : session.callKind,
      status: terminalLogStatus(mapped),
      createdAt: stubCreatedAt,
      listActivityAt,
      replaceExisting: mapped.sessionMode === "direct",
      incrementUnread: false,
      /** INSERT·UPDATE 모두 listActivityAt(terminal) forward-only bump */
      bumpRoomLastMessageAt: true,
      durationSeconds: resolveTerminalDurationSeconds(session, mapped),
    });
  };
  const finalizeLog = async (session: CallSessionRow | DevCallSession, mapped: CommunityMessengerCallSession) => {
    const status = terminalLogStatus(mapped);
    const sessionStartedAt =
      "started_at" in session
        ? trimText(session.started_at ?? "")
        : trimText(session.startedAt ?? "");
    const isDbSession = "initiator_user_id" in session;
    const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
    const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
    /**
     * CONTRACT: call_logs peer is session recipient (canonical), never mapCallSession peer
     * (viewer-relative — reject path contaminates peer_user_id == caller_user_id).
     */
    const peerUserId =
      mapped.sessionMode === "direct"
        ? resolveCanonicalCallLogPeerUserId({
            initiatorUserId,
            recipientUserId,
          })
        : null;
    const endedAt =
      trimText(mapped.endedAt ?? "") ||
      (isDbSession ? trimText(session.ended_at ?? "") : trimText(session.endedAt ?? "")) ||
      undefined;
    await createCommunityMessengerCallLog({
      userId: initiatorUserId,
      roomId: "room_id" in session ? session.room_id : session.roomId,
      sessionId,
      peerUserId,
      callKind: "call_kind" in session ? session.call_kind : session.callKind,
      status,
      durationSeconds: resolveTerminalDurationSeconds(session, mapped),
      replaceExistingStub: mapped.sessionMode === "direct",
      startedAt: sessionStartedAt || undefined,
      endedAt,
    });
  };

  const resolveDirectNextStatus = (
    session: CallSessionRow | DevCallSession
  ): { nextStatus: CommunityMessengerCallSessionStatus; answeredAt?: string | null; endedAt?: string | null } | null => {
    const isDbSession = "initiator_user_id" in session;
    const initiatorUserId = isDbSession ? session.initiator_user_id : session.initiatorUserId;
    const recipientUserId = isDbSession ? session.recipient_user_id : session.recipientUserId;
    const status = (isDbSession ? session.status : session.status) as CommunityMessengerCallSessionStatus;

    if (input.action === "accept") {
      if (!messengerUserIdsEqual(recipientUserId, input.userId)) return null;
      // 이미 active 면 수락 재시도·SDP 재전송 시에도 성공해야 한다 (WebRTC 단계 실패 후 재시도).
      if (status === "active") {
        return { nextStatus: "active", answeredAt: trimText(isDbSession ? session.answered_at : session.answeredAt) || nowIso() };
      }
      if (status !== "ringing") return null;
      return { nextStatus: "active", answeredAt: nowIso() };
    }
    if (input.action === "reject") {
      if (!messengerUserIdsEqual(recipientUserId, input.userId) || status !== "ringing") return null;
      return { nextStatus: "rejected", endedAt: nowIso() };
    }
    if (input.action === "cancel") {
      if (!messengerUserIdsEqual(initiatorUserId, input.userId)) return null;
      if (status === "ringing") return { nextStatus: "cancelled", endedAt: nowIso() };
      /* 이미 연결된 뒤에도 일부 클라이언트가 cancel 만 보내면 bad_action 이 되고 세션이 active 에 고정될 수 있음 */
      if (status === "active") return { nextStatus: "ended", endedAt: nowIso() };
      return null;
    }
    if (input.action === "missed") {
      if (status !== "ringing") return null;
      if (!messengerUserIdsEqual(initiatorUserId, input.userId) && !messengerUserIdsEqual(recipientUserId, input.userId)) return null;
      return { nextStatus: "missed", endedAt: nowIso() };
    }
    if (input.action === "end") {
      const fr = trimText(input.clientEndedReason ?? "");
      const isFailedJoin = isTrustedClientEndedReason(fr) && fr.startsWith("failed_");
      if (status === "ringing" && messengerUserIdsEqual(initiatorUserId, input.userId) && isFailedJoin) {
        return { nextStatus: "ended", endedAt: nowIso() };
      }
      /**
       * 발신 대기 중 잘못 `end`만 온 클라·구버전 호환 — `cancel` 과 동일하게 링 종료.
       * (클라 정상 경로는 `cancel` 이지만, 종료 UI·상태는 반드시 터미널로 고정되어야 함)
       */
      if (status === "ringing" && messengerUserIdsEqual(initiatorUserId, input.userId)) {
        return { nextStatus: "cancelled", endedAt: nowIso() };
      }
      if (status !== "active") return null;
      if (!messengerUserIdsEqual(initiatorUserId, input.userId) && !messengerUserIdsEqual(recipientUserId, input.userId)) return null;
      return { nextStatus: "ended", endedAt: nowIso() };
    }
    return null;
  };
  const resolveHangupReason = (
    action: "accept" | "reject" | "cancel" | "end" | "leave" | "missed",
    nextStatus: CommunityMessengerCallSessionStatus
  ): "reject" | "cancel" | "missed" | "end" | null => {
    if (!isTerminalCallSessionStatus(nextStatus)) return null;
    if (nextStatus === "rejected" || action === "reject") return "reject";
    if (nextStatus === "cancelled" || action === "cancel") return "cancel";
    if (nextStatus === "missed" || action === "missed") return "missed";
    return "end";
  };
  const publishDirectTerminalHangupSignalBestEffort = async (
    toUserId: string | null | undefined,
    nextStatus: CommunityMessengerCallSessionStatus
  ) => {
    const to = trimText(toUserId ?? "");
    if (!to || !isTerminalCallSessionStatus(nextStatus)) return;
    const reason = resolveHangupReason(input.action, nextStatus);
    if (!reason) return;
    try {
      await createCommunityMessengerCallSignal({
        userId: input.userId,
        sessionId,
        toUserId: to,
        signalType: "hangup",
        payload: { reason, source: "session_patch" },
      });
    } catch {
      /* best-effort: 세션 상태가 authoritative */
    }
  };

  const publishGroupCallHangupSignalsBestEffort = async (
    participantUserIds: string[],
    payload: Record<string, unknown>
  ) => {
    for (const toUserId of participantUserIds) {
      if (messengerUserIdsEqual(toUserId, input.userId)) continue;
      try {
        await createCommunityMessengerCallSignal({
          userId: input.userId,
          sessionId,
          toUserId,
          signalType: "hangup",
          payload,
        });
      } catch {
        /* best-effort */
      }
    }
  };

  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: row } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select(
        "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, answered_device_id, ended_at, ended_reason, created_at"
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (row) {
      const session = row as CallSessionRow;
      if (
        (session.session_mode ?? "direct") === "direct" &&
        input.action === "accept" &&
        trimText(session.initiator_user_id) &&
        trimText(session.recipient_user_id ?? "")
      ) {
        const initiator = trimText(session.initiator_user_id);
        const recipient = trimText(session.recipient_user_id!);
        // SSOT_CONTRACT: messenger-call-accept-block ensureNoBlockedEitherWay
        if (!(await ensureNoBlockedEitherWay(initiator, recipient))) {
          return { ok: false, error: "blocked_target" };
        }
      }
      if ((session.session_mode ?? "direct") === "group") {
        const now = nowIso();
        const { data: participantRows } = await (sb as any)
          .from("community_messenger_call_session_participants")
          .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
          .eq("session_id", sessionId);
        const participants = (participantRows ?? []) as CallSessionParticipantRow[];
        const mine = participants.find((item) => messengerUserIdsEqual(item.user_id, input.userId));
        if (!mine) return { ok: false, error: "forbidden" };

        if (input.action === "cancel") {
          if (
            !messengerUserIdsEqual(session.initiator_user_id, input.userId) ||
            session.status !== "ringing"
          ) {
            return { ok: false, error: "bad_action" };
          }
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId);
          const { data: updated } = await (sb as any)
            .from("community_messenger_call_sessions")
            .update({ status: "cancelled", ended_at: now, updated_at: now, ended_reason: "canceled" })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
            )
            .single();
          if (updated) {
            const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
            invalidateActiveCallSessionByUserRoomCacheForRoom(mapped.roomId);
            await finalizeLog(session, mapped);
            const cancelTargets = participants
              .map((p) => trimText(p.user_id ?? ""))
              .filter((id) => id && !messengerUserIdsEqual(id, input.userId));
            await publishGroupCallHangupSignalsBestEffort(cancelTargets, {
              reason: "cancel",
              source: "session_patch",
            });
            await appendCommunityMessengerCallSessionEvent(sb, {
              sessionId,
              actorUserId: input.userId,
              eventType: "canceled",
              payload: { scope: "group" },
            });
            return { ok: true, session: mapped };
          }
          return { ok: false, error: "call_session_update_failed" };
        }

        if (input.action === "end") {
          if (session.status !== "active" && session.status !== "ringing") {
            return { ok: false, error: "bad_action" };
          }
          const endTargets = participants
            .filter((p) => p.participation_status === "joined" || p.participation_status === "invited")
            .map((p) => trimText(p.user_id ?? ""))
            .filter((id) => id.length > 0);
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId)
            .in("participation_status", ["joined", "invited"]);
          const { data: updated } = await (sb as any)
            .from("community_messenger_call_sessions")
            .update({
              status: "ended",
              ended_at: now,
              updated_at: now,
              ended_reason: "ended",
            })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
            )
            .single();
          if (!updated) return { ok: false, error: "call_session_update_failed" };
          const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
          invalidateActiveCallSessionByUserRoomCacheForRoom(mapped.roomId);
          await publishGroupCallHangupSignalsBestEffort(
            endTargets.filter((id) => !messengerUserIdsEqual(id, input.userId)),
            { reason: "end", source: "session_patch" }
          );
          const { data: existingLog } = await (sb as any)
            .from("community_messenger_call_logs")
            .select("id")
            .eq("session_id", sessionId)
            .maybeSingle();
          if (!existingLog) await finalizeLog(session, mapped);
          else await ensureTerminalCallStub(session, mapped);
          await appendCommunityMessengerCallSessionEvent(sb, {
            sessionId,
            actorUserId: input.userId,
            eventType: "ended",
            payload: { scope: "group", terminate_all: true },
          });
          return { ok: true, session: mapped };
        }

        if (input.action === "accept") {
          if (session.status !== "ringing" && session.status !== "active") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "joined", joined_at: now, left_at: null })
            .eq("session_id", sessionId)
            .eq("user_id", input.userId);
        } else if (input.action === "reject") {
          /** 발신 취소 등으로 이미 종료된 뒤 수신 측 거절이 늦게 오는 경우 — bad_action 반복 방지 */
          if (isTerminalCallSessionStatus(session.status)) {
            const mapped = await mapCallSession(input.userId, session);
            await ensureTerminalCallStub(session, mapped);
            return { ok: true, session: mapped };
          }
          if (session.status !== "ringing" && session.status !== "active") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "rejected", left_at: now })
            .eq("session_id", sessionId)
            .eq("user_id", input.userId);
        } else if (input.action === "leave") {
          if (session.status !== "active" && session.status !== "ringing") {
            return { ok: false, error: "bad_action" };
          }
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId)
            .eq("user_id", input.userId);
        } else if (input.action === "missed") {
          if (session.status !== "ringing") return { ok: false, error: "bad_action" };
          await (sb as any)
            .from("community_messenger_call_session_participants")
            .update({ participation_status: "left", left_at: now })
            .eq("session_id", sessionId);
          const { data: updated } = await (sb as any)
            .from("community_messenger_call_sessions")
            .update({ status: "missed", ended_at: now, updated_at: now, ended_reason: "missed" })
            .eq("id", sessionId)
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
            )
            .single();
          if (updated) {
            const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
            invalidateActiveCallSessionByUserRoomCacheForRoom(mapped.roomId);
            await finalizeLog(session, mapped);
            await appendCommunityMessengerCallSessionEvent(sb, {
              sessionId,
              actorUserId: input.userId,
              eventType: "missed",
              payload: { scope: "group" },
            });
            return { ok: true, session: mapped };
          }
          return { ok: false, error: "call_session_update_failed" };
        } else {
          return { ok: false, error: "bad_action" };
        }

        const { data: refreshedRows } = await (sb as any)
          .from("community_messenger_call_session_participants")
          .select("id, session_id, room_id, user_id, participation_status, joined_at, left_at, created_at")
          .eq("session_id", sessionId);
        const refreshedParticipants = (refreshedRows ?? []) as CallSessionParticipantRow[];
        const joinedCount = refreshedParticipants.filter((item) => item.participation_status === "joined").length;
        const invitedCount = refreshedParticipants.filter((item) => item.participation_status === "invited").length;
        const nextStatus = resolveGroupCallSessionStatusAfterParticipantChange({
          joinedCount,
          invitedCount,
          action: input.action,
        });
        const updatePayload: Record<string, unknown> = {
          status: nextStatus,
          updated_at: now,
        };
        if (nextStatus === "active" && !session.answered_at) updatePayload.answered_at = now;
        if (isTerminalCallSessionStatus(nextStatus)) updatePayload.ended_at = now;
        const erG = endedReasonForSessionDelta(
          input.action,
          nextStatus as CommunityMessengerCallSessionStatus,
          input.clientEndedReason,
        );
        if (erG) updatePayload.ended_reason = erG;
        else if (nextStatus === "active") updatePayload.ended_reason = null;
        const { data: updated } = await (sb as any)
          .from("community_messenger_call_sessions")
          .update(updatePayload)
          .eq("id", sessionId)
          .select(
            "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
          )
          .single();
        if (!updated) return { ok: false, error: "call_session_update_failed" };
        const mapped = await mapCallSession(input.userId, updated as CallSessionRow);
        invalidateActiveCallSessionByUserRoomCacheForRoom(mapped.roomId);
        if (input.action === "leave" && !isTerminalCallSessionStatus(mapped.status)) {
          const leaveTargets = refreshedParticipants
            .filter((p) => p.participation_status === "joined")
            .map((p) => trimText(p.user_id ?? ""))
            .filter((id) => id.length > 0 && !messengerUserIdsEqual(id, input.userId));
          await publishGroupCallHangupSignalsBestEffort(leaveTargets, {
            reason: "leave",
            source: "session_patch",
          });
        }
        if (isTerminalCallSessionStatus(mapped.status)) {
          const terminalTargets = refreshedParticipants
            .filter((p) => p.participation_status === "joined" || p.participation_status === "invited")
            .map((p) => trimText(p.user_id ?? ""))
            .filter((id) => id.length > 0 && !messengerUserIdsEqual(id, input.userId));
          await publishGroupCallHangupSignalsBestEffort(terminalTargets, {
            reason: resolveHangupReason(input.action, nextStatus as CommunityMessengerCallSessionStatus) ?? "end",
            source: "session_patch",
          });
          const { data: existingLog } = await (sb as any)
            .from("community_messenger_call_logs")
            .select("id")
            .eq("session_id", sessionId)
            .maybeSingle();
          if (!existingLog) await finalizeLog(session, mapped);
          else await ensureTerminalCallStub(session, mapped);
        }
        await appendCommunityMessengerCallSessionEvent(sb, {
          sessionId,
          actorUserId: input.userId,
          eventType: auditEventTypeForAction(input.action, nextStatus as CommunityMessengerCallSessionStatus),
          payload: { next_status: nextStatus, scope: "group" },
        });
        return { ok: true, session: mapped };
      }

      const next = resolveDirectNextStatus(session);
      if (!next) {
        if (
          input.action === "reject" &&
          messengerUserIdsEqual(session.recipient_user_id, input.userId) &&
          isTerminalCallSessionStatus(session.status)
        ) {
          const mapped = await mapCallSession(
            input.userId,
            session,
            undefined,
            undefined,
            undefined,
            "labels_only"
          );
          await ensureTerminalCallStub(session, mapped);
          return { ok: true, session: mapped };
        }
        if (
          input.action === "missed" &&
          isTerminalCallSessionStatus(session.status) &&
          (messengerUserIdsEqual(session.initiator_user_id, input.userId) ||
            messengerUserIdsEqual(session.recipient_user_id, input.userId))
        ) {
          const mapped = await mapCallSession(
            input.userId,
            session,
            undefined,
            undefined,
            undefined,
            "labels_only"
          );
          await ensureTerminalCallStub(session, mapped);
          return { ok: true, session: mapped };
        }
        if (
          input.action === "cancel" &&
          messengerUserIdsEqual(session.initiator_user_id, input.userId) &&
          isTerminalCallSessionStatus(session.status)
        ) {
          const mapped = await mapCallSession(
            input.userId,
            session,
            undefined,
            undefined,
            undefined,
            "labels_only"
          );
          await ensureTerminalCallStub(session, mapped);
          return { ok: true, session: mapped };
        }
        if (
          input.action === "end" &&
          isTerminalCallSessionStatus(session.status) &&
          (messengerUserIdsEqual(session.initiator_user_id, input.userId) ||
            messengerUserIdsEqual(session.recipient_user_id, input.userId))
        ) {
          const mapped = await mapCallSession(
            input.userId,
            session,
            undefined,
            undefined,
            undefined,
            "labels_only"
          );
          await ensureTerminalCallStub(session, mapped);
          return { ok: true, session: mapped };
        }
        return { ok: false, error: "bad_action" };
      }
      const requestDeviceId = normalizeAnswerClaimDeviceId(input.answeredDeviceId);
      if (input.action === "accept" && messengerUserIdsEqual(session.recipient_user_id, input.userId)) {
        const claim = evaluateAcceptDeviceClaim({
          sessionStatus: session.status,
          claimedDeviceId: session.answered_device_id,
          requestDeviceId,
        });
        if (claim.kind === "answered_elsewhere") {
          return { ok: false, error: CALL_ANSWERED_ELSEWHERE_ERROR };
        }
      }
      const softClaimActiveWithoutDevice =
        input.action === "accept" &&
        session.status === "active" &&
        messengerUserIdsEqual(session.recipient_user_id, input.userId) &&
        !normalizeAnswerClaimDeviceId(session.answered_device_id) &&
        !!requestDeviceId;
      const alreadyActiveSameDevice =
        input.action === "accept" &&
        session.status === "active" &&
        messengerUserIdsEqual(session.recipient_user_id, input.userId) &&
        !softClaimActiveWithoutDevice &&
        evaluateAcceptDeviceClaim({
          sessionStatus: session.status,
          claimedDeviceId: session.answered_device_id,
          requestDeviceId,
        }).kind === "idempotent_same_device";
      let updated: CallSessionRow | null = null;
      let error: unknown = null;
      let acceptClaimWon = false;
      if (alreadyActiveSameDevice) {
        updated = session;
      } else {
        const updatePayload: Record<string, unknown> = {
          status: next.nextStatus,
          updated_at: nowIso(),
        };
        if (next.answeredAt) updatePayload.answered_at = next.answeredAt;
        if (next.endedAt) updatePayload.ended_at = next.endedAt;
        const er = endedReasonForSessionDelta(input.action, next.nextStatus, input.clientEndedReason);
        const fr = trimText(input.clientEndedReason ?? "");
        const useClientFailure =
          input.action === "end" &&
          next.nextStatus === "ended" &&
          isTrustedClientEndedReason(fr);
        if (useClientFailure) updatePayload.ended_reason = fr;
        else if (er) updatePayload.ended_reason = er;
        else if (next.nextStatus === "active") updatePayload.ended_reason = null;
        if (next.nextStatus === "active") {
          const hbSeed = nowIso();
          updatePayload.caller_last_heartbeat_at = hbSeed;
          updatePayload.callee_last_heartbeat_at = hbSeed;
        }
        if (input.action === "accept" && (next.nextStatus === "active" || softClaimActiveWithoutDevice)) {
          if (requestDeviceId) updatePayload.answered_device_id = requestDeviceId;
        }
        const currentStatus = trimText(session.status);
        let updateBuilder = (sb as any)
          .from("community_messenger_call_sessions")
          .update(updatePayload)
          .eq("id", sessionId);
        if (
          (input.action === "accept" ||
            input.action === "reject" ||
            input.action === "missed" ||
            input.action === "cancel" ||
            input.action === "end") &&
          (currentStatus === "ringing" || currentStatus === "active")
        ) {
          updateBuilder = updateBuilder.eq("status", currentStatus);
        }
        if (input.action === "accept" && (currentStatus === "ringing" || softClaimActiveWithoutDevice)) {
          updateBuilder = updateBuilder.is("answered_device_id", null);
        }
        const result = await updateBuilder
          .select(
            "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, answered_device_id, ended_at, ended_reason, created_at"
          )
          .maybeSingle();
        updated = (result.data as CallSessionRow | null) ?? null;
        error = result.error;
        if (!error && updated && input.action === "accept" && next.nextStatus === "active") {
          acceptClaimWon = true;
        }
        if (!error && !updated) {
          const { data: freshRow } = await (sb as any)
            .from("community_messenger_call_sessions")
            .select(
              "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, answered_device_id, ended_at, ended_reason, created_at"
            )
            .eq("id", sessionId)
            .maybeSingle();
          const fresh = (freshRow ?? null) as CallSessionRow | null;
          if (fresh) {
            const freshStatus = trimText(fresh.status);
            if (
              input.action === "accept" &&
              freshStatus === "active" &&
              messengerUserIdsEqual(fresh.recipient_user_id, input.userId)
            ) {
              const lateClaim = evaluateAcceptDeviceClaim({
                sessionStatus: fresh.status,
                claimedDeviceId: fresh.answered_device_id,
                requestDeviceId,
              });
              if (lateClaim.kind === "answered_elsewhere") {
                return { ok: false, error: CALL_ANSWERED_ELSEWHERE_ERROR };
              }
              updated = fresh;
            } else if (
              (input.action === "missed" && freshStatus === "missed") ||
              (input.action === "reject" && freshStatus === "rejected")
            ) {
              updated = fresh;
            }
          }
        }
      }
      if (!error && updated) {
        const participantStatus =
          next.nextStatus === "active"
            ? "joined"
            : next.nextStatus === "rejected"
              ? "rejected"
              : isTerminalCallSessionStatus(next.nextStatus)
                ? "left"
                : "invited";
        await (sb as any)
          .from("community_messenger_call_session_participants")
          .update({
            participation_status: participantStatus,
            joined_at: next.answeredAt ?? null,
            left_at: next.endedAt ?? null,
          })
          .eq("session_id", sessionId)
          .eq("user_id", input.userId);
        /**
         * direct accept/reject/end hot path:
         * - participants 테이블 재조회 1RTT 제거
         * - mapCallSession 내부 peer avatar 재-hydrate 1RTT 제거
         */
        const initiatorId = trimText(updated.initiator_user_id);
        const recipientId = trimText(updated.recipient_user_id);
        const rowStartedAt = trimText(updated.started_at) || nowIso();
        const rowAnsweredAt = trimText(updated.answered_at) || null;
        const rowEndedAt = trimText(updated.ended_at) || null;
        const rowStatus = (updated.status ?? next.nextStatus) as CommunityMessengerCallSessionStatus;
        let mapped: CommunityMessengerCallSession;
        if (initiatorId && recipientId) {
          const directParticipantRows: CallSessionParticipantRow[] = [
            {
              id: `${updated.id}:${initiatorId}`,
              session_id: updated.id,
              room_id: updated.room_id,
              user_id: initiatorId,
              participation_status:
                rowStatus === "active"
                  ? "joined"
                  : isTerminalCallSessionStatus(rowStatus)
                    ? "left"
                    : "invited",
              joined_at: rowStatus === "active" ? rowAnsweredAt : null,
              left_at:
                isTerminalCallSessionStatus(rowStatus) || next.nextStatus === "rejected" ? rowEndedAt : null,
              created_at: rowStartedAt,
            },
            {
              id: `${updated.id}:${recipientId}`,
              session_id: updated.id,
              room_id: updated.room_id,
              user_id: recipientId,
              participation_status:
                rowStatus === "active"
                  ? "joined"
                  : next.nextStatus === "rejected"
                    ? "rejected"
                    : isTerminalCallSessionStatus(rowStatus)
                      ? "left"
                      : "invited",
              joined_at: rowStatus === "active" ? rowAnsweredAt : null,
              left_at:
                isTerminalCallSessionStatus(rowStatus) || next.nextStatus === "rejected" ? rowEndedAt : null,
              created_at: rowStartedAt,
            },
          ];
          let profileMapSeed: Map<string, CommunityMessengerProfileLite> | undefined;
          try {
            const profileSeedRows = await hydrateProfilesLabelsOnly(input.userId, [initiatorId, recipientId], {
              includeSelf: true,
            });
            profileMapSeed = new Map(profileSeedRows.map((row) => [row.id, row]));
          } catch {
            profileMapSeed = undefined;
          }
          mapped = await mapCallSession(
            input.userId,
            updated as CallSessionRow,
            directParticipantRows,
            profileMapSeed,
            true,
            "labels_only"
          );
        } else {
          mapped = await mapCallSession(
            input.userId,
            updated as CallSessionRow,
            undefined,
            undefined,
            undefined,
            "labels_only"
          );
        }
        invalidateActiveCallSessionByUserRoomCacheForRoom(mapped.roomId);
        if (
          acceptClaimWon &&
          input.action === "accept" &&
          next.nextStatus === "active" &&
          (updated.session_mode ?? "direct") === "direct"
        ) {
          const calleeId = trimText(updated.recipient_user_id ?? "");
          if (calleeId) {
            void sendWebPushForCommunityMessengerCallAnsweredElsewhere({
              recipientUserId: calleeId,
              sessionId: updated.id,
              answeredDeviceId:
                normalizeAnswerClaimDeviceId(updated.answered_device_id) ?? requestDeviceId,
            }).catch(() => {});
          }
        }
        if (isTerminalCallSessionStatus(next.nextStatus)) {
          const peerUserId = messengerUserIdsEqual(updated.initiator_user_id, input.userId)
            ? updated.recipient_user_id
            : updated.initiator_user_id;
          void publishDirectTerminalHangupSignalBestEffort(peerUserId, next.nextStatus);
          if (next.nextStatus !== "missed" && peerUserId) {
            void sendWebPushForCommunityMessengerCallTerminal({
              recipientUserId: peerUserId,
              sessionId: updated.id,
              status:
                next.nextStatus === "rejected"
                  ? "rejected"
                  : next.nextStatus === "ended"
                    ? "ended"
                    : "cancelled",
            }).catch(() => {});
          }
          // Reject/cancel: also dismiss other callee devices (account-level reject / cancel-all).
          if (
            (next.nextStatus === "rejected" || next.nextStatus === "cancelled") &&
            (updated.session_mode ?? "direct") === "direct"
          ) {
            const calleeId = trimText(updated.recipient_user_id ?? "");
            if (calleeId && !messengerUserIdsEqual(calleeId, peerUserId ?? "")) {
              void sendWebPushForCommunityMessengerCallTerminal({
                recipientUserId: calleeId,
                sessionId: updated.id,
                status: next.nextStatus === "rejected" ? "rejected" : "cancelled",
              }).catch(() => {});
            }
          }
        }
        await appendCommunityMessengerCallSessionEvent(sb, {
          sessionId,
          actorUserId: input.userId,
          eventType: auditEventTypeForAction(input.action, next.nextStatus),
          payload: {
            next_status: next.nextStatus,
            scope: "direct",
            ...(input.action === "accept" && requestDeviceId
              ? { answered_device_id: requestDeviceId }
              : {}),
          },
        });
        if (
          next.nextStatus === "missed" &&
          (updated.session_mode ?? "direct") === "direct"
        ) {
          const roomIdM = trimText(updated.room_id ?? "");
          const initM = trimText(updated.initiator_user_id ?? "");
          const recipM = trimText(updated.recipient_user_id ?? "");
          if (roomIdM && initM && recipM) {
            /**
             * CONTRACT: await Bell write before returning — fire-and-forget races serverless
             * freeze and drops notification_events (observed 1/30 QA-05 miss).
             */
            try {
              const endedReasonM = trimText(
                (updated as { ended_reason?: string | null }).ended_reason ?? ""
              );
              const { data: deliveryRows } = await (sb as any)
                .from("notification_deliveries")
                .select("status, provider_response")
                .eq("user_id", recipM)
                .eq("target_type", "call_session")
                .eq("target_id", updated.id)
                .eq("event_type", "call_ringing")
                .limit(20);
              let claimedAt =
                trimText(
                  (updated as { incoming_push_claimed_at?: string | null }).incoming_push_claimed_at ??
                    ""
                ) || null;
              if (!claimedAt) {
                const { data: claimRow } = await (sb as any)
                  .from("community_messenger_call_sessions")
                  .select("incoming_push_claimed_at")
                  .eq("id", updated.id)
                  .maybeSingle();
                claimedAt =
                  trimText(
                    (claimRow as { incoming_push_claimed_at?: string | null } | null)
                      ?.incoming_push_claimed_at ?? ""
                  ) || null;
              }
              const decision = decideMissedCallBellNotify({
                sessionMode: updated.session_mode ?? "direct",
                endedReason: endedReasonM,
                deliveryRows: (deliveryRows ?? []) as Array<{
                  status?: string | null;
                  provider_response?: Record<string, unknown> | null;
                }>,
                incomingPushClaimedAt: claimedAt,
              });
              if (!decision.notify) {
                if (decision.skipReason === "incoming_policy_superseded") {
                  console.info("[DIBAY_CALL] missed_notify_skipped_policy_superseded", {
                    sessionId: updated.id,
                    recipientUserId: recipM,
                  });
                } else if (decision.skipReason === "no_delivery_evidence") {
                  console.info("[DIBAY_CALL] missed_skipped_no_delivery_evidence", {
                    sessionId: updated.id,
                    recipientUserId: recipM,
                  });
                } else {
                  console.info("[DIBAY_CALL] missed_notify_skipped", {
                    sessionId: updated.id,
                    recipientUserId: recipM,
                    skipReason: decision.skipReason,
                  });
                }
              } else {
                const profileMap = await fetchProfilesByIds([initM, recipM]);
                await notifyMissedCallPipeline(sb as SupabaseLike, {
                  sessionId: updated.id,
                  roomId: roomIdM,
                  initiatorUserId: initM,
                  recipientUserId: recipM,
                  initiatorDisplayName: profileLabel(profileMap.get(initM), initM),
                  recipientDisplayName: profileLabel(profileMap.get(recipM), recipM),
                });
              }
            } catch (missedErr) {
              console.info("[DIBAY_CALL] missed_notify_skipped_after_error", {
                sessionId: updated.id,
                recipientUserId: recipM,
                err:
                  missedErr instanceof Error
                    ? missedErr.message
                    : typeof missedErr === "string"
                      ? missedErr
                      : "unknown",
              });
            }
          }
        }
        if (isTerminalCallSessionStatus(mapped.status)) {
          const { data: existingLog } = await (sb as any)
            .from("community_messenger_call_logs")
            .select("id")
            .eq("session_id", sessionId)
            .maybeSingle();
          if (!existingLog) await finalizeLog(session, mapped);
          else await ensureTerminalCallStub(session, mapped);
        }
        return { ok: true, session: mapped };
      }
      if (!isMissingTableError(error)) {
        const message =
          typeof error === "object" && error && "message" in error
            ? String((error as { message?: unknown }).message ?? "")
            : "";
        return { ok: false, error: message || "call_session_update_failed" };
      }
    }
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "not_found" };

  if (session.sessionMode === "group") {
    const mine = session.participants.find((item) => messengerUserIdsEqual(item.userId, input.userId));
    if (!mine) return { ok: false, error: "forbidden" };
    const now = nowIso();
    if (input.action === "accept") {
      mine.participationStatus = "joined";
      mine.joinedAt = now;
      mine.leftAt = null;
      if (!session.answeredAt) session.answeredAt = now;
      session.status = "active";
    } else if (input.action === "reject") {
      mine.participationStatus = "rejected";
      mine.leftAt = now;
    } else if (input.action === "end") {
      session.status = "ended";
      session.endedAt = now;
      for (const participant of session.participants) {
        participant.participationStatus = "left";
        participant.leftAt = now;
      }
    } else if (input.action === "leave") {
      mine.participationStatus = "left";
      mine.leftAt = now;
    } else if (input.action === "cancel") {
      if (!messengerUserIdsEqual(session.initiatorUserId, input.userId)) return { ok: false, error: "bad_action" };
      session.status = "cancelled";
      session.endedAt = now;
      for (const participant of session.participants) {
        participant.participationStatus = "left";
        participant.leftAt = now;
      }
    } else if (input.action === "missed") {
      session.status = "missed";
      session.endedAt = now;
      for (const participant of session.participants) {
        participant.participationStatus = "left";
        participant.leftAt = now;
      }
    } else {
      return { ok: false, error: "bad_action" };
    }
    if (!isTerminalCallSessionStatus(session.status)) {
      const joinedCount = session.participants.filter((item) => item.participationStatus === "joined").length;
      const invitedCount = session.participants.filter((item) => item.participationStatus === "invited").length;
      session.status = resolveGroupCallSessionStatusAfterParticipantChange({
        joinedCount,
        invitedCount,
        action: input.action,
      });
      if (isTerminalCallSessionStatus(session.status)) session.endedAt = now;
    }
    const mapped = await mapCallSession(input.userId, session);
    invalidateActiveCallSessionByUserRoomCacheForRoom(mapped.roomId);
    if (isTerminalCallSessionStatus(mapped.status)) {
      if (!dev.calls.some((item) => item.sessionId === sessionId)) await finalizeLog(session, mapped);
      else await ensureTerminalCallStub(session, mapped);
    }
    return { ok: true, session: mapped };
  }

  const next = resolveDirectNextStatus(session);
  if (!next) {
    if (
      input.action === "reject" &&
      session.sessionMode === "direct" &&
      messengerUserIdsEqual(session.recipientUserId, input.userId) &&
      isTerminalCallSessionStatus(session.status)
    ) {
      const mapped = await mapCallSession(
        input.userId,
        session,
        undefined,
        undefined,
        undefined,
        "labels_only"
      );
      await ensureTerminalCallStub(session, mapped);
      return { ok: true, session: mapped };
    }
    return { ok: false, error: "bad_action" };
  }
  session.status = next.nextStatus;
  if (typeof next.answeredAt !== "undefined") session.answeredAt = next.answeredAt;
  if (typeof next.endedAt !== "undefined") session.endedAt = next.endedAt;
  if (next.nextStatus === "ended" || next.nextStatus === "cancelled" || next.nextStatus === "missed") {
    session.endedReason = endedReasonForSessionDelta(
      input.action,
      next.nextStatus,
      input.clientEndedReason,
    );
  }
  for (const participant of session.participants) {
    if (!messengerUserIdsEqual(participant.userId, input.userId)) continue;
    participant.participationStatus =
      next.nextStatus === "active"
        ? "joined"
        : next.nextStatus === "rejected"
          ? "rejected"
          : isTerminalCallSessionStatus(next.nextStatus)
            ? "left"
            : "invited";
    participant.joinedAt = next.answeredAt ?? participant.joinedAt;
    participant.leftAt = next.endedAt ?? participant.leftAt;
  }
  const mapped = await mapCallSession(
    input.userId,
    session,
    undefined,
    undefined,
    undefined,
    "labels_only"
  );
  if (isTerminalCallSessionStatus(mapped.status)) {
    if (!dev.calls.some((item) => item.sessionId === sessionId)) await finalizeLog(session, mapped);
    else await ensureTerminalCallStub(session, mapped);
  }
  if (isTerminalCallSessionStatus(next.nextStatus)) {
    const peerUserId = messengerUserIdsEqual(session.initiatorUserId, input.userId)
      ? session.recipientUserId
      : session.initiatorUserId;
    void publishDirectTerminalHangupSignalBestEffort(peerUserId, next.nextStatus);
  }
  return { ok: true, session: mapped };
}

function callSessionParticipantsContain(participants: string[], userId: string): boolean {
  return participants.some((item) => messengerUserIdsEqual(item, userId));
}

function resolveCallSessionCanonicalUserId(participants: string[], userId: string): string | null {
  const hit = participants.find((item) => messengerUserIdsEqual(item, userId));
  return hit ? trimText(hit) || null : null;
}

export async function listCommunityMessengerCallSignals(
  userId: string,
  sessionId: string
): Promise<CommunityMessengerCallSignal[]> {
  const id = trimText(sessionId);
  if (!id) return [];
  const sb = getSupabaseOrNull();
  if (sb) {
    const { data: participantRows } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("user_id")
      .eq("session_id", id);
    const sessionParticipants = dedupeIds(
      ((participantRows ?? []) as Array<{ user_id?: string | null }>)
        .map((item) => item.user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    if (!callSessionParticipantsContain(sessionParticipants, userId)) {
      /* 참가자 행 삽입 레이스·구 데이터 등으로 participant 가 비어 있어도 1:1 이면 세션 행으로 허용 */
      const { data: sessionRow } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select("initiator_user_id, recipient_user_id, session_mode")
        .eq("id", id)
        .maybeSingle();
      const row = sessionRow as {
        initiator_user_id?: string;
        recipient_user_id?: string | null;
        session_mode?: string | null;
      } | null;
      if (!row) return [];
      const mode = trimText(row.session_mode ?? "") || "direct";
      if (mode !== "direct") return [];
      const init = trimText(row.initiator_user_id ?? "");
      const recip = trimText(row.recipient_user_id ?? "");
      const isDirectParty =
        messengerUserIdsEqual(init, userId) || (recip.length > 0 && messengerUserIdsEqual(recip, userId));
      if (!isDirectParty) return [];
    }

    const { data, error } = await (sb as any)
      .from("community_messenger_call_signals")
      .select("id, session_id, room_id, from_user_id, to_user_id, signal_type, payload, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (data && !error) {
      return (data as CallSignalRow[])
        .filter(
          (row) =>
            messengerUserIdsEqual(row.to_user_id, userId) || messengerUserIdsEqual(row.from_user_id, userId)
        )
        .map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          roomId: row.room_id,
          fromUserId: row.from_user_id,
          toUserId: row.to_user_id,
          signalType: row.signal_type,
          payload: (row.payload ?? {}) as Record<string, unknown>,
          createdAt: trimText(row.created_at) || nowIso(),
        }));
    }
  }
  return getDevState().callSignals
    .filter((item) => item.sessionId === id && (item.fromUserId === userId || item.toUserId === userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      roomId: row.roomId,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      signalType: row.signalType,
      payload: row.payload,
      createdAt: row.createdAt,
    }));
}

export async function listIncomingCommunityMessengerCallSessions(
  userId: string,
  options?: { directOnly?: boolean }
): Promise<CommunityMessengerCallSession[]> {
  const policy = await getMessengerCallAdminPolicyCached();
  await reconcileUserLiveCallSessions(userId, "incoming_api");
  const sb = getSupabaseOrNull();
  if (sb) {
    await terminalStaleRingingDirectSessionsForUser(sb, userId, policy).catch(() => 0);
    if (options?.directOnly) {
      const { data: directRows, error: directError } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
        )
        .eq("recipient_user_id", userId)
        .eq("session_mode", "direct")
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(10);
      if (!directError && (directRows ?? []).length) {
        const filtered = await filterDirectIncomingRowsForPolicy(sb, userId, (directRows ?? []) as CallSessionRow[], policy);
        if (filtered.length) {
          return mapIncomingCallSessionsBatch(userId, filtered);
        }
      }
      return [];
    }

    const [{ data: directRows, error: directError }, { data: groupParticipantRows, error: groupError }] =
      await Promise.all([
        (sb as any)
          .from("community_messenger_call_sessions")
          .select(
            "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
          )
          .eq("recipient_user_id", userId)
          .eq("session_mode", "direct")
          .eq("status", "ringing")
          .order("created_at", { ascending: false })
          .limit(10),
        (sb as any)
          .from("community_messenger_call_session_participants")
          .select("session_id, participation_status")
          .eq("user_id", userId)
          .in("participation_status", ["invited"])
          .limit(20),
      ]);

    const groupSessionIds = dedupeIds(
      ((groupParticipantRows ?? []) as Array<{ session_id?: string | null }>)
        .map((row) => row.session_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );

    let groupRows: CallSessionRow[] = [];
    if (groupSessionIds.length) {
      const { data } = await (sb as any)
        .from("community_messenger_call_sessions")
        .select(
          "id, room_id, initiator_user_id, recipient_user_id, session_mode, max_participants, call_kind, status, started_at, answered_at, ended_at, ended_reason, created_at"
        )
        .in("id", groupSessionIds)
        .eq("session_mode", "group")
        .in("status", ["ringing", "active"])
        .order("created_at", { ascending: false });
      groupRows = (data ?? []) as CallSessionRow[];
    }

    if ((!directError || !groupError) && ((directRows ?? []).length || groupRows.length)) {
      const directFiltered = (directRows ?? []).length
        ? await filterDirectIncomingRowsForPolicy(sb, userId, (directRows ?? []) as CallSessionRow[], policy)
        : [];
      const merged = [...directFiltered, ...groupRows]
        .sort((a, b) => (trimText(b.created_at) || "").localeCompare(trimText(a.created_at) || ""))
        .slice(0, 10);
      return mapIncomingCallSessionsBatch(userId, merged);
    }
  }

  const dev = getDevState();
  const sessions = dev.callSessions
    .filter((item) => {
      if (item.sessionMode === "direct") {
        return item.recipientUserId === userId && item.status === "ringing";
      }
      const mine = item.participants.find((participant) => participant.userId === userId);
      return Boolean(mine && mine.participationStatus === "invited" && (item.status === "ringing" || item.status === "active"));
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  return Promise.all(sessions.map((row) => mapCallSession(userId, row)));
}

export async function createCommunityMessengerCallSignal(input: {
  userId: string;
  sessionId: string;
  toUserId: string;
  signalType: CommunityMessengerCallSignalType;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; signal?: CommunityMessengerCallSignal; error?: string }> {
  const sessionId = trimText(input.sessionId);
  const toUserId = trimText(input.toUserId);
  if (!sessionId || !toUserId) return { ok: false, error: "bad_signal_target" };
  const sb = getSupabaseOrNull();

  const mapSignal = (row: CallSignalRow | DevCallSignal): CommunityMessengerCallSignal => {
    const isDbSignal = "session_id" in row;
    return {
      id: row.id,
      sessionId: isDbSignal ? row.session_id : row.sessionId,
      roomId: isDbSignal ? row.room_id : row.roomId,
      fromUserId: isDbSignal ? row.from_user_id : row.fromUserId,
      toUserId: isDbSignal ? row.to_user_id : row.toUserId,
      signalType: (isDbSignal ? row.signal_type : row.signalType) as CommunityMessengerCallSignalType,
      payload: ((isDbSignal ? row.payload : row.payload) ?? {}) as Record<string, unknown>,
      createdAt: trimText(isDbSignal ? row.created_at : row.createdAt) || nowIso(),
    };
  };

  if (sb) {
    const { data: session } = await (sb as any)
      .from("community_messenger_call_sessions")
      .select("id, room_id, initiator_user_id, recipient_user_id, session_mode, status")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return { ok: false, error: "session_not_found" };
    const row = session as CallSessionRow;
    const { data: participantRows } = await (sb as any)
      .from("community_messenger_call_session_participants")
      .select("user_id")
      .eq("session_id", sessionId);
    const participants = dedupeIds(
      ((participantRows ?? []) as Array<{ user_id?: string | null }>)
        .map((item) => item.user_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0)
    );
    const directFallbackParticipants =
      (row.session_mode ?? "direct") === "direct"
        ? dedupeIds([trimText(row.initiator_user_id), trimText(row.recipient_user_id)])
        : [];
    const canonicalPool = participants.length > 0 ? participants : directFallbackParticipants;
    const canonicalFrom =
      resolveCallSessionCanonicalUserId(canonicalPool, input.userId) ??
      (messengerUserIdsEqual(row.initiator_user_id, input.userId)
        ? trimText(row.initiator_user_id)
        : messengerUserIdsEqual(row.recipient_user_id, input.userId)
          ? trimText(row.recipient_user_id)
          : null);
    const canonicalTo =
      resolveCallSessionCanonicalUserId(canonicalPool, toUserId) ??
      (messengerUserIdsEqual(row.initiator_user_id, toUserId)
        ? trimText(row.initiator_user_id)
        : messengerUserIdsEqual(row.recipient_user_id, toUserId)
          ? trimText(row.recipient_user_id)
          : null);
    if (!canonicalFrom || !canonicalTo || messengerUserIdsEqual(canonicalFrom, canonicalTo)) {
      return { ok: false, error: "forbidden" };
    }
    const { data, error } = await (sb as any)
      .from("community_messenger_call_signals")
      .insert({
        session_id: sessionId,
        room_id: row.room_id,
        from_user_id: canonicalFrom,
        to_user_id: canonicalTo,
        signal_type: input.signalType,
        payload: input.payload,
      })
      .select("id, session_id, room_id, from_user_id, to_user_id, signal_type, payload, created_at")
      .single();
    if (!error && data) return { ok: true, signal: mapSignal(data as CallSignalRow) };
    if (!isMissingTableError(error)) return { ok: false, error: String(error.message ?? "signal_insert_failed") };
  }

  const dev = getDevState();
  const session = dev.callSessions.find((item) => item.id === sessionId);
  if (!session) return { ok: false, error: "session_not_found" };
  const participants = dedupeIds(session.participants.map((item) => item.userId));
  const canonicalFrom = resolveCallSessionCanonicalUserId(participants, input.userId);
  const canonicalTo = resolveCallSessionCanonicalUserId(participants, toUserId);
  if (!canonicalFrom || !canonicalTo || messengerUserIdsEqual(canonicalFrom, canonicalTo)) {
    return { ok: false, error: "forbidden" };
  }
  const row: DevCallSignal = {
    id: randomUUID(),
    sessionId,
    roomId: session.roomId,
    fromUserId: canonicalFrom,
    toUserId: canonicalTo,
    signalType: input.signalType,
    payload: input.payload,
    createdAt: nowIso(),
  };
  dev.callSignals.push(row);
  return { ok: true, signal: mapSignal(row) };
}

/** FBT1 snapshot — trade enrich with preloaded mega bundle (no additional RPC). */
export async function enrichTradeContextForBootstrapSnapshot(
  userId: string,
  summaries: CommunityMessengerRoomSummary[],
  preloadedMega: unknown,
  diagnostics?: CommunityMessengerBootstrapDiagnostics
): Promise<void> {
  const megaPromise: Promise<HomeSyncMegaDirectKeysBundleFetchResult> = Promise.resolve({
    data: (preloadedMega ?? null) as Record<string, unknown> | null,
    error: null,
    leaderRpcWallMs: 0,
    lookupWallMs: 0,
    megaMapSyncMs: 0,
    megaInflightOrRpcWaitMs: 0,
    cacheReason: "rpc_cold",
    singleflightJoinCount: 0,
    cacheKey: "fbt1-snapshot",
  });
  await enrichTradeRoomContextMetaForBootstrap(userId, summaries, diagnostics, undefined, {
    homeSyncMegaBundleForDirectKeys: true,
    megaBundlePrefetchPromise: megaPromise,
    tradeCategoryFetchMode: "full",
  });
}

/** FBT1 snapshot — call log entries from RPC-payload rows (no session-map DB fetch). */
export function buildBootstrapCallsFromPreloadedSnapshot(
  userId: string,
  callLogRows: Array<CallRow | DevCall>,
  sessionParticipantRows: unknown[],
  profileById: Map<string, CommunityMessengerProfileLite>,
  roomMetaMap: Map<string, CommunityMessengerRoomSummary>
): CommunityMessengerCallLog[] {
  const sessionMap = new Map<string, CallSessionMetaRow | DevCallSession>();
  const participantsBySession = new Map<string, CommunityMessengerCallParticipant[]>();
  for (const raw of sessionParticipantRows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const sessionId = trimText(row.session_id);
    const participantUserId = trimText(row.user_id);
    if (!sessionId || !participantUserId) continue;
    if (!sessionMap.has(sessionId)) {
      sessionMap.set(sessionId, {
        id: sessionId,
        room_id: trimText(row.room_id) || "",
        session_mode: "direct",
      });
    }
    const list = participantsBySession.get(sessionId) ?? [];
    const profile = profileById.get(participantUserId);
    list.push({
      userId: participantUserId,
      label: profile?.label ?? profileLabel(null, participantUserId),
      status: (trimText(row.participation_status) as CommunityMessengerCallParticipantStatus) || "invited",
      joinedAt: trimText(row.joined_at) || null,
      leftAt: trimText(row.left_at) || null,
      isMe: participantUserId === userId,
    });
    participantsBySession.set(sessionId, list);
  }
  for (const row of callLogRows) {
    const sessionId = callLogSessionId(row);
    if (!sessionId || sessionMap.has(sessionId)) continue;
    const roomId = callLogRoomId(row);
    const roomMeta = roomId ? roomMetaMap.get(roomId) : undefined;
    sessionMap.set(sessionId, {
      id: sessionId,
      room_id: roomId ?? "",
      session_mode:
        roomMeta?.roomType && roomMeta.roomType !== "direct" ? "group" : "direct",
    });
  }
  return buildCallLogEntriesFromRows(
    userId,
    callLogRows,
    profileById,
    roomMetaMap,
    sessionMap,
    participantsBySession
  );
}
