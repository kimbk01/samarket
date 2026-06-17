"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerCallHistory } from "@/components/community-messenger/call-history/CommunityMessengerCallHistory";
import {
  CommunityMessengerCallPeerDetailPanel,
  type CallPeerDetailSelection,
} from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailPanel";
import { CommunityMessengerCallPeerDetailShell } from "@/components/community-messenger/call-history/CommunityMessengerCallPeerDetailShell";
import { MessengerCallLogDeleteConfirmDialog } from "@/components/community-messenger/MessengerCallLogDeleteConfirmDialog";
import { MessengerOutgoingCallConfirmDialog } from "@/components/community-messenger/MessengerOutgoingCallConfirmDialog";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { presentCallHistoryRow } from "@/lib/community-messenger/call-history/call-history-presenter";
import {
  enrichCommunityMessengerCallLogsWithProfiles,
  normalizeCommunityMessengerCallLogs,
} from "@/lib/community-messenger/call-log-row-copy";
import { launchOutgoingDirectCall } from "@/lib/community-messenger/call-session-navigation-seed";
import {
  fetchCommunityMessengerCallLogsClient,
  useCommunityCallHistoryRealtimeSync,
} from "@/lib/community-messenger/call-history/use-community-call-history-realtime-sync";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { guardInstantOutgoingCallStart } from "@/lib/call/outgoing-call-start-guard";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
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

export type MessengerCallLogsStartDirectCallFn = (
  peerUserId: string,
  kind: "voice" | "video",
  peerLabel?: string | null
) => boolean;

type Props = {
  seedCalls?: CommunityMessengerCallLog[];
  callsHydrating?: boolean;
  entryOrigin?: string | null;
  viewerUserId?: string | null;
  peerProfiles?: CommunityMessengerProfileLite[];
  /** 메신저 홈 `startDirectCall` — 친구 탭과 동일 발신·roomId 해석 */
  onStartDirectCall?: MessengerCallLogsStartDirectCallFn;
  /** 메신저 홈 — 채팅 목록과 동일 스와이프 상태 공유 */
  openedSwipeItemId?: string | null;
  onOpenSwipeItem?: (id: string | null) => void;
  messengerOverlayGeneration?: number;
  onListScrollStart?: () => void;
  /** 메신저 홈 bootstrap `data.calls` 와 RT refetch 결과 동기화 */
  onBootstrapCallsChange?: (calls: CommunityMessengerCallLog[]) => void;
};

type DeleteConfirmState = {
  call: CommunityMessengerCallLog;
};

type OutgoingConfirmState = {
  call: CommunityMessengerCallLog;
  kind: "voice" | "video";
  peerLabel: string;
};

