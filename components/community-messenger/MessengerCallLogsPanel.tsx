"use client";

import { useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerCallHistory } from "@/components/community-messenger/call-history/CommunityMessengerCallHistory";
import {
  CommunityMessengerCallPeerDetailPanel,
  type CallPeerDetailSelection,
} from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailPanel";
import { CommunityMessengerCallPeerDetailShell } from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailShell";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import {
  enrichCommunityMessengerCallLogsWithProfiles,
  normalizeCommunityMessengerCallLogs,
} from "@/lib/community-messenger/call-log-row-copy";
import {
  beginCallLogsFetch,
  getCallLogsCachedCursor,
  isCallLogsCacheFresh,
  markCallLogsFetched,
  recordCallLogsOlderPage,
} from "@/lib/community-messenger/call-history/call-logs-freshness";
import {
  appendCommunityMessengerCallLogsById,
  fetchCommunityMessengerCallLogsClient,
  useCommunityCallHistoryRealtimeSync,
} from "@/lib/community-messenger/call-history/use-community-call-history-realtime-sync";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { callEngineActions } from "@/lib/community-messenger/call-engine";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import {
  resolveCallPeerRoomId,
  sanitizeCallPeerUserId,
  startCallFromHistory,
} from "@/lib/community-messenger/call-history/start-call-from-history";
import type { CommunityMessengerCallLog, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

/** 통화 시트 (발신 창 통일 3판) — 다시 걸기를 누를 때만 불러온다 */
const CallLogsCallSheetLazy = lazy(() => import("@/components/community-messenger/call-ui/MessengerCallChoiceSheet"));


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
  /** D-5: 메신저 홈 안이면 `home_meta`(홈 실시간 call_logs 신호 사용), 단독 페이지는 기본 `own` */
  callLogsRealtimeSource?: "home_meta" | "own";
};

/** 통화 시트 (발신 창 통일 3판) — 다시 걸 기록·상대. 종류는 시트에서 고른다 */
type OutgoingConfirmState = {
  call: CommunityMessengerCallLog;
  peerLabel: string;
};

