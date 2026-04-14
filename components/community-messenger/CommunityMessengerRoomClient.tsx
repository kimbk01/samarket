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
  getCommunityMessengerPermissionGuide,
  hasUsablePrimedCommunityMessengerDeviceStream,
  primeCommunityMessengerDevicePermissionFromUserGesture,
  openCommunityMessengerPermissionSettings,
} from "@/lib/community-messenger/call-permission";
import { startCommunityMessengerCallTone, type CallToneController } from "@/lib/community-messenger/call-feedback-sound";
import { useCommunityMessengerGroupCall } from "@/lib/community-messenger/use-community-messenger-group-call";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import {
  useCommunityMessengerRoomRealtime,
  type CommunityMessengerRoomRealtimeMessageEvent,
} from "@/lib/community-messenger/use-community-messenger-realtime";
import {
  communityMessengerCallSessionIsActiveConnected,
  communityMessengerCallStubStatusIsTerminal,
  communityMessengerRoomIsGloballyUsable,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
  type CommunityMessengerCallSession,
  type CommunityMessengerMessage,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  communityMessengerRoomBootstrapPath,
  communityMessengerRoomMembersPath,
  communityMessengerRoomResourcePath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  flushMessengerMonitorQueue,
  messengerMonitorMessageRtt,
  messengerMonitorRoomLoad,
  messengerMonitorUnreadListSync,
} from "@/lib/community-messenger/monitoring/client";
import { consumeRoomSnapshot, peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { ChatRoom } from "@/lib/types/chat";
import { useNotificationSurface } from "@/contexts/NotificationSurfaceContext";
import { GroupRoomCallOverlay } from "@/components/community-messenger/call-ui";
import { VoiceMessageBubble } from "@/components/community-messenger/VoiceMessageBubble";
import {
  COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS,
  downsampleVoiceWaveformPeaks,
  parseVoiceWaveformPeaksFromMetadata,
} from "@/lib/community-messenger/voice-waveform";
import { pickCommunityMessengerVoiceRecorderMime } from "@/lib/community-messenger/voice-recording";
import { disposeDetachedCommunityCallIfStale } from "@/lib/community-messenger/direct-call-minimize";
import { primeCommunityMessengerCallNavigationSeed } from "@/lib/community-messenger/call-session-navigation-seed";
import { BOTTOM_NAV_STACK_ABOVE_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  COMMUNITY_MESSENGER_PREFERENCE_EVENT,
  readCommunityMessengerLocalSettings,
} from "@/lib/community-messenger/preferences";
import { decodeCommunityMessengerRoomCmCtx } from "@/lib/community-messenger/cm-ctx-url";
import { parseCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import { CommunityMessengerMessageActionSheet } from "@/components/community-messenger/room/CommunityMessengerMessageActionSheet";
import { CommunityMessengerTradeProcessSection } from "@/components/community-messenger/CommunityMessengerTradeProcessSection";
import { useMessengerRoomUiStore } from "@/lib/community-messenger/stores/messenger-room-ui-store";
import {
  fetchChatRoomDetailApi,
  updateChatRoomDetailMemory,
} from "@/lib/chats/fetch-chat-room-detail-api";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

/**
 * 거래 도크보다 먼저 마운트되어 `GET /api/chat/room/[productChatId]` 를 시작 — `runSingleFlight` 로
 * TradeProcessSection 과 요청이 합쳐져 메신저 본문·실시간과 네트워크 경합을 줄인다.
 */
function MessengerTradeChatRoomDetailPrefetch({ productChatId }: { productChatId: string }) {
  useLayoutEffect(() => {
    const id = productChatId.trim();
    if (!id) return;
    void fetchChatRoomDetailApi(id);
  }, [productChatId]);
  return null;
}

/** RSC 스냅샷에 실린 거래 상세를 클라 메모리 캐시에 맞춰 `fetchChatRoomDetailApi` 단일 비행과 일치 */
function SeedTradeChatDetailMemoryFromSnapshot({
  productChatId,
  room,
}: {
  productChatId: string;
  room: ChatRoom;
}) {
  useLayoutEffect(() => {
    const id = productChatId.trim();
    if (!id) return;
    updateChatRoomDetailMemory(id, room);
  }, [productChatId, room]);
  return null;
}

/** 이전 말풍선과의 시간 간격이 이 값을 넘으면 프로필·꼬리 말풍선 다시 표시 (Viber 스타일, 기본 5분) */
const CM_CLUSTER_GAP_MS = 5 * 60 * 1000;

export function CommunityMessengerRoomClient({
  roomId,
  initialCallAction,
  initialCallSessionId,
  initialServerSnapshot = null,
}: {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  /** RSC에서 `loadCommunityMessengerRoomBootstrap` — 첫 페인트까지 클라이언트 대기 완화 */
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
}) {
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
  const voiceFinalizingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartMsRef = useRef(0);
  const recordStartPerfRef = useRef(0);
  const voicePointerOriginXRef = useRef(0);
  const voicePointerOriginYRef = useRef(0);
  const voiceHasLockedGestureRef = useRef(false);
  const voiceCancelledRef = useRef(false);
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceWaveformSamplesRef = useRef<number[]>([]);
  const voiceSampleRafRef = useRef<number | null>(null);
  const voiceMimeRef = useRef<{ mimeType: string; fileExtension: string } | null>(null);
  const voiceUiRafRef = useRef<number | null>(null);
  const voiceMaxTimerRef = useRef<number | null>(null);
  const voiceSessionIdRef = useRef(0);
  const voicePointerDownRef = useRef(false);
  const loadedRef = useRef(Boolean(peekRoomSnapshot(roomId) ?? initialServerSnapshot));
  const silentRoomRefreshBusyRef = useRef(false);
  const silentRoomRefreshAgainRef = useRef(false);
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
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceHandsFree, setVoiceHandsFree] = useState(false);
  const [voiceRecordElapsedMs, setVoiceRecordElapsedMs] = useState(0);
  const [voiceLivePreviewBars, setVoiceLivePreviewBars] = useState<number[]>([]);
  const [voiceCancelHint, setVoiceCancelHint] = useState(false);
  const [voiceLockHint, setVoiceLockHint] = useState(false);
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
  const roomMembersDisplayRef = useRef<CommunityMessengerProfileLite[]>([]);

  const notifSurface = useNotificationSurface();
  useEffect(() => {
    if (!notifSurface || !roomId?.trim()) return;
    const id = roomId.trim();
    notifSurface.setExplicitCommunityChatRoomId(id);
    return () => {
      notifSurface.setExplicitCommunityChatRoomId(null);
    };
  }, [notifSurface, roomId]);

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

  const refresh = useCallback(async (silent = false) => {
    if (silent) {
      if (silentRoomRefreshBusyRef.current) {
        silentRoomRefreshAgainRef.current = true;
        return;
      }
      silentRoomRefreshBusyRef.current = true;
    }
    const primed = !silent && consumeRoomSnapshot(roomId);
    const shouldBlock = !silent && !loadedRef.current && !primed;
    if (shouldBlock) setLoading(true);
    try {
      if (primed) {
        setSnapshot(primed);
        setLoading(false);
      }
      const tBoot = typeof performance !== "undefined" ? performance.now() : Date.now();
      const roomRes = await fetch(communityMessengerRoomBootstrapPath(roomId), { cache: "no-store" });
      const raw = await roomRes.json().catch(() => null);
      const snap = parseCommunityMessengerRoomSnapshotResponse(raw);
      if (roomRes.ok && snap) {
        setSnapshot(snap);
        const elapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
        messengerMonitorRoomLoad(roomId, elapsed);
      } else if (!primed) {
        setSnapshot(null);
      }
    } finally {
      setRoomReadyForRealtime(true);
      if (silent) {
        silentRoomRefreshBusyRef.current = false;
        if (silentRoomRefreshAgainRef.current) {
          silentRoomRefreshAgainRef.current = false;
          void refresh(true);
        }
      }
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    setRoomReadyForRealtime(false);
    if (initialServerSnapshot) {
      /** RSC가 이미 부트스트랩을 내렸으면 첫 GET `/rooms/.../bootstrap` 생략 — 첫 페인트와 채널 연결까지 RTT·대역폭 경합 제거 */
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
      const idleId = scheduleWhenBrowserIdle(() => {
        void refresh(true);
      }, 2800);
      return () => cancelScheduledWhenBrowserIdle(idleId);
    }
    void refresh(false);
    // `initialServerSnapshot` 은 RSC 재실행마다 새 참조일 수 있어 deps 에 넣지 않음(무한 요청 방지). `key={roomId}` 로 방 전환 시 마운트가 갈린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh(roomId), initialServerSnapshot 동시에 맞춤
  }, [refresh, roomId]);

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

  /** 거래 채팅 딥링크는 `product_chats` ID 로 들어올 수 있음 — 부트스트랩 후 실제 CM `room.id` 로 URL 정규화 */
  useEffect(() => {
    if (!snapshot?.room?.id || !roomId?.trim()) return;
    const canonical = snapshot.room.id.trim();
    const fromUrl = roomId.trim();
    if (canonical === fromUrl) return;
    const qs = searchParams.toString();
    router.replace(`/community-messenger/rooms/${encodeURIComponent(canonical)}${qs ? `?${qs}` : ""}`, {
      scroll: false,
    });
  }, [snapshot?.room?.id, roomId, router, searchParams]);

  useEffect(() => {
    if (!snapshot) return;
    if (membersPageInitializedRef.current) return;
    membersPageInitializedRef.current = true;
    setMembersListNextOffset(snapshot.membersTruncated ? COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP : null);
  }, [snapshot]);

  /** `?cm_ctx=` 딥링크로 입장 시 거래/배달 목록 메타 1회 동기화 — 스토어는 `buildCommunityMessengerRoomUrlWithContext` 사용 */
  useEffect(() => {
    if (contextMetaFromUrlHandledRef.current) return;
    const raw = searchParams.get("cm_ctx");
    if (!raw?.trim()) return;
    contextMetaFromUrlHandledRef.current = true;
    const meta = decodeCommunityMessengerRoomCmCtx(raw);
    const stripCmCtxFromUrl = () => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("cm_ctx");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    if (!meta) {
      stripCmCtxFromUrl();
      return;
    }
    void (async () => {
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "context_meta", contextMeta: meta }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && json.ok) void refresh(true);
      } finally {
        stripCmCtxFromUrl();
      }
    })();
  }, [pathname, refresh, roomId, router, searchParams]);

  useEffect(() => {
    sheetInfoFromUrlHandledRef.current = false;
  }, [roomId]);

  /** 목록 롱프레스 「그룹/오픈 정보」 등 `?sheet=info` 로 방 정보 시트를 연다 */
  useEffect(() => {
    const sheet = searchParams.get("sheet");
    if (sheet !== "info") return;
    if (sheetInfoFromUrlHandledRef.current) return;
    if (!snapshot || loading) return;
    sheetInfoFromUrlHandledRef.current = true;
    setActiveSheet("info");
    const next = new URLSearchParams(searchParams.toString());
    next.delete("sheet");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [loading, pathname, router, searchParams, snapshot]);

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
    const bump = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
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

  const messageSearchResults = useMemo(() => {
    const q = roomSearchQuery.trim().toLowerCase();
    const base = roomMessages.filter((m) => m.messageType !== "system");
    if (!q) return base;
    return base.filter((m) => {
      const preview = communityMessengerMessageSearchText(m);
      const hay = `${m.senderLabel} ${preview}`.toLowerCase();
      return hay.includes(q);
    });
  }, [roomMessages, roomSearchQuery]);

  const mediaGalleryMessages = useMemo(() => {
    return roomMessages.filter((m) => {
      if (m.messageType === "voice" || m.messageType === "image") return true;
      if (m.messageType === "text") {
        return looksLikeDirectImageUrl(m.content);
      }
      return false;
    });
  }, [roomMessages]);

  const linkThreadMessages = useMemo(() => {
    return roomMessages.filter((m) => {
      if (m.messageType === "system" || m.messageType === "call_stub" || m.messageType === "file") return false;
      return extractHttpUrls(m.content).length > 0;
    });
  }, [roomMessages]);

  const displayRoomMessages = useMemo(
    () => roomMessages.filter((m) => !(m.messageType === "call_stub" && hiddenCallStubIds.has(m.id))),
    [roomMessages, hiddenCallStubIds]
  );

  const chatVirtualizer = useVirtualizer({
    count: displayRoomMessages.length,
    getScrollElement: () => messagesViewportRef.current,
    estimateSize: () => 96,
    overscan: 12,
  });

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
  const fileMessages = useMemo(() => roomMessages.filter((m) => m.messageType === "file"), [roomMessages]);
  const managementEventMessages = useMemo(
    () =>
      roomMessages
        .filter((m) => m.messageType === "system" && m.content.trim())
        .slice(-5)
        .reverse(),
    [roomMessages]
  );
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
  const photoMessageCount = useMemo(
    () => roomMessages.filter((m) => m.messageType === "image" || (m.messageType === "text" && looksLikeDirectImageUrl(m.content))).length,
    [roomMessages]
  );
  const voiceMessageCount = useMemo(() => roomMessages.filter((m) => m.messageType === "voice").length, [roomMessages]);
  const fileMessageCount = fileMessages.length;
  const linkMessageCount = linkThreadMessages.length;

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

  const groupCall = useCommunityMessengerGroupCall({
    enabled: Boolean(snapshot?.room.roomType && snapshot.room.roomType !== "direct"),
    roomId,
    viewerUserId: snapshot?.viewerUserId ?? "",
    roomLabel: snapshot?.room.title ?? t("nav_messenger_group_call"),
    activeCall: snapshot?.activeCall?.sessionMode === "group" ? snapshot.activeCall : null,
    onRefresh: () => refresh(true),
  });
  const call = groupCall;
  const callPanel = call.panel;
  const roomUnavailable = snapshot ? !communityMessengerRoomIsGloballyUsable(snapshot.room) : true;
  const isGroupRoom = snapshot ? snapshot.room.roomType !== "direct" : false;
  /** `summary` 컬럼에 거래/배달 v1 JSON만 들어간 경우 — 공지·소개에 원문 JSON 을 노출하지 않음 */
  const roomSummaryHoldsOnlyTradeOrDeliveryMeta = useMemo(() => {
    const raw = snapshot?.room.summary?.trim();
    if (!raw) return false;
    const k = snapshot?.room.contextMeta?.kind;
    if (k === "trade" || k === "delivery") return true;
    return parseCommunityMessengerRoomContextMeta(raw) != null;
  }, [snapshot?.room.summary, snapshot?.room.contextMeta]);
  const tradeProductChatIdForDock = useMemo(() => {
    const m = snapshot?.room.contextMeta;
    if (!m || m.kind !== "trade") return "";
    return typeof m.productChatId === "string" ? m.productChatId.trim() : "";
  }, [snapshot?.room.contextMeta]);
  const showMessengerTradeProcessDock = !isGroupRoom && tradeProductChatIdForDock.length > 0;
  const permissionGuide = call.panel ? getCommunityMessengerPermissionGuide(call.panel.kind) : null;
  const isPrivateGroupRoom = snapshot?.room.roomType === "private_group";
  const isOpenGroupRoom = snapshot?.room.roomType === "open_group";
  const isOwner = snapshot?.myRole === "owner";
  const roomTypeLabel = isOpenGroupRoom
    ? t("nav_messenger_open_group")
    : isPrivateGroupRoom
      ? t("nav_messenger_private_group")
      : t("nav_messenger_direct_room");
  const roomSubtitle =
    snapshot?.room.description ||
    (isGroupRoom
      ? t("nav_messenger_group_room_subtitle", { count: snapshot?.room.memberCount ?? 0 })
      : t("nav_messenger_friend_room_subtitle"));
  const roomJoinLabel = isOpenGroupRoom
    ? snapshot?.room.joinPolicy === "password"
      ? t("nav_messenger_join_password")
      : t("nav_messenger_join_free")
    : null;
  const roomIdentityLabel = isOpenGroupRoom
    ? snapshot?.room.identityPolicy === "alias_allowed"
      ? t("nav_messenger_identity_alias")
      : t("nav_messenger_identity_real")
    : null;
  const roomNotice =
    snapshot?.room.roomType === "private_group"
      ? snapshot?.room.noticeText?.trim() ?? ""
      : roomSummaryHoldsOnlyTradeOrDeliveryMeta
        ? ""
        : snapshot?.room.summary?.trim() ?? "";
  const canInviteMembers = Boolean(isPrivateGroupRoom && snapshot?.room.allowMemberInvite);
  const myRoleLabel = snapshot
    ? isOwner
      ? t("nav_messenger_owner_label")
      : t("nav_messenger_my_role_label", { role: snapshot.myRole })
    : "";
  const privateGroupNotice = snapshot?.room.noticeText?.trim() ?? "";
  const canEditGroupNotice = Boolean(
    isPrivateGroupRoom &&
      snapshot &&
      (snapshot.myRole === "owner" || (snapshot.myRole === "admin" && snapshot.room.allowAdminEditNotice))
  );
  const canManageGroupPermissions = Boolean(isPrivateGroupRoom && snapshot?.myRole === "owner");
  const canManageMemberRoles = Boolean(isPrivateGroupRoom && snapshot?.myRole === "owner");
  const canKickGroupMembers = Boolean(
    isPrivateGroupRoom &&
      snapshot &&
      (snapshot.myRole === "owner" || (snapshot.myRole === "admin" && snapshot.room.allowAdminKick))
  );
  const canStartGroupCall = Boolean(
    isGroupRoom &&
      snapshot &&
      communityMessengerRoomIsGloballyUsable(snapshot.room) &&
      (snapshot.myRole === "owner" || snapshot.myRole === "admin" || snapshot.room.allowMemberCall)
  );
  const canUploadAttachments = Boolean(
    !isPrivateGroupRoom ||
      !snapshot ||
      snapshot.myRole === "owner" ||
      snapshot.myRole === "admin" ||
      snapshot.room.allowMemberUpload
  );
  const activeGroupCall = isGroupRoom && snapshot?.activeCall?.sessionMode === "group" ? snapshot.activeCall : null;
  const groupCallStatusLabel = activeGroupCall
    ? activeGroupCall.status === "active"
      ? "그룹 통화 진행 중"
      : activeGroupCall.status === "ringing"
        ? "그룹 통화 연결 중"
        : "그룹 통화 대기"
    : canStartGroupCall
      ? "그룹 통화 시작 가능"
      : isGroupRoom
        ? "그룹 통화 시작 권한 없음"
        : "";
  const privateGroupPermissionRows = useMemo(
    () =>
      snapshot
        ? [
            { label: "일반 멤버 초대", value: snapshot.room.allowMemberInvite ? "허용" : "제한" },
            { label: "관리자 초대", value: snapshot.room.allowAdminInvite ? "허용" : "제한" },
            { label: "관리자 내보내기", value: snapshot.room.allowAdminKick ? "허용" : "제한" },
            { label: "관리자 공지 수정", value: snapshot.room.allowAdminEditNotice ? "허용" : "제한" },
            { label: "일반 멤버 업로드", value: snapshot.room.allowMemberUpload ? "허용" : "제한" },
            { label: "일반 멤버 통화 시작", value: snapshot.room.allowMemberCall ? "허용" : "제한" },
          ]
        : [],
    [snapshot]
  );
  const allowedPrivateGroupPermissionCount = useMemo(
    () => privateGroupPermissionRows.filter((row) => row.value === "허용").length,
    [privateGroupPermissionRows]
  );
  const privateGroupNoticeStatusLabel = privateGroupNotice ? "등록됨" : "없음";
  const describeManagementEvent = useCallback((content: string) => {
    const text = content.trim();
    if (!text) return { title: "운영 변경", detail: "" };
    if (text.startsWith("공지 변경:")) {
      return { title: "공지 변경", detail: text.replace("공지 변경:", "").trim() || "공지가 수정되었습니다." };
    }
    if (text === "공지가 삭제되었습니다." || text === "공지 삭제") {
      return { title: "공지 삭제", detail: "등록된 공지를 비웠습니다." };
    }
    if (text.startsWith("공지 수정 ·")) {
      return { title: "공지 변경", detail: text.replace("공지 수정 ·", "").trim() || "공지를 수정했습니다." };
    }
    if (text === "운영 권한 변경" || text === "그룹 권한이 변경되었습니다.") {
      return { title: "권한 변경", detail: "그룹 운영 권한을 조정했습니다." };
    }
    if (text.includes("관리자 지정")) {
      return { title: "관리자 지정", detail: text };
    }
    if (text.includes("관리자 해제")) {
      return { title: "관리자 해제", detail: text };
    }
    if (text.includes("방장 위임")) {
      return { title: "방장 위임", detail: text };
    }
    if (text.includes("내보내기")) {
      return { title: "멤버 내보내기", detail: text };
    }
    if (text.includes("초대")) {
      return { title: "멤버 초대", detail: text };
    }
    return { title: "운영 변경", detail: text };
  }, []);

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

  /** 미니화 힌트(sessionStorage)에 의존하지 않음 — `active`(연결됨)일 때만 배너(벨 울리는 ringing 제외).
   *  채팅 call_stub 이 이미 종료로 갱신됐는데 세션 행이 잠깐 active 로 남는 경우 배너를 숨긴다. */
  const returnToCallSessionId = useMemo(() => {
    const ac = snapshot?.activeCall;
    if (
      ac &&
      ac.sessionMode === "direct" &&
      ac.roomId === roomId &&
      communityMessengerCallSessionIsActiveConnected(ac.status)
    ) {
      const latestStub = getLatestCallStubForSession(roomMessages, ac.id);
      if (latestStub && communityMessengerCallStubStatusIsTerminal(latestStub.callStatus)) {
        return null;
      }
      return ac.id;
    }
    return null;
  }, [roomId, snapshot?.activeCall, roomMessages]);

  const getRoomActionErrorMessage = useCallback((error?: string) => {
    switch (error) {
      case "room_not_found":
        return t("nav_messenger_room_not_found");
      case "content_required":
        return t("nav_messenger_message_required");
      case "room_blocked":
        return t("nav_messenger_room_blocked_error");
      case "room_archived":
        return t("nav_messenger_room_archived_error");
      case "room_readonly":
        return t("nav_messenger_room_readonly_error");
      case "friend_required":
        return "그룹 초대는 친구 관계에서만 가능합니다.";
      case "target_not_found":
        return "대상 멤버를 찾지 못했습니다.";
      case "invalid_role":
        return "변경할 권한 값이 올바르지 않습니다.";
      case "owner_immutable":
        return "방장 권한은 이 화면에서 변경할 수 없습니다.";
      case "same_owner":
        return "이미 현재 방장인 멤버입니다.";
      case "cannot_kick_admin":
        return "관리자는 내보낼 수 없습니다.";
      case "self_kick_forbidden":
        return "자기 자신은 내보낼 수 없습니다.";
      case "not_group_room":
        return t("nav_messenger_group_only");
      case "not_open_group_room":
        return "공개 그룹방에서만 사용할 수 있는 기능입니다.";
      case "password_required":
        return "비밀번호를 입력해 주세요.";
      case "alias_name_required":
        return "별칭 닉네임을 입력해 주세요.";
      case "invalid_password":
        return "비밀번호가 맞지 않습니다.";
      case "room_full":
        return "정원이 가득 찬 방입니다.";
      case "owner_cannot_leave":
        return "방장은 이 방을 바로 나갈 수 없습니다.";
      case "room_unavailable":
        return t("nav_messenger_room_unavailable");
      case "peer_not_found":
        return t("nav_messenger_peer_not_found");
      case "forbidden":
        return t("nav_messenger_forbidden");
      case "call_provider_not_configured":
        return t("nav_messenger_call_provider_not_ready");
      case "call_session_start_failed":
      case "call_session_participants_insert_failed":
        return t("nav_messenger_call_start_failed");
      case "messenger_storage_unavailable":
        return "메신저 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
      case "messenger_migration_required":
        return "메신저 저장소 마이그레이션이 아직 반영되지 않았습니다. DB 스키마를 먼저 업데이트해 주세요.";
      case "file_too_large":
        return "파일 용량이 너무 큽니다.";
      case "unsupported_audio":
        return t("nav_messenger_voice_unsupported");
      case "unsupported_image":
        return "JPG, PNG, WEBP, GIF 이미지만 보낼 수 있습니다.";
      case "unsupported_file":
        return "지원하지 않는 파일 형식입니다.";
      case "file_required":
      case "multipart_required":
        return "파일을 먼저 선택해 주세요.";
      case "upload_failed":
      case "server_config":
        return t("nav_messenger_voice_upload_failed");
      case "not_found":
        return t("nav_messenger_message_not_found");
      case "unsupported_type":
        return t("nav_messenger_message_type_delete_unsupported");
      case "delete_failed":
        return t("nav_messenger_message_delete_failed");
      default:
        return t("nav_messenger_action_failed");
    }
  }, [t]);

  const toggleRoomMute = useCallback(async () => {
    if (!snapshot) return;
    const nextMuted = !snapshot.room.isMuted;
    setBusy("room-mute");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
  }, [getRoomActionErrorMessage, roomId, snapshot]);

  const toggleRoomArchive = useCallback(async () => {
    if (!snapshot) return;
    const nextArchived = !snapshot.room.isArchivedByViewer;
    setBusy("room-archive");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
  }, [getRoomActionErrorMessage, roomId, snapshot]);

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

  /** 발신 — `lib/community-messenger/outgoing-call-surfaces.ts` 의 roomManaged (채팅방 헤더·컨트롤) */
  const startManagedDirectCall = useCallback(
    async (kind: "voice" | "video") => {
      if (roomUnavailable || isGroupRoom) return;
      setManagedDirectCallError(null);
      setBusy(`managed-call:${kind}`);
      try {
        const existingSession = snapshot?.activeCall;
        if (existingSession && existingSession.sessionMode === "direct" && (existingSession.status === "ringing" || existingSession.status === "active")) {
          openDirectCallPage(existingSession.id);
          return;
        }
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/calls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callKind: kind }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { id?: string };
        };
        if (!res.ok || !json.ok || !json.session?.id) {
          setManagedDirectCallError(getRoomActionErrorMessage(json.error));
          return;
        }
        const sess = json.session as CommunityMessengerCallSession;
        primeCommunityMessengerCallNavigationSeed(sess.id, sess);
        openDirectCallPage(String(sess.id));
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, isGroupRoom, openDirectCallPage, roomId, roomUnavailable, snapshot?.activeCall]
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
      const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/settings`, {
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
    roomId,
    snapshot,
  ]);

  const leaveRoom = useCallback(async () => {
    if (!window.confirm(t("nav_messenger_leave_group_confirm"))) return;
    setBusy("leave-room");
    try {
      const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/leave`, {
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
  }, [getRoomActionErrorMessage, roomId, router, t]);
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
      const tempId = `pending:${roomId}:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId,
        senderId: snapshot.viewerUserId,
        senderLabel:
          roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
        messageType: "text",
        content: trimmed,
        createdAt: new Date().toISOString(),
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
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: CommunityMessengerMessage;
        };
        if (res.ok && json.ok) {
          const elapsed =
            typeof performance !== "undefined" ? Math.round(performance.now() - tSend) : Math.round(Date.now() - tSend);
          messengerMonitorMessageRtt(roomId, elapsed, "text");
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
          return;
        }
        setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, roomId, roomMembersDisplay, scrollMessengerToBottom, snapshot]
  );

  const sendMessage = useCallback(async () => {
    const raw = message.trim();
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

  const sendLocationMessage = useCallback(() => {
    if (!snapshot || roomUnavailable) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      showMessengerSnackbar("이 기기에서 위치를 사용할 수 없습니다.", { variant: "error" });
      return;
    }
    dismissRoomSheet();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
        const content = `📍 위치 공유\n${url}`;
        void sendRawText(content);
      },
      () => {
        showMessengerSnackbar("위치 권한이 필요하거나 가져오지 못했습니다.", { variant: "error" });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, [dismissRoomSheet, roomUnavailable, sendRawText, snapshot]);

  const sendImageFile = useCallback(
    async (file: File) => {
      if (!snapshot || roomUnavailable) return;
      const previewUrl = URL.createObjectURL(file);
      const tempId = `pending:image:${roomId}:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId,
        senderId: snapshot.viewerUserId,
        senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
        messageType: "image",
        content: previewUrl,
        createdAt: new Date().toISOString(),
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
        form.append("file", file);
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/images`, {
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
          messengerMonitorMessageRtt(roomId, elapsed, "image");
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
          return;
        }
        setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
      } finally {
        URL.revokeObjectURL(previewUrl);
        setBusy(null);
      }
    },
    [dismissRoomSheet, getRoomActionErrorMessage, roomId, roomMembersDisplay, roomUnavailable, scrollMessengerToBottom, snapshot]
  );

  const openImagePicker = useCallback(() => {
    if (roomUnavailable || busy === "send-image" || !canUploadAttachments) return;
    imageInputRef.current?.click();
  }, [busy, canUploadAttachments, roomUnavailable]);

  const openCameraPicker = useCallback(() => {
    if (roomUnavailable || busy === "send-image" || !canUploadAttachments) return;
    cameraInputRef.current?.click();
  }, [busy, canUploadAttachments, roomUnavailable]);

  const onPickImageFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await sendImageFile(file);
    },
    [sendImageFile]
  );

  const sendFile = useCallback(
    async (file: File) => {
      if (!snapshot || roomUnavailable) return;
      const tempId = `pending:file:${roomId}:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId,
        senderId: snapshot.viewerUserId,
        senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
        messageType: "file",
        content: "",
        createdAt: new Date().toISOString(),
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
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/files`, {
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
          messengerMonitorMessageRtt(roomId, elapsed, "file");
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
          return;
        }
        setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
      } finally {
        setBusy(null);
      }
    },
    [dismissRoomSheet, getRoomActionErrorMessage, roomId, roomMembersDisplay, roomUnavailable, scrollMessengerToBottom, snapshot]
  );

  const openFilePicker = useCallback(() => {
    if (roomUnavailable || busy === "send-file" || !canUploadAttachments) return;
    fileInputRef.current?.click();
  }, [busy, canUploadAttachments, roomUnavailable]);

  const onPickFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      await sendFile(file);
    },
    [sendFile]
  );

  const finalizeVoiceRecording = useCallback(
    async (shouldUpload: boolean) => {
      if (voiceFinalizingRef.current) return;
      voiceFinalizingRef.current = true;
      setVoiceHandsFree(false);
      setVoiceLockHint(false);
      voiceHasLockedGestureRef.current = false;
      if (voiceSampleRafRef.current != null) {
        cancelAnimationFrame(voiceSampleRafRef.current);
        voiceSampleRafRef.current = null;
      }
      const waveformSnapshot = [...voiceWaveformSamplesRef.current];
      voiceWaveformSamplesRef.current = [];
      voiceAnalyserRef.current = null;
      void voiceAudioContextRef.current?.close().catch(() => {});
      voiceAudioContextRef.current = null;

      if (voiceUiRafRef.current != null) {
        cancelAnimationFrame(voiceUiRafRef.current);
        voiceUiRafRef.current = null;
      }
      if (voiceMaxTimerRef.current) {
        clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = null;
      }
      const rec = mediaRecorderRef.current;
      mediaRecorderRef.current = null;
      const stream = recordStreamRef.current;
      const startedAt = recordStartMsRef.current;
      setVoiceRecording(false);
      setVoiceCancelHint(false);
      setVoiceRecordElapsedMs(0);
      setVoiceLivePreviewBars([]);

      if (rec && rec.state !== "inactive") {
        await new Promise<void>((resolve) => {
          rec.addEventListener("stop", () => resolve(), { once: true });
          try {
            rec.stop();
          } catch {
            resolve();
          }
        });
      }
      stream?.getTracks().forEach((t) => t.stop());
      recordStreamRef.current = null;

      const chunks = [...mediaChunksRef.current];
      mediaChunksRef.current = [];
      const durationSeconds =
        recordStartPerfRef.current > 0 ? (performance.now() - recordStartPerfRef.current) / 1000 : startedAt
          ? (Date.now() - startedAt) / 1000
          : 0;

      if (!shouldUpload) {
        voiceFinalizingRef.current = false;
        return;
      }

      const waveformPeaks =
        waveformSnapshot.length > 0
          ? downsampleVoiceWaveformPeaks(waveformSnapshot, COMMUNITY_MESSENGER_VOICE_WAVEFORM_BARS)
          : [];

      const blobMime =
        (chunks[0] && chunks[0].type && chunks[0].type.length > 0 ? chunks[0].type : null) ||
        voiceMimeRef.current?.mimeType ||
        "audio/webm";
      const ext =
        blobMime.includes("mp4") || blobMime.includes("m4a")
          ? "m4a"
          : blobMime.includes("ogg")
            ? "ogg"
            : "webm";
      const blob = new Blob(chunks, { type: blobMime });
      if (blob.size < 400) {
        voiceFinalizingRef.current = false;
        showMessengerSnackbar("녹음이 너무 짧습니다.", { variant: "error" });
        return;
      }
      if (!snapshot) {
        voiceFinalizingRef.current = false;
        return;
      }

      const roundedDur = Math.max(1, Math.min(600, Math.round(durationSeconds)));
      const blobUrl = URL.createObjectURL(blob);
      const tempId = `pending:${roomId}:voice:${pendingMessageIdRef.current++}`;
      const optimisticMessage: CommunityMessengerMessage & { pending?: boolean } = {
        id: tempId,
        roomId,
        senderId: snapshot.viewerUserId,
        senderLabel: roomMembersDisplay.find((member) => member.id === snapshot.viewerUserId)?.label ?? "나",
        messageType: "voice",
        content: blobUrl,
        createdAt: new Date().toISOString(),
        isMine: true,
        pending: true,
        callKind: null,
        callStatus: null,
        voiceDurationSeconds: roundedDur,
        voiceMimeType: blobMime,
        ...(waveformPeaks.length > 0 ? { voiceWaveformPeaks: waveformPeaks } : {}),
      };
      setRoomMessages((prev) => mergeRoomMessages(prev, [optimisticMessage]));
      scrollMessengerToBottom();
      setBusy("send-voice");
      try {
        const form = new FormData();
        const fileForUpload = new File([blob], `voice.${ext}`, { type: blobMime });
        form.append("file", fileForUpload);
        form.append("durationSeconds", String(roundedDur));
        if (waveformPeaks.length > 0) {
          form.append("waveformPeaks", JSON.stringify(waveformPeaks));
        }
        const tSend = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(`${communityMessengerRoomResourcePath(roomId)}/voice`, {
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
          messengerMonitorMessageRtt(roomId, elapsed, "voice");
        }
        if (!res.ok || !json.ok) {
          URL.revokeObjectURL(blobUrl);
          setRoomMessages((prev) => prev.filter((item) => item.id !== tempId));
          showMessengerSnackbar(getRoomActionErrorMessage(json.error), { variant: "error" });
          return;
        }
        const confirmedVoice = json.message;
        if (confirmedVoice) {
          URL.revokeObjectURL(blobUrl);
          setRoomMessages((prev) =>
            mergeRoomMessages(
              prev.filter((item) => item.id !== tempId),
              [confirmedVoice]
            )
          );
          scrollMessengerToBottom();
          return;
        }
        URL.revokeObjectURL(blobUrl);
        setRoomMessages((prev) => prev.map((item) => (item.id === tempId ? { ...item, pending: false } : item)));
      } finally {
        setBusy(null);
        voiceFinalizingRef.current = false;
      }
    },
    [getRoomActionErrorMessage, roomId, roomMembersDisplay, scrollMessengerToBottom, snapshot]
  );

  const deleteRoomMessage = useCallback(
    async (messageId: string) => {
      if (!window.confirm("이 메시지를 삭제할까요?")) return;
      setBusy("delete-message");
      try {
        const res = await fetch(
          `${communityMessengerRoomResourcePath(roomId)}/messages/${encodeURIComponent(messageId)}`,
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
    [getRoomActionErrorMessage, refresh, roomId]
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

  const abortVoiceArmOnly = useCallback(() => {
    voicePointerDownRef.current = false;
    if (voiceUiRafRef.current != null) {
      cancelAnimationFrame(voiceUiRafRef.current);
      voiceUiRafRef.current = null;
    }
    voiceSessionIdRef.current += 1;
    setVoiceHandsFree(false);
    setVoiceLockHint(false);
    voiceHasLockedGestureRef.current = false;
    if (voiceSampleRafRef.current != null) {
      cancelAnimationFrame(voiceSampleRafRef.current);
      voiceSampleRafRef.current = null;
    }
    voiceWaveformSamplesRef.current = [];
    voiceAnalyserRef.current = null;
    void voiceAudioContextRef.current?.close().catch(() => {});
    voiceAudioContextRef.current = null;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* ignore */
    }
    mediaRecorderRef.current = null;
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
    setVoiceRecording(false);
    setVoiceCancelHint(false);
    setVoiceRecordElapsedMs(0);
    setVoiceLivePreviewBars([]);
  }, []);

  const onVoiceMicPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (
        roomUnavailable ||
        !snapshot ||
        message.trim() ||
        busy === "send" ||
        busy === "send-voice" ||
        busy === "delete-message"
      )
        return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      const session = ++voiceSessionIdRef.current;
      voicePointerDownRef.current = true;
      voiceCancelledRef.current = false;
      voiceHasLockedGestureRef.current = false;
      voicePointerOriginXRef.current = e.clientX;
      voicePointerOriginYRef.current = e.clientY;
      setVoiceCancelHint(false);
      setVoiceLockHint(false);
      setVoiceHandsFree(false);

      const picked = pickCommunityMessengerVoiceRecorderMime();
      voiceMimeRef.current = picked;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (session !== voiceSessionIdRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!voicePointerDownRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        const rec = picked.mimeType
          ? new MediaRecorder(stream, { mimeType: picked.mimeType })
          : new MediaRecorder(stream);
        mediaChunksRef.current = [];
        rec.ondataavailable = (ev) => {
          if (ev.data.size > 0) mediaChunksRef.current.push(ev.data);
        };

        mediaRecorderRef.current = rec;
        recordStreamRef.current = stream;
        try {
          rec.start(200);
        } catch {
          mediaRecorderRef.current = null;
          recordStreamRef.current = null;
          stream.getTracks().forEach((t) => t.stop());
          if (session === voiceSessionIdRef.current) {
            showMessengerSnackbar("녹음을 시작하지 못했습니다. 다른 앱에서 마이크를 쓰는지 확인해 주세요.", {
              variant: "error",
            });
          }
          return;
        }

        if (session !== voiceSessionIdRef.current || !voicePointerDownRef.current) {
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          stream.getTracks().forEach((t) => t.stop());
          mediaRecorderRef.current = null;
          recordStreamRef.current = null;
          return;
        }

        recordStartMsRef.current = Date.now();
        recordStartPerfRef.current = performance.now();
        setVoiceRecording(true);
        setVoiceRecordElapsedMs(0);
        setVoiceLivePreviewBars([]);
        voiceWaveformSamplesRef.current = [];
        if (voiceSampleRafRef.current != null) {
          cancelAnimationFrame(voiceSampleRafRef.current);
          voiceSampleRafRef.current = null;
        }
        void voiceAudioContextRef.current?.close().catch(() => {});
        voiceAudioContextRef.current = null;
        voiceAnalyserRef.current = null;
        try {
          const AC =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AC();
          voiceAudioContextRef.current = ctx;
          const srcNode = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.42;
          srcNode.connect(analyser);
          voiceAnalyserRef.current = analyser;
          const tick = () => {
            if (session !== voiceSessionIdRef.current || !voiceAnalyserRef.current) return;
            const a = voiceAnalyserRef.current;
            const buf = new Uint8Array(a.frequencyBinCount);
            a.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
              const v = (buf[i]! - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / buf.length);
            voiceWaveformSamplesRef.current.push(Math.min(1, rms * 5.5));
            voiceSampleRafRef.current = requestAnimationFrame(tick);
          };
          void ctx.resume().then(() => {
            if (session === voiceSessionIdRef.current && voiceAnalyserRef.current) {
              voiceSampleRafRef.current = requestAnimationFrame(tick);
            }
          });
        } catch {
          /* 파형 미터는 선택 사항 */
        }
        if (voiceUiRafRef.current != null) cancelAnimationFrame(voiceUiRafRef.current);
        const uiSession = voiceSessionIdRef.current;
        const loopVoiceRecordingUi = () => {
          if (voiceSessionIdRef.current !== uiSession || !mediaRecorderRef.current) return;
          setVoiceRecordElapsedMs(performance.now() - recordStartPerfRef.current);
          const snap = voiceWaveformSamplesRef.current;
          if (snap.length > 0) {
            setVoiceLivePreviewBars(downsampleVoiceWaveformPeaks([...snap], 36));
          } else {
            setVoiceLivePreviewBars([]);
          }
          voiceUiRafRef.current = requestAnimationFrame(loopVoiceRecordingUi);
        };
        voiceUiRafRef.current = requestAnimationFrame(loopVoiceRecordingUi);
        if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
        voiceMaxTimerRef.current = window.setTimeout(() => {
          void finalizeVoiceRecording(true);
        }, 120_000);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      } catch {
        if (session === voiceSessionIdRef.current) {
          showMessengerSnackbar(
            getCommunityMessengerPermissionGuide("voice")?.description ??
              "마이크 권한을 허용한 뒤 다시 시도해 주세요.",
            { variant: "error" }
          );
        }
      }
    },
    [busy, finalizeVoiceRecording, message, roomUnavailable, snapshot]
  );

  const onVoiceMicPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (!mediaRecorderRef.current || voiceHandsFree) return;
      const ox = voicePointerOriginXRef.current;
      const oy = voicePointerOriginYRef.current;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      if (dx < -52) {
        voiceHasLockedGestureRef.current = false;
        voiceCancelledRef.current = true;
        setVoiceCancelHint(true);
        setVoiceLockHint(false);
        return;
      }
      if (dy < -58) {
        voiceHasLockedGestureRef.current = true;
        voiceCancelledRef.current = false;
        setVoiceLockHint(true);
        setVoiceCancelHint(false);
        return;
      }
      voiceCancelledRef.current = false;
      setVoiceCancelHint(false);
      if (!voiceHasLockedGestureRef.current) setVoiceLockHint(false);
    },
    [voiceHandsFree]
  );

  const onVoiceMicPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      voicePointerDownRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        if (voiceHasLockedGestureRef.current && !voiceCancelledRef.current) {
          setVoiceHandsFree(true);
          voiceHasLockedGestureRef.current = false;
          setVoiceCancelHint(false);
          setVoiceLockHint(false);
          return;
        }
        void finalizeVoiceRecording(!voiceCancelledRef.current);
        return;
      }
      abortVoiceArmOnly();
    },
    [abortVoiceArmOnly, finalizeVoiceRecording]
  );

  const onVoiceMicPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      voicePointerDownRef.current = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        void finalizeVoiceRecording(false);
        return;
      }
      abortVoiceArmOnly();
    },
    [abortVoiceArmOnly, finalizeVoiceRecording]
  );

  useEffect(() => {
    return () => {
      if (voiceUiRafRef.current != null) {
        cancelAnimationFrame(voiceUiRafRef.current);
        voiceUiRafRef.current = null;
      }
      if (voiceMaxTimerRef.current) clearTimeout(voiceMaxTimerRef.current);
      if (voiceSampleRafRef.current != null) cancelAnimationFrame(voiceSampleRafRef.current);
      void voiceAudioContextRef.current?.close().catch(() => {});
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const inviteMembers = useCallback(async () => {
    if (inviteIds.length === 0) return;
    setBusy("invite");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
  }, [getRoomActionErrorMessage, inviteIds, refresh, roomId]);

  const savePrivateGroupNotice = useCallback(async () => {
    if (!isPrivateGroupRoom) return;
    setBusy("group-notice");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
  }, [getRoomActionErrorMessage, isPrivateGroupRoom, privateGroupNoticeDraft, refresh, roomId]);

  const savePrivateGroupPermissions = useCallback(async () => {
    if (!isPrivateGroupRoom) return;
    setBusy("group-permissions");
    try {
      const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
    roomId,
  ]);

  const updateGroupMemberRole = useCallback(
    async (targetUserId: string, nextRole: "admin" | "member") => {
      setBusy(`group-role:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
    [getRoomActionErrorMessage, refresh, roomId]
  );

  const transferGroupOwner = useCallback(
    async (targetUserId: string, label: string) => {
      if (!window.confirm(`${label}님에게 방장을 위임할까요? 위임 후에는 내가 관리자 권한으로 내려갑니다.`)) return;
      setBusy(`group-owner:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
    [getRoomActionErrorMessage, refresh, roomId]
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

  /** 발신 — roomManaged (멤버 시트 등 방 안에서만) */
  const startDirectCallWithMember = useCallback(
    async (peerUserId: string, kind: "voice" | "video") => {
      setBusy(`member-call:${kind}:${peerUserId}`);
      try {
        const roomRes = await fetch("/api/community-messenger/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomType: "direct", peerUserId }),
        });
        const roomJson = (await roomRes.json().catch(() => ({}))) as { ok?: boolean; error?: string; roomId?: string };
        if (!roomRes.ok || !roomJson.ok || !roomJson.roomId) {
          showMessengerSnackbar(getRoomActionErrorMessage(roomJson.error), { variant: "error" });
          return;
        }
        const directRoomId = String(roomJson.roomId);
        const callRes = await fetch(`${communityMessengerRoomResourcePath(directRoomId)}/calls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callKind: kind }),
        });
        const callJson = (await callRes.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { id?: string };
        };
        if (!callRes.ok || !callJson.ok || !callJson.session?.id) {
          showMessengerSnackbar(getRoomActionErrorMessage(callJson.error), { variant: "error" });
          return;
        }
        setMemberActionTarget(null);
        const sess = callJson.session as CommunityMessengerCallSession;
        primeCommunityMessengerCallNavigationSeed(sess.id, sess);
        const groupCallHref = `/community-messenger/calls/${encodeURIComponent(String(sess.id))}`;
        void router.prefetch(groupCallHref);
        router.push(groupCallHref);
      } finally {
        setBusy(null);
      }
    },
    [getRoomActionErrorMessage, router]
  );

  const removeGroupMember = useCallback(
    async (targetUserId: string, label: string) => {
      if (!window.confirm(`${label}님을 이 그룹에서 내보낼까요?`)) return;
      setBusy(`group-remove:${targetUserId}`);
      try {
        const res = await fetch(communityMessengerRoomResourcePath(roomId), {
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
    [getRoomActionErrorMessage, refresh, roomId]
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
        await startManagedDirectCall(kind);
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
    if (item.messageType === "image" || item.messageType === "file" || item.messageType === "voice") {
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
          const key = `cm_hidden_call_stubs:${roomId.trim()}`;
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      });
      setCallStubSheet(null);
    },
    [roomId]
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
    router.replace(`/community-messenger/rooms/${encodeURIComponent(roomId)}`);
  }, [
    call.panel?.mode,
    call.panel?.sessionId,
    callActionFromUrl,
    sessionIdFromUrl,
    roomId,
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
  }, [isGroupRoom, callPanel]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-[14px] text-ui-muted">
        채팅방을 불러오는 중입니다.
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[16px] font-semibold text-ui-fg">채팅방을 찾을 수 없습니다.</p>
        <button
          type="button"
          onClick={() => router.replace("/community-messenger?section=chats")}
          className="rounded-ui-rect bg-ui-fg px-4 py-3 text-[14px] font-semibold text-ui-surface"
        >
          {t("nav_messenger_home")}
        </button>
      </div>
    );
  }

  const roomHeaderStatus =
    [roomTypeLabel, roomSubtitle || (isGroupRoom ? `${snapshot.room.memberCount}명` : "마지막 활동 없음")]
      .filter(Boolean)
      .join(" · ") || "";

  return (
    <div
      data-messenger-shell
      data-cm-room
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]"
    >
      <header className="sticky top-0 z-10 shrink-0 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2 shadow-none">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              router.replace(
                isGroupRoom
                  ? "/community-messenger?section=chats&filter=private_group"
                  : "/community-messenger?section=chats"
              )
            }
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text)] transition active:bg-[color:var(--cm-room-primary-soft)]"
            aria-label={t("tier1_back")}
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[color:var(--cm-room-primary-soft)] ring-1 ring-[color:var(--cm-room-divider)]">
            {snapshot.room.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={snapshot.room.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-[color:var(--cm-room-primary)]">
                {snapshot.room.title.trim().slice(0, 1).toUpperCase() || "?"}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-tight text-[color:var(--cm-room-text)]">
              {snapshot.room.title}
            </p>
            <p className="truncate text-[11px] text-[color:var(--cm-room-text-muted)]">{roomHeaderStatus}</p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {!isGroupRoom && communityMessengerRoomIsGloballyUsable(snapshot.room) ? (
              <>
                <button
                  type="button"
                  onClick={() => void startManagedDirectCall("voice")}
                  disabled={roomUnavailable || busy === "managed-call:voice" || busy === "managed-call:video"}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--cm-room-primary)] transition active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-35"
                  aria-label={t("nav_voice_call_label")}
                >
                  <VoiceCallIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void startManagedDirectCall("video")}
                  disabled={roomUnavailable || busy === "managed-call:voice" || busy === "managed-call:video"}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--cm-room-primary)] transition active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-35"
                  aria-label={t("nav_video_call_label")}
                >
                  <VideoCallIcon className="h-5 w-5" />
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setActiveSheet("menu")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--cm-room-text-muted)] transition active:bg-[color:var(--cm-room-primary-soft)]"
              aria-label={t("nav_messenger_room_menu")}
            >
              <MoreIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={onPickImageFile}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPickImageFile}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={onPickFile} />

      {showMessengerTradeProcessDock ? (
        <>
          {snapshot.tradeChatRoomDetail ? (
            <SeedTradeChatDetailMemoryFromSnapshot
              productChatId={tradeProductChatIdForDock}
              room={snapshot.tradeChatRoomDetail}
            />
          ) : (
            <MessengerTradeChatRoomDetailPrefetch productChatId={tradeProductChatIdForDock} />
          )}
          <CommunityMessengerTradeProcessSection
            productChatId={tradeProductChatIdForDock}
            viewerUserId={snapshot.viewerUserId}
            initialTradeChatRoom={snapshot.tradeChatRoomDetail ?? null}
            onTradeMetaChanged={() => void refresh(true)}
          />
        </>
      ) : null}

      <div
        ref={messagesViewportRef}
        className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--cm-room-chat-bg)]"
        onScroll={() => {
          updateStickToBottomFromScroll();
          setMessageActionItem(null);
          setCallStubSheet(null);
        }}
      >
        <main className="space-y-2.5 px-3 py-3 pb-3 sm:px-3.5">
          {!communityMessengerRoomIsGloballyUsable(snapshot.room) ? (
            <div className="rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2.5 text-[12px] leading-snug text-[color:var(--cm-room-text)]">
              {snapshot.room.roomStatus === "blocked"
                ? t("nav_messenger_room_blocked_notice")
                : snapshot.room.roomStatus === "archived"
                  ? t("nav_messenger_room_archived_notice")
                  : t("nav_messenger_room_restricted_notice")}
              {snapshot.room.isReadonly ? ` ${t("nav_messenger_room_readonly_notice")}` : ""}
            </div>
          ) : null}
          {(managedDirectCallError || (call.errorMessage && !call.panel) || groupCallAutoAcceptNotice) ? (
            <div className="rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2.5 text-[12px] text-[color:var(--cm-room-text)]">
              {managedDirectCallError ?? call.errorMessage ?? groupCallAutoAcceptNotice}
            </div>
          ) : null}
          <p className="mx-auto max-w-[min(100%,22rem)] rounded-full bg-[color:var(--cm-room-primary-soft)] px-3 py-1 text-center text-[10px] leading-snug text-[color:var(--cm-room-text-muted)]">
            {roomTypeLabel}
            {roomJoinLabel ? ` · ${roomJoinLabel}` : ""}
            {roomIdentityLabel ? ` · ${roomIdentityLabel}` : ""}
            {snapshot.room.memberCount > 0 ? ` · ${snapshot.room.memberCount}명` : ""}
            {snapshot.room.myIdentityMode
              ? ` · ${t("nav_messenger_my_identity", {
                  mode: snapshot.room.myIdentityMode === "alias" ? t("nav_messenger_identity_alias") : t("nav_messenger_identity_real"),
                })}`
              : ""}
            {isGroupRoom ? ` · ${groupCallStatusLabel}` : ""}
          </p>
          {snapshot.room.summary?.trim() && !roomSummaryHoldsOnlyTradeOrDeliveryMeta ? (
            <button
              type="button"
              onClick={() => setActiveSheet("info")}
              className="flex w-full items-center justify-between gap-2 rounded-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-2 text-left active:bg-[color:var(--cm-room-primary-soft)]"
            >
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[color:var(--cm-room-text-muted)]">공지</p>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[color:var(--cm-room-text)]">
                  {snapshot.room.summary.trim()}
                </p>
              </div>
              <span className="shrink-0 text-[14px] text-[color:var(--cm-room-text-muted)]">›</span>
            </button>
          ) : null}
          {hasMoreOlderMessages && roomMessages.length > 0 ? (
            <div
              ref={topOlderSentinelRef}
              className="flex min-h-[24px] flex-col items-center justify-center gap-1 py-2"
            >
              {loadingOlderMessages ? (
                <span className="text-[12px] text-ui-muted">이전 대화를 불러오는 중…</span>
              ) : (
                <span className="text-[11px] text-ui-muted">맨 위로 스크롤하면 이전 대화를 불러옵니다</span>
              )}
            </div>
          ) : null}
          {displayRoomMessages.length ? (
            <div className="relative w-full" style={{ height: chatVirtualizer.getTotalSize() }}>
              {chatVirtualizer.getVirtualItems().map((virtualRow) => {
                const index = virtualRow.index;
                const item = displayRoomMessages[index];
                if (!item) return null;
                const prev = index > 0 ? displayRoomMessages[index - 1] : null;
              const gapMs =
                prev && prev.messageType !== "system" && item.messageType !== "system"
                  ? Math.max(0, new Date(item.createdAt).getTime() - new Date(prev.createdAt).getTime())
                  : 0;
              const isNewClusterFromTime = gapMs > CM_CLUSTER_GAP_MS;
              const peerSenderChanged =
                isGroupRoom &&
                !!prev &&
                prev.messageType !== "system" &&
                (prev.senderId ?? "") !== (item.senderId ?? "");
              const mySenderChanged =
                isGroupRoom &&
                !!prev &&
                prev.messageType !== "system" &&
                (prev.senderId ?? "") !== (item.senderId ?? "");

              const showPeerAvatar =
                !item.isMine &&
                item.messageType !== "system" &&
                (!prev ||
                  prev.messageType === "system" ||
                  prev.isMine ||
                  peerSenderChanged ||
                  isNewClusterFromTime);
              const peerAvatar = !item.isMine ? communityMessengerMemberAvatar(roomMembersDisplay, item.senderId) : null;
              const showMyAvatar =
                item.isMine &&
                item.messageType !== "system" &&
                (!prev ||
                  prev.messageType === "system" ||
                  !prev.isMine ||
                  mySenderChanged ||
                  isNewClusterFromTime);
              const showBubbleTail = item.isMine ? showMyAvatar : showPeerAvatar;
              const myAvatar = item.isMine
                ? communityMessengerMemberAvatar(roomMembersDisplay, snapshot.viewerUserId)
                : null;

              const bindMessageInteraction =
                item.messageType === "system"
                  ? {}
                  : item.messageType === "call_stub"
                    ? {
                        onPointerDown: (_e: ReactPointerEvent<HTMLDivElement>) => {
                          messageLongPressItemRef.current = item;
                          messageLongPressTimerRef.current = window.setTimeout(() => {
                            messageLongPressTimerRef.current = null;
                            setCallStubSheet(item);
                          }, 520);
                        },
                        onPointerUp: () => {
                          if (messageLongPressTimerRef.current) {
                            clearTimeout(messageLongPressTimerRef.current);
                            messageLongPressTimerRef.current = null;
                          }
                          messageLongPressItemRef.current = null;
                        },
                        onPointerCancel: () => {
                          if (messageLongPressTimerRef.current) {
                            clearTimeout(messageLongPressTimerRef.current);
                            messageLongPressTimerRef.current = null;
                          }
                          messageLongPressItemRef.current = null;
                        },
                        onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          setCallStubSheet(item);
                        },
                      }
                    : {
                        onPointerDown: (_e: ReactPointerEvent<HTMLDivElement>) => {
                          messageLongPressItemRef.current = item;
                          messageLongPressTimerRef.current = window.setTimeout(() => {
                            messageLongPressTimerRef.current = null;
                            setMessageActionItem(item);
                          }, 520);
                        },
                        onPointerUp: () => {
                          if (messageLongPressTimerRef.current) {
                            clearTimeout(messageLongPressTimerRef.current);
                            messageLongPressTimerRef.current = null;
                          }
                          messageLongPressItemRef.current = null;
                        },
                        onPointerCancel: () => {
                          if (messageLongPressTimerRef.current) {
                            clearTimeout(messageLongPressTimerRef.current);
                            messageLongPressTimerRef.current = null;
                          }
                          messageLongPressItemRef.current = null;
                        },
                        onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                          e.preventDefault();
                          setMessageActionItem(item);
                        },
                      };

              const systemBubbleClass =
                "rounded-[14px] border border-[color:var(--cm-room-divider)]/90 bg-[color:var(--cm-room-primary-soft)] px-3.5 py-1.5 text-center text-[11px] leading-snug text-[color:var(--cm-room-text-muted)] shadow-[0_1px_3px_rgba(115,96,242,0.08)]";

              const viberInnerBody: ReactNode = (() => {
                const mineLight = item.isMine;
                if (item.messageType === "image") {
                  return (
                    <a
                      href={item.content.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={roomPreferences.mediaAutoSaveEnabled ? "community-messenger-image" : undefined}
                      className="block overflow-hidden rounded-[20px]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.content.trim()}
                        alt=""
                        className="max-h-64 max-w-[min(82vw,400px)] w-auto object-cover"
                      />
                    </a>
                  );
                }
                if (item.messageType === "voice") {
                  return (
                    <VoiceMessageBubble
                      src={communityMessengerVoiceAudioSrc(roomId, item)}
                      durationSeconds={item.voiceDurationSeconds ?? 0}
                      isMine={item.isMine}
                      pending={item.pending}
                      waveformPeaks={item.voiceWaveformPeaks ?? null}
                      sentTimeLabel={undefined}
                      mineBubbleStyle={item.isMine ? "viberLight" : "signature"}
                      fallbackSrc={
                        item.pending
                          ? null
                          : /^https?:\/\//i.test(item.content.trim())
                            ? item.content.trim()
                            : null
                      }
                      mediaType={item.voiceMimeType ?? null}
                    />
                  );
                }
                if (item.messageType === "file") {
                  return (
                    <div className="min-w-[200px]">
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${
                            item.isMine ? "bg-sam-surface/20 text-white" : "bg-sam-surface-muted text-sam-fg"
                          }`}
                        >
                          <FileIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate font-semibold ${item.isMine ? "text-white" : "text-[color:var(--cm-room-text)]"}`}>
                            {item.fileName?.trim() || "첨부 파일"}
                          </p>
                          <p
                            className={`mt-1 text-[12px] ${item.isMine ? "text-white/80" : "text-[color:var(--cm-room-text-muted)]"}`}
                          >
                            {formatFileMeta(item.fileMimeType, item.fileSizeBytes)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3">
                        {item.pending ? (
                          <span className={`text-[12px] ${item.isMine ? "text-sam-muted" : "text-sam-muted"}`}>
                            업로드 중…
                          </span>
                        ) : item.content.trim() ? (
                          <a
                            href={item.content.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            download={
                              roomPreferences.mediaAutoSaveEnabled
                                ? item.fileName?.trim() || "community-messenger-file"
                                : undefined
                            }
                            className={`inline-flex rounded-[10px] border px-3 py-2 text-[12px] font-semibold ${
                              item.isMine
                                ? "border-sam-surface/40 bg-sam-surface/15 text-white"
                                : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text)]"
                            }`}
                          >
                            {roomPreferences.mediaAutoSaveEnabled ? "파일 저장" : "파일 열기"}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                }
                if (item.messageType === "call_stub") {
                  const kind: "voice" | "video" = item.callKind === "video" ? "video" : "voice";
                  const stubBusy =
                    roomUnavailable ||
                    (busy != null && String(busy).startsWith("managed-call:")) ||
                    call.busy === "call-start" ||
                    call.busy === "device-prepare" ||
                    call.busy === "call-accept";
                  const CallGlyph = item.callKind === "video" ? VideoCallIcon : VoiceCallIcon;
                  return (
                    <button
                      type="button"
                      disabled={stubBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void requestOutgoingCallFromStub(kind);
                      }}
                      className="flex w-full max-w-full items-center gap-2.5 rounded-[12px] py-1 text-left transition active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          item.isMine ? "bg-sam-surface/20 text-white" : "bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)]"
                        }`}
                        aria-hidden
                      >
                        <CallGlyph className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                          <span
                            className={`text-[14px] font-semibold leading-snug ${
                              item.isMine ? "text-white" : "text-[color:var(--cm-room-text)]"
                            }`}
                          >
                            {item.callKind === "video" ? t("nav_video_call_label") : t("nav_voice_call_label")}
                          </span>
                          <span
                            className={`text-[11px] font-medium leading-snug ${
                              item.isMine ? "text-white/75" : "text-[color:var(--cm-room-text-muted)]"
                            }`}
                          >
                            {tt(formatRoomCallStatus(item.callStatus))}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                }
                return (
                  <div className="flex w-max max-w-full flex-col gap-2">
                    <div className="flex flex-wrap items-end gap-x-2 gap-y-0.5">
                      <p
                        className={`inline-block w-fit max-w-full text-[14px] leading-snug break-keep [overflow-wrap:break-word] ${
                          mineLight ? "text-white" : "text-[color:var(--cm-room-text)]"
                        }`}
                      >
                        {item.content}
                      </p>
                      {item.pending ? (
                        <span
                          className={`shrink-0 text-[11px] ${mineLight ? "text-white/70" : "text-[color:var(--cm-room-text-muted)]"}`}
                        >
                          {t("common_sending")}
                        </span>
                      ) : null}
                    </div>
                    {roomPreferences.linkPreviewEnabled && extractHttpUrls(item.content).length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {extractHttpUrls(item.content)
                          .slice(0, 2)
                          .map((url) => (
                            <a
                              key={`${item.id}:${url}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex max-w-[220px] truncate rounded-[10px] border px-2.5 py-1 text-[11px] ${
                                mineLight
                                  ? "border-sam-surface/35 bg-sam-surface/15 text-white"
                                  : "border-[color:var(--cm-room-divider)] bg-sam-surface text-[color:var(--cm-room-text-muted)]"
                              }`}
                            >
                              {url.replace(/^https?:\/\//i, "")}
                            </a>
                          ))}
                      </div>
                    ) : null}
                  </div>
                );
              })();

              return (
                <div
                  key={item.id}
                  data-index={virtualRow.index}
                  ref={chatVirtualizer.measureElement}
                  id={`cm-room-msg-${item.id}`}
                  className={`absolute left-0 top-0 w-full pb-2.5 flex scroll-mt-24 ${
                    item.messageType === "system" ? "justify-center" : item.isMine ? "justify-end" : "justify-start"
                  }`}
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {item.messageType === "system" ? (
                    <div className="max-w-[92%] px-2">
                      <div className={systemBubbleClass}>
                        <p className="text-center text-[12px] leading-5">{item.content}</p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`flex w-full min-w-0 max-w-full items-end gap-3 ${
                        item.isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {!item.isMine ? (
                        <div className="relative z-[1] w-9 shrink-0 self-end pb-0.5">
                          {showPeerAvatar ? (
                            peerAvatar?.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={peerAvatar.avatarUrl}
                                alt=""
                                className="h-9 w-9 rounded-full border border-sam-fg/10 object-cover shadow-sm"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center text-[14px] font-semibold leading-none text-sam-muted shadow-sm">
                                {peerAvatar?.initials?.slice(0, 1) ?? "?"}
                              </div>
                            )
                          ) : (
                            <div className="h-9 w-9" aria-hidden />
                          )}
                        </div>
                      ) : null}

                      <div
                        className={`flex min-h-0 min-w-0 flex-1 flex-col ${item.isMine ? "items-end" : "items-start"}`}
                      >
                        {isGroupRoom && !item.isMine && showPeerAvatar ? (
                          <p className="mb-0.5 max-w-full pl-0.5 text-[12px] font-semibold text-[color:var(--cm-room-primary)]">
                            {tt(item.senderLabel)}
                          </p>
                        ) : null}

                        <div
                          className={`flex w-full min-w-0 max-w-[min(85vw,70%)] shrink-0 items-end gap-1.5 ${
                            item.isMine ? "flex-row justify-end" : "flex-row justify-start"
                          }`}
                        >
                          {item.isMine ? (
                            <>
                              <span className="shrink-0 self-end pb-1 text-[10px] tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                                {formatTime(item.createdAt)}
                              </span>
                              <div
                                className="inline-block w-max max-w-full shrink-0 align-bottom"
                                {...bindMessageInteraction}
                              >
                                <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
                                  {item.messageType === "image" ? (
                                    viberInnerBody
                                  ) : (
                                    <div className="px-3 py-2.5">{viberInnerBody}</div>
                                  )}
                                </ViberChatBubble>
                              </div>
                            </>
                          ) : (
                            <>
                              <div
                                className="inline-block w-max max-w-full shrink-0 align-bottom"
                                {...bindMessageInteraction}
                              >
                                <ViberChatBubble isMine={item.isMine} showTail={showBubbleTail}>
                                  {item.messageType === "image" ? (
                                    viberInnerBody
                                  ) : (
                                    <div className="px-3 py-2.5">{viberInnerBody}</div>
                                  )}
                                </ViberChatBubble>
                              </div>
                              <span className="shrink-0 self-end pb-1 text-[10px] tabular-nums leading-none text-[color:var(--cm-room-text-muted)]">
                                {formatTime(item.createdAt)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {item.isMine ? (
                        <div className="relative z-[1] w-9 shrink-0 self-end pb-0.5">
                          {showMyAvatar ? (
                            myAvatar?.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={myAvatar.avatarUrl}
                                alt=""
                                className="h-9 w-9 rounded-full border border-sam-fg/10 object-cover shadow-sm"
                              />
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-sam-fg/10 bg-sam-surface text-center text-[14px] font-semibold leading-none text-sam-muted shadow-sm">
                                {myAvatar?.initials?.slice(0, 1) ?? "나"}
                              </div>
                            )
                          ) : (
                            <div className="h-9 w-9" aria-hidden />
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-[13px] text-[color:var(--cm-room-text-muted)]">
              아직 메시지가 없습니다.
              <br />
              <span className="mt-1 inline-block text-[12px]">첫 인사를 남겨보세요.</span>
            </div>
          )}
          <div ref={messageEndRef} />
        </main>
      </div>

      {messageActionItem ? (
        <CommunityMessengerMessageActionSheet
          item={messageActionItem}
          busy={busy}
          roomUnavailable={roomUnavailable}
          onClose={() => setMessageActionItem(null)}
          onCopy={() => void copyMessageText(messageActionItem)}
          onDelete={
            messageActionItem.isMine &&
            messageActionItem.messageType !== "system" &&
            !messageActionItem.pending
              ? () => {
                  setMessageActionItem(null);
                  void deleteRoomMessage(messageActionItem.id);
                }
              : undefined
          }
          onForward={() => void forwardMessage(messageActionItem)}
          onReply={() => {
            setReplyToMessage(messageActionItem);
            setMessageActionItem(null);
            window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
          }}
          onReportMessage={
            !messageActionItem.isMine && messageActionItem.messageType !== "system"
              ? () => {
                  setMessageActionItem(null);
                  void reportTarget({
                    reportType: "message",
                    messageId: messageActionItem.id,
                    reportedUserId: messageActionItem.senderId ?? undefined,
                  });
                }
              : undefined
          }
          onReportUser={
            !messageActionItem.isMine && messageActionItem.senderId && messageActionItem.messageType !== "system"
              ? () => {
                  setMessageActionItem(null);
                  void reportTarget({
                    reportType: "user",
                    reportedUserId: messageActionItem.senderId ?? undefined,
                  });
                }
              : undefined
          }
          onBlockUser={
            !messageActionItem.isMine && messageActionItem.senderId && messageActionItem.messageType !== "system"
              ? () => {
                  setMessageActionItem(null);
                  void blockPeerFromMessage(messageActionItem.senderId!);
                }
              : undefined
          }
        />
      ) : null}
      {callStubSheet ? (
        <div className="fixed inset-0 z-[65] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
          <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={() => setCallStubSheet(null)} />
          <div className="w-full max-h-[min(72vh,480px)] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
            <div className="border-b border-ui-border px-4 py-3">
              <p className="text-[13px] font-semibold text-ui-fg">통화 메시지</p>
              <p className="mt-1 line-clamp-2 text-[12px] text-ui-muted">{callStubSheet.content}</p>
            </div>
            <nav className="flex flex-col p-1" aria-label="통화 로그 작업">
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left text-[15px] text-ui-fg active:bg-ui-hover disabled:opacity-40"
                disabled={
                  roomUnavailable ||
                  (busy != null && String(busy).startsWith("managed-call:")) ||
                  call.busy === "call-start" ||
                  call.busy === "device-prepare" ||
                  call.busy === "call-accept"
                }
                onClick={() => {
                  const kind = callStubSheet.callKind === "video" ? "video" : "voice";
                  setCallStubSheet(null);
                  void requestOutgoingCallFromStub(kind);
                }}
              >
                다시 걸기
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left text-[15px] text-ui-fg active:bg-ui-hover"
                onClick={() => {
                  setCallStubSheet(null);
                  window.requestAnimationFrame(() => composerTextareaRef.current?.focus());
                }}
              >
                메시지 보내기
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left text-[15px] text-ui-fg active:bg-ui-hover"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(callStubSheet.content);
                  } catch {
                    showMessengerSnackbar("복사하지 못했습니다.", { variant: "error" });
                  }
                  setCallStubSheet(null);
                }}
              >
                텍스트 복사
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left text-[15px] text-ui-fg active:bg-ui-hover"
                onClick={() => hideCallStubLocally(callStubSheet.id)}
              >
                이 기기에서만 숨기기
              </button>
              <button
                type="button"
                className="w-full rounded-ui-rect px-4 py-3.5 text-left text-[15px] text-red-600 active:bg-red-50"
                onClick={() => {
                  const id = callStubSheet.id;
                  setCallStubSheet(null);
                  void reportTarget({ reportType: "message", messageId: id });
                }}
              >
                신고
              </button>
            </nav>
            <button
              type="button"
              onClick={() => setCallStubSheet(null)}
              className="mt-1 w-full border-t border-ui-border py-3 text-[14px] font-medium text-ui-muted"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {replyToMessage && !voiceRecording ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-primary-soft)] px-3 py-2">
          <div className="min-w-0 flex-1 border-l-2 border-[color:var(--cm-room-primary)] pl-2">
            <p className="text-[10px] font-semibold text-[color:var(--cm-room-primary)]">답장</p>
            <p className="line-clamp-2 text-[12px] text-[color:var(--cm-room-text-muted)]">
              {replyToMessage.messageType === "text"
                ? replyToMessage.content
                : `(${replyToMessage.messageType})`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReplyToMessage(null)}
            className="shrink-0 rounded-full px-2 py-1 text-[12px] font-medium text-[color:var(--cm-room-text-muted)] active:bg-sam-surface/80"
          >
            취소
          </button>
        </div>
      ) : null}

      <footer
        className={`sticky bottom-0 z-[5] shrink-0 border-t border-[color:var(--cm-room-divider)] px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5 transition-[background-color,box-shadow] duration-300 ${
          voiceRecording
            ? "border-sky-200/90 bg-gradient-to-b from-sky-50/95 via-white to-white shadow-[0_-6px_18px_rgba(42,171,238,0.08)]"
            : "bg-[color:var(--cm-room-header-bg)] shadow-[0_-8px_28px_rgba(17,24,39,0.07)]"
        }`}
      >
        <div className="grid min-h-[48px] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_auto] items-center gap-2">
          {!voiceRecording ? (
            <button
              type="button"
              onClick={() => setActiveSheet("attach")}
              className="flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-[color:var(--cm-room-primary-soft)] text-[color:var(--cm-room-primary)] transition active:opacity-90"
              aria-label="첨부 메뉴"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          ) : (
            <div className="h-10 w-10 shrink-0 self-center" aria-hidden />
          )}
          <div className="col-start-2 flex min-h-0 min-w-0 items-center">
            {!voiceRecording ? (
              <textarea
                ref={composerTextareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onFocus={() => {
                  useMessengerRoomUiStore.getState().setComposerFocused(true);
                }}
                onBlur={() => {
                  useMessengerRoomUiStore.getState().setComposerFocused(false);
                }}
                rows={1}
                disabled={roomUnavailable || busy === "delete-message" || busy === "send-image" || busy === "send-file"}
                placeholder={
                  roomUnavailable
                    ? snapshot.room.isReadonly
                      ? "읽기 전용 방입니다"
                      : snapshot.room.roomStatus === "blocked"
                        ? "차단된 방입니다"
                        : "보관된 방입니다"
                    : "메시지"
                }
                className="max-h-28 min-h-[44px] min-w-0 w-full resize-none rounded-[var(--cm-room-radius-input)] border-0 bg-[color:var(--cm-room-primary-soft)] px-3.5 py-3 text-[14px] leading-normal text-[color:var(--cm-room-text)] outline-none ring-1 ring-transparent placeholder:text-[color:var(--cm-room-text-muted)] focus:ring-[color:var(--cm-room-primary)] disabled:opacity-50"
              />
            ) : voiceHandsFree ? (
              <div className="flex min-h-[44px] min-w-0 w-full items-center gap-2 rounded-ui-rect border-2 border-sam-border bg-sam-app px-3 py-2 shadow-inner ring-1 ring-sam-border">
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[13px] font-semibold leading-none text-sam-fg sm:text-[14px]">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  {formatVoiceRecordTenThousandths(voiceRecordElapsedMs)}
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <VoiceRecordingLiveWaveform peaks={voiceLivePreviewBars} />
                  <span className="shrink-0 text-center text-[12px] font-medium text-sam-fg">잠금 녹음 중</span>
                </div>
                <button
                  type="button"
                  onClick={() => void finalizeVoiceRecording(false)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sam-surface text-sam-muted shadow-sm ring-1 ring-sam-border"
                  aria-label="녹음 삭제"
                >
                  <TrashVoiceIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void finalizeVoiceRecording(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sam-ink text-white shadow-md"
                  aria-label="음성 전송"
                >
                  <SendVoiceArrowIcon className="h-5 w-5 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex min-h-[44px] min-w-0 w-full items-center gap-2 rounded-ui-rect border-2 border-sam-border bg-sam-app px-3 py-2 shadow-inner ring-1 ring-sam-border">
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[13px] font-semibold leading-none text-sam-fg sm:text-[14px]">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
                  {formatVoiceRecordTenThousandths(voiceRecordElapsedMs)}
                </span>
                <VoiceRecordingLiveWaveform peaks={voiceLivePreviewBars} />
                <span
                  className={`min-w-0 shrink-0 text-center text-[13px] ${
                    voiceCancelHint ? "font-semibold text-red-600" : "text-sam-muted"
                  }`}
                >
                  ‹ 밀어서 취소
                </span>
              </div>
            )}
          </div>

          {!voiceHandsFree ? (
            <div className="relative z-[1] flex h-10 w-10 shrink-0 items-center justify-center self-center overflow-visible">
              {voiceRecording && !voiceHandsFree ? (
                <div
                  className={`absolute bottom-full left-1/2 z-10 mb-1.5 flex -translate-x-1/2 flex-col items-center gap-0.5 rounded-ui-rect px-2.5 py-2 shadow-md ${
                    voiceLockHint ? "bg-sam-ink text-white" : "bg-sam-fg/10/88 text-white/75"
                  }`}
                >
                  <span className="text-base leading-none">⌃</span>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 1a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3z" />
                  </svg>
                </div>
              ) : null}
              <button
                type="button"
                onPointerDown={onVoiceMicPointerDown}
                onPointerMove={onVoiceMicPointerMove}
                onPointerUp={onVoiceMicPointerUp}
                onPointerCancel={onVoiceMicPointerCancel}
                disabled={
                  roomUnavailable ||
                  busy === "send" ||
                  busy === "send-image" ||
                  busy === "send-file" ||
                  busy === "send-voice" ||
                  busy === "delete-message" ||
                  Boolean(message.trim()) ||
                  (voiceRecording && voiceHandsFree)
                }
                className={`touch-none flex h-10 w-10 shrink-0 origin-center select-none items-center justify-center rounded-full shadow-md transition-transform duration-200 active:scale-95 disabled:opacity-35 ${
                  voiceRecording && !voiceHandsFree
                    ? "scale-110 bg-sam-ink text-white ring-4 ring-sam-border shadow-lg"
                    : "bg-sam-border-soft text-sam-fg ring-2 ring-sam-border"
                }`}
                aria-label="음성 메시지 — 길게 눌러 녹음, 왼쪽으로 밀어 취소, 위로 밀어 잠금"
                title={
                  message.trim()
                    ? "글자를 지우면 음성 녹음을 사용할 수 있습니다"
                    : "길게 눌러 녹음 · 손 떼면 전송 · 왼쪽 밀면 취소 · 위로 밀면 잠금"
                }
              >
                <MicHoldIcon className="h-6 w-6" />
              </button>
            </div>
          ) : (
            <div className="h-10 w-10 shrink-0 self-center" aria-hidden />
          )}

          {!voiceRecording ? (
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={
                roomUnavailable ||
                !message.trim() ||
                busy === "send" ||
                busy === "send-image" ||
                busy === "send-file" ||
                busy === "send-voice" ||
                busy === "delete-message"
              }
              className="flex h-10 min-w-[40px] shrink-0 items-center justify-center self-center rounded-full bg-[color:var(--cm-room-primary)] px-2.5 text-[13px] font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-40"
              aria-label="전송"
            >
              <SendPlaneIcon className="h-5 w-5 text-white" />
            </button>
          ) : voiceRecording && !voiceHandsFree ? (
            <div className="h-10 min-w-[4.75rem] shrink-0 self-center" aria-hidden />
          ) : (
            <div className="h-10 w-0 min-w-0 max-w-0 shrink-0 self-center overflow-hidden p-0" aria-hidden />
          )}
        </div>
      </footer>

      {activeSheet ? (
        <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/30" onClick={dismissRoomSheet}>
          <div
            className={`max-h-[85vh] w-full overflow-y-auto shadow-[0_-8px_32px_rgba(0,0,0,0.08)] ${
              activeSheet === "attach"
                ? "rounded-t-[14px] border-t border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
                : "mx-auto max-h-[78vh] w-full max-w-[520px] rounded-t-[12px] border border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] p-5"
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            {activeSheet === "attach" ? (
              <>
                <div className="border-b border-[color:var(--cm-room-divider)] px-4 py-3">
                  <p className="text-[13px] font-semibold text-[color:var(--cm-room-text)]">첨부</p>
                  <p className="mt-0.5 text-[12px] text-[color:var(--cm-room-text-muted)]">보낼 항목을 선택하세요</p>
                </div>
                <nav className="flex flex-col" aria-label="첨부">
                  <button
                    type="button"
                    onClick={openImagePicker}
                    disabled={roomUnavailable || busy === "send-image" || !canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left text-[15px] font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    사진 (갤러리)
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCameraPicker}
                    disabled={roomUnavailable || busy === "send-image" || !canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left text-[15px] font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    카메라
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={roomUnavailable || busy === "send-file" || !canUploadAttachments}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left text-[15px] font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    파일
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendLocationMessage()}
                    disabled={roomUnavailable}
                    className="flex min-h-[48px] w-full items-center justify-between border-b border-[color:var(--cm-room-divider)] px-4 py-3 text-left text-[15px] font-medium text-[color:var(--cm-room-text)] active:bg-[color:var(--cm-room-primary-soft)] disabled:opacity-40"
                  >
                    위치
                    <span className="text-[color:var(--cm-room-text-muted)]">›</span>
                  </button>
                </nav>
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="w-full rounded-[10px] bg-[color:var(--cm-room-chat-bg)] px-3 py-2.5 text-center text-[12px] font-medium text-[color:var(--cm-room-text-muted)] active:opacity-90"
                  >
                    사진·파일 모아보기 · 채팅방 정보는 서랍에서
                  </button>
                </div>
                <button
                  type="button"
                  onClick={dismissRoomSheet}
                  className="mt-1 w-full border-t border-[color:var(--cm-room-divider)] py-3 text-[14px] font-medium text-[color:var(--cm-room-text-muted)] active:bg-[color:var(--cm-room-primary-soft)]"
                >
                  취소
                </button>
              </>
            ) : null}

            {activeSheet === "menu" ? (
              <>
                <p className="text-[13px] font-medium text-sam-fg">채팅방 서랍</p>
                <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">{snapshot.room.title}</h2>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">참여자</p>
                      <p className="mt-1 text-[18px] font-semibold text-sam-fg">{snapshot.room.memberCount}</p>
                      <p className="mt-1 text-[12px] text-sam-muted">{myRoleLabel}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">공유 항목</p>
                      <p className="mt-1 text-[18px] font-semibold text-sam-fg">
                        {photoMessageCount + voiceMessageCount + fileMessageCount + linkMessageCount}
                      </p>
                      <p className="mt-1 text-[12px] text-sam-muted">
                        사진 {photoMessageCount} · 음성 {voiceMessageCount} · 파일 {fileMessageCount} · 링크 {linkMessageCount}
                      </p>
                    </div>
                  </div>

                  {isGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">그룹 통화 상태</p>
                      <p className="mt-1 text-[16px] font-semibold text-sam-fg">{groupCallStatusLabel}</p>
                      <p className="mt-1 text-[12px] text-sam-muted">
                        {activeGroupCall
                          ? `${activeGroupCall.callKind === "video" ? "영상" : "음성"} · ${activeGroupCall.participants.length}명 참여`
                          : canStartGroupCall
                            ? "지금 시작 가능"
                            : "시작 권한 없음"}
                      </p>
                    </div>
                  ) : null}

                  {roomNotice ? (
                    <button
                      type="button"
                      onClick={() => openInfoSheet("notice")}
                      className="flex w-full items-start justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-sam-fg">공지</p>
                        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-sam-fg">{roomNotice}</p>
                      </div>
                      <span className="pl-3 text-[18px] text-sam-meta">›</span>
                    </button>
                  ) : null}

                  {managementEventMessages.length ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <p className="text-[14px] font-semibold text-sam-fg">운영 이력</p>
                      <div className="mt-3 space-y-2">
                        {managementEventMessages.map((event) => {
                          const summary = describeManagementEvent(event.content);
                          return (
                            <button
                              key={event.id}
                              type="button"
                              onClick={() => scrollToRoomMessage(event.id)}
                              className="flex w-full items-start justify-between gap-3 rounded-ui-rect bg-sam-app px-3 py-3 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-sam-fg">{summary.title}</p>
                                <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-sam-muted">{summary.detail}</p>
                              </div>
                              <span className="shrink-0 text-[11px] text-sam-meta">{formatTime(event.createdAt)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <p className="px-1 text-[12px] font-semibold text-sam-muted">대화방</p>
                    <button
                      type="button"
                      onClick={() => setActiveSheet("members")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">{isGroupRoom ? "참여자 및 초대" : "대화상대 정보"}</p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {isGroupRoom
                            ? `${snapshot.room.memberCount}명 · ${canInviteMembers ? "초대 가능" : "초대 제한"}`
                            : "프로필 · 통화"}
                        </p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openInfoSheet()}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">채팅방 정보</p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {roomNotice ? "공지 있음" : "공지 없음"}
                          {snapshot.room.ownerLabel ? ` · 방장 ${snapshot.room.ownerLabel}` : ""}
                        </p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="px-1 text-[12px] font-semibold text-sam-muted">콘텐츠</p>
                    <button
                      type="button"
                      onClick={() => {
                        setRoomSearchQuery("");
                        setActiveSheet("search");
                      }}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">대화 내 검색</p>
                        <p className="mt-1 text-[12px] text-sam-muted">메시지 · 보낸 사람 · 통화 기록</p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSheet("media")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">사진·음성</p>
                        <p className="mt-1 text-[12px] text-sam-muted">사진 {photoMessageCount}개 · 음성 {voiceMessageCount}개</p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSheet("files")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">파일</p>
                        <p className="mt-1 text-[12px] text-sam-muted">파일 {fileMessageCount}개</p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSheet("links")}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">링크</p>
                        <p className="mt-1 text-[12px] text-sam-muted">링크 {linkMessageCount}개</p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <p className="px-1 text-[12px] font-semibold text-sam-muted">설정</p>
                    <button
                      type="button"
                      onClick={() => void toggleRoomMute()}
                      disabled={busy === "room-mute"}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">
                          {snapshot.room.isMuted ? "이 채팅방 알림 켜기" : "이 채팅방 알림 끄기"}
                        </p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {snapshot.room.isMuted ? "개별 알림 꺼짐" : "개별 알림 켜짐"}
                        </p>
                      </div>
                      <span
                        className={`rounded-ui-rect px-2 py-1 text-[11px] font-semibold ${
                          snapshot.room.isMuted ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-muted"
                        }`}
                      >
                        {busy === "room-mute" ? "저장 중" : snapshot.room.isMuted ? "꺼짐" : "켜짐"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleRoomArchive()}
                      disabled={busy === "room-archive" || !communityMessengerRoomIsGloballyUsable(snapshot.room)}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">
                          {!snapshot.room.isArchivedByViewer ? "이 채팅방 보관" : "이 채팅방 보관 해제"}
                        </p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {!snapshot.room.isArchivedByViewer ? "현재 채팅 목록" : "현재 보관함"}
                        </p>
                      </div>
                      <span
                        className={`rounded-ui-rect px-2 py-1 text-[11px] font-semibold ${
                          !snapshot.room.isArchivedByViewer ? "bg-sam-surface-muted text-sam-muted" : "bg-sam-ink text-white"
                        }`}
                      >
                        {busy === "room-archive" ? "저장 중" : !snapshot.room.isArchivedByViewer ? "활성" : "보관됨"}
                      </span>
                    </button>
                  </div>

                  {!isGroupRoom ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[12px] font-semibold text-sam-muted">통화</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            dismissRoomSheet();
                            void startManagedDirectCall("voice");
                          }}
                          disabled={roomUnavailable || busy === "managed-call:voice" || busy === "managed-call:video"}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left text-[15px] font-semibold text-sam-fg disabled:opacity-40"
                        >
                          음성 통화
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            dismissRoomSheet();
                            void startManagedDirectCall("video");
                          }}
                          disabled={roomUnavailable || busy === "managed-call:voice" || busy === "managed-call:video"}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left text-[15px] font-semibold text-sam-fg disabled:opacity-40"
                        >
                          {t("nav_video_call_label")}
                        </button>
                      </div>
                    </div>
                  ) : isGroupRoom ? (
                    <div className="space-y-2">
                      <p className="px-1 text-[12px] font-semibold text-sam-muted">통화</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void startGroupCall("voice")}
                          disabled={!canStartGroupCall || call.busy === "call-start" || call.busy === "device-prepare"}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left text-[15px] font-semibold text-sam-fg disabled:opacity-40"
                        >
                          그룹 음성 통화
                        </button>
                        <button
                          type="button"
                          onClick={() => void startGroupCall("video")}
                          disabled={!canStartGroupCall || call.busy === "call-start" || call.busy === "device-prepare"}
                          className="rounded-ui-rect border border-sam-border px-4 py-4 text-left text-[15px] font-semibold text-sam-fg disabled:opacity-40"
                        >
                          그룹 영상 통화
                        </button>
                      </div>
                      {!canStartGroupCall ? (
                        <p className="px-1 text-[12px] text-sam-muted">시작 권한 없음</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <p className="px-1 text-[12px] font-semibold text-sam-muted">기타</p>
                    {isGroupRoom ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (isOwner && isPrivateGroupRoom) {
                            openMembersForOwnerTransfer();
                            return;
                          }
                          void leaveRoom();
                        }}
                        disabled={busy === "leave-room"}
                        className="w-full rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left text-[15px] font-semibold text-red-700 disabled:opacity-40"
                      >
                        {busy === "leave-room"
                          ? t("nav_messenger_leaving")
                          : isOwner && isPrivateGroupRoom
                            ? "방장 위임 후 나가기"
                            : t("nav_messenger_leave_group_room")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        dismissRoomSheet();
                        void reportTarget({ reportType: "room" });
                      }}
                      className="w-full rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left text-[15px] font-semibold text-red-700"
                    >
                      {t("nav_messenger_report")}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {activeSheet === "members" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">{t("nav_messenger_participants")}</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">{t("nav_messenger_participating_members")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 grid gap-2">
                  {isGroupRoom ? (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="text-[11px] font-medium text-sam-muted">참여자</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">{snapshot.room.memberCount}명</p>
                        <p className="mt-1 text-[12px] text-sam-muted">{roomTypeLabel}</p>
                      </div>
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="text-[11px] font-medium text-sam-muted">운영진</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">방장 1 · 관리자 {groupAdminCount}</p>
                        <p className="mt-1 text-[12px] text-sam-muted">현재 그룹 운영 가능 인원</p>
                      </div>
                      <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                        <p className="text-[11px] font-medium text-sam-muted">초대 상태</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">{canInviteMembers ? "가능" : "제한"}</p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          닉네임 프로필 {aliasProfileCount}명
                          {roomMembersDisplay.length < snapshot.room.memberCount ? " · 표시 범위 기준" : ""}
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {isGroupRoom && snapshot.room.memberCount > roomMembersDisplay.length ? (
                    <p className="text-[12px] leading-5 text-sam-muted">
                      참여자 {snapshot.room.memberCount}명 중 {roomMembersDisplay.length}명 프로필을 불러왔습니다. 나머지는
                      아래에서 더 불러올 수 있습니다.
                    </p>
                  ) : null}
                  {isGroupRoom && membersListNextOffset !== null ? (
                    <button
                      type="button"
                      onClick={() => void loadMoreRoomMembers()}
                      disabled={membersPagingBusy}
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-app px-4 py-3 text-[14px] font-medium text-sam-fg disabled:opacity-50"
                    >
                      {membersPagingBusy ? "불러오는 중…" : "멤버 더 불러오기"}
                    </button>
                  ) : null}
                  {isOwner && isPrivateGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="text-[13px] font-semibold text-sam-fg">운영 안내</p>
                      <p className="mt-1 text-[12px] leading-5 text-sam-muted">
                        멤버를 선택하면 방장 위임, 관리자 지정, 내보내기를 같은 메뉴에서 바로 처리할 수 있습니다.
                      </p>
                    </div>
                  ) : null}
                  {sortedMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        if (messengerUserIdsEqual(member.id, snapshot.viewerUserId)) return;
                        setMemberActionTarget(member);
                      }}
                      className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[14px] font-semibold text-sam-fg">{member.label}</p>
                            {snapshot.room.ownerUserId && messengerUserIdsEqual(member.id, snapshot.room.ownerUserId) ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 text-[10px] font-semibold text-sam-fg">
                                방장
                              </span>
                            ) : null}
                            {member.memberRole === "admin" ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 text-[10px] font-semibold text-sam-fg">관리자</span>
                            ) : null}
                            {messengerUserIdsEqual(member.id, snapshot.viewerUserId) ? (
                              <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-0.5 text-[10px] font-semibold text-sam-fg">나</span>
                            ) : null}
                            {member.identityMode === "alias" ? (
                              <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-0.5 text-[10px] font-semibold text-sam-fg">닉네임</span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[12px] text-sam-muted">
                            {member.subtitle ?? (member.identityMode === "alias" ? t("nav_messenger_member_alias_joined") : t("nav_messenger_member_joined"))}
                          </p>
                          {!messengerUserIdsEqual(member.id, snapshot.viewerUserId) ? (
                            <p className="mt-2 text-[11px] text-sam-meta">
                              {isPrivateGroupRoom ? "탭해서 대화, 역할, 내보내기" : "탭해서 대화와 프로필 액션"}
                            </p>
                          ) : null}
                        </div>
                        {!messengerUserIdsEqual(member.id, snapshot.viewerUserId) ? (
                          <span className="pt-1 text-[18px] leading-none text-sam-meta">›</span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
                {isPrivateGroupRoom ? (
                  <div className="mt-4 rounded-ui-rect bg-sam-app p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold text-sam-fg">{t("nav_messenger_invite_members")}</p>
                        <p className="mt-1 text-[12px] text-sam-muted">
                          {canInviteMembers ? t("nav_messenger_invite_members_desc") : "이 방은 현재 멤버 초대가 제한되어 있습니다."}
                        </p>
                      </div>
                      <span className="rounded-ui-rect bg-sam-surface px-2 py-1 text-[11px] font-semibold text-sam-muted">
                        {myRoleLabel}
                      </span>
                    </div>
                    {canInviteMembers && inviteCandidates.length ? (
                      <>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-[12px] text-sam-muted">초대 후보 {filteredInviteCandidates.length}명 · 선택 {inviteIds.length}명</p>
                          {inviteIds.length ? (
                            <button
                              type="button"
                              onClick={() => setInviteIds([])}
                              className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1 text-[11px] font-medium text-sam-muted"
                            >
                              선택 해제
                            </button>
                          ) : null}
                        </div>
                        <input
                          value={inviteSearchQuery}
                          onChange={(e) => setInviteSearchQuery(e.target.value)}
                          placeholder="친구 검색"
                          className="mt-3 h-10 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[13px] outline-none focus:border-sam-border"
                        />
                        {selectedInviteCandidates.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedInviteCandidates.map((friend) => (
                              <button
                                key={`invite-selected-${friend.id}`}
                                type="button"
                                onClick={() => setInviteIds((prev) => prev.filter((id) => id !== friend.id))}
                                className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-1.5 text-[12px] font-medium text-sam-fg"
                              >
                                {friend.label} 닫기
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    <div className="mt-3 grid gap-2">
                      {canInviteMembers && filteredInviteCandidates.length ? (
                        filteredInviteCandidates.map((friend) => (
                          <label
                            key={friend.id}
                            className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3"
                          >
                            <div>
                              <p className="text-[13px] font-semibold text-sam-fg">{friend.label}</p>
                              <p className="text-[12px] text-sam-muted">{friend.subtitle ?? t("nav_messenger_friend")}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={inviteIds.includes(friend.id)}
                              onChange={(e) => {
                                setInviteIds((prev) =>
                                  e.target.checked ? [...prev, friend.id] : prev.filter((id) => id !== friend.id)
                                );
                              }}
                              className="h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border"
                            />
                          </label>
                        ))
                      ) : canInviteMembers && inviteCandidates.length ? (
                        <p className="text-[12px] text-sam-muted">검색 결과가 없습니다.</p>
                      ) : canInviteMembers ? (
                        <p className="text-[12px] text-sam-muted">{t("nav_messenger_no_invitable_friends")}</p>
                      ) : (
                        <p className="text-[12px] text-sam-muted">친구 초대는 방장이 허용한 방에서만 사용할 수 있습니다.</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void inviteMembers()}
                      disabled={!canInviteMembers || inviteIds.length === 0 || busy === "invite"}
                      className="mt-3 rounded-ui-rect bg-sam-ink px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
                    >
                      {t("nav_messenger_invite_selected_friends")}
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeSheet === "info" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">{t("nav_messenger_room_info")}</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">{t("nav_messenger_room_details")}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">참여자</p>
                      <p className="mt-1 text-[16px] font-semibold text-sam-fg">{snapshot.room.memberCount}명</p>
                      <p className="mt-1 text-[12px] text-sam-muted">{roomTypeLabel}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">내 상태</p>
                      <p className="mt-1 text-[16px] font-semibold text-sam-fg">{myRoleLabel}</p>
                      <p className="mt-1 text-[12px] text-sam-muted">{roomIdentityLabel || "기본 프로필"}</p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">참여 방식</p>
                      <p className="mt-1 text-[16px] font-semibold text-sam-fg">{roomJoinLabel || "기본 입장"}</p>
                      <p className="mt-1 text-[12px] text-sam-muted">
                        {isOpenGroupRoom ? (snapshot.room.isDiscoverable ? "검색 노출" : "비공개") : "초대 기반"}
                      </p>
                    </div>
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                      <p className="text-[11px] font-medium text-sam-muted">공유 항목</p>
                      <p className="mt-1 text-[16px] font-semibold text-sam-fg">
                        {photoMessageCount + voiceMessageCount + fileMessageCount + linkMessageCount}개
                      </p>
                      <p className="mt-1 text-[12px] text-sam-muted">
                        사진 {photoMessageCount} · 파일 {fileMessageCount}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSheet("members")}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="text-[11px] text-sam-muted">참여자</p>
                      <p className="mt-1 text-[13px] font-semibold text-sam-fg">{isGroupRoom ? "멤버 관리" : "상대 정보"}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSheet("media")}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="text-[11px] text-sam-muted">미디어</p>
                      <p className="mt-1 text-[13px] font-semibold text-sam-fg">사진·음성</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRoomSearchQuery("");
                        setActiveSheet("search");
                      }}
                      className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                    >
                      <p className="text-[11px] text-sam-muted">검색</p>
                      <p className="mt-1 text-[13px] font-semibold text-sam-fg">대화 내 검색</p>
                    </button>
                  </div>

                  <div className="rounded-ui-rect border border-sam-border p-4">
                    <p className="text-[14px] font-semibold text-sam-fg">기본 정보</p>
                    <p className="mt-3 text-[14px] font-semibold text-sam-fg">{snapshot.room.title}</p>
                    <p className="mt-2 text-[13px] leading-5 text-sam-muted">
                      {roomSummaryHoldsOnlyTradeOrDeliveryMeta
                        ? roomSubtitle || t("nav_messenger_room_no_intro")
                        : snapshot.room.summary?.trim() || roomSubtitle || t("nav_messenger_room_no_intro")}
                    </p>
                    <div className="mt-4 space-y-2 border-t border-sam-border-soft pt-4 text-[13px] text-sam-fg">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">채팅방 종류</span>
                        <span className="font-medium text-sam-fg">{roomTypeLabel}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">참여자</span>
                        <span className="font-medium text-sam-fg">{snapshot.room.memberCount}명</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">방장</span>
                        <span className="font-medium text-sam-fg">{snapshot.room.ownerLabel || "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sam-muted">내 역할</span>
                        <span className="font-medium text-sam-fg">{myRoleLabel}</span>
                      </div>
                      {snapshot.room.memberLimit ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">최대 인원</span>
                          <span className="font-medium text-sam-fg">{snapshot.room.memberLimit}명</span>
                        </div>
                      ) : null}
                      {roomJoinLabel ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">참여 방식</span>
                          <span className="font-medium text-sam-fg">{roomJoinLabel}</span>
                        </div>
                      ) : null}
                      {roomIdentityLabel ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">표시 이름</span>
                          <span className="font-medium text-sam-fg">{roomIdentityLabel}</span>
                        </div>
                      ) : null}
                      {isOpenGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">검색 노출</span>
                          <span className="font-medium text-sam-fg">{snapshot.room.isDiscoverable ? "허용" : "비공개"}</span>
                        </div>
                      ) : null}
                      {isOpenGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">비밀번호</span>
                          <span className="font-medium text-sam-fg">{snapshot.room.requiresPassword ? "사용" : "없음"}</span>
                        </div>
                      ) : null}
                      {isPrivateGroupRoom ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">멤버 초대</span>
                          <span className="font-medium text-sam-fg">{snapshot.room.allowMemberInvite ? "허용" : "제한"}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {isGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <p className="text-[14px] font-semibold text-sam-fg">통화 상태</p>
                      <div className="mt-3 space-y-2 text-[13px] text-sam-fg">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">현재 상태</span>
                          <span className="font-medium text-sam-fg">{groupCallStatusLabel}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sam-muted">시작 권한</span>
                          <span className="font-medium text-sam-fg">{canStartGroupCall ? "가능" : "제한"}</span>
                        </div>
                        {activeGroupCall ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sam-muted">현재 참여자</span>
                            <span className="font-medium text-sam-fg">{activeGroupCall.participants.length}명</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-ui-rect border border-sam-border p-4">
                    <p className="text-[14px] font-semibold text-sam-fg">공유된 항목</p>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSheet("media")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="text-[11px] text-sam-muted">사진</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">{photoMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSheet("media")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="text-[11px] text-sam-muted">음성</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">{voiceMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSheet("files")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="text-[11px] text-sam-muted">파일</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">{fileMessageCount}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSheet("links")}
                        className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                      >
                        <p className="text-[11px] text-sam-muted">링크</p>
                        <p className="mt-1 text-[16px] font-semibold text-sam-fg">{linkMessageCount}</p>
                      </button>
                    </div>
                  </div>

                  {isPrivateGroupRoom ? (
                    <div className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-sam-fg">운영</p>
                          <p className="mt-1 text-[12px] text-sam-muted">
                            방장 {snapshot.room.ownerLabel ? `· ${snapshot.room.ownerLabel}` : ""} · 관리자 {groupAdminCount}명
                          </p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 text-[11px] font-semibold text-sam-fg">{myRoleLabel}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">공지</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{privateGroupNoticeStatusLabel}</p>
                          <p className="mt-1 text-[11px] text-sam-meta">상단 고정 상태</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">허용 권한</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{allowedPrivateGroupPermissionCount}/6</p>
                          <p className="mt-1 text-[11px] text-sam-meta">운영 설정 반영</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">운영 이력</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{managementEventMessages.length}건</p>
                          <p className="mt-1 text-[11px] text-sam-meta">역할 변경 기록</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => openInfoSheet("notice")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="text-[11px] text-sam-muted">운영</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">공지</p>
                          <p className="mt-1 text-[11px] text-sam-meta">등록 및 수정</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => openInfoSheet("permissions")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="text-[11px] text-sam-muted">운영</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">권한</p>
                          <p className="mt-1 text-[11px] text-sam-meta">허용 범위 조정</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => openInfoSheet("history")}
                          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                        >
                          <p className="text-[11px] text-sam-muted">운영</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">이력</p>
                          <p className="mt-1 text-[11px] text-sam-meta">시스템 기록 보기</p>
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveSheet("members")}
                          className="rounded-ui-rect border border-sam-border px-4 py-3 text-left text-[13px] font-semibold text-sam-fg"
                        >
                          {isOwner ? "멤버 · 위임" : "멤버 · 초대"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isOwner) {
                              setActiveSheet("members");
                              return;
                            }
                            void leaveRoom();
                          }}
                          disabled={busy === "leave-room"}
                          className="rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 text-left text-[13px] font-semibold text-red-700 disabled:opacity-40"
                        >
                          {busy === "leave-room"
                            ? t("nav_messenger_leaving")
                            : isOwner
                              ? "방장 위임 후 나가기"
                              : t("nav_messenger_leave_group_room")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isPrivateGroupRoom ? (
                    <div ref={groupNoticeSectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-sam-fg">그룹 공지</p>
                          <p className="mt-1 text-[12px] text-sam-muted">
                            {privateGroupNotice ? "상단과 서랍에 노출 중" : "등록된 공지 없음"}
                          </p>
                        </div>
                        {snapshot.room.noticeUpdatedAt ? (
                          <span className="rounded-ui-rect bg-sam-surface-muted px-2 py-1 text-[11px] font-semibold text-sam-fg">
                            {formatTime(snapshot.room.noticeUpdatedAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">상태</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{privateGroupNoticeStatusLabel}</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">노출</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{privateGroupNotice ? "상단 표시" : "미설정"}</p>
                        </div>
                      </div>
                      {canEditGroupNotice ? (
                        <div className="mt-3 grid gap-3">
                          <textarea
                            value={privateGroupNoticeDraft}
                            onChange={(e) => setPrivateGroupNoticeDraft(e.target.value)}
                            rows={4}
                            placeholder="그룹 공지를 입력하세요"
                            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-[14px] outline-none focus:border-sam-border"
                          />
                          <button
                            type="button"
                            onClick={() => void savePrivateGroupNotice()}
                            disabled={busy === "group-notice"}
                            className="rounded-ui-rect bg-sam-ink px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
                          >
                            {busy === "group-notice" ? "저장 중" : "공지 저장"}
                          </button>
                        </div>
                      ) : privateGroupNotice ? (
                        <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="whitespace-pre-wrap text-[13px] leading-5 text-sam-fg">{privateGroupNotice}</p>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-3 py-4 text-[12px] text-sam-muted">
                          아직 등록된 그룹 공지가 없습니다.
                        </div>
                      )}
                    </div>
                  ) : null}

                  {isPrivateGroupRoom ? (
                    <div ref={groupPermissionsSectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-sam-fg">권한 설정</p>
                          <p className="mt-1 text-[12px] text-sam-muted">허용 {allowedPrivateGroupPermissionCount}개 · 제한 {6 - allowedPrivateGroupPermissionCount}개</p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 text-[11px] font-semibold text-sam-fg">{myRoleLabel}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">허용</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{allowedPrivateGroupPermissionCount}개</p>
                        </div>
                        <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                          <p className="text-[11px] text-sam-muted">제한</p>
                          <p className="mt-1 text-[13px] font-semibold text-sam-fg">{6 - allowedPrivateGroupPermissionCount}개</p>
                        </div>
                      </div>
                      <div className="mt-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                        <p className="text-[12px] font-semibold text-sam-fg">권한 요약</p>
                        <div className="mt-2 space-y-1.5 text-[12px] text-sam-muted">
                          {privateGroupPermissionRows.map((row) => (
                            <div key={row.label} className="flex items-center justify-between gap-3">
                              <span>{row.label}</span>
                              <span className="font-medium text-sam-fg">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="text-[13px] font-medium text-sam-fg">일반 멤버 초대 허용</span>
                          <input type="checkbox" checked={groupAllowMemberInvite} onChange={(e) => setGroupAllowMemberInvite(e.target.checked)} disabled={!canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="text-[13px] font-medium text-sam-fg">관리자 초대 허용</span>
                          <input type="checkbox" checked={groupAllowAdminInvite} onChange={(e) => setGroupAllowAdminInvite(e.target.checked)} disabled={!canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="text-[13px] font-medium text-sam-fg">관리자 내보내기 허용</span>
                          <input type="checkbox" checked={groupAllowAdminKick} onChange={(e) => setGroupAllowAdminKick(e.target.checked)} disabled={!canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="text-[13px] font-medium text-sam-fg">관리자 공지 수정 허용</span>
                          <input type="checkbox" checked={groupAllowAdminEditNotice} onChange={(e) => setGroupAllowAdminEditNotice(e.target.checked)} disabled={!canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="text-[13px] font-medium text-sam-fg">일반 멤버 파일 업로드 허용</span>
                          <input type="checkbox" checked={groupAllowMemberUpload} onChange={(e) => setGroupAllowMemberUpload(e.target.checked)} disabled={!canManageGroupPermissions} />
                        </label>
                        <label className="flex items-center justify-between rounded-ui-rect border border-sam-border px-3 py-3">
                          <span className="text-[13px] font-medium text-sam-fg">일반 멤버 통화 시작 허용</span>
                          <input type="checkbox" checked={groupAllowMemberCall} onChange={(e) => setGroupAllowMemberCall(e.target.checked)} disabled={!canManageGroupPermissions} />
                        </label>
                      </div>
                      {canManageGroupPermissions ? (
                        <button
                          type="button"
                          onClick={() => void savePrivateGroupPermissions()}
                          disabled={busy === "group-permissions"}
                          className="mt-3 rounded-ui-rect bg-sam-ink px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
                        >
                          {busy === "group-permissions" ? "저장 중" : "권한 저장"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {managementEventMessages.length ? (
                    <div ref={groupHistorySectionRef} className="rounded-ui-rect border border-sam-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-sam-fg">운영 이력</p>
                          <p className="mt-1 text-[12px] text-sam-muted">방장 위임, 관리자 지정, 공지 수정 기록을 확인합니다.</p>
                        </div>
                        <span className="rounded-ui-rect border border-sam-border bg-sam-surface px-2 py-1 text-[11px] font-semibold text-sam-fg">
                          {managementEventMessages.length}건
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {managementEventMessages.map((event) => {
                          const summary = describeManagementEvent(event.content);
                          return (
                            <button
                              key={`info:${event.id}`}
                              type="button"
                              onClick={() => scrollToRoomMessage(event.id)}
                              className="flex w-full items-start justify-between gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-[12px] font-semibold text-sam-fg">{summary.title}</p>
                                <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-sam-muted">{summary.detail}</p>
                              </div>
                              <span className="shrink-0 text-[11px] text-sam-meta">{formatTime(event.createdAt)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {isOpenGroupRoom ? (
                    <div className="rounded-ui-rect bg-sam-app p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[14px] font-semibold text-sam-fg">{t("nav_messenger_open_group_settings")}</p>
                          <p className="mt-1 text-[12px] text-sam-muted">
                            {isOwner ? t("nav_messenger_open_group_owner_desc") : t("nav_messenger_open_group_view_desc")}
                          </p>
                        </div>
                        <span className="rounded-ui-rect bg-sam-surface px-2 py-1 text-[11px] font-semibold text-sam-muted">
                          {isOwner ? t("nav_messenger_owner_label") : t("nav_messenger_my_role_label", { role: snapshot.myRole })}
                        </span>
                      </div>

                      {isOwner ? (
                        <div className="mt-3 grid gap-3">
                          <input
                            value={openGroupTitle}
                            onChange={(e) => setOpenGroupTitle(e.target.value)}
                            placeholder={t("nav_messenger_room_title_placeholder")}
                            className="h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[14px] outline-none focus:border-sam-border"
                          />
                          <textarea
                            value={openGroupSummary}
                            onChange={(e) => setOpenGroupSummary(e.target.value)}
                            rows={3}
                            placeholder={t("nav_messenger_room_intro_placeholder")}
                            className="w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3 text-[14px] outline-none focus:border-sam-border"
                          />
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid grid-cols-2 gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2">
                              <button
                                type="button"
                                onClick={() => setOpenGroupJoinPolicy("password")}
                                className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "password" ? "bg-[#111827] text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                              >
                                {t("nav_messenger_password_short")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenGroupJoinPolicy("free");
                                  setOpenGroupPassword("");
                                }}
                                className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupJoinPolicy === "free" ? "bg-[#111827] text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                              >
                                {t("nav_messenger_join_free")}
                              </button>
                            </div>
                            <input
                              value={openGroupMemberLimit}
                              onChange={(e) => setOpenGroupMemberLimit(e.target.value.replace(/[^0-9]/g, ""))}
                              placeholder={t("nav_messenger_member_limit_placeholder")}
                              className="h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[14px] outline-none focus:border-sam-border"
                            />
                          </div>
                          {openGroupJoinPolicy === "password" ? (
                            <input
                              value={openGroupPassword}
                              onChange={(e) => setOpenGroupPassword(e.target.value)}
                              placeholder={t("nav_messenger_new_password_placeholder")}
                              className="h-11 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 text-[14px] outline-none focus:border-sam-border"
                            />
                          ) : null}
                          <div className="grid grid-cols-2 gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-2">
                            <button
                              type="button"
                              onClick={() => setOpenGroupIdentityPolicy("real_name")}
                              className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "real_name" ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                            >
                              {t("nav_messenger_identity_real")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setOpenGroupIdentityPolicy("alias_allowed")}
                              className={`rounded-ui-rect px-3 py-2 text-[12px] font-semibold ${openGroupIdentityPolicy === "alias_allowed" ? "bg-sam-ink text-white" : "bg-sam-surface-muted text-sam-fg"}`}
                            >
                              {t("nav_messenger_identity_alias")}
                            </button>
                          </div>
                          <label className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-3">
                            <div>
                              <p className="text-[13px] font-semibold text-sam-fg">{t("nav_messenger_discoverable_label")}</p>
                              <p className="mt-1 text-[12px] text-sam-muted">{t("nav_messenger_discoverable_desc")}</p>
                            </div>
                            <input
                              type="checkbox"
                              checked={openGroupDiscoverable}
                              onChange={(e) => setOpenGroupDiscoverable(e.target.checked)}
                              className="h-4 w-4 rounded border-sam-border text-sam-fg focus:ring-sam-border"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void saveOpenGroupSettings()}
                            disabled={busy === "open-group-settings" || !openGroupTitle.trim()}
                            className="rounded-ui-rect bg-[#111827] px-4 py-3 text-[13px] font-semibold text-white disabled:opacity-40"
                          >
                            {busy === "open-group-settings" ? t("nav_messenger_saving_settings") : t("nav_messenger_save_room_settings")}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => void leaveRoom()}
                            disabled={busy === "leave-room"}
                            className="rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-3 text-[13px] font-semibold text-red-700 disabled:opacity-40"
                          >
                            {busy === "leave-room" ? t("nav_messenger_leaving") : t("nav_messenger_leave_group_room")}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {activeSheet === "search" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">이 방에서 검색</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">대화 내 검색</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>
                <input
                  value={roomSearchQuery}
                  onChange={(e) => setRoomSearchQuery(e.target.value)}
                  placeholder="키워드 (보낸 사람·내용)"
                  className="mt-4 h-11 w-full rounded-ui-rect border border-sam-border px-3 text-[14px] outline-none focus:border-sam-border"
                  autoFocus
                />
                <div className="mt-3 max-h-[50vh] space-y-2 overflow-y-auto">
                  {messageSearchResults.length ? (
                    messageSearchResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => scrollToRoomMessage(m.id)}
                        className="w-full rounded-ui-rect border border-sam-border-soft bg-sam-app px-3 py-3 text-left"
                      >
                        <p className="text-[12px] font-medium text-sam-muted">{tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                        <p className="mt-1 line-clamp-2 text-[14px] text-sam-fg">{communityMessengerMessageSearchText(m)}</p>
                      </button>
                    ))
                  ) : (
                    <p className="py-6 text-center text-[13px] text-sam-muted">검색 결과가 없습니다.</p>
                  )}
                </div>
              </>
            ) : null}

            {activeSheet === "media" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">이 방 미디어</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">사진·음성</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                    <p className="text-[11px] font-medium text-sam-muted">사진</p>
                    <p className="mt-1 text-[16px] font-semibold text-sam-fg">{photoMessageCount}</p>
                    <p className="mt-1 text-[12px] text-sam-muted">이미지와 사진 링크</p>
                  </div>
                  <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                    <p className="text-[11px] font-medium text-sam-muted">음성</p>
                    <p className="mt-1 text-[16px] font-semibold text-sam-fg">{voiceMessageCount}</p>
                    <p className="mt-1 text-[12px] text-sam-muted">보이스 메시지 기록</p>
                  </div>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {mediaGalleryMessages.length ? (
                    mediaGalleryMessages.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => scrollToRoomMessage(m.id)}
                        className="flex w-full gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left"
                      >
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-ui-rect bg-sam-border-soft text-[11px] font-semibold text-sam-muted">
                          {m.messageType === "voice" ? (
                            "음성"
                          ) : m.messageType === "image" || looksLikeDirectImageUrl(m.content) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.content.trim()} alt="" className="h-full w-full object-cover" />
                          ) : (
                            "미디어"
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] text-sam-muted">{formatTime(m.createdAt)}</p>
                          <p className="mt-0.5 truncate text-[14px] text-sam-fg">
                            {m.messageType === "voice"
                              ? `음성${m.voiceDurationSeconds ? ` · ${m.voiceDurationSeconds}초` : ""}`
                              : "사진"}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="py-8 text-center text-[13px] text-sam-muted">미디어 없음</p>
                  )}
                </div>
              </>
            ) : null}

            {activeSheet === "files" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">이 방 파일</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">파일 모아보기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                  <p className="text-[11px] font-medium text-sam-muted">첨부 파일</p>
                  <p className="mt-1 text-[16px] font-semibold text-sam-fg">{fileMessageCount}개</p>
                  <p className="mt-1 text-[12px] text-sam-muted">문서, 압축 파일, 일반 첨부를 한곳에서 확인합니다.</p>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {fileMessages.length ? (
                    fileMessages.map((m) => (
                      <div key={m.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                        <button type="button" onClick={() => scrollToRoomMessage(m.id)} className="w-full text-left">
                          <p className="text-[12px] text-sam-muted">{tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                          <p className="mt-1 truncate text-[14px] font-semibold text-sam-fg">{m.fileName?.trim() || "첨부 파일"}</p>
                          <p className="mt-1 text-[12px] text-sam-muted">{formatFileMeta(m.fileMimeType, m.fileSizeBytes)}</p>
                        </button>
                        {!m.pending && m.content.trim() ? (
                          <a
                            href={m.content.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 text-[12px] font-semibold text-sam-fg"
                          >
                            파일 열기
                          </a>
                        ) : (
                          <p className="mt-3 text-[12px] text-sam-muted">업로드 중…</p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="py-8 text-center text-[13px] text-sam-muted">파일 없음</p>
                  )}
                </div>
              </>
            ) : null}

            {activeSheet === "links" ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-medium text-sam-fg">이 방 링크</p>
                    <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">링크 모아보기</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSheet("menu")}
                    className="rounded-ui-rect border border-sam-border px-3 py-2 text-[12px] text-sam-fg"
                  >
                    {t("tier1_back")}
                  </button>
                </div>
                <div className="mt-4 rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
                  <p className="text-[11px] font-medium text-sam-muted">공유 링크</p>
                  <p className="mt-1 text-[16px] font-semibold text-sam-fg">{linkMessageCount}개</p>
                  <p className="mt-1 text-[12px] text-sam-muted">메시지에 포함된 URL을 모아 다시 열 수 있습니다.</p>
                </div>
                <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto">
                  {linkThreadMessages.length ? (
                    linkThreadMessages.map((m) => {
                      const urls = extractHttpUrls(m.content);
                      return (
                        <div key={m.id} className="rounded-ui-rect border border-sam-border bg-sam-surface p-3">
                          <button type="button" onClick={() => scrollToRoomMessage(m.id)} className="w-full text-left">
                            <p className="text-[12px] text-sam-muted">{tt(m.senderLabel)} · {formatTime(m.createdAt)}</p>
                            <p className="mt-1 line-clamp-2 text-[13px] text-sam-fg">{m.content}</p>
                          </button>
                          <div className="mt-2 flex flex-col gap-1.5">
                            {urls.map((url) => (
                              <a
                                key={`${m.id}:${url}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-[13px] font-medium text-sam-fg underline decoration-sam-meta"
                              >
                                {url}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="py-8 text-center text-[13px] text-sam-muted">링크 없음</p>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {memberActionTarget ? (
        <div className="fixed inset-0 z-[25] flex items-end justify-center bg-black/30 px-4 pb-6" onClick={() => setMemberActionTarget(null)}>
          <div
            className="w-full max-w-[520px] overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface p-5 shadow-[0_10px_30px_rgba(17,24,39,0.08)]"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[13px] font-medium text-sam-fg">멤버 액션</p>
            <h2 className="mt-1 text-[20px] font-semibold text-sam-fg">{memberActionTarget.label}</h2>
            <p className="mt-1 text-[12px] text-sam-muted">
              {memberActionTarget.memberRole === "admin"
                ? "관리자"
                : snapshot?.room.ownerUserId && messengerUserIdsEqual(memberActionTarget.id, snapshot.room.ownerUserId)
                  ? "방장"
                  : "멤버"}
              {memberActionTarget.identityMode === "alias" ? " · 닉네임 프로필" : ""}
            </p>
            {isPrivateGroupRoom ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="text-[11px] text-sam-muted">역할 변경</p>
                  <p className="mt-1 text-[12px] font-semibold text-sam-fg">{canManageMemberRoles ? "가능" : "제한"}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="text-[11px] text-sam-muted">내보내기</p>
                  <p className="mt-1 text-[12px] font-semibold text-sam-fg">{canKickGroupMembers ? "가능" : "제한"}</p>
                </div>
                <div className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2">
                  <p className="text-[11px] text-sam-muted">방장 위임</p>
                  <p className="mt-1 text-[12px] font-semibold text-sam-fg">{isOwner ? "가능" : "불가"}</p>
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-2">
              <div className="border-b border-sam-border-soft pb-1 text-[11px] font-semibold text-sam-meta">대화</div>
              <button
                type="button"
                onClick={() => void startDirectChatWithMember(memberActionTarget.id)}
                disabled={busy === `member-chat:${memberActionTarget.id}`}
                className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
              >
                <div>
                  <p className="text-[15px] font-semibold text-sam-fg">1:1 대화 시작</p>
                  <p className="mt-1 text-[12px] text-sam-muted">이 멤버와 별도 대화방을 엽니다.</p>
                </div>
                <span className="text-[18px] text-sam-meta">›</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void startDirectCallWithMember(memberActionTarget.id, "voice")}
                  disabled={busy === `member-call:voice:${memberActionTarget.id}`}
                  className="rounded-ui-rect border border-sam-border px-4 py-4 text-left text-[14px] font-semibold text-sam-fg disabled:opacity-40"
                >
                  음성 통화
                </button>
                <button
                  type="button"
                  onClick={() => void startDirectCallWithMember(memberActionTarget.id, "video")}
                  disabled={busy === `member-call:video:${memberActionTarget.id}`}
                  className="rounded-ui-rect border border-sam-border px-4 py-4 text-left text-[14px] font-semibold text-sam-fg disabled:opacity-40"
                >
                  영상 통화
                </button>
              </div>
              {((canManageMemberRoles &&
                snapshot?.room.ownerUserId &&
                !messengerUserIdsEqual(memberActionTarget.id, snapshot.room.ownerUserId)) ||
                (canKickGroupMembers &&
                  snapshot?.room.ownerUserId &&
                  !messengerUserIdsEqual(memberActionTarget.id, snapshot.room.ownerUserId) &&
                  !(snapshot.myRole !== "owner" && memberActionTarget.memberRole === "admin"))) ? (
                <div className="border-b border-sam-border-soft pb-1 pt-2 text-[11px] font-semibold text-sam-meta">운영</div>
              ) : null}
              {canManageMemberRoles &&
              snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, snapshot.room.ownerUserId) ? (
                <>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => void transferGroupOwner(memberActionTarget.id, memberActionTarget.label)}
                      disabled={busy === `group-owner:${memberActionTarget.id}`}
                      className="flex items-center justify-between rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-4 text-left disabled:opacity-40"
                    >
                      <div>
                        <p className="text-[15px] font-semibold text-sam-fg">방장 위임</p>
                        <p className="mt-1 text-[12px] text-sam-muted">이 멤버를 새 방장으로 변경합니다.</p>
                      </div>
                      <span className="text-[18px] text-sam-meta">›</span>
                    </button>
                  ) : null}
                </>
              ) : null}
              {canManageMemberRoles &&
              snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, snapshot.room.ownerUserId) ? (
                <button
                  type="button"
                  onClick={() => void updateGroupMemberRole(memberActionTarget.id, memberActionTarget.memberRole === "admin" ? "member" : "admin")}
                  disabled={busy === `group-role:${memberActionTarget.id}`}
                  className="flex items-center justify-between rounded-ui-rect border border-sam-border px-4 py-4 text-left disabled:opacity-40"
                >
                  <div>
                    <p className="text-[15px] font-semibold text-sam-fg">
                      {memberActionTarget.memberRole === "admin" ? "관리자 해제" : "관리자 지정"}
                    </p>
                    <p className="mt-1 text-[12px] text-sam-muted">운영진 권한을 조정합니다.</p>
                  </div>
                  <span className="text-[18px] text-sam-meta">›</span>
                </button>
              ) : null}
              {canKickGroupMembers &&
              snapshot?.room.ownerUserId &&
              !messengerUserIdsEqual(memberActionTarget.id, snapshot.room.ownerUserId) &&
              !(snapshot.myRole !== "owner" && memberActionTarget.memberRole === "admin") ? (
                <button
                  type="button"
                  onClick={() => void removeGroupMember(memberActionTarget.id, memberActionTarget.label)}
                  disabled={busy === `group-remove:${memberActionTarget.id}`}
                  className="flex items-center justify-between rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left disabled:opacity-40"
                >
                  <div>
                    <p className="text-[15px] font-semibold text-red-700">그룹에서 내보내기</p>
                    <p className="mt-1 text-[12px] text-red-600/80">현재 그룹 참여를 종료합니다.</p>
                  </div>
                  <span className="text-[18px] text-red-300">›</span>
                </button>
              ) : null}
              <div className="border-b border-sam-border-soft pb-1 pt-2 text-[11px] font-semibold text-sam-meta">보호</div>
              <button
                type="button"
                onClick={() =>
                  void reportTarget({
                    reportType: "user",
                    reportedUserId: memberActionTarget.id,
                  })
                }
                className="flex items-center justify-between rounded-ui-rect border border-red-200 bg-sam-surface px-4 py-4 text-left"
              >
                <div>
                  <p className="text-[15px] font-semibold text-red-700">사용자 신고</p>
                  <p className="mt-1 text-[12px] text-red-600/80">문제가 있는 사용자를 신고합니다.</p>
                </div>
                <span className="text-[18px] text-red-300">›</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isGroupRoom && call.panel ? (
        <GroupRoomCallOverlay
          t={t}
          tt={tt}
          isGroupRoom={isGroupRoom}
          groupPrefix={t("nav_messenger_group_prefix")}
          groupCall={call}
          permissionGuide={permissionGuide}
          formatDuration={formatDuration}
          formatParticipantStatus={formatParticipantStatus}
          onOpenCallPermissionHelp={openCallPermissionHelp}
          onRetryCallDevicePermission={retryCallDevicePermission}
          onAcceptIncomingCall={handleAcceptIncomingCall}
        />
      ) : null}

      {!isGroupRoom && snapshot && returnToCallSessionId ? (
        <div
          className={`fixed left-3 right-3 z-40 flex items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 ${BOTTOM_NAV_STACK_ABOVE_CLASS}`}
        >
          <span className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-[11px] font-semibold text-sam-muted">
            진행 중
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-sam-fg">통화 진행 중</p>
            <p className="truncate text-[12px] text-sam-muted">채팅 중 복귀 가능</p>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem("cm_minimized_call_room");
                sessionStorage.removeItem("cm_minimized_call_session");
              } catch {
                /* ignore */
              }
              const backToCallHref = `/community-messenger/calls/${encodeURIComponent(returnToCallSessionId)}`;
              router.prefetch(backToCallHref);
              router.push(backToCallHref);
            }}
            className="shrink-0 rounded-ui-rect border border-sam-border bg-sam-ink px-3 py-2 text-[12px] font-semibold text-white"
          >
            통화 화면
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** 녹음 경과 시간 — 1/10000초(0.0001s) 단위까지 표시 */
function formatVoiceRecordTenThousandths(ms: number): string {
  const totalSec = Math.max(0, ms) / 1000;
  const m = Math.floor(totalSec / 60);
  let rem = totalSec - m * 60;
  if (rem >= 60) rem = 59.9999;
  let s = Math.floor(rem);
  const frac = rem - s;
  let tenK = Math.round(frac * 10000);
  if (tenK >= 10000) {
    tenK = 0;
    s += 1;
  }
  if (s >= 60) {
    return `${m + 1}:00.0000`;
  }
  return `${m}:${String(s).padStart(2, "0")}.${String(tenK).padStart(4, "0")}`;
}

function VoiceRecordingLiveWaveform({ peaks, className }: { peaks: number[]; className?: string }) {
  const bars = peaks.length > 0 ? peaks : Array.from({ length: 36 }, () => 0.08);
  return (
    <div
      className={`flex h-7 min-w-0 flex-1 items-end justify-between gap-[1px] px-0.5 ${className ?? ""}`}
    >
      {bars.map((p, i) => {
        const h = 4 + Math.round(Math.min(1, p) * 22);
        return (
          <div
            key={i}
            className="w-[2px] max-w-[2px] shrink-0 rounded-full bg-sam-muted/55"
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

function communityMessengerMessageSearchText(m: CommunityMessengerMessage & { pending?: boolean }): string {
  if (m.messageType === "call_stub") return m.callKind === "video" ? "영상 통화" : "음성 통화";
  if (m.messageType === "voice") return "음성 메시지";
  if (m.messageType === "file") return m.fileName?.trim() || "파일";
  if (m.messageType === "image") return m.content.trim() || "사진";
  return m.content;
}

function looksLikeDirectImageUrl(raw: string): boolean {
  const t = raw.trim();
  return /^https?:\/\//i.test(t) && /\.(png|jpe?g|gif|webp|svg)(\?[^\s]*)?$/i.test(t);
}

function extractHttpUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')]+/gi);
  return matches ?? [];
}

function communityMessengerVoiceAudioSrc(
  roomId: string,
  item: CommunityMessengerMessage & { pending?: boolean }
): string {
  const content = item.content.trim();
  if (item.pending && content.startsWith("blob:")) {
    return content;
  }
  const id = String(item.id ?? "").trim();
  if (!id || id.startsWith("pending:")) {
    return "";
  }
  return `${communityMessengerRoomResourcePath(roomId)}/messages/${encodeURIComponent(id)}/audio`;
}

function mergeRoomMessages(
  prev: Array<CommunityMessengerMessage & { pending?: boolean }>,
  next: CommunityMessengerMessage[]
): Array<CommunityMessengerMessage & { pending?: boolean }> {
  const mergedConfirmed = new Map<string, CommunityMessengerMessage & { pending?: boolean }>();
  for (const item of prev) {
    if (item.pending) continue;
    mergedConfirmed.set(item.id, item);
  }
  for (const item of next) {
    mergedConfirmed.set(item.id, {
      ...mergedConfirmed.get(item.id),
      ...item,
      pending: false,
    });
  }
  const pending = prev.filter((item) => item.pending);
  const mergedPending = pending.filter((item) => {
    return !next.some((confirmedItem) => {
      if (confirmedItem.senderId !== item.senderId || confirmedItem.messageType !== item.messageType) return false;
      const dt = Math.abs(new Date(confirmedItem.createdAt).getTime() - new Date(item.createdAt).getTime());
      if (item.messageType === "voice" && item.pending) {
        return dt < 15_000;
      }
      if (item.messageType === "file" && item.pending) {
        return confirmedItem.fileName === item.fileName && dt < 15_000;
      }
      return confirmedItem.content === item.content && dt < 15_000;
    });
  });
  return [...mergedConfirmed.values(), ...mergedPending].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function getLatestCallStubForSession(
  messages: Array<CommunityMessengerMessage & { pending?: boolean }>,
  sessionId: string
): CommunityMessengerMessage | null {
  let best: CommunityMessengerMessage | null = null;
  for (const m of messages) {
    if (m.pending) continue;
    if (m.messageType !== "call_stub") continue;
    const sid = m.callSessionId?.trim();
    if (!sid || !messengerUserIdsEqual(sid, sessionId)) continue;
    if (!best || new Date(m.createdAt).getTime() > new Date(best.createdAt).getTime()) {
      best = m;
    }
  }
  return best;
}

/** Viber 톤 — 브랜드 보라 발신 / 화이트 수신. `showTail`: 새 덩어리(프로필 옆)만 꼬리 표시 */
function ViberChatBubble({
  isMine,
  showTail,
  children,
}: {
  isMine: boolean;
  showTail: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`sam-bubble ${isMine ? "sam-bubble--outgoing" : "sam-bubble--incoming"}`}
      style={{
        borderRadius: "var(--cm-room-radius-bubble)",
      }}
    >
      {showTail ? (
        !isMine ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -left-[8px] top-[8px] z-[1] h-0 w-0 border-y-[9px] border-y-transparent border-r-[11px]"
            style={{ borderRightColor: "var(--cm-room-bubble-incoming)" }}
          />
        ) : (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-[8px] top-[8px] z-[1] h-0 w-0 border-y-[9px] border-y-transparent border-l-[11px]"
            style={{ borderLeftColor: "var(--cm-room-bubble-outgoing)" }}
          />
        )
      ) : null}
      {children}
    </div>
  );
}

function communityMessengerMemberAvatar(
  members: CommunityMessengerProfileLite[],
  senderId: string | null | undefined
): { avatarUrl: string | null; initials: string } | null {
  if (!senderId) return null;
  const member = members.find((m) => m.id === senderId);
  if (!member) return { avatarUrl: null, initials: "?" };
  const avatarUrl =
    member.identityMode === "alias" && member.aliasProfile?.avatarUrl
      ? member.aliasProfile.avatarUrl
      : member.avatarUrl;
  const rawLabel =
    member.identityMode === "alias" && member.aliasProfile?.displayName?.trim()
      ? member.aliasProfile.displayName.trim()
      : member.label.trim();
  const compact = rawLabel.replace(/\s+/g, "");
  const initials = compact[0] ?? "?";
  return { avatarUrl, initials };
}

function mapRealtimeRoomMessage(
  snapshot: CommunityMessengerRoomSnapshot,
  membersForSender: CommunityMessengerProfileLite[],
  message: {
    id: string;
    roomId: string;
    senderId: string | null;
    messageType: "text" | "image" | "file" | "system" | "call_stub" | "voice";
    content: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }
): CommunityMessengerMessage {
  const sender = message.senderId ? membersForSender.find((member) => member.id === message.senderId) : null;
  const callKind =
    message.metadata.callKind === "video" || message.metadata.callKind === "voice"
      ? message.metadata.callKind
      : null;
  const callStatus =
    message.metadata.callStatus === "missed" ||
    message.metadata.callStatus === "rejected" ||
    message.metadata.callStatus === "cancelled" ||
    message.metadata.callStatus === "ended" ||
    message.metadata.callStatus === "incoming" ||
    message.metadata.callStatus === "dialing"
      ? message.metadata.callStatus
      : null;
  const voiceDurationSeconds =
    message.messageType === "voice"
      ? Math.max(0, Math.floor(Number(message.metadata.durationSeconds ?? 0)) || 0)
      : undefined;
  const voiceWaveformPeaks =
    message.messageType === "voice"
      ? parseVoiceWaveformPeaksFromMetadata(message.metadata.waveformPeaks) ?? null
      : undefined;
  const voiceMimeType =
    message.messageType === "voice" ? (String(message.metadata.mimeType ?? "").trim() || null) : undefined;
  const fileName = message.messageType === "file" ? (String(message.metadata.fileName ?? "").trim() || null) : undefined;
  const fileMimeType = message.messageType === "file" ? (String(message.metadata.mimeType ?? "").trim() || null) : undefined;
  const fileSizeBytes =
    message.messageType === "file" ? Math.max(0, Math.floor(Number(message.metadata.fileSizeBytes ?? 0)) || 0) : undefined;
  const callSessionIdRaw = message.metadata.sessionId;
  const callSessionId =
    typeof callSessionIdRaw === "string" && callSessionIdRaw.trim() ? callSessionIdRaw.trim() : null;
  return {
    id: message.id,
    roomId: message.roomId,
    senderId: message.senderId,
    senderLabel: sender?.label ?? (message.senderId === snapshot.viewerUserId ? "나" : "상대"),
    messageType: message.messageType,
    content: message.content,
    createdAt: message.createdAt,
    isMine: message.senderId === snapshot.viewerUserId,
    callKind,
    callStatus,
    callSessionId,
    ...(voiceDurationSeconds !== undefined ? { voiceDurationSeconds } : {}),
    ...(voiceWaveformPeaks !== undefined ? { voiceWaveformPeaks } : {}),
    ...(voiceMimeType !== undefined ? { voiceMimeType } : {}),
    ...(fileName !== undefined ? { fileName } : {}),
    ...(fileMimeType !== undefined ? { fileMimeType } : {}),
    ...(fileSizeBytes !== undefined ? { fileSizeBytes } : {}),
  };
}

function formatFileMeta(mimeType?: string | null, fileSizeBytes?: number | null): string {
  const parts: string[] = [];
  const mime = String(mimeType ?? "").trim();
  const size = Number(fileSizeBytes ?? 0);
  if (mime) parts.push(mime);
  if (size > 0) parts.push(formatFileSize(size));
  return parts.join(" · ") || "첨부 파일";
}

function formatFileSize(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)}KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)}MB`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatRoomCallStatus(status?: string | null): string {
  if (status === "missed") return "부재중";
  if (status === "rejected") return "거절됨";
  if (status === "cancelled") return "취소됨";
  if (status === "ended") return "통화 종료";
  if (status === "incoming") return "수신 중";
  if (status === "dialing") return "발신 중";
  return "상태 확인 중";
}

function formatDuration(value: number): string {
  const total = Math.max(0, Math.floor(value));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatParticipantStatus(value: "invited" | "joined" | "left" | "rejected"): string {
  if (value === "joined") return "참여 중";
  if (value === "invited") return "대기";
  if (value === "rejected") return "거절";
  return "종료";
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SendPlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function MicHoldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function TrashVoiceIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function SendVoiceArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  );
}

function VoiceCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VideoCallIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="2" y="6" width="14" height="12" rx="2" strokeLinejoin="round" />
      <path d="M22 8v8l-5-3.2V11.2L22 8z" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 13h6M9 17h4" strokeLinecap="round" />
    </svg>
  );
}
