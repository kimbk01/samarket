"use client";

/** 방 메시지·메타 Realtime 은 시청자당 단일 `global-messenger:bundle` 채널(`useCommunityMessengerRoomRealtime`)로 수신·`room_id` 로만 분배한다. */

import { usePathname, useRouter } from "next/navigation";
import { useMessengerRoomUrlSearchParams } from "@/lib/community-messenger/room/use-messenger-room-url-search-params";
import { noteR2M11Phase1SeedReady } from "@/lib/community-messenger/room/cm-room-r2-m11-suspense-release";
import { noteR2M11BPhase1SeedReady } from "@/lib/community-messenger/room/cm-room-r2-m11b-breakdown";
import { noteTradeChatRoomSnapshotReadyForShellBreakdown } from "@/lib/trade/trade-chat-room-shell-breakdown-perf";
import {
  beginTradePhase1Breakdown,
  endTradePhase1BreakdownSection,
  finalizeTradePhase1Breakdown,
  isTradePhase1EntryLightPass,
  noteTradePhase1InitialMessageCount,
  noteTradePhase1LargeArrayCount,
  noteTradePhase1MemoWorkMs,
} from "@/lib/trade/trade-chat-room-phase1-breakdown-perf";
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
import {
  useMessengerRoomOpenMarkReadEffect,
  type MessengerRoomOpenMarkReadPhaseRef,
} from "@/lib/community-messenger/room/use-messenger-room-open-mark-read-effect";
import {
  clearMessengerRealtimeLocalUnreadForRoom,
  setMessengerRealtimeFocusedRoomId,
} from "@/lib/community-messenger/realtime/messenger-realtime-client-activity-ref";
import {
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MEMBER_CAP,
  COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_MESSAGE_LIMIT,
  type CommunityMessengerMessage,
  type CommunityMessengerMessageActionOpenState,
  type CommunityMessengerProfileLite,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { communityMessengerRoomMembersPath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { buildClientShellPlaceholderSnapshot } from "@/lib/community-messenger/room/client-shell-placeholder-snapshot";
import { pickAuthoritativeMessengerRoomSnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import {
  peekRoomSnapshot,
  primeHotRoomSnapshot,
  primeRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { CM_CLUSTER_GAP_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { cmReadUiLog } from "@/lib/community-messenger/read/cm-read-ui-log";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import { shouldAdvancePeerReadReceiptCursor } from "@/lib/community-messenger/room/messenger-peer-read-cursor-guard";
import {
  createMessengerRoomBootstrapRefresh,
  forgetMessengerRoomClientBootstrapFlights,
} from "@/lib/community-messenger/room/messenger-room-bootstrap-refresh";
import { clearCmBootstrapDebounceForRoom } from "@/lib/community-messenger/room/cm-bootstrap-orchestration";
import {
  useMessengerRoomBootstrapLifecycle,
  type MessengerRoomBootstrapRefreshFn,
} from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import { clearCmRoomForegroundBootstrapLock } from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import { useMessengerRoomUrlSyncEffects } from "@/lib/community-messenger/room/use-messenger-room-url-sync-effects";
import { CM_ROOM_EMPTY_VIRTUALIZER_STUB } from "@/lib/community-messenger/room/cm-room-empty-virtualizer-stub";
import { finalizeStoreOrderChatDisplayMessages } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import type { MessengerRoomPhase1TimelineHeavyBundle } from "@/lib/community-messenger/room/use-messenger-room-phase1-timeline-heavy";
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
import {
  recordRouteEntryElapsedMetric,
  recordRouteEntryElapsedMetricOnce,
  recordRouteEntryMetric,
} from "@/lib/runtime/samarket-runtime-debug";
import {
  attachMessengerRoomEntryHydrationSchedulerSurface,
  cancelMessengerRoomEntryHydration,
} from "@/lib/community-messenger/background-hydration-scheduler";
import {
  ensureCmRoomEntryRouteT0,
  resetCmRoomEntryTraceSession,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { entryTimingT0 } from "@/lib/community-messenger/room/cm-room-entry-timing";
import { resetCmRoomR5TimelineMountInstrumentation } from "@/lib/community-messenger/room/cm-room-r5-timeline-mount-instrumentation";
import {
  noteCmRoomR6HeavyHostMount,
  noteCmRoomR6VirtualizerReady,
  scheduleCmRoomTimelineHeavyReadyAfterDom,
  resetCmRoomR6DisplayReadyInstrumentation,
} from "@/lib/community-messenger/room/cm-room-r6-display-ready-instrumentation";
import {
  CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP,
  noteCmRoomR7Phase1SeedAvailable,
  noteCmRoomR7RoomOpen,
  resetCmRoomR7FirstRowCommitInstrumentation,
} from "@/lib/community-messenger/room/cm-room-r7-first-row-commit-instrumentation";
import { beginCmRoomEntryPriorityMode, endCmRoomEntryPriorityMode } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { consumeCommunityMessengerRoomNavTap } from "@/lib/community-messenger/room-nav-timing";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { acquireCommunityMessengerReadAckBroadcast } from "@/lib/community-messenger/realtime/cm-read-ack-broadcast-client";
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
import { useMessengerRoomEagerOlderHistoryHydration } from "@/lib/community-messenger/room/use-messenger-room-eager-older-history-hydration";
import { useMessengerRoomReaderScrollBottom } from "@/lib/community-messenger/room/use-messenger-room-reader-scroll-bottom";
import { useMessengerRoomTradeDockScrollAnchor } from "@/lib/community-messenger/room/use-messenger-room-trade-dock-scroll-anchor";
import { useMessengerRoomReaderScrollRoomLifecycle } from "@/lib/community-messenger/room/use-messenger-room-reader-scroll-room-lifecycle";
import { useMessengerRoomVisibilityBusCatchup } from "@/lib/community-messenger/room/use-messenger-room-visibility-bus-catchup";
import {
  onCommunityMessengerBusEvent,
  postCommunityMessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import {
  patchMessengerRoomReadSnapshotRuntime,
  patchMessengerRoomSnapshotRuntime,
} from "@/lib/community-messenger/realtime/messenger-realtime-snapshot-runtime";
import {
  seedMessengerRealtimeFromRoomSnapshot,
  setActiveMessengerRealtimeRoom,
  applyIncomingMessageEvent,
  getMessengerRealtimeRoomMessages,
  normalizeMessengerRealtimeRoomId,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
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

import { MESSENGER_ROOM_BOOTSTRAP_DEBOUNCE_MS } from "@/lib/community-messenger/messenger-latency-config";

/** 입장 직후 여러 경로가 동시에 `refresh(true)` 를 열 때 silent bootstrap GET 을 한 번으로 합류 */
const ROOM_ENTRY_SILENT_REFRESH_BURST_MS = 500;
const ROOM_ENTRY_SILENT_REFRESH_DEBOUNCE_MS = MESSENGER_ROOM_BOOTSTRAP_DEBOUNCE_MS;

function pushCmR8PerfEvent(roomId: string, event: string, payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const id = roomId.trim();
  if (!id) return;
  const t0 = entryTimingT0();
  const tMs = t0 > 0 && typeof performance !== "undefined" ? Math.round(performance.now() - t0) : null;
  const row = {
    event,
    room_id_suffix: id.length <= 8 ? id : id.slice(-8),
    t_ms: tMs,
    ...payload,
  };
  const bag = window.__cmPerfEvents ?? [];
  bag.push(row);
  window.__cmPerfEvents = bag;
  // eslint-disable-next-line no-console -- R8 seed/bootstrap row path trace
  console.log("[cm-room-r8-seed-path]", JSON.stringify(row));
}

function resolveMessengerRoomInitialSnapshot(
  roomId: string,
  initialViewerId: string,
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null
): CommunityMessengerRoomSnapshot | null {
  return pickAuthoritativeMessengerRoomSnapshot({
    roomId,
    viewerUserId: initialViewerId,
    serverSnapshot: initialServerSnapshot,
  });
}

export type MessengerRoomClientPhase1Props = {
  roomId: string;
  initialCallAction?: string;
  initialCallSessionId?: string;
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  initialViewerUserId?: string | null;
};

export function useMessengerRoomClientPhase1({
  roomId,
  initialCallAction,
  initialCallSessionId,
  initialServerSnapshot = null,
  initialViewerUserId = null,
}: MessengerRoomClientPhase1Props) {
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "useMessengerRoomClientPhase1_init_ms");
  recordRouteEntryElapsedMetricOnce("messenger_room_entry", "phase1_start_ms");
  const phase1PerfTrack = beginTradePhase1Breakdown();
  const phase1EntryLightPass = isTradePhase1EntryLightPass();
  const fromPropViewer = typeof initialViewerUserId === "string" ? initialViewerUserId.trim() : "";
  const fromServerViewer = initialServerSnapshot?.viewerUserId?.trim() ?? "";
  const initialViewerId = fromPropViewer || fromServerViewer;
  /** placeholder 전용: 값이 없으면 `undefined` 로 두어 빈 문자열과 구분(스냅샷 필드는 빈 문자열로 저장). */
  const viewerIdForPlaceholder = fromPropViewer || fromServerViewer || undefined;
  const { t, tt } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useMessengerRoomUrlSearchParams();
  /** 같은 방에 머문 채 전역 배너에서 수락할 때도 반응하도록 URL 을 구독한다(RSC initial props 만으론 갱신이 안 될 수 있음). */
  const callActionFromUrl = searchParams.get("callAction") ?? initialCallAction ?? undefined;
  const sessionIdFromUrl = searchParams.get("sessionId") ?? initialCallSessionId ?? undefined;
  const contextMetaFromUrlHandledRef = useRef(false);
  /** 뷰포트·하단 체류 조건 충족 시 `mark_read` — unread 0 이어도 상대 신규 메시지가 오면 읽음 커서만 진행(상대 읽음 표시) */
  const roomOpenMarkReadRef = useRef<MessengerRoomOpenMarkReadPhaseRef["current"]>({
    roomId: null,
    phase: "idle",
  });
  const sheetInfoFromUrlHandledRef = useRef(false);
  const autoHandledSessionRef = useRef<string | null>(null);
  const autoAcceptInFlightRef = useRef<string | null>(null);
  const pendingMessageIdRef = useRef(0);
  const loadedRef = useRef(
    Boolean(peekRoomSnapshot(roomId, initialViewerId || undefined) ?? initialServerSnapshot)
  );
  /** RSC가 `membersDeferred` 부트스트랩을 내렸으면 사일런트 갱신 시 전원 멤버 프로필을 다시 끌어오지 않음 */
  const deferredMemberBootstrapRef = useRef(Boolean(initialServerSnapshot?.membersDeferred));
  const silentRoomRefreshBusyRef = useRef(false);
  const silentRoomRefreshAgainRef = useRef(false);
  const silentBootstrapThrottleCoalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swrDeferredBootstrapTimerRef = useRef<number | null>(null);
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
  /** 상대 Realtime INSERT 직후 `mark_read` 가시 비율 완화 — @see useMessengerRoomOpenMarkReadEffect */
  const peerTailMarkReadHintRef = useRef<string | null>(null);
  /** 방 전환 시 이전 방 꼬리 힌트가 남지 않게 */
  useEffect(() => {
    peerTailMarkReadHintRef.current = null;
  }, [roomId]);
  /** 서버+클라 이중 bump 가 같은 틱에 오면 catch-up 을 한 번만 돌린다 */
  const remoteBumpCatchUpRafRef = useRef<number | null>(null);
  /** canonical·raw 채널 이중 발행 시 동일 페이로드로 catch-up 이 두 번 도는 것 방지 */
  const lastRemoteBumpDedupeRef = useRef<string>("");
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const hasMoreOlderMessagesRef = useRef(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [timelineHighlightMessageId, setTimelineHighlightMessageId] = useState<string | null>(null);
  const timelineHighlightTimerRef = useRef<number | null>(null);
  const urlDeepLinkMessageHandledRef = useRef<string>("");
  let initialSnapshotResolved: CommunityMessengerRoomSnapshot | null = null;
  const [snapshot, setSnapshot] = useState<CommunityMessengerRoomSnapshot | null>(() => {
    /** `peekHotRoomSnapshot` 제외: 방 이탈 후 새 메시지가 와도 hot 이 갱신되지 않아, 배지로 재입장 시 옛 타임라인이 먼저 깔리는 문제가 난다. */
    const prepared = resolveMessengerRoomInitialSnapshot(roomId, initialViewerId, initialServerSnapshot);
    const resolved = prepared ?? buildClientShellPlaceholderSnapshot(roomId, viewerIdForPlaceholder);
    initialSnapshotResolved = resolved;
    recordRouteEntryElapsedMetric("messenger_room_entry", "phase1_snapshot_prepare_ms");
    if (phase1PerfTrack) {
      noteTradePhase1InitialMessageCount(resolved.messages?.length ?? 0);
      noteTradePhase1LargeArrayCount(
        Math.max(resolved.messages?.length ?? 0, resolved.members?.length ?? 0)
      );
    }
    return resolved;
  });
  if (phase1PerfTrack) endTradePhase1BreakdownSection("bootstrap_normalize");
  /** DB `community_messenger_messages.room_id` — URL id(거래·레거시)와 다를 수 있어 Realtime 필터는 이 값을 쓴다. */
  const streamRoomId = useMemo(() => {
    const c =
      snapshot?.room?.id?.trim() ||
      initialServerSnapshot?.room?.id?.trim();
    const r = String(roomId ?? "").trim();
    return (c || r).trim();
  }, [snapshot?.room?.id, initialServerSnapshot?.room?.id, roomId]);
  if (phase1PerfTrack) endTradePhase1BreakdownSection("unread_state_init");

  useLayoutEffect(() => {
    const rid = String(roomId ?? "").trim();
    if (!rid || !snapshot) return;
    noteR2M11Phase1SeedReady(rid);
    noteR2M11BPhase1SeedReady(rid);
    noteTradeChatRoomSnapshotReadyForShellBreakdown();
  }, [roomId, snapshot?.room.id]);

  /** dynamic import·슬라이드·BootstrapGate — props 시드가 placeholder 보다 풍부하면 즉시 승격(빈 타임라인 포함) */
  useLayoutEffect(() => {
    const seeded = initialServerSnapshot;
    if (!seeded || seeded.clientShellPlaceholder) return;
    const msgCount = seeded.messages?.length ?? 0;
    const rid = String(seeded.room.id ?? roomId ?? "").trim();
    if (rid) {
      primeRoomSnapshot(rid, seeded);
    }
    setSnapshot((prev) => {
      if (!prev || prev.clientShellPlaceholder) return seeded;
      if (msgCount > 0 && (prev.messages?.length ?? 0) >= msgCount) return prev;
      return seeded;
    });
    setRoomMessages((prev) => {
      if (msgCount <= 0) return prev;
      if (prev.length >= msgCount) return prev;
      return seeded.messages;
    });
  }, [initialServerSnapshot, roomId]);

  useEffect(() => {
    const id = streamRoomId.trim();
    if (!id) return;
    clearMessengerRealtimeLocalUnreadForRoom(id);
    setMessengerRealtimeFocusedRoomId(id);
    return () => {
      setMessengerRealtimeFocusedRoomId(null);
    };
  }, [streamRoomId]);

  const [roomMessages, setRoomMessages] = useState<Array<CommunityMessengerMessage & { pending?: boolean }>>(() => {
    const base = (initialSnapshotResolved?.messages as Array<CommunityMessengerMessage & { pending?: boolean }>) ?? [];
    const rid = roomId.trim();
    if (!rid) return base;
    const live = getMessengerRealtimeRoomMessages(rid);
    if (live.length <= base.length) return base;
    return mergeRoomMessages(base, live);
  });

  useLayoutEffect(() => {
    const rid = roomId.trim();
    if (!rid) return;
    noteCmRoomR7RoomOpen(rid);
    if (roomMessages.length > 0) {
      noteCmRoomR7Phase1SeedAvailable(rid, roomMessages.length);
    }
    pushCmR8PerfEvent(rid, "phase1_rows_seed_count", {
      phase1_seed_message_count: roomMessages.length,
      bootstrap_message_count: snapshot?.messages?.length ?? 0,
    });
  }, [roomId, roomMessages.length]);
  const snapshotRef = useRef<CommunityMessengerRoomSnapshot | null>(null);
  const roomMessagesRef = useRef(roomMessages);
  const roomStateCommitCountRef = useRef(0);
  const messagesStateCommitCountRef = useRef(0);
  const participantsStateCommitCountRef = useRef(0);
  const profilesStateCommitCountRef = useRef(0);
  const phase1SnapshotCommitRecordedRef = useRef(false);
  /** `mark_read` — 시트·메시지 액션 등 오버레이 시 금지 */
  const readPhase1OverlayBlockedRef = useRef(false);
  const roomLoadingRef = useRef(false);
  snapshotRef.current = snapshot;
  roomMessagesRef.current = roomMessages;

  /** cached seed — bootstrap·hydration pass 대기 전 타임라인 state 동기(첫 paint FMV) */
  useLayoutEffect(() => {
    const snap = snapshot;
    if (!snap || snap.clientShellPlaceholder) return;
    const snapMsgs = snap.messages ?? [];
    if (snapMsgs.length === 0 && !snap.room.lastMessage?.trim()) return;
    setRoomMessages((prev) => {
      if (snapMsgs.length === 0) return prev.length > 0 ? prev : prev;
      if (prev.length === 0) return snapMsgs;
      if (prev.length >= snapMsgs.length) return prev;
      return mergeRoomMessages(prev, snapMsgs);
    });
  }, [snapshot, snapshot?.messages?.length, snapshot?.room.lastMessage]);

  if (!phase1SnapshotCommitRecordedRef.current && snapshot?.room?.id) {
    phase1SnapshotCommitRecordedRef.current = true;
    recordRouteEntryElapsedMetric("messenger_room_entry", "phase1_snapshot_commit_ms");
    if (phase1PerfTrack) endTradePhase1BreakdownSection("store_hydration");
  }

  useEffect(() => {
    const s = snapshot ?? initialServerSnapshot ?? null;
    if (s?.clientShellPlaceholder) return;
    seedMessengerRealtimeFromRoomSnapshot(s);
  }, [initialServerSnapshot, snapshot]);

  useEffect(() => {
    if (!snapshot) return;
    roomStateCommitCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "room_state_commit_count", roomStateCommitCountRef.current);
  }, [snapshot]);

  useEffect(() => {
    const id = String(roomId ?? "").trim();
    setActiveMessengerRealtimeRoom(id || null);
    return () => {
      setActiveMessengerRealtimeRoom(null);
    };
  }, [roomId]);

  useEffect(() => {
    const viewerId = snapshotRef.current?.viewerUserId?.trim() || initialServerSnapshot?.viewerUserId?.trim() || "";
    if (!viewerId) return;
    const rid = String(roomId ?? "").trim();
    if (!rid) return;
    const ridNorm = normalizeMessengerRealtimeRoomId(rid);
    return onCommunityMessengerBusEvent((ev) => {
      if ("viewerUserId" in ev && String(ev.viewerUserId) !== viewerId) return;
      const evRoomRaw = "roomId" in ev && typeof (ev as { roomId?: unknown }).roomId === "string" ? (ev as { roomId: string }).roomId : "";
      const evRoomNorm = normalizeMessengerRealtimeRoomId(evRoomRaw);
      if (evRoomNorm !== ridNorm) return;
      if (ev.type === "cm.room.incoming_message") {
        applyIncomingMessageEvent({
          viewerUserId: viewerId,
          roomId: rid,
          messageRow: ev.messageRow,
          roomSummary: snapshotRef.current?.room ?? initialServerSnapshot?.room ?? undefined,
        });
      } else if (ev.type === "cm.room.read") {
        patchMessengerRoomReadSnapshotRuntime({
          viewerUserId: viewerId,
          roomId: rid,
        });
        setSnapshot((prev) => (prev ? { ...prev, room: { ...prev.room, unreadCount: 0 } } : prev));
        return;
      } else if (ev.type === "cm.room.summary_patch") {
        patchMessengerRoomSnapshotRuntime({
          viewerUserId: viewerId,
          roomId: rid,
          unreadCount: ev.unreadCount,
          lastReadMessageId: ev.lastReadMessageId,
        });
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            room: {
              ...prev.room,
              ...(typeof ev.unreadCount === "number" && Number.isFinite(ev.unreadCount)
                ? { unreadCount: Math.max(0, Math.floor(ev.unreadCount)) }
                : null),
            },
          };
        });
        return;
      } else if (ev.type === "cm.room.local_unread") {
        patchMessengerRoomSnapshotRuntime({
          viewerUserId: viewerId,
          roomId: rid,
          unreadCount: ev.unreadCount,
        });
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            room: {
              ...prev.room,
              unreadCount: Math.max(0, Math.floor(Number(ev.unreadCount) || 0)),
            },
          };
        });
        return;
      } else {
        return;
      }
      const mergedMessages = getMessengerRealtimeRoomMessages(rid);
      if (mergedMessages.length > 0) {
        setRoomMessages((prev) => mergeRoomMessages(prev, mergedMessages));
      }
    });
  }, [initialServerSnapshot?.room, initialServerSnapshot?.viewerUserId, roomId, setSnapshot]);
  const [friends, setFriends] = useState<CommunityMessengerProfileLite[]>([]);
  const [friendsLoaded, setFriendsLoaded] = useState(false);
  /** 부트스트랩 대기와 입력창 활성을 분리 — 타임라인만 스켈레톤·보강 */
  const [loading, setLoading] = useState(false);
  /** 초기 부트스트랩(HTTP) 완료 후에만 Realtime 구독 — 마운트 시 중복 요청·구독 레이스 완화 */
  const [roomReadyForRealtime, setRoomReadyForRealtime] = useState(false);
  /** R2-M8: viewport DOM 부착 후에만 virtualizer·파생 목록 마운트 (scroll root 없이 getVirtualItems()=[] 방지) */
  const [timelineViewportMounted, setTimelineViewportMounted] = useState(false);
  const [timelineVirtualizerGeneration, setTimelineVirtualizerGeneration] = useState(0);
  const [timelineHeavyLive, setTimelineHeavyLive] = useState(false);
  const [timelineHeavyBundle, setTimelineHeavyBundle] = useState<MessengerRoomPhase1TimelineHeavyBundle | null>(
    null
  );
  const onTimelineHeavyReady = useCallback((bundle: MessengerRoomPhase1TimelineHeavyBundle) => {
    setTimelineHeavyBundle(bundle);
    const rid = roomId.trim();
    if (rid) {
      noteCmRoomR6VirtualizerReady(rid);
      scheduleCmRoomTimelineHeavyReadyAfterDom(rid, "timeline_heavy_bundle");
    }
  }, [roomId]);

  const notifyTimelineViewportMounted = useCallback((mounted: boolean) => {
    setTimelineViewportMounted(mounted);
    if (mounted) {
      setTimelineVirtualizerGeneration((g) => g + 1);
    }
  }, []);

  useLayoutEffect(() => {
    const rid = roomId.trim();
    if (!rid) return;
    setTimelineViewportMounted(false);
    setTimelineHeavyLive(false);
    setTimelineHeavyBundle(null);
  }, [roomId]);

  /** scroll root 부착 후 heavy virtualizer — 시드·pass3 전에는 entry direct paint 우선(R7). */
  useLayoutEffect(() => {
    if (!timelineViewportMounted) return;
    const hasTimelineSeed =
      roomMessages.length > 0 ||
      (snapshot?.messages?.length ?? 0) > 0 ||
      Boolean(snapshot?.room.lastMessage?.trim());
    const rid = roomId.trim();
    const entrySliceDefer =
      hasTimelineSeed && roomMessages.length > CM_ROOM_ENTRY_SEED_PAINT_ROW_CAP;
    let cancelled = false;
    const attachHeavy = () => {
      if (cancelled) return;
      setTimelineHeavyLive(true);
      if (rid) noteCmRoomR6HeavyHostMount(rid);
    };
    if (!hasTimelineSeed) {
      attachHeavy();
      return;
    }
    if (!entrySliceDefer) {
      if (typeof requestIdleCallback === "function") {
        const idleId = requestIdleCallback(attachHeavy, { timeout: 48 });
        return () => {
          cancelled = true;
          cancelIdleCallback(idleId);
        };
      }
      const rafId = requestAnimationFrame(() => {
        requestAnimationFrame(attachHeavy);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(rafId);
      };
    }
    /**
     * R11: timeline_rows_prepare→first_row_commit 구간에서 2.5s stall의 주원인이
     * heavy host attach fallback timeout(2500ms)으로 확인되어, entry seed가 있으면
     * direct seed row와 같은 tick(2x rAF)에서 heavy를 붙인다.
     * DO NOT: API/bootstrap/unread/realtime 계약 변경.
     */
    pushCmR8PerfEvent(rid, "timeline_heavy_attach_scheduler", {
      has_timeline_seed: hasTimelineSeed,
      entry_slice_defer: entrySliceDefer,
      scheduler_mode: "same_tick_raf",
    });
    const rafOuter = requestAnimationFrame(() => {
      const rafInner = requestAnimationFrame(attachHeavy);
      if (cancelled) cancelAnimationFrame(rafInner);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafOuter);
    };
  }, [
    roomId,
    roomMessages.length,
    snapshot?.messages?.length,
    snapshot?.room.lastMessage,
    timelineViewportMounted,
    timelineVirtualizerGeneration,
  ]);

  useEffect(() => {
    const viewerId = snapshot?.viewerUserId?.trim() || initialServerSnapshot?.viewerUserId?.trim() || "";
    if (!viewerId || !roomReadyForRealtime) return;
    return acquireCommunityMessengerReadAckBroadcast(viewerId);
  }, [snapshot?.viewerUserId, initialServerSnapshot?.viewerUserId, roomReadyForRealtime]);
  const [busy, setBusy] = useState<string | null>(null);
  const [messageActionItem, setMessageActionItem] = useState<CommunityMessengerMessageActionOpenState | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<(CommunityMessengerMessage & { pending?: boolean }) | null>(
    null
  );
  /** 방 이동 시 답장 대상은 이전 방과 섞이지 않도록 초기화 */
  useEffect(() => {
    setReplyToMessage(null);
  }, [roomId]);

  const replyDraftTargetId = replyToMessage?.id ?? null;
  /** 대상 메시지가 목록에서 사라지면(삭제·나만 숨김·동기화) 답장 바를 비워 고아 상태 방지 */
  useEffect(() => {
    if (!replyDraftTargetId) return;
    if (loading) return;
    if (!roomMessages.some((m) => m.id === replyDraftTargetId)) {
      setReplyToMessage(null);
    }
  }, [roomMessages, replyDraftTargetId, loading]);

  const [callStubSheet, setCallStubSheet] = useState<CommunityMessengerMessageActionOpenState | null>(null);
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

  useLayoutEffect(() => {
    consumeCommunityMessengerRoomNavTap(roomId);
    beginCmRoomEntryPriorityMode(roomId);
    resetCmRoomEntryTraceSession(roomId);
    resetCmRoomR5TimelineMountInstrumentation(roomId);
    resetCmRoomR6DisplayReadyInstrumentation(roomId);
    resetCmRoomR7FirstRowCommitInstrumentation(roomId);
    cancelMessengerRoomEntryHydration("room_change");
    ensureCmRoomEntryRouteT0();
    attachMessengerRoomEntryHydrationSchedulerSurface(true);
    return () => {
      attachMessengerRoomEntryHydrationSchedulerSurface(false);
      endCmRoomEntryPriorityMode("room_unmount");
    };
  }, [roomId]);

  /** TRUE PASS-0 shell timing은 `CommunityMessengerRoomPass0Shell` 전용 — Phase1 에서 shell 스테이지를 찍지 않는다. */

  useMessengerRoomPhase1ViewerBootstrapDedupSync({
    snapshotViewerUserId: snapshot?.viewerUserId,
    viewerBootstrapDedupRef,
  });

  useMessengerRoomReaderScrollRoomLifecycle({ roomId });

  useEffect(() => {
    const syncPreferences = () => {
      setRoomPreferences(readCommunityMessengerLocalSettings());
    };
    // `roomPreferences` is initialized from the same read in `useState` above; skip
    // duplicate work on mount—`COMMUNITY_MESSENGER_PREFERENCE_EVENT` still resyncs when prefs change.
    if (typeof window === "undefined") return;
    window.addEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, syncPreferences as EventListener);
    return () => {
      window.removeEventListener(COMMUNITY_MESSENGER_PREFERENCE_EVENT, syncPreferences as EventListener);
    };
  }, []);

  const refreshBootstrapDepsRef = useRef({
    roomId,
    viewerBootstrapDedupRef,
    setSnapshot,
    setRoomMessages,
    setLoading,
    setRoomReadyForRealtime,
    loadedRef,
    deferredMemberBootstrapRef,
    silentRoomRefreshBusyRef,
    silentRoomRefreshAgainRef,
    silentBootstrapThrottleCoalesceTimerRef,
    swrDeferredBootstrapTimerRef,
  });
  refreshBootstrapDepsRef.current = {
    roomId,
    viewerBootstrapDedupRef,
    setSnapshot,
    setRoomMessages,
    setLoading,
    setRoomReadyForRealtime,
    loadedRef,
    deferredMemberBootstrapRef,
    silentRoomRefreshBusyRef,
    silentRoomRefreshAgainRef,
    silentBootstrapThrottleCoalesceTimerRef,
    swrDeferredBootstrapTimerRef,
  };

  const refreshBootstrapImplRef = useRef<ReturnType<typeof createMessengerRoomBootstrapRefresh> | null>(
    null
  );

  const ensureRefreshBootstrapImpl = useCallback(() => {
    if (refreshBootstrapImplRef.current) return refreshBootstrapImplRef.current;
    const d = refreshBootstrapDepsRef.current;
    refreshBootstrapImplRef.current = createMessengerRoomBootstrapRefresh({
      roomId: d.roomId,
      viewerBootstrapDedupRef: d.viewerBootstrapDedupRef,
      setSnapshot: d.setSnapshot,
      setRoomMessages: d.setRoomMessages,
      setLoading: d.setLoading,
      setRoomReadyForRealtime: d.setRoomReadyForRealtime,
      loadedRef: d.loadedRef,
      deferredMemberBootstrapRef: d.deferredMemberBootstrapRef,
      silentRoomRefreshBusyRef: d.silentRoomRefreshBusyRef,
      silentRoomRefreshAgainRef: d.silentRoomRefreshAgainRef,
      silentBootstrapThrottleCoalesceTimerRef: d.silentBootstrapThrottleCoalesceTimerRef,
      swrDeferredBootstrapTimerRef: d.swrDeferredBootstrapTimerRef,
    });
    return refreshBootstrapImplRef.current;
  }, []);

  /** trade shell-critical 첫 render — factory 생성을 첫 refresh 호출(대개 useEffect)까지 미룸 */
  const refreshBootstrap = useMemo((): ReturnType<typeof createMessengerRoomBootstrapRefresh> => {
    if (phase1EntryLightPass) {
      return (silent, opts) => ensureRefreshBootstrapImpl()(silent, opts);
    }
    return ensureRefreshBootstrapImpl();
  }, [ensureRefreshBootstrapImpl, phase1EntryLightPass, roomId]);

  const entrySilentBurstUntilRef = useRef(0);
  const entrySilentRefreshDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entrySilentBurstAwaitRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  /** RSC 시드가 있을 때만 — composer textarea 가 실제 visible 될 때까지 silent `refresh(true)` 보류 */
  const seededRoomEntryRef = useRef(Boolean(initialServerSnapshot));
  const seededFirstSilentHoldPromiseRef = useRef(Promise.resolve() as Promise<void>);
  const releaseSeededFirstSilentHoldRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    entrySilentBurstUntilRef.current =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) + ROOM_ENTRY_SILENT_REFRESH_BURST_MS;
    seededRoomEntryRef.current = Boolean(initialServerSnapshot);
    releaseSeededFirstSilentHoldRef.current?.();
    releaseSeededFirstSilentHoldRef.current = null;
    if (Boolean(initialServerSnapshot)) {
      seededFirstSilentHoldPromiseRef.current = new Promise<void>((resolve) => {
        releaseSeededFirstSilentHoldRef.current = () => {
          resolve();
        };
      });
    } else {
      seededFirstSilentHoldPromiseRef.current = Promise.resolve();
    }
    return () => {
      clearCmRoomForegroundBootstrapLock(roomId);
      clearCmBootstrapDebounceForRoom(roomId);
      releaseSeededFirstSilentHoldRef.current?.();
      releaseSeededFirstSilentHoldRef.current = null;
      if (swrDeferredBootstrapTimerRef.current != null) {
        clearTimeout(swrDeferredBootstrapTimerRef.current);
        swrDeferredBootstrapTimerRef.current = null;
      }
      if (entrySilentRefreshDebounceTimerRef.current != null) {
        clearTimeout(entrySilentRefreshDebounceTimerRef.current);
        entrySilentRefreshDebounceTimerRef.current = null;
      }
      const pending = entrySilentBurstAwaitRef.current;
      if (pending) {
        entrySilentBurstAwaitRef.current = null;
        pending.resolve();
      }
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps -- roomId 전환 시에만 시드·게이트 재설정

  const notifyComposerTextareaVisibleForSeededBootstrap = useCallback(() => {
    const release = releaseSeededFirstSilentHoldRef.current;
    if (release) {
      releaseSeededFirstSilentHoldRef.current = null;
      release();
    }
  }, []);

  const refresh = useCallback<MessengerRoomBootstrapRefreshFn>(
    async (silent, opts) => {
      if (silent === true && isDevSafeMode() && !opts?.forceSilentNetwork) {
        return;
      }
      if (silent === true && !opts?.forceSilentNetwork) {
        if (seededRoomEntryRef.current && releaseSeededFirstSilentHoldRef.current) {
          await seededFirstSilentHoldPromiseRef.current;
        }
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now < entrySilentBurstUntilRef.current) {
          let slot = entrySilentBurstAwaitRef.current;
          if (!slot) {
            let resolve!: () => void;
            const promise = new Promise<void>((r) => {
              resolve = r;
            });
            slot = { promise, resolve };
            entrySilentBurstAwaitRef.current = slot;
          }
          if (entrySilentRefreshDebounceTimerRef.current != null) {
            clearTimeout(entrySilentRefreshDebounceTimerRef.current);
          }
          const awaitSlot = slot;
          entrySilentRefreshDebounceTimerRef.current = setTimeout(() => {
            entrySilentRefreshDebounceTimerRef.current = null;
            void refreshBootstrap(true).finally(() => {
              entrySilentBurstAwaitRef.current = null;
              awaitSlot.resolve();
            });
          }, ROOM_ENTRY_SILENT_REFRESH_DEBOUNCE_MS);
          return awaitSlot.promise;
        }
      }
      await refreshBootstrap(silent, opts);
    },
    [refreshBootstrap]
  );

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

  useMessengerRoomBootstrapLifecycle({
    roomId,
    initialServerSnapshot,
    refresh,
    loadedRef,
    setRoomReadyForRealtime,
  });

  useEffect(() => {
    const snap = snapshot;
    const id = roomId.trim();
    if (!snap?.viewerUserId || !id) return;
    if (snap.clientShellPlaceholder) return;
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
      if (snap?.viewerUserId && id && !snap.clientShellPlaceholder) primeHotRoomSnapshot(id, snap);
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

  /**
   * 상대 `community_messenger_participants` UPDATE 가 오면 읽음 커서를 스냅샷에 즉시 반영한다.
   * `refresh(true)` 만 기다리면 silent 부트스트랩 400ms coalesce 등으로 라벨이 늦거나 유실될 수 있다.
   */
  const onParticipantPostgresForPeerRead = useCallback(
    (
      payload: {
        eventType: string;
        roomId: string;
        newRecord: Record<string, unknown> | null;
        oldRecord: Record<string, unknown> | null;
      },
      applySource: "participant_pg" | "read_ack_broadcast" = "participant_pg"
    ) => {
      const evRoom = payload.roomId.trim();
      const ledgerRoomId = streamRoomId.trim();
      const routeRoomId =
        typeof window !== "undefined"
          ? window.location.pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/)?.[1]?.trim().toLowerCase() ?? null
          : null;
      const activeRoomId = useMessengerRealtimeStore.getState().activeRoomId;
      if (!evRoom || !ledgerRoomId || evRoom.toLowerCase() !== ledgerRoomId.toLowerCase()) {
        cmRtReadSyncLog("event_ignored_reason", {
          roomId: ledgerRoomId,
          ignoredReason: "participant_room_id_mismatch",
          payloadRoomId: evRoom || null,
          streamRoomId: ledgerRoomId,
          routeRoomId,
          activeRoomId,
        });
        return;
      }
      if (payload.eventType === "DELETE") return;
      const row = payload.newRecord;
      if (!row) return;
      const peerUid = String(row.user_id ?? "").trim();
      const snap = snapshotRef.current;
      if (!snap || snap.room.roomType !== "direct" || !snap.readReceipt) {
        cmRtReadSyncLog("event_ignored_reason", {
          roomId: ledgerRoomId,
          viewerUserId: snap?.viewerUserId ?? null,
          ignoredReason: !snap ? "no_snapshot" : snap.room.roomType !== "direct" ? "not_direct_room" : "no_read_receipt",
          routeRoomId,
          activeRoomId,
        });
        return;
      }
      if (!peerUid || messengerUserIdsEqual(peerUid, snap.viewerUserId)) {
        cmRtReadSyncLog("event_ignored_reason", {
          roomId: ledgerRoomId,
          viewerUserId: snap.viewerUserId,
          participantUserId: peerUid || null,
          ignoredReason: "own_participant_row",
          isSelf: true,
          routeRoomId,
          activeRoomId,
        });
        return;
      }
      const lrmRaw = row.last_read_message_id;
      const lrmStr = typeof lrmRaw === "string" && lrmRaw.trim() ? lrmRaw.trim() : null;
      const lraRaw = row.last_read_at;
      const lraStr = typeof lraRaw === "string" && lraRaw.trim() ? lraRaw.trim() : null;
      if (!lrmStr && !lraStr) {
        cmRtReadSyncLog("event_ignored_reason", {
          roomId: ledgerRoomId,
          viewerUserId: snap.viewerUserId,
          participantUserId: peerUid,
          ignoredReason: "no_last_read_fields",
          routeRoomId,
          activeRoomId,
        });
        return;
      }

      cmRtReadSyncLog("participant_update_is_peer_read", {
        roomId: ledgerRoomId,
        viewerUserId: snap.viewerUserId,
        participantUserId: peerUid,
        lastReadMessageId: lrmStr,
        lastReadAt: lraStr,
        isPeer: true,
        routeRoomId,
        activeRoomId,
        channelScope: applySource,
      });

      const messageCreatedAtById = new Map<string, string>();
      for (const m of roomMessagesRef.current) {
        const id = String(m.id ?? "").trim();
        if (!id || m.pending) continue;
        const ca = typeof m.createdAt === "string" && m.createdAt.trim() ? m.createdAt.trim() : "";
        if (ca) messageCreatedAtById.set(id, ca);
      }
      for (const m of snap.messages) {
        const id = String(m.id ?? "").trim();
        if (!id || messageCreatedAtById.has(id)) continue;
        const ca = typeof m.createdAt === "string" && m.createdAt.trim() ? m.createdAt.trim() : "";
        if (ca) messageCreatedAtById.set(id, ca);
      }

      if (
        !shouldAdvancePeerReadReceiptCursor({
          prev: snap.readReceipt,
          nextMessageId: lrmStr,
          nextReadAt: lraStr,
          messageCreatedAtById,
        })
      ) {
        cmRtReadSyncLog("peer_read_pointer_before_after", {
          roomId: ledgerRoomId,
          viewerUserId: snap.viewerUserId,
          participantUserId: peerUid,
          before: {
            lastReadMessageId: snap.readReceipt?.lastReadMessageId ?? null,
            lastReadAt: snap.readReceipt?.lastReadAt ?? null,
          },
          after: { lastReadMessageId: lrmStr, lastReadAt: lraStr },
          ignoredReason: "shouldAdvancePeerReadReceiptCursor_false",
        });
        cmReadUiLog("peer_read_pointer_blocked", {
          roomId: ledgerRoomId,
          source: "realtime",
          peerUserId: peerUid,
          nextLastReadMessageId: lrmStr,
          nextLastReadAt: lraStr,
          prevLastReadMessageId: snap.readReceipt?.lastReadMessageId ?? null,
          reason: "shouldAdvancePeerReadReceiptCursor_false",
        });
        cmRtReadSyncLog("event_ignored_reason", {
          roomId: ledgerRoomId,
          viewerUserId: snap.viewerUserId,
          ignoredReason: "peer_read_cursor_not_advanced",
          routeRoomId,
          activeRoomId,
        });
        return;
      }

      let createdAtForCursor: string | undefined;
      if (lrmStr) {
        const fromLive = roomMessagesRef.current.find((m) => m.id === lrmStr)?.createdAt;
        const fromSnap = snap.messages.find((m) => m.id === lrmStr)?.createdAt;
        const t = fromLive ?? fromSnap;
        if (typeof t === "string" && t.trim()) createdAtForCursor = t.trim();
      }

      setSnapshot((prev) => {
        if (!prev || String(prev.room.id) !== String(snap.room.id) || !prev.readReceipt) return prev;
        return {
          ...prev,
          readReceipt: {
            ...prev.readReceipt,
            ...(lrmStr ? { lastReadMessageId: lrmStr } : {}),
            ...(lraStr ? { lastReadAt: lraStr } : {}),
            ...(createdAtForCursor != null ? { lastReadMessageCreatedAt: createdAtForCursor } : {}),
          },
        };
      });
      cmRtReadSyncLog("read_receipt_patch_apply", {
        roomId: ledgerRoomId,
        viewerUserId: snap.viewerUserId,
        participantUserId: peerUid,
        lastReadMessageId: lrmStr,
        lastReadAt: lraStr,
        routeRoomId,
        activeRoomId,
        channelScope: applySource,
      });
      cmRtReadSyncLog("peer_read_pointer_update", {
        roomId: ledgerRoomId,
        viewerUserId: snap.viewerUserId,
        participantUserId: peerUid,
        lastReadMessageId: lrmStr,
        lastReadAt: lraStr,
        channelScope: applySource,
      });
      cmRtReadSyncLog("bubble_unread_recomputed", {
        roomId: ledgerRoomId,
        viewerUserId: snap.viewerUserId,
        lastReadMessageId: lrmStr,
        channelScope: applySource,
      });
      if (applySource === "read_ack_broadcast") {
        cmRtReadSyncLog("bubble_unread_removed", {
          roomId: ledgerRoomId,
          viewerUserId: snap.viewerUserId,
          lastReadMessageId: lrmStr,
          channelScope: applySource,
        });
      }
      cmReadUiLog("peer_read_pointer_update", {
        roomId: ledgerRoomId,
        source: applySource === "read_ack_broadcast" ? "read_ack_broadcast" : "realtime",
        peerUserId: peerUid,
        lastReadMessageId: lrmStr,
        lastReadAt: lraStr,
        reason: applySource === "read_ack_broadcast" ? "read_ack_broadcast" : "participant_postgres_update",
      });
      cmReadUiLog("room_bubble_read_state_patch", {
        roomId: ledgerRoomId,
        source: "realtime",
        reason: "readReceipt_snapshot_merge",
      });
      const uid = snap.viewerUserId.trim();
      if (uid) {
        patchMessengerRoomSnapshotRuntime({
          viewerUserId: uid,
          roomId: ledgerRoomId,
          lastReadMessageId: lrmStr,
        });
        postCommunityMessengerBusEvent({
          type: "cm.room.summary_patch",
          roomId: ledgerRoomId,
          viewerUserId: uid,
          lastReadMessageId: lrmStr ?? null,
          at: Date.now(),
        });
        queueMicrotask(() => {
          forgetMessengerRoomClientBootstrapFlights({ roomId: ledgerRoomId, viewerUserId: uid });
          void refresh(true, { forceSilentNetwork: true, triggerReason: "read_patch_force_network" });
        });
      }
    },
    [streamRoomId, refresh]
  );

  useEffect(() => {
    const viewerId = snapshotRef.current?.viewerUserId?.trim() || initialServerSnapshot?.viewerUserId?.trim() || "";
    if (!viewerId) return;
    const rid = String(roomId ?? "").trim();
    const ridNorm = normalizeMessengerRealtimeRoomId(rid);
    const ledgerNorm = normalizeMessengerRealtimeRoomId(String(streamRoomId ?? "").trim());
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.type !== "cm.room.peer_read_ack") return;
      const evRoomNorm = normalizeMessengerRealtimeRoomId(ev.roomId);
      if (evRoomNorm !== ledgerNorm && evRoomNorm !== ridNorm) return;
      if (messengerUserIdsEqual(ev.readerUserId, viewerId)) return;
      onParticipantPostgresForPeerRead(
        {
          eventType: "UPDATE",
          roomId: ev.roomId,
          newRecord: {
            user_id: ev.readerUserId,
            room_id: ev.roomId,
            last_read_message_id: ev.lastReadMessageId,
            last_read_at: ev.lastReadAt,
          },
          oldRecord: null,
        },
        "read_ack_broadcast"
      );
    });
  }, [initialServerSnapshot?.viewerUserId, onParticipantPostgresForPeerRead, roomId, streamRoomId]);

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
    peerTailMarkReadHintRef,
    setRoomMessages,
    onParticipantPostgres: onParticipantPostgresForPeerRead,
    onRefresh: () => {
      // Realtime 메시지 이벤트가 RLS/Publication/세션 레이스로 누락돼도
      // 방 화면은 unread/participants 변화(onRefresh)만으로 즉시 증분 동기화해 따라잡는다.
      void (async () => {
        const mergedNewMessages = await catchUpNewerMessages();
        /**
         * 신규 메시지는 `after=` 증분·ingest 로 이미 반영됐으면 silent_delta(full) 생략.
         * 상대 mark_read·참가자 메타만 온 경우(증분 false)는 `silent_delta` 로 읽음·unread 만 맞춘다.
         */
        if (!mergedNewMessages) {
          void refresh(true, { triggerReason: "realtime_on_refresh" });
        }
      })();
    },
  });

  if (phase1PerfTrack) endTradePhase1BreakdownSection("realtime_prepare");

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
      messageActionItem?.item.id ?? "no-message-action",
      callStubSheet?.item.id ?? "no-call-stub",
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
    messageActionItem?.item.id,
    callStubSheet?.item.id,
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
    peerTailMarkReadHintRef,
  });

  if (phase1PerfTrack) endTradePhase1BreakdownSection("read_state_init");

  useEffect(() => {
    if (!snapshot) {
      /** hydrate 중 snapshot 일시 null — 기존 timeline·cached seed 유지(빈 타임라인 flash 방지) */
      return;
    }
    if (roomMessagesRef.current === snapshot.messages && roomMessagesRef.current.length > 0) {
      recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_map_index_ms", 0);
      recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_dedupe_ms", 0);
      recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_normalize_ms", 0);
      recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_sort_ms", 0);
      recordRouteEntryElapsedMetricOnce("messenger_room_entry", "room_snapshot_messages_merge_applied_ms");
      return;
    }
    setRoomMessages((prev) => {
      let next: Array<CommunityMessengerMessage & { pending?: boolean }>;
      if (prev.length === 0) {
        recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_map_index_ms", 0);
        recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_dedupe_ms", 0);
        recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_normalize_ms", 0);
        recordRouteEntryMetric("messenger_room_entry", "initial_messages_merge_sort_ms", 0);
        next = snapshot.messages;
      } else if ((snapshot.messages?.length ?? 0) === 0 && Boolean(snapshot.room.lastMessage?.trim())) {
        /** hydrate wave 가 빈 messages[] 만 내려줄 때 기존 cached timeline 유지 */
        return prev;
      } else {
        next = mergeRoomMessages(prev, snapshot.messages, {
          perfScope: "messenger_room_entry",
          perfMetricPrefix: "initial_messages_merge",
        });
      }
      if (next.length > 0) {
        recordRouteEntryElapsedMetricOnce("messenger_room_entry", "room_snapshot_messages_merge_applied_ms");
      }
      return next;
    });
  }, [snapshot]);

  useEffect(() => {
    if (roomMessages.length <= 0) return;
    messagesStateCommitCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "messages_state_commit_count", messagesStateCommitCountRef.current);
  }, [roomMessages]);

  const { oldestLoadedMessageId, loadOlderMessages, hydrateFullOlderMessageHistory } =
    useMessengerRoomLoadOlderMessagesFetch({
    roomId,
    snapshot,
    snapshotRef,
    roomMessages,
    roomMessagesRef,
    setRoomMessages,
    messagesViewportRef,
    olderMessagesExhaustedRef,
    loadOlderMessagesRef,
    hasMoreOlderMessages,
    hasMoreOlderMessagesRef,
    setHasMoreOlderMessages,
    loadingOlderMessages,
    setLoadingOlderMessages,
  });
  hasMoreOlderMessagesRef.current = hasMoreOlderMessages;

  useMessengerRoomEagerOlderHistoryHydration({
    roomId,
    snapshot,
    roomMessageCount: roomMessages.length,
    timelineViewportMounted,
    hydrateFullOlderMessageHistory,
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

  const roomMembersDisplay = useMemo(() => {
    const tMemo0 = typeof performance !== "undefined" ? performance.now() : 0;
    if (!snapshot) {
      if (phase1PerfTrack) noteTradePhase1MemoWorkMs((typeof performance !== "undefined" ? performance.now() : 0) - tMemo0);
      return [];
    }
    const baseIds = new Set(snapshot.members.map((m) => m.id));
    const extra = pagedRoomMembers.filter((m) => !baseIds.has(m.id));
    const merged = [...snapshot.members, ...extra];
    if (phase1PerfTrack) noteTradePhase1MemoWorkMs((typeof performance !== "undefined" ? performance.now() : 0) - tMemo0);
    return merged;
  }, [snapshot, pagedRoomMembers]);

  useEffect(() => {
    roomMembersDisplayRef.current = roomMembersDisplay;
    if (roomMembersDisplay.length <= 0) return;
    profilesStateCommitCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "profiles_state_commit_count", profilesStateCommitCountRef.current);
  }, [roomMembersDisplay]);

  useEffect(() => {
    if (!snapshot || snapshot.members.length <= 0) return;
    participantsStateCommitCountRef.current += 1;
    recordRouteEntryMetric(
      "messenger_room_entry",
      "participants_state_commit_count",
      participantsStateCommitCountRef.current
    );
  }, [snapshot]);

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
    if (phase1EntryLightPass) return [];
    const memberIds = new Set(roomMembersDisplay.map((member) => member.id));
    return friends.filter((friend) => !memberIds.has(friend.id));
  }, [friends, roomMembersDisplay, phase1EntryLightPass]);
  const filteredInviteCandidates = useMemo(() => {
    if (phase1EntryLightPass) return [];
    const keyword = inviteSearchQuery.trim().toLowerCase();
    if (!keyword) return inviteCandidates;
    return inviteCandidates.filter((friend) => {
      const haystack = [friend.label, friend.subtitle ?? ""].join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [inviteCandidates, inviteSearchQuery, phase1EntryLightPass]);
  const selectedInviteCandidates = useMemo(() => {
    if (phase1EntryLightPass) return [];
    const inviteMap = new Map(inviteCandidates.map((friend) => [friend.id, friend]));
    return inviteIds.map((id) => inviteMap.get(id)).filter((friend): friend is CommunityMessengerProfileLite => Boolean(friend));
  }, [inviteCandidates, inviteIds, phase1EntryLightPass]);

  const dismissRoomSheet = useCallback(() => {
    setActiveSheet(null);
    setInfoSheetFocus(null);
    setRoomSearchQuery("");
    setInviteSearchQuery("");
    setInviteIds([]);
  }, []);

  const messageSearchResults = timelineHeavyBundle?.messageSearchResults ?? [];
  const mediaGalleryMessages = timelineHeavyBundle?.mediaGalleryMessages ?? [];
  const linkThreadMessages = timelineHeavyBundle?.linkThreadMessages ?? [];
  const displayRoomMessagesBootstrap = useMemo(() => {
    const tMemo0 = typeof performance !== "undefined" ? performance.now() : 0;
    const filtered = roomMessages.filter(
      (m) => !(m.messageType === "call_stub" && hiddenCallStubIds.has(m.id))
    );
    const result = phase1EntryLightPass
      ? filtered
      : finalizeStoreOrderChatDisplayMessages(filtered);
    if (phase1PerfTrack) noteTradePhase1MemoWorkMs((typeof performance !== "undefined" ? performance.now() : 0) - tMemo0);
    return result;
  }, [hiddenCallStubIds, roomMessages, phase1EntryLightPass, phase1PerfTrack]);
  if (phase1PerfTrack) endTradePhase1BreakdownSection("messages_normalize");
  const displayRoomMessages =
    timelineHeavyBundle?.displayRoomMessages ?? displayRoomMessagesBootstrap;
  useEffect(() => {
    const rid = roomId.trim();
    if (!rid) return;
    pushCmR8PerfEvent(rid, "phase1_rows_display_count", {
      phase1_seed_message_count: roomMessages.length,
      bootstrap_message_count: snapshot?.messages?.length ?? 0,
      display_message_count: displayRoomMessages.length,
    });
  }, [displayRoomMessages.length, roomId, roomMessages.length, snapshot?.messages?.length]);
  const fileMessages = timelineHeavyBundle?.fileMessages ?? [];
  const managementEventMessages = timelineHeavyBundle?.managementEventMessages ?? [];
  const photoMessageCount = timelineHeavyBundle?.photoMessageCount ?? 0;
  const voiceMessageCount = timelineHeavyBundle?.voiceMessageCount ?? 0;
  const fileMessageCount = timelineHeavyBundle?.fileMessageCount ?? 0;
  const linkMessageCount = timelineHeavyBundle?.linkMessageCount ?? 0;
  const chatVirtualizer = timelineHeavyBundle?.chatVirtualizer ?? CM_ROOM_EMPTY_VIRTUALIZER_STUB;

  const tradeDockScrollAnchorEnabled = useMemo(() => {
    const room = snapshot?.room;
    const meta = room?.contextMeta;
    if (!room || room.roomType !== "direct" || !meta || meta.kind !== "trade") return false;
    const pcid = typeof meta.productChatId === "string" ? meta.productChatId.trim() : "";
    return pcid.length > 0;
  }, [snapshot?.room]);

  const storeOrderDockScrollAnchorEnabled = useMemo(() => {
    const room = snapshot?.room;
    const meta = room?.contextMeta;
    if (!room || room.roomType !== "direct" || !meta || meta.kind !== "delivery") return false;
    const orderId = typeof meta.storeOrderId === "string" ? meta.storeOrderId.trim() : "";
    return orderId.length > 0;
  }, [snapshot?.room]);

  const { scrollMessengerToBottom, updateStickToBottomFromScroll } = useMessengerRoomReaderScrollBottom({
    roomId,
    activeSheet,
    stickToBottomRef,
    messagesViewportRef,
    messageEndRef,
    roomMessages,
    deferEntryScrollToDeliveryDirectTimeline: storeOrderDockScrollAnchorEnabled,
  });

  useEffect(() => {
    urlDeepLinkMessageHandledRef.current = "";
  }, [roomId]);

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
      phase1EntryLightPass
        ? 0
        : roomMembersDisplay.filter(
            (member) =>
              member.memberRole === "admin" &&
              (!snapshot?.room.ownerUserId || !messengerUserIdsEqual(member.id, snapshot.room.ownerUserId))
          ).length,
    [snapshot?.room.ownerUserId, roomMembersDisplay, phase1EntryLightPass]
  );
  const aliasProfileCount = useMemo(
    () =>
      phase1EntryLightPass
        ? 0
        : roomMembersDisplay.filter((member) => member.identityMode === "alias").length,
    [roomMembersDisplay, phase1EntryLightPass]
  );
  const sortedMembers = useMemo(() => {
    const tMemo0 = typeof performance !== "undefined" ? performance.now() : 0;
    if (!snapshot) {
      if (phase1PerfTrack) noteTradePhase1MemoWorkMs((typeof performance !== "undefined" ? performance.now() : 0) - tMemo0);
      return [];
    }
    if (phase1EntryLightPass) {
      if (phase1PerfTrack) noteTradePhase1MemoWorkMs((typeof performance !== "undefined" ? performance.now() : 0) - tMemo0);
      return roomMembersDisplay;
    }
    const sorted = [...roomMembersDisplay].sort((left, right) => {
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
    if (phase1PerfTrack) noteTradePhase1MemoWorkMs((typeof performance !== "undefined" ? performance.now() : 0) - tMemo0);
    return sorted;
  }, [snapshot, roomMembersDisplay, phase1EntryLightPass, phase1PerfTrack]);
  if (phase1PerfTrack) endTradePhase1BreakdownSection("participants_normalize");
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

  const clearTimelineMessageHighlight = useCallback(() => {
    if (timelineHighlightTimerRef.current != null) {
      clearTimeout(timelineHighlightTimerRef.current);
      timelineHighlightTimerRef.current = null;
    }
    setTimelineHighlightMessageId(null);
  }, []);

  const flashTimelineMessageHighlight = useCallback(
    (messageId: string) => {
      clearTimelineMessageHighlight();
      setTimelineHighlightMessageId(messageId);
      timelineHighlightTimerRef.current = window.setTimeout(() => {
        setTimelineHighlightMessageId(null);
        timelineHighlightTimerRef.current = null;
      }, 1800);
    },
    [clearTimelineMessageHighlight]
  );

  const focusTimelineMessage = useCallback(
    async (messageId: string) => {
      const mid = messageId.trim();
      if (!mid) return;
      dismissRoomSheet();
      const messageInList = () => roomMessagesRef.current.some((m) => m.id === mid);
      let guard = 0;
      while (!messageInList() && hasMoreOlderMessagesRef.current && !olderMessagesExhaustedRef.current && guard < 80) {
        guard += 1;
        await loadOlderMessages();
        for (let i = 0; i < 30; i += 1) {
          if (messageInList()) break;
          await new Promise<void>((r) => {
            window.setTimeout(r, 16);
          });
        }
      }
      if (!messageInList()) {
        showMessengerSnackbar("메시지를 찾을 수 없습니다.", { variant: "error" });
        return;
      }
      scrollToRoomMessage(mid);
      window.requestAnimationFrame(() => {
        flashTimelineMessageHighlight(mid);
      });
    },
    [dismissRoomSheet, flashTimelineMessageHighlight, loadOlderMessages, scrollToRoomMessage]
  );

  const urlDeepLinkMessageId = (searchParams.get("msg") ?? "").trim();
  useEffect(() => {
    if (!urlDeepLinkMessageId || loading || !snapshot) return;
    const key = `${streamRoomId}:${urlDeepLinkMessageId}`;
    if (urlDeepLinkMessageHandledRef.current === key) return;
    urlDeepLinkMessageHandledRef.current = key;
    void focusTimelineMessage(urlDeepLinkMessageId);
  }, [urlDeepLinkMessageId, loading, snapshot, streamRoomId, focusTimelineMessage]);

  const loadFriends = useCallback(async () => {
    if (friendsLoaded) return;
    const res = await fetch("/api/community-messenger/friends", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; friends?: CommunityMessengerProfileLite[] };
    setFriends(res.ok && json.ok ? json.friends ?? [] : []);
    setFriendsLoaded(true);
  }, [friendsLoaded]);
  if (phase1PerfTrack) {
    endTradePhase1BreakdownSection("memo_compute");
    finalizeTradePhase1Breakdown();
  }
  return {
  timelineHeavyLive,
  timelineVirtualizerGeneration,
  notifyTimelineViewportMounted,
  onTimelineHeavyReady,
  timelineHeavyHostInput: {
    roomId,
    roomMessages,
    hiddenCallStubIds,
    roomSearchQuery,
    messagesViewportRef,
    tradeDockScrollAnchorEnabled,
    storeOrderDockScrollAnchorEnabled,
    messageEndRef,
    stickToBottomRef,
  },
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
  notifyComposerTextareaVisibleForSeededBootstrap,
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
  timelineHighlightMessageId,
  focusTimelineMessage,
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

