"use client";

/**
 * 커뮤니티 메신저 방 Phase2 전용 컨트롤러 — Phase1 컨텍스트 + 그룹 통화 컨텍스트 위에서
 * 전송·권한·통화·그룹 운영 등 모든 상호작용 상태와 이펙트를 한곳에 둔다.
 * UI(`CommunityMessengerRoomPhase2.tsx`)는 이 훅의 반환값만 구조 분해해 렌더한다.
 */

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  hasUsablePrimedCommunityMessengerDeviceStream,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  openCommunityMessengerPermissionSettings,
} from "@/lib/community-messenger/call-permission";
import { startCommunityMessengerCallTone, type CallToneController } from "@/lib/community-messenger/call-feedback-sound";
import { useCommunityMessengerRoomGroupCall } from "@/lib/community-messenger/room/community-messenger-group-call-context";
import { useMessengerRoomClientPhase1Context } from "@/lib/community-messenger/room/messenger-room-client-phase1-context";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { type CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { forgetMessengerRoomClientBootstrapFlights } from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import { messengerMonitorMessageRtt } from "@/lib/community-messenger/monitoring/client";
import { getMessengerRoomActionErrorMessage } from "@/lib/community-messenger/room/messenger-room-action-error-messages";
import { useMessengerRoomVoiceRecording } from "@/lib/community-messenger/room/use-messenger-room-voice-recording";
import { disposeDetachedCommunityCallIfStale } from "@/lib/community-messenger/direct-call-minimize";
import { bootstrapCommunityMessengerOutgoingCallAndNavigate } from "@/lib/community-messenger/call-session-navigation-seed";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import {
  mergeRoomMessages,
  nextOptimisticCommunityMessengerCreatedAtIso,
} from "@/components/community-messenger/room/community-messenger-room-helpers";
import { createCommunityMessengerClientMessageId } from "@/lib/community-messenger/client-message-id";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { touchRecentStickerUrl } from "@/lib/stickers/recent-stickers-client";
import { useMessengerRoomPhase2RoomPresentation } from "@/lib/community-messenger/room/phase2/use-messenger-room-phase2-room-presentation";
import {
  KASAMA_OWNER_HUB_BADGE_REFRESH,
  KASAMA_TRADE_CHAT_UNREAD_UPDATED,
} from "@/lib/chats/chat-channel-events";

export type MessengerRoomPhase2ControllerState = ReturnType<typeof useMessengerRoomPhase2Controller>;

function dispatchTradeLinkedNavBadgesAfterMessengerMutation(tradeDock: boolean) {
  if (!tradeDock || typeof window === "undefined") return;
  window.dispatchEvent(new Event(KASAMA_OWNER_HUB_BADGE_REFRESH));
  window.dispatchEvent(new Event(KASAMA_TRADE_CHAT_UNREAD_UPDATED));
}

/** 첨부·위치 선택 후 「보내기」 전 확인 시트용 */
export type MessengerAttachmentConfirmDraft =
  | { kind: "image"; files: File[]; previewUrls: string[] }
  | { kind: "file"; file: File }
  | { kind: "location"; content: string };

const MESSENGER_IMAGE_ALBUM_PICK_MAX = 10;

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
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
        return;
      }
      setSnapshot((prev) => (prev ? { ...prev, room: { ...prev.room, isMuted: nextMuted } } : prev));
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, streamRoomId, snapshot]);

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
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
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
  }, [getRoomActionErrorMessage, streamRoomId, snapshot]);

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
      const suffix = action ? `?action=${encodeURIComponent(action)}` : "";
      const href = `/community-messenger/calls/${encodeURIComponent(nextSessionId)}${suffix}`;
      void router.prefetch(href);
      router.push(href);
    },
    [router]
  );

  /** 발신 — `lib/community-messenger/outgoing-call-surfaces.ts` 의 roomManaged (채팅방 헤더·컨트롤). 성공 시 true */
  const startManagedDirectCall = useCallback(
    (kind: "voice" | "video"): Promise<boolean> => {
      if (roomUnavailable || isGroupRoom) return Promise.resolve(false);
      if (outgoingDialSyncGuardRef.current) return Promise.resolve(false);
      outgoingDialSyncGuardRef.current = true;
      setOutgoingDialLocked(true);

      setManagedDirectCallError(null);
      const existingSession = snapshot?.activeCall;
      if (existingSession && existingSession.sessionMode === "direct" && (existingSession.status === "ringing" || existingSession.status === "active")) {
        outgoingDialSyncGuardRef.current = false;
        setOutgoingDialLocked(false);
        openDirectCallPage(existingSession.id);
        return Promise.resolve(true);
      }

      return (async () => {
        try {
          const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
            { roomId, peerUserId: null, kind },
            (href) => {
              logClientPerf("messenger-call.dial.push", { phase: "room_managed", roomId, kind });
              void router.prefetch(href);
              router.push(href);
            }
          );
          if (!result.ok) {
            setManagedDirectCallError(result.userMessage);
            return false;
          }
          return true;
        } catch (e) {
          const name = typeof e === "object" && e && "name" in e ? String((e as { name?: unknown }).name) : "";
          setManagedDirectCallError(
            name === "AbortError" ? "통화 준비가 중단되었습니다." : "네트워크 오류로 통화를 시작하지 못했습니다."
          );
          return false;
        } finally {
          outgoingDialSyncGuardRef.current = false;
          setOutgoingDialLocked(false);
        }
      })();
    },
    [isGroupRoom, openDirectCallPage, roomId, roomUnavailable, router, snapshot?.activeCall]
  );

  useEffect(() => {
    if (!snapshot || !isPrivateGroupRoom) return;
    setPrivateGroupNoticeDraft(snapshot.room.noticeText ?? "");
    setGroupAllowMemberInvite(snapshot.room.allowMemberInvite !== false);
    setGroupAllowAdminInvite(snapshot.room.allowAdminInvite !== false);
    setGroupAllowAdminKick(snapshot.room.allowAdminKick !== false);
    setGroupAllowAdminEditNotice(snapshot.room.allowAdminEditNotice !== false);
    setGroupAllowMemberUpload(snapshot.room.allowMemberUpload !== false);
    setGroupAllowMemberCall(snapshot.room.allowMemberCall !== false);
  }, [isPrivateGroupRoom, snapshot]);

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
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
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
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
        return;
      }
      router.replace("/community-messenger?section=chats&filter=private_group");
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, streamRoomId, router, t]);
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
    async (content: string, restoreOnFail?: string) => {
      const trimmed = content.trim();
      if (!trimmed || !snapshot) return;
      const clientMessageId = createCommunityMessengerClientMessageId();
      const tempId = `pending:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: snapshot.viewerUserId,
        senderLabel:
          roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
        messageType: "text",
        content: trimmed,
        createdAt: nextOptimisticCommunityMessengerCreatedAtIso(roomMessagesRef.current),
        clientMessageId,
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      stickToBottomRef.current = true;
      scrollMessengerToBottom();
      setBusy("send");
      try {
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(streamRoomId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, clientMessageId }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(streamRoomId, elapsed, "text");
        }
        if (!res.ok || !json.ok) {
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          if (restoreOnFail !== undefined) setMessage(restoreOnFail);
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        if (json.message) {
          const confirmedMessage = json.message;
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [confirmedMessage]
            )
          );
          scrollMessengerToBottom();
          postCommunityMessengerBusEvent({
            type: "cm.room.message_sent",
            roomId: streamRoomId,
            clientMessageId,
            at: Date.now(),
          });
          forgetRoomBootstrapClientFlightsAfterMutation();
          dispatchTradeLinkedNavBadgesAfterMessengerMutation(showMessengerTradeProcessDock);
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
      forgetRoomBootstrapClientFlightsAfterMutation,
      getRoomActionErrorMessage,
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      showMessengerTradeProcessDock,
      scrollMessengerToBottom,
      snapshot,
    ]
  );

  const sendMessage = useCallback(async (textOverride?: string) => {
    const raw = (textOverride ?? message).trim();
    if (!raw || !snapshot) return;
    const replyPrefix = replyToMessage
      ? `[답장: ${replyToMessage.senderLabel}] ${
          replyToMessage.messageType === "text"
            ? replyToMessage.content.trim().slice(0, 200)
            : `(${replyToMessage.messageType})`
        }\n`
      : "";
    const content = `${replyPrefix}${raw}`.trim();
    setMessage("");
    setReplyToMessage(null);
    await sendRawText(content);
  }, [message, replyToMessage, sendRawText, snapshot]);

  const sendSticker = useCallback(
    async (fileUrl: string, stickerItemId?: string) => {
      const url = fileUrl.trim();
      if (!snapshot || roomUnavailable || !url.startsWith("/stickers/")) return;
      const clientMessageId = createCommunityMessengerClientMessageId();
      const tempId = `pending:sticker:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: snapshot.viewerUserId,
        senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
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
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
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
          postCommunityMessengerBusEvent({
            type: "cm.room.message_sent",
            roomId: streamRoomId,
            clientMessageId,
            at: Date.now(),
          });
          forgetRoomBootstrapClientFlightsAfterMutation();
          dispatchTradeLinkedNavBadgesAfterMessengerMutation(showMessengerTradeProcessDock);
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
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      roomUnavailable,
      scrollMessengerToBottom,
      showMessengerTradeProcessDock,
      snapshot,
    ]
  );

  const sendLocationMessage = useCallback(() => {
    if (!snapshot || roomUnavailable) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showMessengerSnackbar("이 기기에서 위치를 사용할 수 없습니다.", { variant: "error" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
        const content = `📍 위치 공유\n${url}`;
        setAttachmentConfirmDraft({ kind: "location", content });
        setActiveSheet("attach-confirm");
      },
      () => {
        showMessengerSnackbar("위치 권한이 필요하거나 가져오지 못했습니다.", { variant: "error" });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, [roomUnavailable, setActiveSheet, snapshot]);

  const sendImageFiles = useCallback(
    async (files: File[], optimisticPreviewUrls: string[]) => {
      if (!snapshot || roomUnavailable) return;
      const list = files.slice(0, MESSENGER_IMAGE_ALBUM_PICK_MAX);
      const previews = optimisticPreviewUrls.slice(0, MESSENGER_IMAGE_ALBUM_PICK_MAX);
      if (list.length === 0 || list.length !== previews.length) return;
      const tempId = `pending:image:${streamRoomId}:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: snapshot.viewerUserId,
        senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
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
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        const serverImageMsg = json.message;
        if (serverImageMsg) {
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [serverImageMsg]
            )
          );
          scrollMessengerToBottom();
          forgetRoomBootstrapClientFlightsAfterMutation();
          dispatchTradeLinkedNavBadgesAfterMessengerMutation(showMessengerTradeProcessDock);
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
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      roomUnavailable,
      scrollMessengerToBottom,
      showMessengerTradeProcessDock,
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
      showMessengerSnackbar(`한 번에 선택할 수 있는 사진은 최대 ${MESSENGER_IMAGE_ALBUM_PICK_MAX}장입니다.`, {
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
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId: streamRoomId,
        senderId: snapshot.viewerUserId,
        senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
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
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        const serverFileMsg = json.message;
        if (serverFileMsg) {
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [serverFileMsg]
            )
          );
          scrollMessengerToBottom();
          forgetRoomBootstrapClientFlightsAfterMutation();
          dispatchTradeLinkedNavBadgesAfterMessengerMutation(showMessengerTradeProcessDock);
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
      refresh,
      roomMessagesRef,
      streamRoomId,
      roomMembersDisplay,
      roomUnavailable,
      scrollMessengerToBottom,
      showMessengerTradeProcessDock,
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
      await sendImageFiles(files, previewUrls);
      return;
    }
    if (draft.kind === "file") {
      const { file } = draft;
      setAttachmentConfirmDraft(null);
      dismissRoomSheet();
      await sendFile(file);
      return;
    }
    const { content } = draft;
    setAttachmentConfirmDraft(null);
    dismissRoomSheet();
    await sendRawText(content);
  }, [attachmentConfirmDraft, dismissRoomSheet, sendFile, sendImageFiles, sendRawText]);

  const deleteRoomMessage = useCallback(
    async (messageId: string) => {
      if (!window.confirm("이 메시지를 삭제할까요?")) return;
      setBusy("delete-message");
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(streamRoomId)}/messages/${encodeURIComponent(messageId)}`,
          { method: "DELETE" }
        );
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        setRoomMessages((prev) => prev.filter((item) => item.id !== messageId));
        void refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, refresh, streamRoomId]
  );

  const blockPeerFromMessage = useCallback(
    async (targetUserId: string) => {
      if (!window.confirm("이 사용자를 차단할까요? 친구·대화 일부가 제한될 수 있습니다.")) return;
      setBusy("block-peer");
      try {
        const res = await fetch("/api/community/block-relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(json.error ?? "차단 처리에 실패했습니다.", { variant: "error" });
          return;
        }
        showMessengerSnackbar("차단되었습니다.", { variant: "success" });
        void refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [refresh]
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
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
        return;
      }
      setInviteIds([]);
      setInviteSearchQuery("");
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, inviteIds, refresh, streamRoomId]);

  const savePrivateGroupNotice = useCallback(async () => {
    if (!isPrivateGroupRoom) return;
    setBusy("group-notice");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "group_notice", noticeText: privateGroupNoticeDraft }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
        return;
      }
      await refresh(true);
    } finally {
      setBusy(null);
    }
  }, [getRoomActionErrorMessage, isPrivateGroupRoom, privateGroupNoticeDraft, refresh, streamRoomId]);

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
        showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
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
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        await refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, refresh, streamRoomId]
  );

  const transferGroupOwner = useCallback(
    async (targetUserId: string, label: string) => {
      if (!window.confirm(`${label}님에게 방장을 위임할까요? 위임 후에는 내가 관리자 권한으로 내려갑니다.`)) return;
      setBusy(`group-owner:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "group_owner_transfer", targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        await refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, refresh, streamRoomId]
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
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        router.push(`/community-messenger/rooms/${encodeURIComponent(String(json.roomId))}`);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, router]
  );

  /** 발신 — roomManaged (멤버 시트 등 방 안에서만). 성공 시 true */
  const startDirectCallWithMember = useCallback(
    (peerUserId: string, kind: "voice" | "video"): Promise<boolean> => {
      if (outgoingDialSyncGuardRef.current) return Promise.resolve(false);
      outgoingDialSyncGuardRef.current = true;
      setOutgoingDialLocked(true);

      return (async () => {
        try {
          const result = await bootstrapCommunityMessengerOutgoingCallAndNavigate(
            { roomId: null, peerUserId, kind },
            (href) => {
              logClientPerf("messenger-call.dial.push", { phase: "member_sheet", peerUserId, kind });
              void router.prefetch(href);
              router.push(href);
            }
          );
          if (!result.ok) {
            showMessengerSnackbar(result.userMessage, { variant: "error" });
            return false;
          }
          return true;
        } catch (e) {
          const name = typeof e === "object" && e && "name" in e ? String((e as { name?: unknown }).name) : "";
          showMessengerSnackbar(
            name === "AbortError" ? "통화 준비가 중단되었습니다." : "네트워크 오류로 통화를 시작하지 못했습니다.",
            { variant: "error" }
          );
          return false;
        } finally {
          outgoingDialSyncGuardRef.current = false;
          setOutgoingDialLocked(false);
        }
      })();
    },
    [router]
  );

  const removeGroupMember = useCallback(
    async (targetUserId: string, label: string) => {
      if (!window.confirm(`${label}님을 이 그룹에서 내보낼까요?`)) return;
      setBusy(`group-remove:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(streamRoomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "group_member_remove", targetUserId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        await refresh(true);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, refresh, streamRoomId]
  );

  const startGroupCall = useCallback(
    async (kind: "voice" | "video") => {
      if (!canStartGroupCall) {
        showMessengerSnackbar("이 그룹에서는 현재 멤버 통화 시작 권한이 없습니다.", { variant: "error" });
        return;
      }
      dismissRoomSheet();
      await call.startOutgoingCall(kind);
    },
    [call, canStartGroupCall, dismissRoomSheet]
  );

  /** 통화 로그 말풍선 — Viber 처럼 탭 후 확인 → 동일 종류(음성/영상)로 재연결 */
  const requestOutgoingCallFromStub = useCallback(
    async (kind: "voice" | "video") => {
      if (roomUnavailable) return;
      if (!window.confirm("통화를 연결할까요?")) return;
      if (isGroupRoom) {
        await startGroupCall(kind);
      } else {
        startManagedDirectCall(kind);
      }
    },
    [isGroupRoom, roomUnavailable, startGroupCall, startManagedDirectCall]
  );

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
      const reasonDetail = window.prompt("신고 사유를 입력해 주세요.");
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
        showMessengerSnackbar(json.error ?? "신고 접수에 실패했습니다.", { variant: "error" });
        return;
      }
      setMemberActionTarget(null);
      showMessengerSnackbar("신고가 접수되었습니다.", { variant: "success" });
    },
    [roomId]
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
        showMessengerSnackbar("복사할 수 없는 메시지입니다.", { variant: "error" });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        showMessengerSnackbar("복사하지 못했습니다.", { variant: "error" });
      }
      setMessageActionItem(null);
    },
    [getMessageCopyText]
  );

  const forwardMessage = useCallback(
    async (item: CommunityMessengerMessage & { pending?: boolean }) => {
      const text = getMessageCopyText(item);
      const payload = text || `[${item.messageType} 메시지]`;
      try {
        if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
          await navigator.share({ title: snapshot?.room.title ?? "대화", text: payload });
        } else {
          await navigator.clipboard.writeText(payload);
          showMessengerSnackbar("내용을 클립보드에 복사했습니다.", { variant: "success" });
        }
      } catch {
        try {
          await navigator.clipboard.writeText(payload);
          showMessengerSnackbar("내용을 클립보드에 복사했습니다.", { variant: "success" });
        } catch {
          showMessengerSnackbar("전달할 수 없습니다.", { variant: "error" });
        }
      }
      setMessageActionItem(null);
    },
    [getMessageCopyText, snapshot?.room.title]
  );

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

  return {
    ...phase1,
    call,
    roomHeaderStatus,
    roomUnavailable,
    isGroupRoom,
    roomSummaryHoldsOnlyTradeOrDeliveryMeta,
    tradeProductChatIdForDock,
    showMessengerTradeProcessDock,
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
    requestOutgoingCallFromStub,
    reportTarget,
    getMessageCopyText,
    copyMessageText,
    forwardMessage,
    hideCallStubLocally,
  };
}
