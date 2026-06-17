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
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import { guardInstantOutgoingCallStart } from "@/lib/call/outgoing-call-start-guard";
import type { CommunityMessengerCallLog, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

function sanitizeCallPeerUserId(peerUserId: string | null | undefined): string | null {
  const raw = peerUserId?.trim() ?? "";
  if (!raw || raw.startsWith("peer:") || raw.startsWith("room:")) return null;
  return raw;
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
}: Props) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const [calls, setCalls] = useState<CommunityMessengerCallLog[]>(seedCalls);
  const [loading, setLoading] = useState(callsHydrating);
  const [error, setError] = useState<string | null>(null);
  const [peerDetailOpen, setPeerDetailOpen] = useState(false);
  const [peerDetailSelection, setPeerDetailSelection] = useState<CallPeerDetailSelection | null>(null);
  const [openedSwipeItemId, setOpenedSwipeItemId] = useState<string | null>(null);
  const [outgoingConfirm, setOutgoingConfirm] = useState<OutgoingConfirmState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [outgoingBusy, setOutgoingBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const fallbackFetchedRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const enrichCalls = useCallback(
    (entries: CommunityMessengerCallLog[]) =>
      enrichCommunityMessengerCallLogsWithProfiles(normalizeCommunityMessengerCallLogs(entries), peerProfiles),
    [peerProfiles]
  );

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

  useEffect(() => {
    if (!callsHydrating || fallbackFetchedRef.current) return;
    fallbackFetchedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/community-messenger/calls", { credentials: "include" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; calls?: CommunityMessengerCallLog[] };
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(t("cm_ui_call_logs_load_failed"));
          return;
        }
        setCalls(enrichCalls(json.calls ?? []));
      } catch {
        if (!cancelled) setError(t("cm_ui_call_logs_network_failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callsHydrating, enrichCalls, t]);

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
    async (peerUserId: string, kind: "voice" | "video", peerLabel: string, roomId: string | null) => {
      const guard = guardInstantOutgoingCallStart({ peerUserId, kind });
      if (!guard.ok) {
        showMessengerSnackbar(guard.userMessage, { variant: "error" });
        return;
      }
      const result = await launchOutgoingDirectCall(
        roomId ? { kind, roomId, peerUserId, peerLabel } : { kind, peerUserId, peerLabel },
        router
      );
      if (!result.ok) {
        showMessengerSnackbar(result.userMessage, { variant: "error" });
      }
    },
    [router]
  );

  const onRowNavigate = useCallback(
    (call: CommunityMessengerCallLog) => {
      setOpenedSwipeItemId(null);

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
    [entryOrigin, resolveRoomIdForPeer, router, viewerUserId]
  );

  const onRequestOutgoingConfirm = useCallback((call: CommunityMessengerCallLog, kind: "voice" | "video") => {
    const vm = presentCallHistoryRow(call);
    setOutgoingConfirm({ call, kind, peerLabel: vm.peerDisplayLabel });
  }, []);

  const onDeleteRequest = useCallback((call: CommunityMessengerCallLog) => {
    setOpenedSwipeItemId(null);
    setDeleteConfirm({ call });
  }, []);

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
      setCalls((prev) => prev.filter((row) => row.id !== target.id));
      setOpenedSwipeItemId(null);
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
  }, [deleteBusy, deleteConfirm, safeT, t]);

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
      resolveRoomIdForPeer(peerUserId ?? "", next.call.roomId);

    if (!peerUserId) {
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

    if (onStartDirectCall?.(peerUserId, next.kind, next.peerLabel)) {
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
      />

      <CommunityMessengerCallPeerDetailShell open={peerDetailOpen} onClosed={handlePeerDetailClosed}>
        {peerDetailSelection ? (
          <CommunityMessengerCallPeerDetailPanel
            selection={peerDetailSelection}
            calls={peerDetailCalls}
            entryOrigin={entryOrigin}
            viewerUserId={viewerUserId}
            onRequestOutgoingConfirm={(kind) => {
              const peerId = sanitizeCallPeerUserId(peerDetailSelection.peerUserId);
              const roomId = peerDetailSelection.roomId?.trim() || null;
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
                    roomId: peerDetailSelection.roomId,
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
