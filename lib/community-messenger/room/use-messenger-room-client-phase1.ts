"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  hasUsablePrimedCommunityMessengerDeviceStream,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  openCommunityMessengerPermissionSettings,
} from "@/lib/community-messenger/call-permission";
import { startCommunityMessengerCallTone, type CallToneController } from "@/lib/community-messenger/call-feedback-sound";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { useMessengerRoomRealtimeMessageIngest } from "@/lib/community-messenger/room/use-messenger-room-realtime-message-ingest";
import { useMessengerRoomOpenMarkReadEffect } from "@/lib/community-messenger/room/use-messenger-room-open-mark-read-effect";
import {
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
  type CommunityMessengerMessage,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { communityMessengerRoomMembersPath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { peekHotRoomSnapshot, peekRoomSnapshot, primeHotRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { createMessengerRoomBootstrapRefresh } from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import { useMessengerRoomBootstrapLifecycle } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import { useMessengerRoomUrlSyncEffects } from "@/lib/community-messenger/room/use-messenger-room-url-sync-effects";
import { useMessengerRoomChatVirtualizer } from "@/lib/community-messenger/room/use-messenger-room-chat-virtualizer";
import { useMessengerRoomDerivedMessageLists } from "@/lib/community-messenger/room/use-messenger-room-derived-message-lists";
import type { ChatRoom } from "@/lib/types/chat";
import { useNotificationSurfaceCommunityMessengerRoom } from "@/lib/ui/use-notification-surface-explicit-chat-rooms";
import { disposeDetachedCommunityCallIfStale } from "@/lib/community-messenger/direct-call-minimize";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  readCommunityMessengerLocalSettings,
} from "@/lib/community-messenger/preferences";
import { fetchChatRoomDetailApi } from "@/lib/chats/fetch-chat-room-detail-api";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import { useMessengerRoomBumpBroadcastSubscription } from "@/lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription";
import { useMessengerRoomCanonicalRouteReplaceEffect } from "@/lib/community-messenger/room/use-messenger-room-canonical-route-effect";
import { useMessengerRoomLocalIndexedDbSnapshot } from "@/lib/community-messenger/room/use-messenger-room-local-indexed-db-snapshot";
import {
  useMessengerRoomPhase1MonitorFlushOnRoomUnmount,
  useMessengerRoomPhase1SilentBootstrapThrottleCleanup,
  useMessengerRoomPhase1ViewerBootstrapDedupSync,
} from "@/lib/community-messenger/room/use-messenger-room-phase1-bootstrap-aux-effects";
import { useMessengerRoomRemoteCatchup } from "@/lib/community-messenger/room/use-messenger-room-remote-catchup";
import { useMessengerRoomLoadOlderMessagesFetch } from "@/lib/community-messenger/room/use-messenger-room-load-older-messages-fetch";
import { useMessengerRoomLoadOlderMessagesIntersection } from "@/lib/community-messenger/room/use-messenger-room-load-older-messages-intersection";
import { useMessengerRoomReaderScrollBottom } from "@/lib/community-messenger/room/use-messenger-room-reader-scroll-bottom";
import { useMessengerRoomReaderScrollRoomLifecycle } from "@/lib/community-messenger/room/use-messenger-room-reader-scroll-room-lifecycle";
import { useMessengerRoomVisibilityBusCatchup } from "@/lib/community-messenger/room/use-messenger-room-visibility-bus-catchup";
import {
  BackIcon,
  communityMessengerMemberAvatar,
  communityMessengerMessageSearchText,
  communityMessengerVoiceAudioSrc,
  extractHttpUrls,
  FileIcon,
  formatDuration,
  formatFileMeta,
  formatParticipantStatus,
  formatRoomCallStatus,
  formatTime,
  formatVoiceRecordTenThousandths,
  getLatestCallStubForSession,
  looksLikeDirectImageUrl,
  mergeRoomMessages,
  MicHoldIcon,
  MoreIcon,
  PlusIcon,
  SendPlaneIcon,
  SendVoiceArrowIcon,
  TrashVoiceIcon,
  VideoCallIcon,
  VoiceCallIcon,
  VoiceRecordingLiveWaveform,
  ViberChatBubble,
} from "@/components/community-messenger/room/community-messenger-room-helpers";

export type MessengerRoomClientPhase1Props = {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
};

export function useMessengerRoomClientPhase1({
  roomId,
  initialCallAction,
  initialCallSessionId,
  initialServerSnapshot = null,
}: MessengerRoomClientPhase1Props) {
  const initialViewerId = initialServerSnapshot?.viewerUserId?.trim() ?? "";
  const { t, tt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /** 같은 방에 머문 채 전역 배너에서 수락할 때도 반응하도록 URL 을 구독한다(RSC initial props 만으론 갱신이 안 될 수 있음). */
  const callActionFromUrl = searchParams.get("callAction") ?? initialCallAction ?? undefined;
  const sessionIdFromUrl = searchParams.get("sessionId") ?? initialCallSessionId ?? undefined;
  const contextMetaFromUrlHandledRef = useRef(false);
  /** 방 입장 시 미읽음이 있으면 `mark_read` 1회 — 동일 방 재입장마다 초기화 */
  const roomOpenMarkReadRef = useRef<{ roomId: string | null; phase: "idle" | "in_flight" | "done" }>({
    roomId: null,
    phase: "idle",
  });
  const sheetInfoFromUrlHandledRef = useRef(false);
  const autoHandledSessionRef = useRef<string | null>(null);
  const autoAcceptInFlightRef = useRef<string | null>(null);
  const pendingMessageIdRef = useRef(0);
  const loadedRef = useRef(
    Boolean(
      peekHotRoomSnapshot(roomId, initialViewerId || undefined) ??
        peekRoomSnapshot(roomId, initialViewerId || undefined) ??
        initialServerSnapshot
    )
  );
  /** RSC가 `membersDeferred` 부트스트랩을 내렸으면 사일런트 갱신 시 전원 멤버 프로필을 다시 끌어오지 않음 */
  const deferredMemberBootstrapRef = useRef(Boolean(initialServerSnapshot?.membersDeferred));
  const silentRoomRefreshBusyRef = useRef(false);
  const silentRoomRefreshAgainRef = useRef(false);
  const silentBootstrapThrottleCoalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewerBootstrapDedupRef = useRef(initialViewerId);
  /** 발신 다이얼 `router.push` 연타 방지 — ref 는 동기 연타, state 는 버튼 비활성 표시 */
  const outgoingDialSyncGuardRef = useRef(false);
  const [outgoingDialLocked, setOutgoingDialLocked] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const messageLongPressTimerRef = useRef<number | null>(null);
  const messageLongPressItemRef = useRef<(CommunityMessengerMessage & { pending?: boolean }) | null>(null);
  const groupNoticeSectionRef = useRef<HTMLDivElement | null>(null);
  const groupPermissionsSectionRef = useRef<HTMLDivElement | null>(null);
  const groupHistorySectionRef = useRef<HTMLDivElement | null>(null);
  /** 서버 부트스트랩(`bootstrap` GET)과 동일한 초기 메시지 윈도 — 그만큼이면 더 있을 수 있음 */
  const CM_SNAPSHOT_FIRST_PAGE = COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT;
  const olderMessagesExhaustedRef = useRef(false);
  const topOlderSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadOlderMessagesRef = useRef<() => void>(() => {});
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stickToBottomRef = useRef(true);
  /** 서버+클라 이중 bump 가 같은 틱에 오면 catch-up 을 한 번만 돌린다 */
  const remoteBumpCatchUpRafRef = useRef<number | null>(null);
  /** canonical·raw 채널 이중 발행 시 동일 페이로드로 catch-up 이 두 번 도는 것 방지 */
  const lastRemoteBumpDedupeRef = useRef<string>("");
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [snapshot, setSnapshot] = useState<CommunityMessengerRoomSnapshot | null>(() => {
    const hot = peekHotRoomSnapshot(roomId, initialViewerId || undefined);
    const listPrimed = peekRoomSnapshot(roomId, initialViewerId || undefined);
    return hot ?? listPrimed ?? initialServerSnapshot ?? null;
  });
  /** DB `community_messenger_messages.room_id` — URL id(거래·레거시)와 다를 수 있어 Realtime 필터는 이 값을 쓴다. */
  const streamRoomId = useMemo(() => {
    const c =
      snapshot?.room?.id?.trim() ||
      initialServerSnapshot?.room?.id?.trim();
    const r = String(roomId ?? "").trim();
    return (c || r).trim();
  }, [snapshot?.room?.id, initialServerSnapshot?.room?.id, roomId]);
  const [roomMessages, setRoomMessages] = useState<Array<CommunityMessengerMessage & { pending?: boolean }>>([]);
  const snapshotRef = useRef<CommunityMessengerRoomSnapshot | null>(null);
  const roomMessagesRef = useRef(roomMessages);
  /** `mark_read` — 시트·메시지 액션 등 오버레이 시 금지 */
  const readPhase1OverlayBlockedRef = useRef(false);
  const roomLoadingRef = useRef(false);
  snapshotRef.current = snapshot;
  roomMessagesRef.current = roomMessages;
  const [friends, setFriends] = useState<CommunityMessengerProfileLite[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [loading, setLoading] = useState(
    () =>
      !Boolean(
        peekHotRoomSnapshot(roomId, initialViewerId || undefined) ??
          peekRoomSnapshot(roomId, initialViewerId || undefined) ??
          initialServerSnapshot
      )
  );
  /** 초기 부트스트랩(HTTP) 완료 후에만 Realtime 구독 — 마운트 시 중복 요청·구독 레이스 완화 */
  const [roomReadyForRealtime, setRoomReadyForRealtime] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [messageActionItem, setMessageActionItem] = useState<(CommunityMessengerMessage & { pending?: boolean }) | null>(
    null
  );
  const [replyToMessage, setReplyToMessage] = useState<(CommunityMessengerMessage & { pending?: boolean }) | null>(
    null
  );
  const [callStubSheet, setCallStubSheet] = useState<CommunityMessengerMessage | null>(null);
  const [hiddenCallStubIds, setHiddenCallStubIds] = useState<Set<string>>(() => new Set());
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [roomPreferences, setRoomPreferences] = useState(() => readCommunityMessengerLocalSettings());
  const [message, setMessage] = useState("");
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [privateGroupNoticeDraft, setPrivateGroupNoticeDraft] = useState("");
  const [groupAllowMemberInvite, setGroupAllowMemberInvite] = useState(true);
  const [groupAllowAdminInvite, setGroupAllowAdminInvite] = useState(true);
  const [groupAllowAdminKick, setGroupAllowAdminKick] = useState(true);
  const [groupAllowAdminEditNotice, setGroupAllowAdminEditNotice] = useState(true);
  const [groupAllowMemberUpload, setGroupAllowMemberUpload] = useState(true);
  const [groupAllowMemberCall, setGroupAllowMemberCall] = useState(true);
  const [memberActionTarget, setMemberActionTarget] = useState<CommunityMessengerProfileLite | null>(null);
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [openGroupTitle, setOpenGroupTitle] = useState("");
  const [openGroupSummary, setOpenGroupSummary] = useState("");
  const [openGroupPassword, setOpenGroupPassword] = useState("");
  const [openGroupMemberLimit, setOpenGroupMemberLimit] = useState("200");
  const [openGroupDiscoverable, setOpenGroupDiscoverable] = useState(true);
  const [openGroupJoinPolicy, setOpenGroupJoinPolicy] = useState<"password" | "free">("password");
  const [openGroupIdentityPolicy, setOpenGroupIdentityPolicy] = useState<"real_name" | "alias_allowed">("alias_allowed");
  const [activeSheet, setActiveSheet] = useState<
    | null
    | "attach"
    | "attach-confirm"
    | "menu"
    | "members"
    | "info"
    | "search"
    | "media"
    | "files"
    | "links"
    | "stickers"
  >(null);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  const [managedDirectCallError, setManagedDirectCallError] = useState<string | null>(null);
  /** 그룹 URL 자동 수락 effect 예외 시(훅이 잡지 못한 throw) 안내 */
  const [groupCallAutoAcceptNotice, setGroupCallAutoAcceptNotice] = useState<string | null>(null);
  const [infoSheetFocus, setInfoSheetFocus] = useState<null | "notice" | "permissions" | "history">(null);
  const [pagedRoomMembers, setPagedRoomMembers] = useState<CommunityMessengerProfileLite[]>([]);
  const [membersListNextOffset, setMembersListNextOffset] = useState<number | null>(null);
  const [membersPagingBusy, setMembersPagingBusy] = useState(false);
  const membersPageInitializedRef = useRef(false);
  const prevActiveSheetRef = useRef<typeof activeSheet>(null);
  const roomMembersDisplayRef = useRef<CommunityMessengerProfileLite[]>([]);

  useMessengerRoomPhase1SilentBootstrapThrottleCleanup({
    roomId,
    silentBootstrapThrottleCoalesceTimerRef,
  });

  useMessengerRoomPhase1ViewerBootstrapDedupSync({
    snapshotViewerUserId: snapshot?.viewerUserId,
    viewerBootstrapDedupRef,
  });

  useMessengerRoomReaderScrollRoomLifecycle({ roomId });

  useEffect(() => {
    const syncPreferences = () => {
      setRoomPreferences(readCommunityMessengerLocalSettings());
    };
    syncPreferences();
    if (typeof window === "undefined") return;
    window.addEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, syncPreferences as EventListener);
    return () => {
      window.removeEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, syncPreferences as EventListener);
    };
  }, []);

  const refresh = useMemo(
    () =>
      createMessengerRoomBootstrapRefresh({
        roomId,
        viewerBootstrapDedupRef,
        setSnapshot,
        setLoading,
        setRoomReadyForRealtime,
        loadedRef,
        deferredMemberBootstrapRef,
        silentRoomRefreshBusyRef,
        silentRoomRefreshAgainRef,
        silentBootstrapThrottleCoalesceTimerRef,
      }),
    [
      roomId,
      viewerBootstrapDedupRef,
      setSnapshot,
      setLoading,
      setRoomReadyForRealtime,
      loadedRef,
      deferredMemberBootstrapRef,
      silentRoomRefreshBusyRef,
      silentRoomRefreshAgainRef,
      silentBootstrapThrottleCoalesceTimerRef,
    ]
  );

  useMessengerRoomBootstrapLifecycle({
    roomId,
    initialServerSnapshot,
    refresh,
    loadedRef,
    setRoomReadyForRealtime,
  });

  useNotificationSurfaceCommunityMessengerRoom(roomId, Boolean(snapshot ?? initialServerSnapshot));

  useMessengerRoomLocalIndexedDbSnapshot({
    roomId,
    snapshotRef,
    snapshot,
    setSnapshot,
    setLoading,
    loadedRef,
    setRoomReadyForRealtime,
  });

  useEffect(() => {
    const snap = snapshot;
    const id = roomId.trim();
    if (!snap?.viewerUserId || !id) return;
    primeHotRoomSnapshot(id, snap);
  }, [roomId, snapshot]);

  /** 거래 1:1 — Phase2·Trade 카드 청크보다 먼저 상품/거래 상세 GET 을 시작해 "불러오는 중" 체감을 줄인다. */
  useEffect(() => {
    const m = snapshot?.room.contextMeta;
    if (!m || m.kind !== "trade") return;
    const pcid = typeof m.productChatId === "string" ? m.productChatId.trim() : "";
    if (!pcid) return;
    void fetchChatRoomDetailApi(pcid);
  }, [snapshot?.room.contextMeta]);

  useLayoutEffect(() => {
    return () => {
      const snap = snapshotRef.current;
      const id = String(roomId ?? "").trim();
      if (snap?.viewerUserId && id) primeHotRoomSnapshot(id, snap);
    };
  }, [roomId]);

  useMessengerRoomPhase1MonitorFlushOnRoomUnmount({ roomId });

  useEffect(() => {
    setPagedRoomMembers([]);
    setMembersListNextOffset(null);
    membersPageInitializedRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!snapshot) return;
    if (membersPageInitializedRef.current) return;
    membersPageInitializedRef.current = true;
    if (snapshot.membersDeferred) {
      setMembersListNextOffset(0);
    } else {
      setMembersListNextOffset(snapshot.membersTruncated ? COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP : null);
    }
  }, [snapshot]);

  const openInfoSheetFromUrl = useCallback(() => {
    setActiveSheet("info");
  }, []);

  useMessengerRoomUrlSyncEffects({
    roomId,
    resourceRoomId: streamRoomId,
    pathname,
    routerReplace: router.replace,
    searchParams,
    snapshot,
    loading,
    refresh,
    contextMetaFromUrlHandledRef,
    sheetInfoFromUrlHandledRef,
    openInfoSheetFromUrl,
  });

  const { catchUpNewerMessages, catchUpAfterRemoteBump } = useMessengerRoomRemoteCatchup({
    roomId,
    streamRoomId,
    refresh,
    snapshotRef,
    roomMessagesRef,
    setRoomMessages,
  });

  useMessengerRoomVisibilityBusCatchup({
    roomId,
    streamRoomId,
    catchUpNewerMessages,
    refresh,
  });

  useMessengerRoomRealtimeMessageIngest({
    routeRoomId: String(roomId ?? "").trim(),
    streamRoomId,
    snapshot,
    initialServerSnapshot,
    viewerUserIdHint: initialViewerId || undefined,
    roomReadyForRealtime,
    snapshotRef,
    roomMembersDisplayRef,
    stickToBottomRef,
    setRoomMessages,
    onRefresh: () => {
      // Realtime 메시지 이벤트가 RLS/Publication/세션 레이스로 누락돼도
      // 방 화면은 unread/participants 변화(onRefresh)만으로 즉시 증분 동기화해 따라잡는다.
      void catchUpNewerMessages();
      void refresh(true);
    },
  });

  useMessengerRoomBumpBroadcastSubscription({
    roomId,
    streamRoomId,
    roomReadyForRealtime,
    snapshot,
    initialServerSnapshot,
    snapshotRef,
    roomMembersDisplayRef,
    remoteBumpCatchUpRafRef,
    lastRemoteBumpDedupeRef,
    setRoomMessages,
    catchUpAfterRemoteBump,
  });

  useMessengerRoomCanonicalRouteReplaceEffect({
    roomId,
    router,
    searchParams,
    snapshot,
  });

  useLayoutEffect(() => {
    roomLoadingRef.current = loading;
    readPhase1OverlayBlockedRef.current =
      activeSheet != null ||
      messageActionItem != null ||
      callStubSheet != null ||
      infoSheetFocus != null ||
      memberActionTarget != null;
  }, [loading, activeSheet, messageActionItem, callStubSheet, infoSheetFocus, memberActionTarget]);

  const readGateVersion = useMemo(() => {
    const latestMessageId =
      roomMessages[roomMessages.length - 1]?.id ??
      snapshot?.messages?.[snapshot.messages.length - 1]?.id ??
      "";
    return [
      roomId,
      snapshot?.room.unreadCount ?? 0,
      latestMessageId,
      loading ? "loading" : "ready",
      activeSheet ?? "no-sheet",
      messageActionItem?.id ?? "no-message-action",
      callStubSheet?.id ?? "no-call-stub",
      infoSheetFocus ?? "no-info-focus",
      memberActionTarget?.id ?? "no-member-action",
    ].join("|");
  }, [
    roomId,
    snapshot?.room.unreadCount,
    snapshot?.messages,
    roomMessages,
    loading,
    activeSheet,
    messageActionItem?.id,
    callStubSheet?.id,
    infoSheetFocus,
    memberActionTarget?.id,
  ]);

  useMessengerRoomOpenMarkReadEffect({
    roomId,
    snapshotRef,
    roomOpenMarkReadRef,
    stickToBottomRef,
    roomMessagesRef,
    messagesViewportRef,
    readPhase1OverlayBlockedRef,
    roomLoadingRef,
    readGateVersion,
  });

  useEffect(() => {
    if (!snapshot) {
      setRoomMessages([]);
      return;
    }
    setRoomMessages((prev) => mergeRoomMessages(prev, snapshot.messages));
  }, [snapshot]);

  const { oldestLoadedMessageId, loadOlderMessages } = useMessengerRoomLoadOlderMessagesFetch({
    roomId,
    snapshot,
    snapshotRef,
    roomMessages,
    setRoomMessages,
    messagesViewportRef,
    CM_SNAPSHOT_FIRST_PAGE,
    olderMessagesExhaustedRef,
    loadOlderMessagesRef,
    hasMoreOlderMessages,
    setHasMoreOlderMessages,
    loadingOlderMessages,
    setLoadingOlderMessages,
  });

  useMessengerRoomLoadOlderMessagesIntersection({
    roomId,
    hasMoreOlderMessages,
    oldestLoadedMessageId,
    messagesViewportRef,
    topOlderSentinelRef,
    olderMessagesExhaustedRef,
    loadOlderMessagesRef,
  });

  const { scrollMessengerToBottom, updateStickToBottomFromScroll } = useMessengerRoomReaderScrollBottom({
    roomId,
    activeSheet,
    stickToBottomRef,
    messagesViewportRef,
    messageEndRef,
    roomMessages,
  });

  const roomMembersDisplay = useMemo(() => {
    if (!snapshot) return [];
    const baseIds = new Set(snapshot.members.map((m) => m.id));
    const extra = pagedRoomMembers.filter((m) => !baseIds.has(m.id));
    return [...snapshot.members, ...extra];
  }, [snapshot, pagedRoomMembers]);

  useEffect(() => {
    roomMembersDisplayRef.current = roomMembersDisplay;
  }, [roomMembersDisplay]);

  const loadMoreRoomMembers = useCallback(async () => {
    if (membersListNextOffset === null || membersPagingBusy || !snapshot) return;
    const id = roomId?.trim();
    if (!id) return;
    setMembersPagingBusy(true);
    try {
      const res = await fetch(
        `${communityMessengerRoomMembersPath(id)}?offset=${membersListNextOffset}&limit=40`,
        { cache: "no-store", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        members?: CommunityMessengerProfileLite[];
        nextOffset?: number | null;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.members)) return;
      setPagedRoomMembers((prev) => {
        const known = new Set([...snapshot.members, ...prev].map((m) => m.id));
        const next = [...prev];
        for (const m of json.members ?? []) {
          if (!known.has(m.id)) {
            known.add(m.id);
            next.push(m);
          }
        }
        return next;
      });
      setMembersListNextOffset(json.nextOffset ?? null);
    } finally {
      setMembersPagingBusy(false);
    }
  }, [membersListNextOffset, membersPagingBusy, roomId, snapshot]);

  /** `membersDeferred` 방: 멤버 시트로 전환되는 순간에만 첫 `/members` 페이지를 요청 */
  useEffect(() => {
    const prev = prevActiveSheetRef.current;
    prevActiveSheetRef.current = activeSheet;
    if (activeSheet !== "members") return;
    if (prev === "members") return;
    if (!snapshot?.membersDeferred) return;
    if (membersListNextOffset === null) return;
    void loadMoreRoomMembers();
  }, [activeSheet, loadMoreRoomMembers, membersListNextOffset, snapshot?.membersDeferred]);

  const inviteCandidates = useMemo(() => {
    const memberIds = new Set(roomMembersDisplay.map((member) => member.id));
    return friends.filter((friend) => !memberIds.has(friend.id));
  }, [friends, roomMembersDisplay]);
  const filteredInviteCandidates = useMemo(() => {
    const keyword = inviteSearchQuery.trim().toLowerCase();
    if (!keyword) return inviteCandidates;
    return inviteCandidates.filter((friend) => {
      const haystack = [friend.label, friend.subtitle ?? ""].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [inviteCandidates, inviteSearchQuery]);
  const selectedInviteCandidates = useMemo(() => {
    const inviteMap = new Map(inviteCandidates.map((friend) => [friend.id, friend]));
    return inviteIds.map((id) => inviteMap.get(id)).filter((friend): friend is CommunityMessengerProfileLite => Boolean(friend));
  }, [inviteCandidates, inviteIds]);

  const dismissRoomSheet = useCallback(() => {
    setActiveSheet(null);
    setInfoSheetFocus(null);
    setRoomSearchQuery("");
    setInviteSearchQuery("");
    setInviteIds([]);
  }, []);

  const {
    messageSearchResults,
    mediaGalleryMessages,
    linkThreadMessages,
    displayRoomMessages,
    fileMessages,
    managementEventMessages,
    photoMessageCount,
    voiceMessageCount,
    fileMessageCount,
    linkMessageCount,
  } = useMessengerRoomDerivedMessageLists(roomMessages, hiddenCallStubIds, roomSearchQuery);

  const chatVirtualizer = useMessengerRoomChatVirtualizer(displayRoomMessages.length, messagesViewportRef);

  useEffect(() => {
    const id = roomId?.trim();
    if (!id) {
      setHiddenCallStubIds(new Set());
      return;
    }
    const key = `cm_hidden_call_stubs:${id}`;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        setHiddenCallStubIds(
          new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [])
        );
      } else {
        setHiddenCallStubIds(new Set());
      }
    } catch {
      setHiddenCallStubIds(new Set());
    }
  }, [roomId]);
  const groupAdminCount = useMemo(
    () =>
      roomMembersDisplay.filter(
        (member) =>
          member.memberRole === "admin" &&
          (!snapshot?.room.ownerUserId || !messengerUserIdsEqual(member.id, snapshot.room.ownerUserId))
      ).length,
    [snapshot?.room.ownerUserId, roomMembersDisplay]
  );
  const aliasProfileCount = useMemo(
    () => roomMembersDisplay.filter((member) => member.identityMode === "alias").length,
    [roomMembersDisplay]
  );
  const sortedMembers = useMemo(() => {
    if (!snapshot) return [];
    return [...roomMembersDisplay].sort((left, right) => {
      const rank = (member: CommunityMessengerProfileLite) => {
        const isMemberOwner = Boolean(snapshot.room.ownerUserId && messengerUserIdsEqual(member.id, snapshot.room.ownerUserId));
        if (isMemberOwner) return 0;
        if (member.memberRole === "admin") return 1;
        if (messengerUserIdsEqual(member.id, snapshot.viewerUserId)) return 2;
        return 3;
      };
      const rankDiff = rank(left) - rank(right);
      if (rankDiff !== 0) return rankDiff;
      return left.label.localeCompare(right.label, "ko");
    });
  }, [snapshot, roomMembersDisplay]);
  const scrollToRoomMessage = useCallback(
    (messageId: string) => {
      dismissRoomSheet();
      window.requestAnimationFrame(() => {
        const el = document.getElementById(`cm-room-msg-${messageId}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    [dismissRoomSheet]
  );

  const loadFriends = useCallback(async () => {
    if (friendsLoaded) return;
    const res = await fetch("/api/community-messenger/friends", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; friends?: CommunityMessengerProfileLite[] };
    setFriends(res.ok && json.ok ? json.friends ?? [] : []);
    setFriendsLoaded(true);
  }, [friendsLoaded]);
  return {
  roomId,
  streamRoomId,
  initialCallAction,
  initialCallSessionId,
  initialServerSnapshot,
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
  CM_SNAPSHOT_FIRST_PAGE,
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
  inviteCandidates,
  inviteIds,
  inviteSearchQuery,
  linkMessageCount,
  linkThreadMessages,
  loadedRef,
  loadFriends,
  loading,
  loadingOlderMessages,
  loadMoreRoomMembers,
  loadOlderMessages,
  loadOlderMessagesRef,
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
  };
}

