"use client";

function trimCmText(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 커뮤니티 메신저 방 Phase2 전용 컨트롤러 — Phase1 컨텍스트 + 그룹 통화 컨텍스트 위에서
 * 전송·권한·통화·그룹 운영 등 모든 상호작용 상태와 이펙트를 한곳에 둔다.
 * UI(`CommunityMessengerRoomPhase2.tsx`)는 이 훅의 반환값만 구조 분해해 렌더한다.
 */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  hasUsablePrimedCommunityMessengerDeviceStream,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  openCommunityMessengerPermissionSettings,
} from "@/lib/community-messenger/call-permission";
import {
  startCommunityMessengerCallTone,
  type CallToneController,
  unlockCommunityMessengerCallPlaybackFromUserGesture,
} from "@/lib/community-messenger/call-feedback-sound";
import { useCommunityMessengerRoomGroupCall } from "@/lib/community-messenger/room/community-messenger-group-call-context";
import { useMessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { type CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";
import { buildCommunityMessengerInternalShareClipboard } from "@/lib/community-messenger/message-actions/message-internal-share-card";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { forgetMessengerRoomClientBootstrapFlights } from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import { messengerMonitorMessageRtt } from "@/lib/community-messenger/monitoring/client";
import {
  getMessengerRoomActionErrorMessage,
  pickMessengerApiErrorField,
} from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { tryRedirectMessengerRoomAuthBlocked } from "@/lib/community-messenger/room/messenger-room-auth-blocked-redirect";
import { useMessengerRoomVoiceRecording } from "@/lib/community-messenger/room/use-messenger-room-voice-recording";
import { disposeDetachedCommunityCallIfStale } from "@/lib/community-messenger/direct-call-minimize";
import {
  buildCommunityMessengerOutgoingDialHref,
  rememberCallNavigationReturnPath,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { cmCallLatencyInfo, cmCallLatencyMarkClick, setCmCallLatencyContext } from "@/lib/community-messenger/cm-call-debug";
import { SAMARKET_ROUTES } from "@/lib/app/samarket-route-map";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import {
  mergeRoomMessages,
  nextOptimisticCommunityMessengerCreatedAtIso,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { createCommunityMessengerClientMessageId } from "@/lib/community-messenger/client-message-id";
import { syncMessengerHomeAfterOutboundSend } from "@/lib/community-messenger/multi-tab-bus";
import { touchRecentStickerUrl } from "@/lib/stickers/recent-stickers-client";
import { useMessengerRoomPhase2RoomPresentation } from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { bumpCommunityMessengerPresenceActivity } from "@/lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime";
import { requestLocationWithDiBaYGate } from "@/lib/permissions/device-permission-manager";
import {
  messengerRoomReadBlockKeyCallPanel,
  setMessengerRoomReadBlock,
} from "@/lib/community-messenger/room/messenger-room-read-gate";
import { buildReplyPreviewSnapshot } from "@/lib/community-messenger/message-actions/message-reply-policy";
import { registerMessengerRoomComposerPhase2Bridge } from "@/lib/community-messenger/room/messenger-room-composer-phase2-bridge";
import { translateCmUi } from "@/lib/community-messenger/cm-ui-translate";

export type MessengerRoomPhase2ControllerState = ReturnType<typeof useMessengerRoomPhase2Controller>;

function dispatchTradeLinkedNavBadgesAfterMessengerMutation(tradeDock: boolean, roomId: string) {
  if (!tradeDock || typeof window === "undefined") return;
  requestMessengerHubBadgeResync("room_phase2_mark_read", { roomId });
  dispatchTradeChatUnreadUpdated({
    source: "community-messenger-room-phase2",
    key: "trade-linked-nav-badges",
  });
}

/** 첨부·위치 선택 후 「보내기」 전 확인 시트용 */
export type MessengerAttachmentConfirmDraft =
  | { kind: "image"; files: File[]; previewUrls: string[] }
  | { kind: "file"; file: File }
  | { kind: "location"; content: string };

const MESSENGER_IMAGE_ALBUM_PICK_MAX = 10;

/** `viewerUserId` 비어 있을 때만 — 확정 메시지가 오면 교체. 서버 POST 와 무관(세션 auth). */
const CM_OPTIMISTIC_SENDER_FALLBACK_ID = "__cm_shell_self__";

function optimisticOutboundSender(
  snapshot: { viewerUserId: string },
  roomMembersDisplay: Array<{ id: string; label: string }>
): { senderId: string; senderLabel: string } {
  const uid = snapshot.viewerUserId.trim();
  if (uid) {
    return {
      senderId: uid,
      senderLabel: roomMembersDisplay.find((m) => m.id === uid)?.label ?? translateCmUi("common_me"),
    };
  }
  return { senderId: CM_OPTIMISTIC_SENDER_FALLBACK_ID, senderLabel: translateCmUi("common_me") };
}

export function useMessengerRoomPhase2Controller() {
  const phase1 = useMessengerRoomClientPhase1Context();
  const {
    CM_SNAPSHOT_FIRST_PAGE,
    activeSheet,
    aliasProfileCount,
    autoAcceptInFlightRef,
    autoHandledSessionRef,
    busy,
    callActionFromUrl,
    callStubSheet,
    cameraInputRef,
    catchUpNewerMessages,
    chatVirtualizer,
    composerTextareaRef,
    contextMetaFromUrlHandledRef,
    deferredMemberBootstrapRef,
    dismissRoomSheet,
    displayRoomMessages,
    fileInputRef,
    fileMessageCount,
    fileMessages,
    filteredInviteCandidates,
    friends,
    friendsLoaded,
    groupAdminCount,
    groupAllowAdminEditNotice,
    groupAllowAdminInvite,
    groupAllowAdminKick,
    groupAllowMemberCall,
    groupAllowMemberInvite,
    groupAllowMemberUpload,
    groupCallAutoAcceptNotice,
    groupHistorySectionRef,
    groupNoticeSectionRef,
    groupPermissionsSectionRef,
    hasMoreOlderMessages,
    hiddenCallStubIds,
    imageInputRef,
    infoSheetFocus,
    initialCallAction,
    initialCallSessionId,
    initialServerSnapshot,
    inviteCandidates,
    inviteIds,
    inviteSearchQuery,
    linkMessageCount,
    linkThreadMessages,
    loadFriends,
    loadMoreRoomMembers,
    loadOlderMessages,
    loadOlderMessagesRef,
    loadedRef,
    loading,
    loadingOlderMessages,
    managedDirectCallError,
    managementEventMessages,
    mediaGalleryMessages,
    memberActionTarget,
    membersListNextOffset,
    membersPageInitializedRef,
    membersPagingBusy,
    message,
    messageActionItem,
    messageEndRef,
    messageLongPressItemRef,
    messageLongPressTimerRef,
    messageSearchResults,
    messagesViewportRef,
    olderMessagesExhaustedRef,
    oldestLoadedMessageId,
    openGroupDiscoverable,
    openGroupIdentityPolicy,
    openGroupJoinPolicy,
    openGroupMemberLimit,
    openGroupPassword,
    openGroupSummary,
    openGroupTitle,
    outgoingDialLocked,
    outgoingDialSyncGuardRef,
    pagedRoomMembers,
    pathname,
    pendingMessageIdRef,
    photoMessageCount,
    prevActiveSheetRef,
    privateGroupNoticeDraft,
    refresh,
    replyToMessage,
    roomId,
    streamRoomId,
    roomMembersDisplay,
    roomMembersDisplayRef,
    roomMessages,
    roomMessagesRef,
    roomOpenMarkReadRef,
    roomPreferences,
    roomReadyForRealtime,
    roomSearchQuery,
    router,
    scrollMessengerToBottom,
    scrollToRoomMessage,
    searchParams,
    selectedInviteCandidates,
    sessionIdFromUrl,
    setActiveSheet,
    setBusy,
    setCallStubSheet,
    setFriends,
    setFriendsLoaded,
    setGroupAllowAdminEditNotice,
    setGroupAllowAdminInvite,
    setGroupAllowAdminKick,
    setGroupAllowMemberCall,
    setGroupAllowMemberInvite,
    setGroupAllowMemberUpload,
    setGroupCallAutoAcceptNotice,
    setHasMoreOlderMessages,
    setHiddenCallStubIds,
    setInfoSheetFocus,
    setInviteIds,
    setInviteSearchQuery,
    setLoading,
    setLoadingOlderMessages,
    setManagedDirectCallError,
    setMemberActionTarget,
    setMembersListNextOffset,
    setMembersPagingBusy,
    setMessage,
    setMessageActionItem,
    setOpenGroupDiscoverable,
    setOpenGroupIdentityPolicy,
    setOpenGroupJoinPolicy,
    setOpenGroupMemberLimit,
    setOpenGroupPassword,
    setOpenGroupSummary,
    setOpenGroupTitle,
    setOutgoingDialLocked,
    setPagedRoomMembers,
    setPrivateGroupNoticeDraft,
    setReplyToMessage,
    setRoomMessages,
    setRoomPreferences,
    setRoomReadyForRealtime,
    setRoomSearchQuery,
    setSnapshot,
    sheetInfoFromUrlHandledRef,
    silentRoomRefreshAgainRef,
    silentRoomRefreshBusyRef,
    snapshot,
    snapshotRef,
    sortedMembers,
    stickToBottomRef,
    t,
    topOlderSentinelRef,
    tt,
    updateStickToBottomFromScroll,
    voiceMessageCount,
  } = phase1;

  const [attachmentConfirmDraft, setAttachmentConfirmDraft] = useState<MessengerAttachmentConfirmDraft | null>(null);

  useEffect(() => {
    const rid = roomId?.trim();
    return () => {
      if (!rid) return;
      setAttachmentConfirmDraft((prev) => {
        if (prev?.kind === "image") {
          for (const u of prev.previewUrls) URL.revokeObjectURL(u);
        }
        return null;
      });
    };
  }, [roomId]);

  useEffect(() => {
    if (activeSheet != null) return;
    setAttachmentConfirmDraft((prev) => {
      if (!prev) return null;
      if (prev.kind === "image") {
        for (const u of prev.previewUrls) URL.revokeObjectURL(u);
      }
      return null;
    });
  }, [activeSheet]);

  const call = useCommunityMessengerRoomGroupCall();
  const callPanel = call.panel;
  const {
    roomUnavailable,
    isGroupRoom,
    roomSummaryHoldsOnlyTradeOrDeliveryMeta,
    tradeProductChatIdForDock,
    showMessengerTradeProcessDock,
    storeOrderIdForDock,
    storeIdForDock,
    showMessengerStoreOrderDock,
    permissionGuide,
    isPrivateGroupRoom,
    isOpenGroupRoom,
    isOwner,
    roomTypeLabel,
    roomSubtitle,
    roomJoinLabel,
    roomIdentityLabel,
    roomNotice,
    canInviteMembers,
    myRoleLabel,
    privateGroupNotice,
    canEditGroupNotice,
    canManageGroupPermissions,
    canManageMemberRoles,
    canKickGroupMembers,
    canStartGroupCall,
    canUploadAttachments,
    activeGroupCall,
    groupCallStatusLabel,
    privateGroupPermissionRows,
    allowedPrivateGroupPermissionCount,
    privateGroupNoticeStatusLabel,
    returnToCallSessionId,
    roomHeaderStatus,
  } = useMessengerRoomPhase2RoomPresentation({
    snapshot,
    roomId,
    roomMessages,
    t,
    callPanel,
  });

  useEffect(() => {
    /* 스냅샷 로딩 전에는 activeCall 을 알 수 없음 — null 로 dispose 하면 미니화(detached) 연결까지 끊긴다 */
    if (loading) return;
    void disposeDetachedCommunityCallIfStale(snapshot?.activeCall?.id ?? null);
  }, [loading, snapshot?.activeCall?.id]);

  /** 서버에 진행 중 통화가 없을 때 sessionStorage 잔존 제거(채팅 배너는 오직 스냅샷 activeCall 만 신뢰) */
  useEffect(() => {
    if (!snapshot || snapshot.activeCall) return;
    try {
      sessionStorage.removeItem("cm_minimized_call_room");
      sessionStorage.removeItem("cm_minimized_call_session");
    } catch {
      /* ignore */
    }
  }, [snapshot]);

  const getRoomActionErrorMessage = useCallback(
    (error?: string) => getMessengerRoomActionErrorMessage(error, t),
    [t]
  );

  const redirectIfMessengerAuthBlocked = useCallback(
    (res: Response, json: { error?: unknown; code?: unknown }) =>
      tryRedirectMessengerRoomAuthBlocked(router, res, json, {
        pathname: pathname ?? "",
        streamRoomId,
      }),
    [router, pathname, streamRoomId]
  );

  /** 동일 메시지에 대한 반응 POST 중복(연타)만 막는다 — 메시지마다 독립 */
  const messageReactionToggleBusyIdsRef = useRef<Set<string>>(new Set());

  const forgetRoomBootstrapClientFlightsAfterMutation = useCallback(() => {
    const uid = snapshot?.viewerUserId?.trim();
    const route = roomId?.trim();
    const stream = streamRoomId?.trim();
    if (!uid || !stream) return;
    forgetMessengerRoomClientBootstrapFlights({ roomId: stream, viewerUserId: uid });
    if (route && route !== stream) {
      forgetMessengerRoomClientBootstrapFlights({ roomId: route, viewerUserId: uid });
    }
  }, [roomId, streamRoomId, snapshot?.viewerUserId]);

  const onMessengerOutboundConfirmed = useCallback(
    (msg: CommunityMessengerMessage, clientMessageId?: string) => {
      const uid = snapshot?.viewerUserId?.trim();
      if (!uid) return;
      syncMessengerHomeAfterOutboundSend({
        roomId: streamRoomId,
        senderUserId: uid,
        message: msg,
        clientMessageId,
      });
      forgetRoomBootstrapClientFlightsAfterMutation();
      dispatchTradeLinkedNavBadgesAfterMessengerMutation(showMessengerTradeProcessDock, streamRoomId);
    },
    [
      forgetRoomBootstrapClientFlightsAfterMutation,
      showMessengerTradeProcessDock,
      snapshot?.viewerUserId,
      streamRoomId,
    ]
  );

  const {
    voiceMicArming,
    voiceRecording,
    voiceHandsFree,
    voiceRecordElapsedMs,
    voiceLivePreviewBars,
    voiceCancelHint,
    voiceLockHint,
    finalizeVoiceRecording,
    onVoiceMicPointerDown,
    onVoiceMicPointerMove,
    onVoiceMicPointerUp,
    onVoiceMicPointerCancel,
  } = useMessengerRoomVoiceRecording({
    roomId,
    apiRoomId: streamRoomId,
    snapshot,
    roomMembersDisplay,
    roomUnavailable,
    message,
    busy,
    pendingMessageIdRef,
    getRoomActionErrorMessage,
    setBusy,
    setRoomMessages,
    scrollMessengerToBottom,
    onOutboundMessageConfirmed: onMessengerOutboundConfirmed,
    tryRedirectAuthBlocked: redirectIfMessengerAuthBlocked,
  });

  const toggleRoomMute = useCallback(async () => {
    if (!snapshot) return;
    const nextMuted = !snapshot.room.isMuted;
    setBusy("room-mute");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "participant_settings", isMuted: nextMuted }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      setSnapshot((prev) => (prev ? { ...prev, room: { ...prev.room, isMuted: nextMuted } } : prev));
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, streamRoomId, snapshot]);

  const toggleRoomArchive = useCallback(async () => {
    if (!snapshot) return;
    const nextArchived = !snapshot.room.isArchivedByViewer;
    setBusy("room-archive");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", archived: nextArchived }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                isArchivedByViewer: nextArchived,
              },
            }
          : prev
      );
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, streamRoomId, snapshot]);

  const openCallPermissionHelp = useCallback(() => {
    if (openCommunityMessengerPermissionSettings()) return;
    showMessengerSnackbar(
      callPanel?.kind === "video"
        ? t("nav_messenger_permission_browser_camera_mic")
        : t("nav_messenger_permission_browser_mic")
    );
  }, [callPanel?.kind, t]);

  const retryCallDevicePermission = useCallback(() => {
    const kind = callPanel?.kind;
    if (!kind) return;
    void primeCommunityMessengerDevicePermissionFromUserGesture(kind)
      .then(async () => {
        await call.prepareDevices();
        if (callPanel?.mode === "dialing" && !callPanel.sessionId) {
          await call.startOutgoingCall(kind);
          return;
        }
        if (callPanel?.mode === "incoming") {
          await call.acceptIncomingCall();
        }
      })
      .catch(() => {
        showMessengerSnackbar(
          kind === "video"
            ? t("nav_messenger_permission_retry_camera_mic")
            : t("nav_messenger_permission_retry_mic"),
          { variant: "error" }
        );
      });
  }, [call, callPanel, t]);

  const handleAcceptIncomingCall = useCallback((): Promise<boolean> => {
    return call.acceptIncomingCall();
  }, [call]);

  const openDirectCallPage = useCallback(
    (nextSessionId: string, action?: "accept") => {
      rememberCallNavigationReturnPath();
      const suffix = action ? `?action=${encodeURIComponent(action)}` : "";
      const href = `/community-messenger/calls/${encodeURIComponent(nextSessionId)}${suffix}`;
      router.push(href);
    },
    [router]
  );

  /** 발신 — roomManaged. 즉시 `/calls/outgoing` 으로 이동해 준비 UI 표시 후 세션 POST (`OutgoingDialPageClient`). */
  const startManagedDirectCall = useCallback(
    (kind: "voice" | "video"): boolean => {
      if (roomUnavailable || isGroupRoom) return false;
      if (outgoingDialSyncGuardRef.current) return false;
      outgoingDialSyncGuardRef.current = true;
      setOutgoingDialLocked(true);

      setManagedDirectCallError(null);
      const existingSession = snapshot?.activeCall;
      if (existingSession && existingSession.sessionMode === "direct" && (existingSession.status === "ringing" || existingSession.status === "active")) {
        outgoingDialSyncGuardRef.current = false;
        setOutgoingDialLocked(false);
        unlockCommunityMessengerCallPlaybackFromUserGesture();
        openDirectCallPage(existingSession.id);
        return true;
      }

      const rid = roomId.trim();
      const peerLabel = snapshot?.room.title?.trim();
      cmCallLatencyMarkClick({
        surface: "room_managed",
        roomId: rid,
        kind,
        peerLabel: peerLabel ?? null,
      });
      setCmCallLatencyContext({ role: "initiator", callKind: kind, roomId: rid });
      rememberCallNavigationReturnPath();
      /** 세션 POST 는 다음 화면 effect — 여기서 priming 하지 않으면 Web Audio 가 제스처 밖에서 resume 되어 경고·잔음이 난다 */
      unlockCommunityMessengerCallPlaybackFromUserGesture();
      cmCallLatencyInfo("outgoing_route_push_start", {
        roomId: rid,
        callKind: kind,
        role: "initiator",
        peerLabel: peerLabel ?? null,
      });
      logClientPerf("messenger-call.dial.push", { phase: "room_managed_outgoing_shell", roomId: rid, kind });
      router.push(buildCommunityMessengerOutgoingDialHref({ kind, roomId: rid, peerLabel }));
      void primeCommunityMessengerDevicePermissionFromUserGesture(kind);
      window.setTimeout(() => {
        outgoingDialSyncGuardRef.current = false;
        setOutgoingDialLocked(false);
      }, 0);
      return true;
    },
    [isGroupRoom, openDirectCallPage, roomId, roomUnavailable, router, snapshot?.activeCall, snapshot?.room.title]
  );

  useEffect(() => {
    if (!snapshot) return;
    if (isPrivateGroupRoom || isOpenGroupRoom) {
      setPrivateGroupNoticeDraft(snapshot.room.noticeText ?? "");
    }
    if (!isPrivateGroupRoom) return;
    setGroupAllowMemberInvite(snapshot.room.allowMemberInvite !== false);
    setGroupAllowAdminInvite(snapshot.room.allowAdminInvite !== false);
    setGroupAllowAdminKick(snapshot.room.allowAdminKick !== false);
    setGroupAllowAdminEditNotice(snapshot.room.allowAdminEditNotice !== false);
    setGroupAllowMemberUpload(snapshot.room.allowMemberUpload !== false);
    setGroupAllowMemberCall(snapshot.room.allowMemberCall !== false);
  }, [isOpenGroupRoom, isPrivateGroupRoom, snapshot]);

  useEffect(() => {
    if (!snapshot || !isOpenGroupRoom) return;
    setOpenGroupTitle(snapshot.room.title);
    setOpenGroupSummary(snapshot.room.summary ?? "");
    setOpenGroupPassword("");
    setOpenGroupMemberLimit(String(snapshot.room.memberLimit ?? 200));
    setOpenGroupDiscoverable(snapshot.room.isDiscoverable);
    setOpenGroupJoinPolicy(snapshot.room.joinPolicy === "free" ? "free" : "password");
    setOpenGroupIdentityPolicy(snapshot.room.identityPolicy === "real_name" ? "real_name" : "alias_allowed");
  }, [isOpenGroupRoom, snapshot]);

  useEffect(() => {
    if (activeSheet !== "members" || !isPrivateGroupRoom || friendsLoaded) return;
    void loadFriends();
  }, [activeSheet, friendsLoaded, isPrivateGroupRoom, loadFriends]);

  const saveOpenGroupSettings = useCallback(async () => {
    if (!isOpenGroupRoom || !snapshot) return;
    setBusy("open-group-settings");
    try {
      const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: openGroupTitle,
          summary: openGroupSummary,
          password: openGroupPassword,
          memberLimit: Number(openGroupMemberLimit || "200"),
          isDiscoverable: openGroupDiscoverable,
          joinPolicy: openGroupJoinPolicy,
          identityPolicy: openGroupIdentityPolicy,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      setOpenGroupPassword("");
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }, [
    getRoomActionErrorMessage,
    isOpenGroupRoom,
    openGroupDiscoverable,
    openGroupIdentityPolicy,
    openGroupJoinPolicy,
    openGroupMemberLimit,
    openGroupPassword,
    openGroupSummary,
    openGroupTitle,
    redirectIfMessengerAuthBlocked,
    refresh,
    streamRoomId,
    snapshot,
  ]);

  const leaveRoom = useCallback(async () => {
    if (!window.confirm(t("nav_messenger_leave_group_confirm"))) return;
    setBusy("leave-room");
    try {
      const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/leave`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      router.replace(
        isOpenGroupRoom ? SAMARKET_ROUTES.chat.messengerMeetingsHub : SAMARKET_ROUTES.chat.messengerHub,
        { scroll: false }
      );
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, isOpenGroupRoom, redirectIfMessengerAuthBlocked, streamRoomId, router, t]);

  const openMembersForOwnerTransfer = useCallback(() => {
    if (activeSheet) {
      setActiveSheet("members");
      return;
    }
    setActiveSheet("members");
  }, [activeSheet]);
  const openInfoSheet = useCallback((focus?: "notice" | "permissions" | "history") => {
    setInfoSheetFocus(focus ?? null);
    setActiveSheet("info");
  }, []);

  useEffect(() => {
    if (activeSheet !== "info" || !infoSheetFocus) return;
    const target =
      infoSheetFocus === "notice"
        ? groupNoticeSectionRef.current
        : infoSheetFocus === "permissions"
          ? groupPermissionsSectionRef.current
          : groupHistorySectionRef.current;
    if (!target) return;
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeSheet, infoSheetFocus]);

  const sendRawText = useCallback(
    async (
      content: string,
      restoreOnFail?: string,
      replyToMessageId?: string | null,
      replySourceMessage?: (CommunityMessengerMessage & { pending?: boolean }) | null
    ) => {
      const trimmed = content.trim();
      if (!trimmed || !snapshot) return;
      const clientMessageId = createCommunityMessengerClientMessageId();
      const latencyKey = cmReceiveLatencyKey({ roomId: streamRoomId, clientMessageId });
      cmReceiveLatencyMark(latencyKey, {
        sender_click_ms: cmReceiveLatencyNow(),
        realtime_payload_room_id: streamRoomId,
        realtime_payload_message_id: "",
      });
      const tempId = `pending:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const rid = (replyToMessageId ?? "").trim();
      const replySnap =
        rid && replySourceMessage && replySourceMessage.id === rid ? buildReplyPreviewSnapshot(replySourceMessage) : null;
      const optimisticSender = optimisticOutboundSender(snapshot, roomMembersDisplay);
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: optimisticSender.senderId,
        senderLabel: optimisticSender.senderLabel,
        messageType: "text",
        content: trimmed,
        createdAt: nextOptimisticCommunityMessengerCreatedAtIso(roomMessagesRef.current),
        clientMessageId,
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
        ...(replySnap
          ? {
              replyToMessageId: replySnap.messageId,
              replyPreviewText: replySnap.previewText,
              replyPreviewType: replySnap.messageType,
              replySenderLabelSnapshot: replySnap.senderLabel,
            }
          : {}),
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      stickToBottomRef.current = true;
      scrollMessengerToBottom();
      setBusy("send");
      try {
        cmReceiveLatencyMark(latencyKey, { send_api_start_ms: cmReceiveLatencyNow() });
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const replyId = rid;
        const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            clientMessageId,
            ...(replyId ? { replyToMessageId: replyId } : {}),
          }),
        });
        cmReceiveLatencyMark(latencyKey, { send_api_done_ms: cmReceiveLatencyNow() });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        const createdAt = typeof json.message?.createdAt === "string" ? json.message.createdAt : "";
        if (createdAt) cmReceiveLatencyMark(latencyKey, { db_message_created_at: createdAt });
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(streamRoomId, elapsed, "text");
        }
        if (!res.ok || !json.ok) {
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          if (restoreOnFail !== undefined) setMessage(restoreOnFail);
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        bumpCommunityMessengerPresenceActivity("message_sent");
        const confirmedMessage = json.message;
        if (confirmedMessage?.id) {
          const withCid =
            !trimCmText(confirmedMessage.clientMessageId) && clientMessageId
              ? { ...confirmedMessage, clientMessageId }
              : confirmedMessage;
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter(
                (item) =>
                  item.id !== tempId &&
                  !(
                    (item as { pending?: boolean }).pending &&
                    item.clientMessageId === clientMessageId
                  )
              ),
              [withCid]
            )
          );
          scrollMessengerToBottom();
          onMessengerOutboundConfirmed(withCid, clientMessageId);
          forgetRoomBootstrapClientFlightsAfterMutation();
          return;
        }
        void catchUpNewerMessages().finally(() => {
          const exists = roomMessagesRef.current.some(
            (item) => item.clientMessageId === clientMessageId && !item.pending
          );
          if (!exists) void refresh(true, { triggerReason: "send_missing_message_body" });
        });
        forgetRoomBootstrapClientFlightsAfterMutation();
      } finally {
        setBusy(null);
      }
    },
    [
      catchUpNewerMessages,
      forgetRoomBootstrapClientFlightsAfterMutation,
      getRoomActionErrorMessage,
      redirectIfMessengerAuthBlocked,
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      onMessengerOutboundConfirmed,
      scrollMessengerToBottom,
      snapshot,
    ]
  );

  const sendMessage = useCallback(async (textOverride?: string) => {
    const raw = (textOverride ?? message).trim();
    if (!raw || !snapshot) return;
    if (busy === "send") return;
    const replyTarget = replyToMessage;
    const replyId = replyTarget?.id?.trim() ?? "";
    setMessage("");
    setReplyToMessage(null);
    await sendRawText(raw, undefined, replyId || null, replyId ? replyTarget : null);
  }, [busy, message, replyToMessage, sendRawText, snapshot]);

  const sendSticker = useCallback(
    async (fileUrl: string, stickerItemId?: string) => {
      const url = fileUrl.trim();
      if (!snapshot || roomUnavailable || !url.startsWith("/stickers/")) return;
      const clientMessageId = createCommunityMessengerClientMessageId();
      const tempId = `pending:sticker:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const optimisticSender = optimisticOutboundSender(snapshot, roomMembersDisplay);
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: optimisticSender.senderId,
        senderLabel: optimisticSender.senderLabel,
        messageType: "sticker",
        content: url,
        createdAt: nextOptimisticCommunityMessengerCreatedAtIso(roomMessagesRef.current),
        clientMessageId,
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      scrollMessengerToBottom();
      setBusy("send-sticker");
      dismissRoomSheet();
      try {
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/messages/sticker`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: url,
            clientMessageId,
            stickerItemId: stickerItemId ?? "",
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(streamRoomId, elapsed, "sticker");
        }
        if (!res.ok || !json.ok) {
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        bumpCommunityMessengerPresenceActivity("message_sent");
        touchRecentStickerUrl(url);
        const confirmedSticker = json.message;
        if (confirmedSticker) {
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [confirmedSticker]
            )
          );
          scrollMessengerToBottom();
          onMessengerOutboundConfirmed(confirmedSticker, clientMessageId);
          return;
        }
        setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        void refresh(true);
        forgetRoomBootstrapClientFlightsAfterMutation();
      } finally {
        setBusy(null);
      }
    },
    [
      dismissRoomSheet,
      forgetRoomBootstrapClientFlightsAfterMutation,
      getRoomActionErrorMessage,
      redirectIfMessengerAuthBlocked,
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      roomUnavailable,
      scrollMessengerToBottom,
      onMessengerOutboundConfirmed,
      snapshot,
    ]
  );

  const sendLocationMessage = useCallback(() => {
    if (!snapshot || roomUnavailable) return;
    void (async () => {
      const res = await requestLocationWithDiBaYGate({ featureKey: "messenger_current_location" });
      if (!res.ok) {
        if (res.reason === "later") return;
        if (res.reason === "deferred") {
          showMessengerSnackbar(
            translateCmUi("cm_ui_location_permission_hint"),
            { variant: "error" },
          );
          return;
        }
        showMessengerSnackbar(
          res.reason === "denied"
            ? translateCmUi("cm_ui_location_permission_hint")
            : translateCmUi("cm_ui_location_fetch_failed"),
          { variant: "error" },
        );
        return;
      }
      const { latitude, longitude } = res.position;
      const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
      const content = translateCmUi("cm_ui_location_share_line", { url });
      setAttachmentConfirmDraft({ kind: "location", content });
      setActiveSheet("attach-confirm");
    })();
  }, [roomUnavailable, setActiveSheet, setAttachmentConfirmDraft, snapshot, showMessengerSnackbar]);

  const sendImageFiles = useCallback(
    async (files: File[], optimisticPreviewUrls: string[]) => {
      if (!snapshot || roomUnavailable) return;
      const list = files.slice(0, MESSENGER_IMAGE_ALBUM_PICK_MAX);
      const previews = optimisticPreviewUrls.slice(0, MESSENGER_IMAGE_ALBUM_PICK_MAX);
      if (list.length === 0 || list.length !== previews.length) return;
      const tempId = `pending:image:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const optimisticSender = optimisticOutboundSender(snapshot, roomMembersDisplay);
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: optimisticSender.senderId,
        senderLabel: optimisticSender.senderLabel,
        messageType: "image",
        content: previews[0]!,
        ...(previews.length > 1
          ? {
              imageAlbumUrls: previews,
              imageAlbumPreviewUrls: previews,
              imageAlbumOriginalUrls: previews,
            }
          : {
              imagePreviewUrl: previews[0]!,
              imageOriginalUrl: previews[0]!,
            }),
        createdAt: nextOptimisticCommunityMessengerCreatedAtIso(roomMessagesRef.current),
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      scrollMessengerToBottom();
      setBusy("send-image");
      dismissRoomSheet();
      try {
        const form = new FormData();
        for (const f of list) form.append("files", f);
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/images`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(streamRoomId, elapsed, "image");
        }
        if (!res.ok || !json.ok) {
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        bumpCommunityMessengerPresenceActivity("message_sent");
        const serverImageMsg = json.message;
        if (serverImageMsg) {
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [serverImageMsg]
            )
          );
          scrollMessengerToBottom();
          onMessengerOutboundConfirmed(serverImageMsg);
          return;
        }
        setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        void refresh(true);
        forgetRoomBootstrapClientFlightsAfterMutation();
      } finally {
        for (const u of previews) URL.revokeObjectURL(u);
        setBusy(null);
      }
    },
    [
      dismissRoomSheet,
      forgetRoomBootstrapClientFlightsAfterMutation,
      getRoomActionErrorMessage,
      redirectIfMessengerAuthBlocked,
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      roomUnavailable,
      scrollMessengerToBottom,
      onMessengerOutboundConfirmed,
      snapshot,
    ]
  );

  const openImagePicker = useCallback(() => {
    if (roomUnavailable || busy === "send-image" || !canUploadAttachments) return;
    imageInputRef.current?.click();
  }, [busy, canUploadAttachments, roomUnavailable]);

  const openCameraPicker = useCallback(() => {
    if (roomUnavailable || busy === "send-image" || !canUploadAttachments) return;
    cameraInputRef.current?.click();
  }, [busy, canUploadAttachments, roomUnavailable]);

  const onPickImageFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    event.target.value = "";
    if (picked.length === 0) return;
    const files = picked.slice(0, MESSENGER_IMAGE_ALBUM_PICK_MAX);
    if (picked.length > MESSENGER_IMAGE_ALBUM_PICK_MAX) {
      showMessengerSnackbar(translateCmUi("cm_ui_album_pick_max", { count: MESSENGER_IMAGE_ALBUM_PICK_MAX }), {
        variant: "error",
      });
    }
    const previewUrls = files.map((f) => URL.createObjectURL(f));
    setAttachmentConfirmDraft({ kind: "image", files, previewUrls });
    setActiveSheet("attach-confirm");
  }, [setActiveSheet]);

  const sendFile = useCallback(
    async (file: File) => {
      if (!snapshot || roomUnavailable) return;
      const tempId = `pending:file:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const optimisticSender = optimisticOutboundSender(snapshot, roomMembersDisplay);
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: optimisticSender.senderId,
        senderLabel: optimisticSender.senderLabel,
        messageType: "file",
        content: "",
        createdAt: nextOptimisticCommunityMessengerCreatedAtIso(roomMessagesRef.current),
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
        fileName: file.name,
        fileMimeType: file.type || "application/octet-stream",
        fileSizeBytes: file.size,
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      scrollMessengerToBottom();
      setBusy("send-file");
      dismissRoomSheet();
      try {
        const form = new FormData();
        form.append("file", file);
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/files`, {
          method: "POST",
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(streamRoomId, elapsed, "file");
        }
        if (!res.ok || !json.ok) {
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        bumpCommunityMessengerPresenceActivity("message_sent");
        const serverFileMsg = json.message;
        if (serverFileMsg) {
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [serverFileMsg]
            )
          );
          scrollMessengerToBottom();
          onMessengerOutboundConfirmed(serverFileMsg);
          return;
        }
        setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
        void refresh(true);
        forgetRoomBootstrapClientFlightsAfterMutation();
      } finally {
        setBusy(null);
      }
    },
    [
      dismissRoomSheet,
      forgetRoomBootstrapClientFlightsAfterMutation,
      getRoomActionErrorMessage,
      redirectIfMessengerAuthBlocked,
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      roomUnavailable,
      scrollMessengerToBottom,
      onMessengerOutboundConfirmed,
      snapshot,
    ]
  );

  const openFilePicker = useCallback(() => {
    if (roomUnavailable || busy === "send-file" || !canUploadAttachments) return;
    fileInputRef.current?.click();
  }, [busy, canUploadAttachments, roomUnavailable]);

  const onPickFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAttachmentConfirmDraft({ kind: "file", file });
    setActiveSheet("attach-confirm");
  }, [setActiveSheet]);

  const cancelAttachmentConfirm = useCallback(() => {
    setAttachmentConfirmDraft((prev) => {
      if (prev?.kind === "image") {
        for (const u of prev.previewUrls) URL.revokeObjectURL(u);
      }
      return null;
    });
    dismissRoomSheet();
  }, [dismissRoomSheet]);

  const confirmAttachmentSend = useCallback(async () => {
    const draft = attachmentConfirmDraft;
    if (!draft) {
      dismissRoomSheet();
      return;
    }
    if (draft.kind === "image") {
      const { files, previewUrls } = draft;
      setAttachmentConfirmDraft(null);
      dismissRoomSheet();
      setReplyToMessage(null);
      await sendImageFiles(files, previewUrls);
      return;
    }
    if (draft.kind === "file") {
      const { file } = draft;
      setAttachmentConfirmDraft(null);
      dismissRoomSheet();
      setReplyToMessage(null);
      await sendFile(file);
      return;
    }
    const { content } = draft;
    const replyTarget = replyToMessage;
    const replyId = replyTarget?.id?.trim() ?? "";
    setAttachmentConfirmDraft(null);
    dismissRoomSheet();
    setReplyToMessage(null);
    await sendRawText(content, undefined, replyId || null, replyId ? replyTarget : null);
  }, [attachmentConfirmDraft, dismissRoomSheet, replyToMessage, sendFile, sendImageFiles, sendRawText, setReplyToMessage]);

  const hideRoomMessageForMe = useCallback(
    async (messageId: string) => {
      setBusy("hide-message");
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(streamRoomId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "hide_for_me" }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setReplyToMessage((prev) => (prev?.id === messageId ? null : prev));
        setRoomMessages((prev) => prev.filter((item) => item.id !== messageId));
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, setReplyToMessage, setRoomMessages, streamRoomId]
  );

  const deleteRoomMessageForEveryone = useCallback(
    async (messageId: string) => {
      if (!window.confirm(t("cm_ui_confirm_delete_for_everyone"))) return;
      setBusy("delete-for-everyone");
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(streamRoomId)}/messages/${encodeURIComponent(messageId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete_for_everyone" }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setReplyToMessage((prev) => (prev?.id === messageId ? null : prev));
        void refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, refresh, setReplyToMessage, streamRoomId, t]
  );

  const toggleMessageReaction = useCallback(
    async (messageId: string, reactionKey: string) => {
      const mid = messageId.trim();
      const rk = reactionKey.trim();
      if (!mid || !rk) return;
      const row = roomMessagesRef.current.find((x) => x.id === mid);
      if (row?.isMine || row?.pending) {
        showMessengerSnackbar(translateCmUi("cm_ui_cannot_react_own_message"), { variant: "error" });
        return;
      }
      const busy = messageReactionToggleBusyIdsRef.current;
      if (busy.has(mid)) return;
      busy.add(mid);
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(streamRoomId)}/messages/${encodeURIComponent(mid)}/reactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ reactionKey: rk }),
          }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reactions?: CommunityMessengerMessage["reactions"];
          error?: string;
        };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        if (Array.isArray(json.reactions)) {
          setRoomMessages((prev) => prev.map((m) => (m.id === mid ? { ...m, reactions: json.reactions } : m)));
        }
      } finally {
        busy.delete(mid);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, setRoomMessages, streamRoomId]
  );

  const deleteRoomMessage = useCallback(
    async (messageId: string) => {
      const row = roomMessagesRef.current.find((x) => x.id === messageId);
      if (row?.messageType !== "voice") return;
      if (!window.confirm(t("cm_ui_confirm_delete_voice_message"))) return;
      setBusy("delete-message");
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(streamRoomId)}/messages/${encodeURIComponent(messageId)}`,
          { method: "DELETE" }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setReplyToMessage((prev) => (prev?.id === messageId ? null : prev));
        setRoomMessages((prev) => prev.filter((item) => item.id !== messageId));
        void refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, refresh, setReplyToMessage, setRoomMessages, streamRoomId, t]
  );

  const blockPeerFromMessage = useCallback(
    async (targetUserId: string) => {
      if (!window.confirm(t("cm_ui_confirm_block_peer_messenger"))) return;
      setBusy("block-peer");
      try {
        const res = await fetch("/api/community/block-relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(json.error ?? translateCmUi("cm_ui_block_action_failed"), { variant: "error" });
          return;
        }
        showMessengerSnackbar(translateCmUi("cm_ui_blocked_success"), { variant: "success" });
        void refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [redirectIfMessengerAuthBlocked, refresh, t]
  );

  const inviteMembers = useCallback(async () => {
    if (inviteIds.length === 0) return;
    setBusy("invite");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invite", memberIds: inviteIds }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      setInviteIds([]);
      setInviteSearchQuery("");
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, inviteIds, redirectIfMessengerAuthBlocked, refresh, streamRoomId]);

  const savePrivateGroupNotice = useCallback(async () => {
    if (!isPrivateGroupRoom && !isOpenGroupRoom) return;
    setBusy("group-notice");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "group_notice", noticeText: privateGroupNoticeDraft }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      await refresh(true);
      showMessengerSnackbar(
        isOpenGroupRoom ? translateCmUi("cm_ui_meeting_notice_saved") : translateCmUi("cm_ui_notice_saved"),
        { variant: "success" }
      );
    } finally {
      setBusy(null);
    }
  }, [
    getRoomActionErrorMessage,
    isOpenGroupRoom,
    isPrivateGroupRoom,
    privateGroupNoticeDraft,
    redirectIfMessengerAuthBlocked,
    refresh,
    streamRoomId,
  ]);

  const savePrivateGroupPermissions = useCallback(async () => {
    if (!isPrivateGroupRoom) return;
    setBusy("group-permissions");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "group_permissions",
          allowMemberInvite: groupAllowMemberInvite,
          allowAdminInvite: groupAllowAdminInvite,
          allowAdminKick: groupAllowAdminKick,
          allowAdminEditNotice: groupAllowAdminEditNotice,
          allowMemberUpload: groupAllowMemberUpload,
          allowMemberCall: groupAllowMemberCall,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
        return;
      }
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }, [
    getRoomActionErrorMessage,
    groupAllowAdminEditNotice,
    groupAllowAdminInvite,
    groupAllowAdminKick,
    groupAllowMemberCall,
    groupAllowMemberInvite,
    groupAllowMemberUpload,
    isPrivateGroupRoom,
    redirectIfMessengerAuthBlocked,
    refresh,
    streamRoomId,
  ]);

  const updateGroupMemberRole = useCallback(
    async (targetUserId: string, nextRole: "admin" | "member") => {
      setBusy(`group-role:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "group_member_role", targetUserId, nextRole }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        await refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, refresh, streamRoomId]
  );

  const transferGroupOwner = useCallback(
    async (targetUserId: string, label: string) => {
      if (!window.confirm(t("cm_ui_confirm_transfer_group_owner", { name: label }))) return;
      setBusy(`group-owner:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "group_owner_transfer", targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        await refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, refresh, streamRoomId, t]
  );

  const startDirectChatWithMember = useCallback(
    async (peerUserId: string) => {
      setBusy(`member-chat:${peerUserId}`);
      try {
        const res = await fetch("/api/community-messenger/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomType: "direct", peerUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; roomId?: string };
        if (!res.ok || !json.ok || !json.roomId) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        router.push(`/community-messenger/rooms/${encodeURIComponent(String(json.roomId))}`);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, router]
  );

  /** 발신 — 멤버 시트 등. 즉시 `/calls/outgoing` → 세션 생성 후 `/calls/:id`. */
  const startDirectCallWithMember = useCallback(
    (peerUserId: string, kind: "voice" | "video", peerLabelHint?: string): boolean => {
      if (outgoingDialSyncGuardRef.current) return false;
      outgoingDialSyncGuardRef.current = true;
      setOutgoingDialLocked(true);

      const peer = peerUserId.trim();
      cmCallLatencyMarkClick({
        surface: "member_sheet",
        peerUserId: peer,
        kind,
      });
      setCmCallLatencyContext({ role: "initiator", callKind: kind });
      rememberCallNavigationReturnPath();
      unlockCommunityMessengerCallPlaybackFromUserGesture();
      cmCallLatencyInfo("outgoing_route_push_start", {
        peerUserId: peer,
        callKind: kind,
        role: "initiator",
      });
      logClientPerf("messenger-call.dial.push", { phase: "member_sheet_outgoing_shell", peerUserId: peer, kind });
      router.push(buildCommunityMessengerOutgoingDialHref({ kind, peerUserId: peer }));
      void primeCommunityMessengerDevicePermissionFromUserGesture(kind);
      window.setTimeout(() => {
        outgoingDialSyncGuardRef.current = false;
        setOutgoingDialLocked(false);
      }, 0);
      return true;
    },
    [router]
  );

  const removeGroupMember = useCallback(
    async (targetUserId: string, label: string) => {
      if (!window.confirm(t("cm_ui_confirm_remove_group_member", { name: label }))) return;
      setBusy(`group-remove:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "group_member_remove", targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          if (redirectIfMessengerAuthBlocked(res, json)) return;
          showMessengerSnackbar(getRoomActionErrorMessage(pickMessengerApiErrorField(json)), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        await refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, redirectIfMessengerAuthBlocked, refresh, streamRoomId, t]
  );

  const startGroupCall = useCallback(
    async (kind: "voice" | "video") => {
      if (!canStartGroupCall) {
        showMessengerSnackbar(translateCmUi("cm_ui_group_member_call_forbidden"), { variant: "error" });
        return;
      }
      dismissRoomSheet();
      await call.startOutgoingCall(kind);
    },
    [call, canStartGroupCall, dismissRoomSheet]
  );

  /** 통화 로그에서 재발신 — 헤더와 동일한 확인 후 발신 */
  const [callStubOutgoingConfirm, setCallStubOutgoingConfirm] = useState<null | { kind: "voice" | "video" }>(null);
  const pendingStubCallKindRef = useRef<"voice" | "video" | null>(null);

  const openCallStubOutgoingConfirm = useCallback(
    (kind: "voice" | "video") => {
      if (roomUnavailable) return;
      pendingStubCallKindRef.current = kind;
      setCallStubOutgoingConfirm({ kind });
    },
    [roomUnavailable]
  );

  const cancelCallStubOutgoingConfirm = useCallback(() => {
    pendingStubCallKindRef.current = null;
    setCallStubOutgoingConfirm(null);
  }, []);

  const confirmCallStubOutgoing = useCallback(async () => {
    const kind = pendingStubCallKindRef.current;
    if (!kind || roomUnavailable) return;
    if (isGroupRoom) {
      pendingStubCallKindRef.current = null;
      setCallStubOutgoingConfirm(null);
      await startGroupCall(kind);
      return;
    }
    const ok = startManagedDirectCall(kind);
    if (ok) {
      pendingStubCallKindRef.current = null;
      setCallStubOutgoingConfirm(null);
    }
  }, [isGroupRoom, roomUnavailable, startGroupCall, startManagedDirectCall]);

  useEffect(() => {
    if (!messageActionItem && !callStubSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMessageActionItem(null);
        setCallStubSheet(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageActionItem, callStubSheet]);

  const reportTarget = useCallback(
    async (input: { reportType: "room" | "message" | "user"; messageId?: string; reportedUserId?: string }) => {
      const reasonDetail = window.prompt(translateCmUi("cm_ui_report_reason_prompt"));
      if (!reasonDetail || !reasonDetail.trim()) return;
      const res = await fetch("/api/community-messenger/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType: input.reportType,
          roomId,
          messageId: input.messageId,
          reportedUserId: input.reportedUserId,
          reasonType: "etc",
          reasonDetail: reasonDetail.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        if (redirectIfMessengerAuthBlocked(res, json)) return;
        showMessengerSnackbar(json.error ?? translateCmUi("cm_ui_report_failed"), { variant: "error" });
        return;
      }
      setMemberActionTarget(null);
      showMessengerSnackbar(translateCmUi("cm_ui_report_submitted"), { variant: "success" });
    },
    [redirectIfMessengerAuthBlocked, roomId]
  );

  const getMessageCopyText = useCallback((item: CommunityMessengerMessage & { pending?: boolean }) => {
    if (item.messageType === "text" || item.messageType === "call_stub") return item.content.trim();
    if (item.messageType === "image") {
      const originals = item.imageAlbumOriginalUrls?.filter(Boolean) ?? [];
      if (originals.length > 1) return originals.map((u) => u.trim()).join("\n");
      const album = item.imageAlbumUrls?.filter(Boolean) ?? [];
      if (album.length > 1) return album.map((u) => u.trim()).join("\n");
      return (item.imageOriginalUrl || item.content).trim();
    }
    if (item.messageType === "file" || item.messageType === "voice" || item.messageType === "sticker") {
      return item.content.trim();
    }
    return "";
  }, []);

  const copyMessageText = useCallback(
    async (item: CommunityMessengerMessage & { pending?: boolean }) => {
      const text = getMessageCopyText(item);
      if (!text) {
        showMessengerSnackbar(translateCmUi("cm_ui_cannot_copy_message"), { variant: "error" });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showMessengerSnackbar(translateCmUi("cm_ui_copied_success"), { variant: "success" });
      } catch {
        showMessengerSnackbar(translateCmUi("cm_ui_copy_failed"), { variant: "error" });
      }
      setMessageActionItem(null);
    },
    [getMessageCopyText, setMessageActionItem]
  );

  const shareMessageExternally = useCallback(
    async (item: CommunityMessengerMessage & { pending?: boolean }) => {
      const text = getMessageCopyText(item);
      const payload =
        text || translateCmUi("cm_ui_message_type_bracket", { type: item.messageType });
      try {
        if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
          await navigator.share({
            title: snapshot?.room.title ?? translateCmUi("cm_ui_chat_fallback"),
            text: payload,
          });
        } else {
          await navigator.clipboard.writeText(payload);
          showMessengerSnackbar(translateCmUi("cm_ui_content_copied_clipboard"), { variant: "success" });
        }
      } catch {
        try {
          await navigator.clipboard.writeText(payload);
          showMessengerSnackbar(translateCmUi("cm_ui_content_copied_clipboard"), { variant: "success" });
        } catch {
          showMessengerSnackbar(translateCmUi("cm_ui_cannot_forward_message"), { variant: "error" });
        }
      }
      setMessageActionItem(null);
    },
    [getMessageCopyText, setMessageActionItem, snapshot?.room.title]
  );

  const shareMessageCopyDeepLink = useCallback(
    async (item: CommunityMessengerMessage & { pending?: boolean }) => {
      const canon = streamRoomId.trim();
      if (!canon) return;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/community-messenger/rooms/${encodeURIComponent(canon)}?msg=${encodeURIComponent(item.id)}`;
      try {
        await navigator.clipboard.writeText(url);
        showMessengerSnackbar(translateCmUi("cm_ui_message_link_copied"), { variant: "success" });
      } catch {
        showMessengerSnackbar(translateCmUi("cm_ui_copy_failed"), { variant: "error" });
      }
      setMessageActionItem(null);
    },
    [setMessageActionItem, streamRoomId]
  );

  const shareMessageToOtherRoom = useCallback(
    async (item: CommunityMessengerMessage & { pending?: boolean }) => {
      const text = getMessageCopyText(item);
      const roomTitle = snapshot?.room.title?.trim() || translateCmUi("cm_ui_chat_fallback");
      const preview = text || translateCmUi("cm_ui_message_type_bracket", { type: item.messageType });
      const canon = streamRoomId.trim();
      const block = buildCommunityMessengerInternalShareClipboard({
        roomTitle,
        sourceRoomId: canon || item.roomId?.trim() || "",
        item,
        previewText: preview,
      });
      try {
        await navigator.clipboard.writeText(block);
      } catch {
        showMessengerSnackbar(translateCmUi("cm_ui_copy_failed"), { variant: "error" });
        return;
      }
      setMessageActionItem(null);
      router.push("/community-messenger?section=chats");
      showMessengerSnackbar(translateCmUi("cm_ui_message_card_copied_paste"), { variant: "success" });
    },
    [getMessageCopyText, router, setMessageActionItem, snapshot?.room.title, streamRoomId]
  );

  /** @deprecated Prefer shareMessageExternally / shareMessageToOtherRoom / shareMessageCopyDeepLink */
  const forwardMessage = shareMessageExternally;

  const hideCallStubLocally = useCallback(
    (messageId: string) => {
      setHiddenCallStubIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        try {
          const key = `cm_hidden_call_stubs:${streamRoomId.trim()}`;
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
      setCallStubSheet(null);
    },
    [streamRoomId]
  );

  useEffect(() => {
    if (!isGroupRoom) return;
    const activeCall = snapshot?.activeCall;
    if (!activeCall) return;
    if (callActionFromUrl !== "accept") return;
    if (sessionIdFromUrl && !messengerUserIdsEqual(sessionIdFromUrl, activeCall.id)) return;
    if (autoHandledSessionRef.current && messengerUserIdsEqual(autoHandledSessionRef.current, activeCall.id)) return;
    if (autoAcceptInFlightRef.current && messengerUserIdsEqual(autoAcceptInFlightRef.current, activeCall.id)) return;
    if (activeCall.isMineInitiator) return;
    const shouldAutoAccept =
      activeCall.sessionMode === "group"
        ? (activeCall.status === "ringing" || activeCall.status === "active") &&
          activeCall.participants.some((participant) => participant.isMe && participant.status === "invited")
        : activeCall.status === "ringing";
    if (!shouldAutoAccept) return;
    /* URL 자동 수락은 useEffect 라서 브라우저가 사용자 제스처로 보지 않는다.
     * 전역 배너에서 프라임된 스트림이 있을 때만 자동으로 이어가고, 없으면 방 안 「수락」 한 번 필요. */
    if (!hasUsablePrimedCommunityMessengerDeviceStream(activeCall.callKind)) return;

    const sessionKey = activeCall.id;
    autoAcceptInFlightRef.current = sessionKey;
    void (async () => {
      try {
        const ok = await handleAcceptIncomingCall();
        if (ok) {
          autoHandledSessionRef.current = sessionKey;
        }
      } catch {
        setGroupCallAutoAcceptNotice(MESSENGER_CALL_USER_MSG.autoAcceptFailed);
      } finally {
        if (messengerUserIdsEqual(autoAcceptInFlightRef.current, sessionKey)) {
          autoAcceptInFlightRef.current = null;
        }
      }
    })();
  }, [callActionFromUrl, handleAcceptIncomingCall, isGroupRoom, roomId, router, sessionIdFromUrl, snapshot?.activeCall]);

  useEffect(() => {
    if (call.panel || call.errorMessage) {
      setGroupCallAutoAcceptNotice(null);
    }
  }, [call.panel, call.errorMessage]);

  useEffect(() => {
    const key = messengerRoomReadBlockKeyCallPanel(streamRoomId);
    if (call.panel) setMessengerRoomReadBlock(key, true);
    return () => setMessengerRoomReadBlock(key, false);
  }, [call.panel, streamRoomId]);

  useEffect(() => {
    if (!isGroupRoom) return;
    if (callActionFromUrl !== "accept" || !sessionIdFromUrl) return;
    if (snapshot?.activeCall?.id && messengerUserIdsEqual(snapshot.activeCall.id, sessionIdFromUrl)) return;
    let cancelled = false;
    const refreshNow = () => {
      if (cancelled) return;
      void refresh(true);
    };
    refreshNow();
    /* 그룹 URL 자동 수락 대기 — 0.5초 폴링은 동일 창에서 /api 부하가 큼 → 1초(최대 5회) */
    const timer = window.setInterval(refreshNow, 1000);
    const stopTimer = window.setTimeout(() => {
      window.clearInterval(timer);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [callActionFromUrl, isGroupRoom, refresh, sessionIdFromUrl, snapshot?.activeCall?.id]);

  useEffect(() => {
    if (!isGroupRoom) return;
    if (callActionFromUrl !== "accept" || !sessionIdFromUrl) return;
    const samePanelSession =
      call.panel?.sessionId &&
      messengerUserIdsEqual(call.panel.sessionId, sessionIdFromUrl) &&
      call.panel.mode !== "incoming";
    const sameActiveSession =
      snapshot?.activeCall?.id &&
      messengerUserIdsEqual(snapshot.activeCall.id, sessionIdFromUrl) &&
      snapshot.activeCall.status === "active";
    if (!samePanelSession && !sameActiveSession) return;
    router.replace(`/community-messenger/rooms/${encodeURIComponent(streamRoomId)}`);
  }, [
    call.panel?.mode,
    call.panel?.sessionId,
    callActionFromUrl,
    sessionIdFromUrl,
    streamRoomId,
    router,
    snapshot?.activeCall?.id,
    snapshot?.activeCall?.status,
    isGroupRoom,
  ]);

  useEffect(() => {
    if (!isGroupRoom || !callPanel || (callPanel.mode !== "incoming" && callPanel.mode !== "dialing")) {
      return;
    }
    let cancelled = false;
    let tone: CallToneController | null = null;
    void startCommunityMessengerCallTone(callPanel.mode === "incoming" ? "incoming" : "outgoing", {
      callKind: callPanel.kind,
    }).then((t) => {
      if (cancelled) {
        t.stop();
        return;
      }
      tone = t;
    });
    return () => {
      cancelled = true;
      tone?.stop();
    };
  }, [isGroupRoom, callPanel?.sessionId, callPanel?.mode, callPanel?.kind]);

  useLayoutEffect(() => {
    return registerMessengerRoomComposerPhase2Bridge({
      sendMessage,
      setActiveSheet,
      voiceRecording,
      voiceMicArming,
      voiceHandsFree,
      voiceRecordElapsedMs,
      voiceLivePreviewBars,
      voiceCancelHint,
      voiceLockHint,
      finalizeVoiceRecording,
      onVoiceMicPointerDown,
      onVoiceMicPointerMove,
      onVoiceMicPointerUp,
      onVoiceMicPointerCancel,
    });
  }, [
    finalizeVoiceRecording,
    onVoiceMicPointerCancel,
    onVoiceMicPointerDown,
    onVoiceMicPointerMove,
    onVoiceMicPointerUp,
    sendMessage,
    setActiveSheet,
    voiceCancelHint,
    voiceHandsFree,
    voiceLivePreviewBars,
    voiceLockHint,
    voiceMicArming,
    voiceRecordElapsedMs,
    voiceRecording,
  ]);

  return {
    ...phase1,
    call,
    roomHeaderStatus,
    roomUnavailable,
    isGroupRoom,
    roomSummaryHoldsOnlyTradeOrDeliveryMeta,
    tradeProductChatIdForDock,
    showMessengerTradeProcessDock,
    storeOrderIdForDock,
    storeIdForDock,
    showMessengerStoreOrderDock,
    permissionGuide,
    isPrivateGroupRoom,
    isOpenGroupRoom,
    isOwner,
    roomTypeLabel,
    roomSubtitle,
    roomJoinLabel,
    roomIdentityLabel,
    roomNotice,
    canInviteMembers,
    myRoleLabel,
    privateGroupNotice,
    canEditGroupNotice,
    canManageGroupPermissions,
    canManageMemberRoles,
    canKickGroupMembers,
    canStartGroupCall,
    canUploadAttachments,
    activeGroupCall,
    groupCallStatusLabel,
    privateGroupPermissionRows,
    allowedPrivateGroupPermissionCount,
    privateGroupNoticeStatusLabel,
    returnToCallSessionId,
    getRoomActionErrorMessage,
    voiceMicArming,
    voiceRecording,
    voiceHandsFree,
    voiceRecordElapsedMs,
    voiceLivePreviewBars,
    voiceCancelHint,
    voiceLockHint,
    finalizeVoiceRecording,
    onVoiceMicPointerDown,
    onVoiceMicPointerMove,
    onVoiceMicPointerUp,
    onVoiceMicPointerCancel,
    toggleRoomMute,
    toggleRoomArchive,
    openCallPermissionHelp,
    retryCallDevicePermission,
    handleAcceptIncomingCall,
    openDirectCallPage,
    startManagedDirectCall,
    saveOpenGroupSettings,
    leaveRoom,
    openMembersForOwnerTransfer,
    openInfoSheet,
    sendRawText,
    sendMessage,
    sendSticker,
    sendLocationMessage,
    attachmentConfirmDraft,
    cancelAttachmentConfirm,
    confirmAttachmentSend,
    openImagePicker,
    openCameraPicker,
    onPickImageFile,
    sendFile,
    openFilePicker,
    onPickFile,
    deleteRoomMessage,
    hideRoomMessageForMe,
    deleteRoomMessageForEveryone,
    toggleMessageReaction,
    blockPeerFromMessage,
    inviteMembers,
    savePrivateGroupNotice,
    savePrivateGroupPermissions,
    updateGroupMemberRole,
    transferGroupOwner,
    startDirectChatWithMember,
    startDirectCallWithMember,
    removeGroupMember,
    startGroupCall,
    callStubOutgoingConfirm,
    openCallStubOutgoingConfirm,
    cancelCallStubOutgoingConfirm,
    confirmCallStubOutgoing,
    reportTarget,
    getMessageCopyText,
    copyMessageText,
    forwardMessage,
    shareMessageExternally,
    shareMessageCopyDeepLink,
    shareMessageToOtherRoom,
    hideCallStubLocally,
  };
}
