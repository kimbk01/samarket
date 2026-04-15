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
import {
  useCommunityMessengerRoomRealtime,
  type CommunityMessengerRoomRealtimeMessageEvent,
} from "@/lib/community-messenger/use-community-messenger-realtime";
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
  messengerMonitorUnreadListSync,
} from "@/lib/community-messenger/monitoring/client";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import { getLocalRoomSnapshot, putLocalRoomSnapshot } from "@/lib/community-messenger/local-store/roomSnapshotDb";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { createMessengerRoomBootstrapRefresh } from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import { useMessengerRoomBootstrapLifecycle } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import { useMessengerRoomUrlSyncEffects } from "@/lib/community-messenger/room/use-messenger-room-url-sync-effects";
import { useMessengerRoomChatVirtualizer } from "@/lib/community-messenger/room/use-messenger-room-chat-virtualizer";
import { useMessengerRoomDerivedMessageLists } from "@/lib/community-messenger/room/use-messenger-room-derived-message-lists";
import { useMessengerRoomVoiceRecording } from "@/lib/community-messenger/room/use-messenger-room-voice-recording";
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
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
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
  mapRealtimeRoomMessage,
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
  const loadedRef = useRef(Boolean(peekRoomSnapshot(roomId) ?? initialServerSnapshot));
  /** RSC가 `membersDeferred` 부트스트랩을 내렸으면 사일런트 갱신 시 전원 멤버 프로필을 다시 끌어오지 않음 */
  const deferredMemberBootstrapRef = useRef(Boolean(initialServerSnapshot?.membersDeferred));
  const silentRoomRefreshBusyRef = useRef(false);
  const silentRoomRefreshAgainRef = useRef(false);
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
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [snapshot, setSnapshot] = useState<CommunityMessengerRoomSnapshot | null>(() => {
    const listPrimed = peekRoomSnapshot(roomId);
    return listPrimed ?? initialServerSnapshot ?? null;
  });
  const [roomMessages, setRoomMessages] = useState<Array<CommunityMessengerMessage & { pending?: boolean }>>([]);
  const snapshotRef = useRef<CommunityMessengerRoomSnapshot | null>(null);
  const pendingRealtimeRef = useRef<CommunityMessengerRoomRealtimeMessageEvent[]>([]);
  /** 100+ 그룹: Realtime INSERT 폭주 시 rAF 로 한 프레임에 합쳐 렌더·diff 비용 절감 */
  const realtimeMessageBatchRef = useRef<CommunityMessengerRoomRealtimeMessageEvent[]>([]);
  const realtimeBatchFlushRafRef = useRef<number | null>(null);
  const roomMessagesRef = useRef(roomMessages);
  snapshotRef.current = snapshot;
  roomMessagesRef.current = roomMessages;
  const [friends, setFriends] = useState<CommunityMessengerProfileLite[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  const [loading, setLoading] = useState(() => !Boolean(peekRoomSnapshot(roomId) ?? initialServerSnapshot));
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
  const [activeSheet, setActiveSheet] = useState<null | "attach" | "menu" | "members" | "info" | "search" | "media" | "files" | "links">(null);
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
        setSnapshot,
        setLoading,
        setRoomReadyForRealtime,
        loadedRef,
        deferredMemberBootstrapRef,
        silentRoomRefreshBusyRef,
        silentRoomRefreshAgainRef,
      }),
    [
      roomId,
      setSnapshot,
      setLoading,
      setRoomReadyForRealtime,
      loadedRef,
      deferredMemberBootstrapRef,
      silentRoomRefreshBusyRef,
      silentRoomRefreshAgainRef,
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
  const catchUpNewerMessages = useCallback(async () => {
    const id = roomId?.trim();
    if (!id) return;
    const confirmed = roomMessagesRef.current.filter((m) => !m.pending);
    if (confirmed.length === 0) return;
    const latest = confirmed[confirmed.length - 1];
    if (!latest?.id) return;
    try {
      const res = await fetch(
        `${communityMessengerRoomResourcePath(id)}/messages?after=${encodeURIComponent(latest.id)}&limit=80`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: CommunityMessengerMessage[];
      };
      if (!res.ok || !json.ok || !Array.isArray(json.messages) || json.messages.length === 0) return;
      setRoomMessages((prev) => mergeRoomMessages(prev, json.messages ?? []));
    } catch {
      /* ignore */
    }
  }, [roomId]);

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
    const id = roomId?.trim();
    if (!id) return;
    let lastAt = 0;
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.roomId !== id) return;
      const now = Date.now();
      if (now - lastAt < 1500) return;
      lastAt = now;
      void catchUpNewerMessages();
      void refresh(true);
    });
  }, [catchUpNewerMessages, refresh, roomId]);

  useEffect(() => {
    return () => {
      if (realtimeBatchFlushRafRef.current !== null) {
        cancelAnimationFrame(realtimeBatchFlushRafRef.current);
        realtimeBatchFlushRafRef.current = null;
      }
    };
  }, []);

  const flushRealtimeMessageBatch = useCallback(() => {
    realtimeBatchFlushRafRef.current = null;
    const batch = realtimeMessageBatchRef.current.splice(0);
    if (batch.length === 0) return;
    const snap = snapshotRef.current;
    if (!snap) {
      pendingRealtimeRef.current.push(...batch);
      return;
    }
    setRoomMessages((prev) => {
      let cur = prev;
      for (const event of batch) {
        if (event.eventType === "DELETE") {
          cur = cur.filter((item) => item.id !== event.message.id);
        } else {
          cur = mergeRoomMessages(cur, [mapRealtimeRoomMessage(snap, roomMembersDisplayRef.current, event.message)]);
        }
      }
      return cur;
    });
  }, []);

  const handleRealtimeMessageEvent = useCallback((event: CommunityMessengerRoomRealtimeMessageEvent) => {
    realtimeMessageBatchRef.current.push(event);
    if (realtimeBatchFlushRafRef.current !== null) return;
    realtimeBatchFlushRafRef.current = window.requestAnimationFrame(() => {
      flushRealtimeMessageBatch();
    });
  }, [flushRealtimeMessageBatch]);

  useEffect(() => {
    if (!snapshot) return;
    const queued = pendingRealtimeRef.current;
    if (queued.length === 0) return;
    pendingRealtimeRef.current = [];
    setRoomMessages((prev) => {
      let cur = prev;
      for (const event of queued) {
        if (event.eventType === "DELETE") {
          cur = cur.filter((item) => item.id !== event.message.id);
        } else {
          cur = mergeRoomMessages(cur, [mapRealtimeRoomMessage(snapshot, roomMembersDisplayRef.current, event.message)]);
        }
      }
      return cur;
    });
  }, [snapshot]);

  useCommunityMessengerRoomRealtime({
    roomId,
    enabled: Boolean(roomId) && roomReadyForRealtime && snapshot !== null,
    onRefresh: () => {
      void refresh(true);
    },
    onMessageEvent: handleRealtimeMessageEvent,
  });

  /** 스냅샷에 미읽음이 있으면 방 열람으로 읽음 처리 — 목록·배지와 서버 정합(모니터링 `room_open`) */
  useEffect(() => {
    const id = roomId?.trim();
    if (!id) return;
    if (roomOpenMarkReadRef.current.roomId !== id) {
      roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
    }
    if (!snapshot) return;
    if (String(snapshot.room.id) !== String(id)) return;
    if (roomOpenMarkReadRef.current.phase !== "idle") return;
    if (snapshot.room.unreadCount < 1) return;
    roomOpenMarkReadRef.current.phase = "in_flight";
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    void (async () => {
      try {
        const res = await fetch(communityMessengerRoomResourcePath(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "mark_read" }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && json.ok && typeof performance !== "undefined") {
          messengerMonitorUnreadListSync(id, Math.round(performance.now() - t0), "room_open");
          roomOpenMarkReadRef.current.phase = "done";
          postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: id, at: Date.now() });
        } else {
          roomOpenMarkReadRef.current.phase = "idle";
        }
      } catch {
        roomOpenMarkReadRef.current.phase = "idle";
      }
    })();
  }, [roomId, snapshot]);

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

  const oldestLoadedMessageId = useMemo(
    () => roomMessages.find((m) => !m.pending)?.id ?? null,
    [roomMessages]
  );

  const loadOlderMessages = useCallback(async () => {
    if (loadingOlderMessages || !hasMoreOlderMessages || olderMessagesExhaustedRef.current) return;
    const beforeId = oldestLoadedMessageId;
    if (!beforeId) return;
    const vp = messagesViewportRef.current;
    const prevScrollHeight = vp?.scrollHeight ?? 0;
    setLoadingOlderMessages(true);
    try {
      const res = await fetch(
        `${communityMessengerRoomResourcePath(roomId)}/messages?before=${encodeURIComponent(beforeId)}`,
        { cache: "no-store" }
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
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const vp = messagesViewportRef.current;
        if (vp) vp.scrollTop = vp.scrollHeight;
        messageEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      });
    });
  }, []);

  const updateStickToBottomFromScroll = useCallback(() => {
    const el = messagesViewportRef.current;
    if (!el) return;
    const threshold = 100;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < threshold;
  }, []);

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
  flushRealtimeMessageBatch,
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
  handleRealtimeMessageEvent,
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
  pendingRealtimeRef,
  photoMessageCount,
  prevActiveSheetRef,
  privateGroupNoticeDraft,
  realtimeBatchFlushRafRef,
  realtimeMessageBatchRef,
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