/** 통화 목록 본문 — 독립 페이지·메신저 홈 탭 공용 */
export function MessengerCallLogsPanel({
  seedCalls = [],
  callsHydrating = false,
  entryOrigin = null,
  viewerUserId = null,
  peerProfiles = [],
  openedSwipeItemId: controlledOpenedSwipeItemId,
  onOpenSwipeItem: controlledOnOpenSwipeItem,
  messengerOverlayGeneration,
  onListScrollStart,
  onBootstrapCallsChange,
  callLogsRealtimeSource = "own",
}: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const resolvedViewerUserId = viewerUserId?.trim() || getSyncViewerUserIdForClient() || null;
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

  const enrichCalls = useCallback(
    (entries: CommunityMessengerCallLog[]) =>
      enrichCommunityMessengerCallLogsWithProfiles(normalizeCommunityMessengerCallLogs(entries), peerProfiles),
    [peerProfiles]
  );

  /** CUT-2B: realtime / visibility / mount — replace with first page only; clear older pages */
  const applyFirstPageFromServer = useCallback(
    (page: { calls: CommunityMessengerCallLog[]; nextCursor: string | null; hasMore: boolean }) => {
      const enriched = enrichCalls(page.calls);
      setCalls(enriched);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setLoadMoreError(null);
      setLoading(false);
      setError(null);
      onBootstrapCallsChange?.(enriched);
    },
    [enrichCalls, onBootstrapCallsChange]
  );

  const refetchCallLogsFromServer = useCallback(async () => {
    const startedAtInvalidation = beginCallLogsFetch();
    const fetched = await fetchCommunityMessengerCallLogsClient();
    if (fetched) {
      applyFirstPageFromServer(fetched);
      markCallLogsFetched(resolvedViewerUserId, startedAtInvalidation, fetched);
      return;
    }
    if (calls.length === 0) {
      setError(t("cm_ui_call_logs_load_failed"));
      setLoading(false);
    }
  }, [applyFirstPageFromServer, calls.length, resolvedViewerUserId, t]);

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
    setCalls((prev) => {
      const merged = appendCommunityMessengerCallLogsById(prev, enrichCalls(page.calls));
      onBootstrapCallsChange?.(merged);
      return merged;
    });
    setNextCursor(page.nextCursor);
    setHasMore(page.hasMore);
    recordCallLogsOlderPage(resolvedViewerUserId, page);
  }, [enrichCalls, loadingMore, onBootstrapCallsChange, resolvedViewerUserId, t]);

  useCommunityCallHistoryRealtimeSync({
    enabled: Boolean(resolvedViewerUserId),
    viewerUserId: resolvedViewerUserId,
    onRefetch: refetchCallLogsFromServer,
    realtimeSource: callLogsRealtimeSource,
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
    /**
     * 채팅 P0-4 (Owner 「P0-4 승인」 2026-11-11): 다시 연 통화 탭 — 마지막 조회 뒤 바뀌었을 신호가 없으면(실시간·통화 종료·
     * 앱 복귀·60초) 홈 데이터의 목록을 그대로 쓰고 다시 받지 않는다(실측: 방문마다 0.6~1.2초 재조회).
     */
    if (isCallLogsCacheFresh(resolvedViewerUserId)) {
      const cached = getCallLogsCachedCursor();
      setNextCursor(cached.nextCursor);
      setHasMore(cached.hasMore);
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

  useEffect(() => {
    setCalls(enrichCalls(seedCalls));
    setNextCursor(null);
    setHasMore(false);
    setLoadMoreError(null);
    if (!callsHydrating) {
      setLoading(false);
    }
  }, [seedCalls, callsHydrating, enrichCalls]);

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
          /** 분할 화면 왼쪽 통화 탭 유지 — 이동 함수가 분할일 때만 싣는다 (2026-11-16 감사 P1) */
          splitListSection: "call_logs",
          viewerUserId,
        });
        return;
      }
      const sid = call.sessionId?.trim();
      if (sid) {
        const href = `/community-messenger/calls/${encodeURIComponent(sid)}`;
        if (!callEngineActions.pushRouteOnce(router, sid, href)) {
          router.push(href);
        }
      }
    },
    [closeCallLogSwipe, entryOrigin, router, viewerUserId]
  );

  const onRequestOutgoingConfirm = useCallback(
    (call: CommunityMessengerCallLog) => {
      closeCallLogSwipe();
      const vm = presentCallHistoryRow(call);
      setOutgoingConfirm({ call, peerLabel: vm.peerDisplayLabel });
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
          onBootstrapCallsChange?.(enrichCalls(next));
          return next;
        });
        showMessengerSnackbar(
          safeT("cm_ui_call_log_deleted"),
          { variant: "success" }
        );
      } catch {
        showMessengerSnackbar(t("cm_ui_call_log_delete_failed"), { variant: "error" });
      } finally {
        setDeletingCallId(null);
      }
    },
    [closeCallLogSwipe, deletingCallId, enrichCalls, onBootstrapCallsChange, safeT, t]
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

  const handleOutgoingConfirm = useCallback((kind: "voice" | "video") => {
    const next = outgoingConfirm;
    if (!next || outgoingBusy) return;
    /** 다시 걸기 본문 = 공용 함수(홈 telRING 칸과 같이 씀 · 2026-11-26 옮기기만, 동작 같음) */
    startCallFromHistory({
      call: next.call,
      kind,
      peerLabel: next.peerLabel,
      router,
      detailPeerUserId: peerDetailSelection?.peerUserId ?? null,
      detailRoomId: peerDetailSelection?.roomId ?? null,
      missingRoomMessage: safeT("cm_ui_call_outgoing_missing_room"),
      networkErrorMessage: t("cm_ui_network_error_could_not_start_call"),
      onBlocked: () => setOutgoingConfirm(null),
      onStart: () => {
        setOutgoingBusy(true);
        setOutgoingConfirm(null);
        setPeerDetailOpen(false);
      },
      onDone: () => setOutgoingBusy(false),
    });
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
            <Suspense fallback={null}>
              <CallLogsCallSheetLazy
                peerLabel={outgoingConfirm.peerLabel}
                peerAvatarUrl={outgoingConfirm.call.peerAvatarUrl ?? null}
                viewerUserId={resolvedViewerUserId}
                peerUserId={sanitizeCallPeerUserId(outgoingConfirm.call.peerUserId) ?? null}
                busy={outgoingBusy}
                onClose={() => {
                  if (!outgoingBusy) setOutgoingConfirm(null);
                }}
                onDibayCall={handleOutgoingConfirm}
              />
            </Suspense>
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
            viewerUserId={resolvedViewerUserId}
            onRequestOutgoingConfirm={() => {
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
                    callKind: "voice",
                    status: "ended",
                    startedAt: new Date().toISOString(),
                    durationSeconds: 0,
                    endedAt: null,
                    isOutgoing: true,
                    endedReason: null,
                    displayType: "outgoing",
                  } satisfies CommunityMessengerCallLog),
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
