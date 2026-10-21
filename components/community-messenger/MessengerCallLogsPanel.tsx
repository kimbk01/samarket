"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { markCallScreenPushEntry } from "@/lib/community-messenger/call-v4/call-return-navigation";
import { CommunityMessengerCallHistory } from "@/components/community-messenger/call-history/CommunityMessengerCallHistory";
import {
  CommunityMessengerCallPeerDetailPanel,
  type CallPeerDetailSelection,
} from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailPanel";
import { CommunityMessengerCallPeerDetailShell } from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailShell";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import {
  enrichCommunityMessengerCallLogsWithProfiles,
  normalizeCommunityMessengerCallLogs,
} from "@/lib/community-messenger/call-log-row-copy";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import {
  appendCommunityMessengerCallLogsById,
  fetchCommunityMessengerCallLogsClient,
  useCommunityCallHistoryRealtimeSync,
} from "@/lib/community-messenger/call-history/use-community-call-history-realtime-sync";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { alertOutgoingCallFailure } from "@/lib/community-messenger/call-outgoing-failure-alert";
import { callEngineActions } from "@/lib/community-messenger/call-engine";
import {
  guardInstantOutgoingCallStart,
  isOutgoingCallPhoneVerificationRequired,
  navigateBlockedOutgoingCall,
} from "@/lib/call/outgoing-call-start-guard";
import { callLogsIdentityKey, mergeCallLogsFirstPage } from "@/lib/community-messenger/call-history/call-logs-panel-merge";
import { resolveCallHistoryRedialRoomClient } from "@/lib/community-messenger/call-history/call-history-redial-room-client";
import { getCurrentUserIdForDb, getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import type { CommunityMessengerCallLog, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

function sanitizeCallPeerUserId(peerUserId: string | null | undefined): string | null {
  const raw = peerUserId?.trim() ?? "";
  if (!raw || raw.startsWith("peer:") || raw.startsWith("room:")) return null;
  return raw;
}

function resolveCallPeerRoomId(peerUserId: string, roomId: string | null | undefined): string | null {
  const direct = roomId?.trim();
  if (direct) return direct;
  const peer = peerUserId.trim();
  if (peer.startsWith("room:")) return peer.slice(5).trim() || null;
  return null;
}

type Props = {
  seedCalls?: CommunityMessengerCallLog[];
  callsHydrating?: boolean;
  entryOrigin?: string | null;
  viewerUserId?: string | null;
  peerProfiles?: CommunityMessengerProfileLite[];
  /** 메신저 홈 — 채팅 목록과 동일 스와이프 상태 공유 */
  openedSwipeItemId?: string | null;
  onOpenSwipeItem?: (id: string | null) => void;
  messengerOverlayGeneration?: number;
  onListScrollStart?: () => void;
  /** 메신저 홈 bootstrap `data.calls` 와 RT refetch 결과 동기화 */
  onBootstrapCallsChange?: (calls: CommunityMessengerCallLog[]) => void;
};

/** 기본값 배열은 렌더마다 새로 만들면 seed effect 가 무한 반복된다 (C-1) */
const EMPTY_CALLS: CommunityMessengerCallLog[] = [];
const EMPTY_PROFILES: CommunityMessengerProfileLite[] = [];

type OutgoingConfirmState = {
  call: CommunityMessengerCallLog;
  kind: "voice" | "video";
  peerLabel: string;
};

/** 통화 목록 본문 — 독립 페이지·메신저 홈 탭 공용 */
export function MessengerCallLogsPanel({
  seedCalls = EMPTY_CALLS,
  callsHydrating = false,
  entryOrigin = null,
  viewerUserId = null,
  peerProfiles = EMPTY_PROFILES,
  openedSwipeItemId: controlledOpenedSwipeItemId,
  onOpenSwipeItem: controlledOnOpenSwipeItem,
  messengerOverlayGeneration,
  onListScrollStart,
  onBootstrapCallsChange,
}: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [asyncViewerUserId, setAsyncViewerUserId] = useState<string | null>(null);
  const resolvedViewerUserId = viewerUserId?.trim() || getSyncViewerUserIdForClient() || asyncViewerUserId || null;
  /** C-18: 단독 페이지는 viewerUserId 를 받지 않는다 — 프로필 캐시가 늦으면 비동기로 채워 첫 조회를 보장 */
  useEffect(() => {
    if (resolvedViewerUserId) return;
    let cancelled = false;
    void getCurrentUserIdForDb().then((id) => {
      if (!cancelled && id?.trim()) setAsyncViewerUserId(id.trim());
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedViewerUserId]);
  const [calls, setCalls] = useState<CommunityMessengerCallLog[]>(seedCalls);
  const [loading, setLoading] = useState(callsHydrating);
  const [error, setError] = useState<string | null>(null);
  const [peerDetailOpen, setPeerDetailOpen] = useState(false);
  const [peerDetailSelection, setPeerDetailSelection] = useState<CallPeerDetailSelection | null>(null);
  const [localOpenedSwipeItemId, setLocalOpenedSwipeItemId] = useState<string | null>(null);
  const swipeControlled = controlledOnOpenSwipeItem != null;
  const openedSwipeItemId = swipeControlled ? (controlledOpenedSwipeItemId ?? null) : localOpenedSwipeItemId;
  const setOpenedSwipeItemId = useCallback(
    (id: string | null) => {
      if (swipeControlled) controlledOnOpenSwipeItem!(id);
      else setLocalOpenedSwipeItemId(id);
    },
    [controlledOnOpenSwipeItem, swipeControlled]
  );
  const [outgoingConfirm, setOutgoingConfirm] = useState<OutgoingConfirmState | null>(null);
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null);
  const [outgoingBusy, setOutgoingBusy] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const mountRefreshDoneRef = useRef(false);
  const skipMountRefetchOnceRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);
  nextCursorRef.current = nextCursor;
  /** 2페이지 이상 불러왔는지 — 첫 페이지 재조회 시 병합 여부 */
  const loadedBeyondFirstPageRef = useRef(false);
  /** 부모(`data.calls`)로 내보낸 배열 — 되돌아온 seed 는 다시 적용하지 않는다 (C-2) */
  const lastEmittedCallsRef = useRef<CommunityMessengerCallLog[] | null>(null);
  const callsCountRef = useRef(0);
  callsCountRef.current = calls.length;
  const emitBootstrapCalls = useCallback(
    (next: CommunityMessengerCallLog[]) => {
      lastEmittedCallsRef.current = next;
      onBootstrapCallsChange?.(next);
    },
    [onBootstrapCallsChange]
  );

  const enrichCalls = useCallback(
    (entries: CommunityMessengerCallLog[]) =>
      enrichCommunityMessengerCallLogsWithProfiles(normalizeCommunityMessengerCallLogs(entries), peerProfiles),
    [peerProfiles]
  );

  /** CUT-2B: realtime / visibility / mount — replace with first page only; clear older pages */
  const applyFirstPageFromServer = useCallback(
    (page: { calls: CommunityMessengerCallLog[]; nextCursor: string | null; hasMore: boolean }) => {
      const enriched = enrichCalls(page.calls);
      if (loadedBeyondFirstPageRef.current) {
        setCalls((prev) => {
          const merged = mergeCallLogsFirstPage(prev, enriched);
          emitBootstrapCalls(merged);
          return merged;
        });
      } else {
        setCalls(enriched);
        setNextCursor(page.nextCursor);
        setHasMore(page.hasMore);
        emitBootstrapCalls(enriched);
      }
      setLoadMoreError(null);
      setLoading(false);
      setError(null);
    },
    [emitBootstrapCalls, enrichCalls]
  );

  const refetchCallLogsFromServer = useCallback(async () => {
    const fetched = await fetchCommunityMessengerCallLogsClient();
    if (fetched) {
      applyFirstPageFromServer(fetched);
      return;
    }
    if (callsCountRef.current === 0) {
      setError(t("cm_ui_call_logs_load_failed"));
      setLoading(false);
    }
  }, [applyFirstPageFromServer, t]);

  const onLoadMore = useCallback(async () => {
    const cursor = nextCursorRef.current?.trim();
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    const page = await fetchCommunityMessengerCallLogsClient({ cursor });
    setLoadingMore(false);
    if (!page) {
      setLoadMoreError(t("cm_ui_call_logs_load_failed"));
      return;
    }
    loadedBeyondFirstPageRef.current = true;
    setCalls((prev) => {
      const merged = appendCommunityMessengerCallLogsById(prev, enrichCalls(page.calls));
      emitBootstrapCalls(merged);
      return merged;
    });
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
  }, [emitBootstrapCalls, enrichCalls, loadingMore, t]);

  useCommunityCallHistoryRealtimeSync({
    enabled: Boolean(resolvedViewerUserId),
    viewerUserId: resolvedViewerUserId,
    onRefetch: refetchCallLogsFromServer,
  });

  useEffect(() => {
    if (callsHydrating) {
      skipMountRefetchOnceRef.current = true;
    }
  }, [callsHydrating]);

  useEffect(() => {
    if (callsHydrating || mountRefreshDoneRef.current || !resolvedViewerUserId) return;
    mountRefreshDoneRef.current = true;
    if (skipMountRefetchOnceRef.current) {
      skipMountRefetchOnceRef.current = false;
      return;
    }
    void refetchCallLogsFromServer();
  }, [callsHydrating, refetchCallLogsFromServer, resolvedViewerUserId]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      void refetchCallLogsFromServer();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetchCallLogsFromServer]);

  const closeCallLogSwipe = useCallback(() => {
    setOpenedSwipeItemId(null);
  }, [setOpenedSwipeItemId]);

  useEffect(() => {
    if (!outgoingConfirm && !peerDetailOpen) return;
    closeCallLogSwipe();
  }, [closeCallLogSwipe, outgoingConfirm, peerDetailOpen]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (messengerOverlayGeneration == null) return;
    setOpenedSwipeItemId(null);
  }, [messengerOverlayGeneration, setOpenedSwipeItemId]);

  /** 외부 seed(부트스트랩) 반영 — 우리가 내보낸 배열이 되돌아온 경우는 커서·페이지를 유지 (C-1·C-2) */
  const seedKey = callLogsIdentityKey(seedCalls);
  const lastAppliedSeedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (seedCalls === lastEmittedCallsRef.current) {
      lastAppliedSeedKeyRef.current = seedKey;
      return;
    }
    /** 상위 `?? []` 등으로 배열 참조만 새로 만들어진 경우 — 같은 내용이면 다시 적용하지 않는다 */
    if (lastAppliedSeedKeyRef.current === seedKey) return;
    if (seedCalls.length === 0 && callsCountRef.current > 0) return;
    lastAppliedSeedKeyRef.current = seedKey;
    setCalls(enrichCalls(seedCalls));
    setNextCursor(null);
    setHasMore(false);
    setLoadMoreError(null);
    loadedBeyondFirstPageRef.current = false;
    if (!callsHydrating) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedKey 로 내용 변경만 반영 (C-1)
  }, [seedKey, callsHydrating, enrichCalls]);

  useEffect(() => {
    if (!callsHydrating) return;
    setLoading(true);
    setError(null);
  }, [callsHydrating]);

  const onRowNavigate = useCallback(
    (call: CommunityMessengerCallLog) => {
      closeCallLogSwipe();

      if (call.sessionMode !== "group") {
        const vm = presentCallHistoryRow(call);
        const peerUserId = sanitizeCallPeerUserId(call.peerUserId) ?? sanitizeCallPeerUserId(vm.peerUserId) ?? "";
        setPeerDetailSelection({
          peerUserId: peerUserId || `room:${call.roomId?.trim() || call.id}`,
          /** 이 기록의 방만 — 다른 기록 행의 방으로 대체하지 않는다(재발신은 서버가 해석). */
          roomId: call.roomId?.trim() || null,
          peerName: vm.peerName,
          peerPublicId: vm.peerPublicId,
          peerDisplayLabel: vm.peerDisplayLabel,
          peerAvatarUrl: vm.peerAvatarUrl,
        });
        setPeerDetailOpen(true);
        return;
      }

      const roomId = call.roomId?.trim();
      if (roomId) {
        void runCommunityMessengerRoomForwardNavigation({
          router,
          roomId,
          listSource: "inbox",
          fromEntryOrigin: entryOrigin,
          viewerUserId,
        });
        return;
      }
      const sid = call.sessionId?.trim();
      if (sid) {
        const href = `/community-messenger/calls/${encodeURIComponent(sid)}`;
        /** P-7 — push 진입 토큰: 종료 시 back 1회로 통화 기록에 돌아온다 */
        markCallScreenPushEntry(sid, href);
        if (!callEngineActions.pushRouteOnce(router, sid, href)) {
          router.push(href);
        }
      }
    },
    [closeCallLogSwipe, entryOrigin, router, viewerUserId]
  );

  const onRequestOutgoingConfirm = useCallback(
    (call: CommunityMessengerCallLog, kind: "voice" | "video") => {
      closeCallLogSwipe();
      const vm = presentCallHistoryRow(call);
      setOutgoingConfirm({ call, kind, peerLabel: vm.peerDisplayLabel });
    },
    [closeCallLogSwipe]
  );

  const performDeleteCallLog = useCallback(
    async (call: CommunityMessengerCallLog) => {
      const targetId = call.id?.trim();
      if (!targetId || deletingCallId) return;
      setDeletingCallId(targetId);
      closeCallLogSwipe();
      try {
        const res = await fetch(`/api/community-messenger/calls/logs/${encodeURIComponent(targetId)}`, {
          method: "DELETE",
          credentials: "include",
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (!res.ok || !json.ok) {
          showMessengerSnackbar(t("cm_ui_call_log_delete_failed"), { variant: "error" });
          return;
        }
        setCalls((prev) => {
          const next = prev.filter((row) => row.id !== targetId);
          emitBootstrapCalls(next);
          return next;
        });
        showMessengerSnackbar(
          safeT("cm_ui_call_log_deleted", {
            fallbackKo: "통화 기록을 삭제했습니다.",
            fallbackEn: "Call log deleted.",
          }),
          { variant: "success" }
        );
      } catch {
        showMessengerSnackbar(t("cm_ui_call_log_delete_failed"), { variant: "error" });
      } finally {
        setDeletingCallId(null);
      }
    },
    [closeCallLogSwipe, deletingCallId, emitBootstrapCalls, safeT, t]
  );

  const onDeleteRequest = useCallback(
    (call: CommunityMessengerCallLog) => {
      void performDeleteCallLog(call);
    },
    [performDeleteCallLog]
  );

  const handlePeerDetailClosed = useCallback(() => {
    setPeerDetailOpen(false);
    setPeerDetailSelection(null);
  }, []);

  const handleOutgoingConfirm = useCallback(() => {
    const next = outgoingConfirm;
    if (!next || outgoingBusy) return;
    const vm = presentCallHistoryRow(next.call);
    const peerUserId =
      sanitizeCallPeerUserId(next.call.peerUserId) ??
      sanitizeCallPeerUserId(vm.peerUserId) ??
      sanitizeCallPeerUserId(peerDetailSelection?.peerUserId);
    /** 기록의 방은 "후보"일 뿐 — 통화 가능 여부·canonical 대체는 서버(`/calls/redial-room`)가 결정. */
    const historicRoomId =
      next.call.roomId?.trim() ||
      resolveCallPeerRoomId(peerDetailSelection?.peerUserId ?? "", peerDetailSelection?.roomId) ||
      null;

    if (!peerUserId && !historicRoomId) {
      alertOutgoingCallFailure(
        safeT("cm_ui_call_outgoing_missing_room", {
          fallbackKo: "통화를 시작할 수 없습니다. 상대 정보가 없습니다.",
          fallbackEn: "Cannot start the call. Peer information is missing.",
        }),
      );
      return;
    }

    const guard = guardInstantOutgoingCallStart({ peerUserId, kind: next.kind, roomId: historicRoomId });
    if (!guard.ok) {
      if (isOutgoingCallPhoneVerificationRequired(guard)) return;
      setOutgoingConfirm(null);
      /** 홈 `startDirectCall` 과 동일 — 진행 중 통화가 있으면 그 통화 화면으로. */
      if (guard.blockedCallId) navigateBlockedOutgoingCall(router, guard.blockedCallId);
      else alertOutgoingCallFailure(guard.userMessage);
      return;
    }

    setOutgoingBusy(true);
    setOutgoingConfirm(null);
    setPeerDetailOpen(false);

    logCallV4("video_confirm_clicked", {
      kind: next.kind,
      peerUserId: peerUserId || undefined,
      roomId: historicRoomId || undefined,
    });

    void (async () => {
      try {
        const resolved = await resolveCallHistoryRedialRoomClient({ peerUserId, roomId: historicRoomId });
        if (!resolved.ok) {
          logCallV4("video_confirm_redial_room_failed", {
            kind: next.kind,
            peerUserId: peerUserId || undefined,
            roomId: historicRoomId || undefined,
            error: resolved.error,
          });
          if (!resolved.phoneVerificationRequired) alertOutgoingCallFailure(resolved.userMessage);
          return;
        }
        logCallV4("video_confirm_launch_with_room", {
          kind: next.kind,
          peerUserId: peerUserId || undefined,
          roomId: resolved.roomId,
          historicRoomId: historicRoomId || undefined,
          source: resolved.source,
        });
        const result = await launchOutgoingDirectCall(
          {
            kind: next.kind,
            roomId: resolved.roomId,
            peerUserId: peerUserId || undefined,
            peerLabel: next.peerLabel,
          },
          router
        );
        if (!result.ok) {
          if (isOutgoingCallPhoneVerificationRequired(result)) return;
          alertOutgoingCallFailure(result.userMessage);
        }
      } catch {
        alertOutgoingCallFailure(t("cm_ui_network_error_could_not_start_call"));
      } finally {
        setOutgoingBusy(false);
      }
    })();
  }, [
    outgoingBusy,
    outgoingConfirm,
    peerDetailSelection?.peerUserId,
    peerDetailSelection?.roomId,
    router,
    safeT,
    t,
  ]);

  const peerDetailCalls = useMemo(() => calls, [calls]);

  const overlayDialogs =
    portalReady && outgoingConfirm
      ? createPortal(
          <div className="relative z-[1400]">
            <MessengerOutgoingCallConfirmDialog
              open
              peerLabel={outgoingConfirm.peerLabel}
              kind={outgoingConfirm.kind}
              busy={outgoingBusy}
              onCancel={() => {
                if (!outgoingBusy) setOutgoingConfirm(null);
              }}
              onConfirm={handleOutgoingConfirm}
            />
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <CommunityMessengerCallHistory
        calls={calls}
        loading={loading}
        error={error}
        onNavigate={onRowNavigate}
        onRequestOutgoingConfirm={onRequestOutgoingConfirm}
        onDeleteRequest={onDeleteRequest}
        openedSwipeItemId={openedSwipeItemId}
        onOpenSwipeItem={setOpenedSwipeItemId}
        onListScrollStart={() => {
          if (!openedSwipeItemId) return;
          closeCallLogSwipe();
          onListScrollStart?.();
        }}
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onLoadMore={() => {
          void onLoadMore();
        }}
      />

      <CommunityMessengerCallPeerDetailShell open={peerDetailOpen} onClosed={handlePeerDetailClosed}>
        {peerDetailSelection ? (
          <CommunityMessengerCallPeerDetailPanel
            selection={peerDetailSelection}
            calls={peerDetailCalls}
            entryOrigin={entryOrigin}
            viewerUserId={viewerUserId}
            onRequestOutgoingConfirm={(kind) => {
              closeCallLogSwipe();
              const peerId = sanitizeCallPeerUserId(peerDetailSelection.peerUserId);
              const roomId = resolveCallPeerRoomId(
                peerDetailSelection.peerUserId,
                peerDetailSelection.roomId
              );
              const latestCall =
                (peerId
                  ? peerDetailCalls.find((row) => row.peerUserId?.trim() === peerId)
                  : null) ??
                (roomId ? peerDetailCalls.find((row) => row.roomId?.trim() === roomId) : null) ??
                null;
              setOutgoingConfirm({
                call:
                  latestCall ??
                  ({
                    id: `peer:${peerId ?? roomId ?? "unknown"}`,
                    sessionId: null,
                    roomId,
                    sessionMode: "direct",
                    title: peerDetailSelection.peerDisplayLabel,
                    peerLabel: peerDetailSelection.peerDisplayLabel,
                    peerAvatarUrl: peerDetailSelection.peerAvatarUrl,
                    peerUserId: peerId,
                    participantCount: 2,
                    participantLabels: [],
                    callKind: kind,
                    status: "ended",
                    startedAt: new Date().toISOString(),
                    durationSeconds: 0,
                    endedAt: null,
                    isOutgoing: true,
                    endedReason: null,
                    displayType: "outgoing",
                  } satisfies CommunityMessengerCallLog),
                kind,
                peerLabel: peerDetailSelection.peerDisplayLabel,
              });
            }}
          />
        ) : null}
      </CommunityMessengerCallPeerDetailShell>

      {overlayDialogs}
    </>
  );
}