/** 통화 목록 본문 — 독립 페이지·메신저 홈 탭 공용 */
export function MessengerCallLogsPanel({
  seedCalls = [],
  callsHydrating = false,
  entryOrigin = null,
  viewerUserId = null,
  peerProfiles = [],
  onStartDirectCall,
  openedSwipeItemId: controlledOpenedSwipeItemId,
  onOpenSwipeItem: controlledOnOpenSwipeItem,
  messengerOverlayGeneration,
  onListScrollStart,
  onBootstrapCallsChange,
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
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [outgoingBusy, setOutgoingBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const mountRefreshDoneRef = useRef(false);
  const skipMountRefetchOnceRef = useRef(false);

  const enrichCalls = useCallback(
    (entries: CommunityMessengerCallLog[]) =>
      enrichCommunityMessengerCallLogsWithProfiles(normalizeCommunityMessengerCallLogs(entries), peerProfiles),
    [peerProfiles]
  );

  const applyServerCalls = useCallback(
    (entries: CommunityMessengerCallLog[]) => {
      const enriched = enrichCalls(entries);
      setCalls(enriched);
      setLoading(false);
      setError(null);
      onBootstrapCallsChange?.(enriched);
    },
    [enrichCalls, onBootstrapCallsChange]
  );

  const refetchCallLogsFromServer = useCallback(async () => {
    const fetched = await fetchCommunityMessengerCallLogsClient();
    if (fetched) {
      applyServerCalls(fetched);
      return;
    }
    if (calls.length === 0) {
      setError(t("cm_ui_call_logs_load_failed"));
      setLoading(false);
    }
  }, [applyServerCalls, calls.length, t]);

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
    if (!outgoingConfirm && !deleteConfirm && !peerDetailOpen) return;
    closeCallLogSwipe();
  }, [closeCallLogSwipe, deleteConfirm, outgoingConfirm, peerDetailOpen]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (messengerOverlayGeneration == null) return;
    setOpenedSwipeItemId(null);
  }, [messengerOverlayGeneration, setOpenedSwipeItemId]);

  useEffect(() => {
    setCalls(enrichCalls(seedCalls));
    if (!callsHydrating) {
      setLoading(false);
    }
  }, [seedCalls, callsHydrating, enrichCalls]);

  useEffect(() => {
    if (!callsHydrating) return;
    setLoading(true);
    setError(null);
  }, [callsHydrating]);

  const resolveRoomIdForPeer = useCallback(
    (peerUserId: string, seedRoomId: string | null) => {
      const direct = seedRoomId?.trim();
      if (direct) return direct;
      const fromCalls = calls.find((row) => row.peerUserId?.trim() === peerUserId && row.roomId?.trim())?.roomId;
      return fromCalls?.trim() || null;
    },
    [calls]
  );

  const launchOutgoingFallback = useCallback(
    async (
      peerUserId: string | null,
      kind: "voice" | "video",
      peerLabel: string,
      roomId: string | null
    ) => {
      const guard = guardInstantOutgoingCallStart({ peerUserId, kind, roomId });
      if (!guard.ok) {
        showMessengerSnackbar(guard.userMessage, { variant: "error" });
        return;
      }
      const dialInput = roomId?.trim()
        ? { kind, roomId: roomId.trim(), peerUserId: peerUserId?.trim() || undefined, peerLabel }
        : peerUserId?.trim()
          ? { kind, peerUserId: peerUserId.trim(), peerLabel }
          : null;
      if (!dialInput) return;
      const result = await launchOutgoingDirectCall(dialInput, router);
      if (!result.ok) {
        showMessengerSnackbar(result.userMessage, { variant: "error" });
      }
    },
    [router]
  );

  const onRowNavigate = useCallback(
    (call: CommunityMessengerCallLog) => {
      closeCallLogSwipe();

      if (call.sessionMode !== "group") {
        const vm = presentCallHistoryRow(call);
        const peerUserId = sanitizeCallPeerUserId(call.peerUserId) ?? sanitizeCallPeerUserId(vm.peerUserId) ?? "";
        setPeerDetailSelection({
          peerUserId: peerUserId || `room:${call.roomId?.trim() || call.id}`,
          roomId: resolveRoomIdForPeer(peerUserId, call.roomId),
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
        router.push(`/community-messenger/calls/${encodeURIComponent(sid)}`);
      }
    },
    [closeCallLogSwipe, entryOrigin, resolveRoomIdForPeer, router, viewerUserId]
  );

  const onRequestOutgoingConfirm = useCallback(
    (call: CommunityMessengerCallLog, kind: "voice" | "video") => {
      closeCallLogSwipe();
      const vm = presentCallHistoryRow(call);
      setOutgoingConfirm({ call, kind, peerLabel: vm.peerDisplayLabel });
    },
    [closeCallLogSwipe]
  );

  const onDeleteRequest = useCallback(
    (call: CommunityMessengerCallLog) => {
      closeCallLogSwipe();
      setDeleteConfirm({ call });
    },
    [closeCallLogSwipe]
  );

  const handleDeleteConfirm = useCallback(async () => {
    const target = deleteConfirm?.call;
    if (!target || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/community-messenger/calls/logs/${encodeURIComponent(target.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) {
        showMessengerSnackbar(t("cm_ui_call_log_delete_failed"), { variant: "error" });
        return;
      }
      setCalls((prev) => {
        const next = prev.filter((row) => row.id !== target.id);
        onBootstrapCallsChange?.(enrichCalls(next));
        return next;
      });
      closeCallLogSwipe();
      setDeleteConfirm(null);
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
      setDeleteBusy(false);
    }
  }, [
    closeCallLogSwipe,
    deleteBusy,
    deleteConfirm,
    enrichCalls,
    onBootstrapCallsChange,
    safeT,
    t,
  ]);

  const handlePeerDetailClosed = useCallback(() => {
    setPeerDetailOpen(false);
    setPeerDetailSelection(null);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    if (!deleteBusy) setDeleteConfirm(null);
  }, [deleteBusy]);

  const handleOutgoingConfirm = useCallback(() => {
    const next = outgoingConfirm;
    if (!next || outgoingBusy) return;
    const vm = presentCallHistoryRow(next.call);
    const peerUserId =
      sanitizeCallPeerUserId(next.call.peerUserId) ??
      sanitizeCallPeerUserId(vm.peerUserId) ??
      sanitizeCallPeerUserId(peerDetailSelection?.peerUserId);
    const roomId =
      next.call.roomId?.trim() ||
      peerDetailSelection?.roomId?.trim() ||
      resolveCallPeerRoomId(peerDetailSelection?.peerUserId ?? "", peerDetailSelection?.roomId) ||
      (peerUserId ? resolveRoomIdForPeer(peerUserId, next.call.roomId) : null);

    if (!peerUserId && !roomId) {
      showMessengerSnackbar(
        safeT("cm_ui_call_outgoing_missing_room", {
          fallbackKo: "통화를 시작할 수 없습니다. 상대 정보가 없습니다.",
          fallbackEn: "Cannot start the call. Peer information is missing.",
        }),
        { variant: "error" }
      );
      return;
    }

    setOutgoingBusy(true);
    setOutgoingConfirm(null);
    setPeerDetailOpen(false);

    if (peerUserId && onStartDirectCall?.(peerUserId, next.kind, next.peerLabel)) {
      setOutgoingBusy(false);
      return;
    }

    void (async () => {
      try {
        await launchOutgoingFallback(peerUserId, next.kind, next.peerLabel, roomId);
      } catch {
        showMessengerSnackbar(t("cm_ui_network_error_could_not_start_call"), { variant: "error" });
      } finally {
        setOutgoingBusy(false);
      }
    })();
  }, [
    launchOutgoingFallback,
    onStartDirectCall,
    outgoingBusy,
    outgoingConfirm,
    peerDetailSelection?.peerUserId,
    peerDetailSelection?.roomId,
    resolveRoomIdForPeer,
    safeT,
    t,
  ]);

  const peerDetailCalls = useMemo(() => calls, [calls]);

  const overlayDialogs =
    portalReady && (outgoingConfirm || deleteConfirm)
      ? createPortal(
          <div className="relative z-[1400]">
            {outgoingConfirm ? (
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
            ) : null}
            {deleteConfirm ? (
              <MessengerCallLogDeleteConfirmDialog
                open
                busy={deleteBusy}
                onCancel={closeDeleteConfirm}
                onConfirm={() => {
                  void handleDeleteConfirm();
                }}
              />
            ) : null}
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
