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
import {
  communityMessengerRoomBootstrapPath,
  communityMessengerRoomMembersPath,
  communityMessengerRoomResourcePath,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  flushMessengerMonitorQueue,
  messengerMonitorMessageRtt,
} from "@/lib/community-messenger/monitoring/client";
import { cmRtLogCanonicalRedirect } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { getLocalRoomSnapshot, putLocalRoomSnapshot } from "@/lib/community-messenger/local-store/roomSnapshotDb";
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
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeCommunityMessengerRoomBumpBroadcast } from "@/lib/community-messenger/realtime/room-bump-broadcast";
import {
  communityMessengerBumpKnownRoomIds,
  communityMessengerBumpPayloadMatchesKnownRooms,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { parseCommunityMessengerBumpMessageSnapshot } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import type { MessengerChatViewPosition } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
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
  const loadedRef = useRef(Boolean(peekRoomSnapshot(roomId, initialViewerId || undefined) ?? initialServerSnapshot));
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
    const listPrimed = peekRoomSnapshot(roomId, initialViewerId || undefined);
    return listPrimed ?? initialServerSnapshot ?? null;
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
    () => !Boolean(peekRoomSnapshot(roomId, initialViewerId || undefined) ?? initialServerSnapshot)
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

  useNotificationSurfaceCommunityMessengerRoom(roomId);

  useEffect(() => {
    return () => {
      const t = silentBootstrapThrottleCoalesceTimerRef.current;
      if (t != null) {
        clearTimeout(t);
        silentBootstrapThrottleCoalesceTimerRef.current = null;
      }
    };
  }, [roomId]);

  useEffect(() => {
    const v = snapshot?.viewerUserId?.trim() ?? "";
    if (v) viewerBootstrapDedupRef.current = v;
  }, [snapshot?.viewerUserId]);

  useEffect(() => {
    const id = roomId?.trim();
    return () => {
      if (id && messengerRolloutUsesRoomScrollHints()) {
        useMessengerRoomReaderStateStore.getState().clearRoom(id);
      }
    };
  }, [roomId]);

  useEffect(() => {
    const id = roomId?.trim();
    if (!id || !messengerRolloutUsesRoomScrollHints()) return;
    useMessengerRoomReaderStateStore.getState().setScrollPosition(id, "at-bottom");
  }, [roomId]);

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

  // Local-first: 목록 프리패치/서버 시드가 없을 때 IndexedDB 스냅샷으로 first paint를 당긴다.
  useEffect(() => {
    if (snapshotRef.current) return;
    const id = String(roomId ?? "").trim();
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const local = await getLocalRoomSnapshot(id);
      if (cancelled) return;
      if (!local) return;
      // 방 진입 즉시 렌더 + realtime 구독 허용
      setSnapshot(local);
      setLoading(false);
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  // 스냅샷이 갱신될 때 로컬에 persist (best-effort, LRU/TTL/상한은 DB 레이어에서 처리)
  useEffect(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    const id = String(roomId ?? "").trim();
    if (!id) return;
    void putLocalRoomSnapshot(id, snap);
  }, [roomId, snapshot]);

  useEffect(() => {
    return () => {
      void flushMessengerMonitorQueue();
    };
  }, [roomId]);

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

  /** 탭 복귀: 최신 id 이후 메시지만 증분 로드(diff) 후 메타용 사일런트 스냅샷 */
  const catchUpNewerMessages = useCallback(async (): Promise<boolean> => {
    const id = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!id) return false;
    const confirmed = roomMessagesRef.current.filter((m) => !m.pending);
    if (confirmed.length === 0) {
      // 첫 진입/희귀 레이스: 아직 confirmed가 없으면 부트스트랩 refresh로 최신 윈도를 먼저 확보.
      void refresh(true);
      return false;
    }
    /** 앵커는 배열 끝이 아니라 **시간상 최신 확정 메시지** — 정렬/가상화와 무관하게 `after=` 일관 */
    let anchorId: string | null = null;
    let bestTime = -Infinity;
    let bestIdForTie = "";
    for (const m of confirmed) {
      const mid = String(m?.id ?? "").trim();
      if (!mid || mid.startsWith("pending:") || !isUuidLikeString(mid)) continue;
      const t = new Date(m.createdAt).getTime();
      if (!Number.isFinite(t)) continue;
      if (t > bestTime || (t === bestTime && mid > bestIdForTie)) {
        bestTime = t;
        anchorId = mid;
        bestIdForTie = mid;
      }
    }
    if (!anchorId) {
      void refresh(true);
      return false;
    }
    try {
      const res = await fetch(
        `${communityMessengerRoomResourcePath(id)}/messages?after=${encodeURIComponent(anchorId)}&limit=80`,
        { cache: "no-store", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: CommunityMessengerMessage[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.messages) || json.messages.length === 0) return false;
      setRoomMessages((prev) => mergeRoomMessages(prev, json.messages ?? []));
      return true;
    } catch {
      /* ignore */
    }
    return false;
  }, [roomId, streamRoomId, refresh]);

  /** Broadcast v2 `messageId` 로 1건 GET — `after` 페이지보다 가볍고 레이스에 강하다. */
  const tryMergeSingleMessageFromBump = useCallback(async (messageId: string): Promise<boolean> => {
    const mid = String(messageId ?? "").trim();
    if (!mid || !isUuidLikeString(mid)) return false;
    /**
     * INSERT 직후 단건 GET 이 404/5xx 면 복제·커밋 레이스 가능 — 짧은 간격으로만 재시도.
     * (분당 72회 한도: 404/503 등에만 재시도·상한으로 폭주 방지)
     */
    const maxAttempts = 14;
    const gapMs = 130;
    for (let i = 0; i < maxAttempts; i++) {
      const rid = (snapshotRef.current?.room?.id?.trim() || streamRoomId?.trim() || "").trim();
      if (!rid) return false;
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(rid)}/messages/${encodeURIComponent(mid)}`,
          { cache: "no-store", credentials: "include" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok && json.message) {
          const row = json.message;
          setRoomMessages((prev) => mergeRoomMessages(prev, [row]));
          return true;
        }
        const retryable = res.status === 404 || res.status === 503 || res.status >= 500;
        if (!retryable || i + 1 >= maxAttempts) return false;
      } catch {
        if (i + 1 >= maxAttempts) return false;
      }
      await new Promise<void>((r) => setTimeout(r, gapMs));
    }
    return false;
  }, [streamRoomId]);

  /** 원격 bump 직후: 단건 병합 → 실패 시 `after` 증분 → 마지막에 스냅샷 refresh */
  const catchUpAfterRemoteBump = useCallback(
    async (hintMessageId?: string | null) => {
      const hint = typeof hintMessageId === "string" ? hintMessageId.trim() : "";
      if (hint && (await tryMergeSingleMessageFromBump(hint))) {
        return;
      }
      const backoffMs = [14, 32, 72];
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((r) => setTimeout(r, backoffMs[attempt - 1] ?? 72));
        }
        const ok = await catchUpNewerMessages();
        if (ok) return;
      }
      void refresh(true);
    },
    [catchUpNewerMessages, refresh, tryMergeSingleMessageFromBump]
  );

  /** 통화 종료 직후 다른 탭에서 돌아올 때 스냅샷(activeCall)이 잠깐 옛값이면 배너가 남는 경우 완화 */
  useEffect(() => {
    let lastBumpAt = 0;
    const bump = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastBumpAt < 2000) return; // burst 1~2 + cooldown
      lastBumpAt = now;
      void catchUpNewerMessages();
      void refresh(true);
    };
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("pageshow", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("pageshow", bump);
    };
  }, [catchUpNewerMessages, refresh]);

  // Multi-tab: another tab sent a message in this room -> catch up quickly without full reload storms.
  useEffect(() => {
    const route = roomId?.trim();
    const stream = streamRoomId?.trim();
    if (!route && !stream) return;
    let lastAt = 0;
    return onCommunityMessengerBusEvent((ev) => {
      const evr = ev.roomId.trim();
      if (evr !== route && evr !== stream) return;
      const now = Date.now();
      if (now - lastAt < 1500) return;
      lastAt = now;
      void catchUpNewerMessages();
      void refresh(true);
    });
  }, [catchUpNewerMessages, refresh, roomId, streamRoomId]);

  useMessengerRoomRealtimeMessageIngest({
    routeRoomId: String(roomId ?? "").trim(),
    streamRoomId,
    snapshot,
    initialServerSnapshot,
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

  /**
   * `postgres_changes` 가 publication/RLS/세션 타이밍 문제로 누락돼도,
   * 방 단위 Broadcast bump 신호로 즉시 증분 동기화한다.
   */
  useEffect(() => {
    const viewer =
      snapshot?.viewerUserId?.trim() ?? initialServerSnapshot?.viewerUserId?.trim() ?? "";
    if (!viewer || !roomReadyForRealtime) return;

    const route = String(roomId ?? "").trim();
    const stream = String(streamRoomId ?? "").trim();
    const snapRoom = String(snapshot?.room?.id ?? "").trim();
    const bumpSubscribeIds = communityMessengerBumpKnownRoomIds({
      routeRoomId: route,
      streamRoomId: stream || route,
      snapshotRoomId: snapRoom || null,
    });
    if (bumpSubscribeIds.size === 0) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    const channels: ReturnType<typeof subscribeCommunityMessengerRoomBumpBroadcast>[] = [];

    const onBump = (payload: Record<string, unknown>) => {
      const known = communityMessengerBumpKnownRoomIds({
        routeRoomId: String(roomId ?? "").trim(),
        streamRoomId: String(streamRoomId ?? "").trim(),
        snapshotRoomId: snapshotRef.current?.room?.id ?? null,
      });
      if (!communityMessengerBumpPayloadMatchesKnownRooms(payload, known)) return;

      const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
      // 내 bump는 이미 optimistic/confirm 처리되므로 스킵.
      if (from && from === viewer) return;

      const hint =
        typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof (payload as { message_id?: unknown }).message_id === "string"
            ? String((payload as { message_id: string }).message_id).trim()
            : "";
      const at = typeof payload.at === "string" ? payload.at.trim() : "";
      const dedupeKey = `${from}|${hint || "no-mid"}|${at}`;
      if (lastRemoteBumpDedupeRef.current === dedupeKey) return;
      lastRemoteBumpDedupeRef.current = dedupeKey;

      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
      }
      remoteBumpCatchUpRafRef.current = requestAnimationFrame(() => {
        remoteBumpCatchUpRafRef.current = null;
        const pre = parseCommunityMessengerBumpMessageSnapshot(payload, viewer);
        if (pre) {
          const member = roomMembersDisplayRef.current.find((m) => messengerUserIdsEqual(m.id, pre.senderId ?? ""));
          const enriched =
            member?.label && member.label.trim().length > 0 ? { ...pre, senderLabel: member.label } : pre;
          setRoomMessages((prev) => mergeRoomMessages(prev, [enriched]));
        }
        void catchUpAfterRemoteBump(hint || undefined);
      });
    };

    for (const rid of bumpSubscribeIds) {
      channels.push(
        subscribeCommunityMessengerRoomBumpBroadcast({
          sb,
          roomId: rid,
          onBump,
        })
      );
    }

    return () => {
      lastRemoteBumpDedupeRef.current = "";
      if (remoteBumpCatchUpRafRef.current != null) {
        cancelAnimationFrame(remoteBumpCatchUpRafRef.current);
        remoteBumpCatchUpRafRef.current = null;
      }
      for (const ch of channels) {
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignore */
        }
      }
    };
  }, [
    catchUpAfterRemoteBump,
    initialServerSnapshot?.viewerUserId,
    roomId,
    roomReadyForRealtime,
    snapshot?.room?.id,
    snapshot?.viewerUserId,
    streamRoomId,
  ]);

  /** URL 이 원장 방 id 와 다르면(거래 채팅 id 등) Realtime·히스토리 일관을 위해 정규 UUID 로 교체 */
  useEffect(() => {
    if (!snapshot?.room?.id) return;
    const canon = String(snapshot.room.id).trim();
    const route = String(roomId ?? "").trim();
    if (!canon || !route || canon === route) return;
    cmRtLogCanonicalRedirect({
      fromRouteRoomId: route,
      toCanonicalRoomId: canon,
      viewerUserId: snapshot.viewerUserId,
    });
    const qs = searchParams?.toString();
    void router.replace(
      `/community-messenger/rooms/${encodeURIComponent(canon)}${qs && qs.length > 0 ? `?${qs}` : ""}`
    );
  }, [roomId, router, searchParams, snapshot]);

  useLayoutEffect(() => {
    roomLoadingRef.current = loading;
    readPhase1OverlayBlockedRef.current =
      activeSheet != null ||
      messageActionItem != null ||
      callStubSheet != null ||
      infoSheetFocus != null ||
      memberActionTarget != null;
  }, [loading, activeSheet, messageActionItem, callStubSheet, infoSheetFocus, memberActionTarget]);

  useMessengerRoomOpenMarkReadEffect({
    roomId,
    snapshotRef,
    roomOpenMarkReadRef,
    stickToBottomRef,
    roomMessagesRef,
    messagesViewportRef,
    readPhase1OverlayBlockedRef,
    roomLoadingRef,
  });

  useEffect(() => {
    if (!snapshot) {
      setRoomMessages([]);
      return;
    }
    setRoomMessages((prev) => mergeRoomMessages(prev, snapshot.messages));
  }, [snapshot]);

  useEffect(() => {
    olderMessagesExhaustedRef.current = false;
    setHasMoreOlderMessages(false);
    setLoadingOlderMessages(false);
  }, [roomId]);

  useEffect(() => {
    if (!snapshot) return;
    if (String(snapshot.room.id) !== String(roomId)) return;
    if (!olderMessagesExhaustedRef.current) {
      setHasMoreOlderMessages(snapshot.messages.length >= CM_SNAPSHOT_FIRST_PAGE);
    }
  }, [roomId, snapshot]);

  const oldestLoadedMessageId = useMemo(() => {
    for (const m of roomMessages) {
      if (m.pending) continue;
      const rid = String(m.id ?? "").trim();
      if (!rid || rid.startsWith("pending:") || !isUuidLikeString(rid)) continue;
      return rid;
    }
    return null;
  }, [roomMessages]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || !hasMoreOlderMessages || olderMessagesExhaustedRef.current) return;
    const beforeId = oldestLoadedMessageId;
    if (!beforeId) return;
    const apiRoomId = (snapshotRef.current?.room?.id?.trim() || roomId?.trim() || "").trim();
    if (!apiRoomId) return;
    const vp = messagesViewportRef.current;
    const prevScrollHeight = vp?.scrollHeight ?? 0;
    setLoadingOlderMessages(true);
    try {
      const res = await fetch(
        `${communityMessengerRoomResourcePath(apiRoomId)}/messages?before=${encodeURIComponent(beforeId)}`,
        { cache: "no-store", credentials: "include" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: CommunityMessengerMessage[];
        hasMore?: boolean;
      };
      if (!res.ok || !json.ok || !Array.isArray(json.messages)) {
        olderMessagesExhaustedRef.current = true;
        setHasMoreOlderMessages(false);
        return;
      }
      if (json.messages.length === 0) {
        olderMessagesExhaustedRef.current = true;
        setHasMoreOlderMessages(false);
        return;
      }
      setRoomMessages((prev) => mergeRoomMessages(prev, json.messages ?? []));
      if (!json.hasMore) {
        olderMessagesExhaustedRef.current = true;
      }
      setHasMoreOlderMessages(Boolean(json.hasMore));
      window.requestAnimationFrame(() => {
        const el = messagesViewportRef.current;
        if (el && prevScrollHeight > 0) {
          el.scrollTop += el.scrollHeight - prevScrollHeight;
        }
      });
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [roomId, oldestLoadedMessageId, loadingOlderMessages, hasMoreOlderMessages]);

  loadOlderMessagesRef.current = () => {
    void loadOlderMessages();
  };

  useEffect(() => {
    const root = messagesViewportRef.current;
    const target = topOlderSentinelRef.current;
    if (!root || !target || !hasMoreOlderMessages || olderMessagesExhaustedRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (hit) loadOlderMessagesRef.current();
      },
      { root, rootMargin: "120px 0px 0px 0px", threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [roomId, hasMoreOlderMessages, oldestLoadedMessageId]);

  const scrollMessengerToBottom = useCallback(() => {
    const id = roomId?.trim();
    if (id && messengerRolloutUsesRoomScrollHints()) {
      useMessengerRoomReaderStateStore.getState().clearPendingNew(id);
      useMessengerRoomReaderStateStore.getState().setScrollPosition(id, "at-bottom");
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const vp = messagesViewportRef.current;
        if (vp) vp.scrollTop = vp.scrollHeight;
        messageEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      });
    });
  }, [roomId]);

  const updateStickToBottomFromScroll = useCallback(() => {
    const el = messagesViewportRef.current;
    if (!el) return;
    const threshold = 100;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < threshold;
    const id = roomId?.trim();
    if (!id || !messengerRolloutUsesRoomScrollHints()) return;
    let pos: MessengerChatViewPosition;
    if (activeSheet === "search") {
      pos = "jumped-by-search";
    } else if (stickToBottomRef.current) {
      pos = "at-bottom";
    } else {
      pos = "reading-history";
    }
    useMessengerRoomReaderStateStore.getState().setScrollPosition(id, pos);
  }, [roomId, activeSheet]);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [roomId]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollMessengerToBottom();
    }
  }, [roomMessages, scrollMessengerToBottom]);

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

