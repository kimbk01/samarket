"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  discardPrimedCommunityMessengerDevicePermission,
} from "@/lib/community-messenger/call-permission";
import { migrateCommunityMessengerMediaSessionKey } from "@/lib/call/permission-manager";
import {
  CommunityMessengerGroupAgoraSession,
  fetchGroupAgoraConnection,
  type GroupAgoraRemotePeer,
} from "@/lib/community-messenger/call-provider/group-agora-session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  playCommunityMessengerCallSignalSound,
  stopCommunityMessengerCallTone,
} from "@/lib/community-messenger/call-feedback-sound";
import { getCommunityMessengerMediaErrorMessage } from "@/lib/community-messenger/media-errors";
import {
  ensureCallCanUseMedia,
  getCallMediaPermissionBlockedMessageKey,
} from "@/lib/community-messenger/call-media-permission-preflight";
import {
  fetchMessengerCallSoundConfig,
  getMessengerCallSoundConfigCache,
} from "@/lib/community-messenger/messenger-call-sound-config-client";
import { incomingRingTimeoutMsFromConfig } from "@/lib/community-messenger/messenger-call-ring-timeout";
import { patchCommunityMessengerCallMissedOnce } from "@/lib/community-messenger/messenger-call-missed-patch";
import { callEngineActions, dispatchCallEngineSignal, joinCallEngineGroupPublishOnce } from "@/lib/community-messenger/call-engine";
import { MESSENGER_CALL_USER_MSG } from "@/lib/community-messenger/messenger-call-user-messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { isTerminalIncomingCallStatus } from "@/lib/community-messenger/call-incoming-terminal";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallParticipant,
  CommunityMessengerCallSession,
} from "@/lib/community-messenger/types";
import { messengerMonitorCallConnection } from "@/lib/community-messenger/monitoring/client";

function cmTr(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(getRuntimeAppLanguage(), key, vars);
}

type GroupCallPanelState = {
  kind: CommunityMessengerCallKind;
  mode: "dialing" | "incoming" | "connecting" | "active";
  sessionId: string | null;
  peerLabel: string;
};

type GroupCallEndedState = {
  kind: CommunityMessengerCallKind;
  peerLabel: string;
  reason: "ended" | "declined" | "missed" | "failed" | "canceled";
  endedAt: number;
  endedDurationSeconds: number | null;
};

export type GroupCallRemotePeer = {
  userId: string;
  label: string;
  agora: GroupAgoraRemotePeer;
};

type Props = {
  enabled: boolean;
  roomId: string;
  viewerUserId: string;
  roomLabel: string;
  activeCall: CommunityMessengerCallSession | null;
  onRefresh: () => Promise<void> | void;
};

type BindRemoteVideo = (userId: string, node: HTMLVideoElement | null) => void;
type BindRemoteAudio = (userId: string, node: HTMLAudioElement | null) => void;

export function useCommunityMessengerGroupCall(args: Props) {
  const [panel, setPanel] = useState<GroupCallPanelState | null>(null);
  const [endedPanel, setEndedPanel] = useState<GroupCallEndedState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [remotePeers, setRemotePeers] = useState<GroupCallRemotePeer[]>([]);
  const [hasLocalMedia, setHasLocalMedia] = useState(false);
  const [cameraSwitchSupported, setCameraSwitchSupported] = useState(false);
  const [agoraReconnecting, setAgoraReconnecting] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const agoraSessionRef = useRef<CommunityMessengerGroupAgoraSession | null>(null);
  const agoraJoinInFlightRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const activeSinceRef = useRef<number | null>(null);
  const groupCallTerminalSoundPrevRef = useRef<{
    id: string;
    status: CommunityMessengerCallSession["status"];
  } | null>(null);
  const sessionDialStartRef = useRef<number | null>(null);
  const firstConnectionRecordedRef = useRef(false);
  const suppressIncomingPanelForSessionIdRef = useRef<string | null>(null);
  const panelSessionIdRef = useRef<string | null>(null);

  const currentSessionId = panel?.sessionId ?? args.activeCall?.id ?? null;
  panelSessionIdRef.current = panel?.sessionId ?? null;
  const participants = args.activeCall?.participants ?? [];
  const joinedParticipants = useMemo(
    () => participants.filter((item) => item.status === "joined" && !item.isMe),
    [participants]
  );
  const myParticipant = participants.find((item) => item.isMe) ?? null;
  const amJoined = myParticipant?.status === "joined";
  const onGroupRoomRefreshRef = useRef(args.onRefresh);
  onGroupRoomRefreshRef.current = args.onRefresh;

  const participantLabelByUserId = useCallback(
    (userId: string) =>
      participants.find((p) => messengerUserIdsEqual(p.userId, userId))?.label ?? userId,
    [participants]
  );

  const ensureAgoraSession = useCallback(() => {
    if (agoraSessionRef.current) return agoraSessionRef.current;
    const session = new CommunityMessengerGroupAgoraSession({
      onRemotePeersChanged: (peers) => {
        if (!mountedRef.current) return;
        setRemotePeers(
          peers.map((p) => ({
            userId: p.userId,
            label: participantLabelByUserId(p.userId),
            agora: p,
          }))
        );
        if (peers.length > 0) {
          setConnectedAt((prev) => prev ?? Date.now());
          setPanel((prev) => (prev ? { ...prev, mode: "active" } : prev));
        }
      },
      onAnyRemoteJoined: () => {
        setErrorMessage((prev) => (prev === cmTr("cm_ui_group_peer_connection_unstable") ? null : prev));
      },
      onAllRemotesLeft: () => {
        /* 세션 PATCH 가 authoritative — Agora 채널만 비면 UI 뱃지만 갱신 */
      },
      onConnectionReconnecting: () => setAgoraReconnecting(true),
      onConnectionRecovered: () => setAgoraReconnecting(false),
      onConnectionDisconnected: () => {
        setAgoraReconnecting(true);
        void onGroupRoomRefreshRef.current();
      },
    });
    agoraSessionRef.current = session;
    return session;
  }, [participantLabelByUserId]);

  const cleanupMedia = useCallback(async () => {
    discardPrimedCommunityMessengerDevicePermission();
    agoraJoinInFlightRef.current = null;
    await agoraSessionRef.current?.cleanup();
    agoraSessionRef.current = null;
    setHasLocalMedia(false);
    setCameraSwitchSupported(false);
    setRemotePeers([]);
    setAgoraReconnecting(false);
    activeSinceRef.current = null;
    setElapsedSeconds(0);
    const node = localVideoRef.current;
    if (node) node.srcObject = null;
  }, []);

  const showEndedPanel = useCallback(
    (
      kind: CommunityMessengerCallKind,
      peerLabel: string,
      reason: GroupCallEndedState["reason"],
      endedAtMs: number
    ) => {
      setEndedPanel({
        kind,
        peerLabel,
        reason,
        endedAt: endedAtMs,
        endedDurationSeconds: connectedAt != null ? Math.max(0, Math.floor((endedAtMs - connectedAt) / 1000)) : null,
      });
    },
    [connectedAt]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void cleanupMedia();
    };
  }, [cleanupMedia]);

  useEffect(() => {
    setConnectedAt(null);
    setEndedPanel(null);
    firstConnectionRecordedRef.current = false;
    sessionDialStartRef.current = null;
  }, [currentSessionId]);

  useEffect(() => {
    if (!endedPanel) return;
    const timer = window.setTimeout(() => setEndedPanel(null), 2400);
    return () => window.clearTimeout(timer);
  }, [endedPanel]);

  useEffect(() => {
    const node = localVideoRef.current;
    if (!node || !hasLocalMedia) return;
    ensureAgoraSession().playLocalVideo(node);
  }, [ensureAgoraSession, hasLocalMedia, panel?.kind]);

  useEffect(() => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    let cancelled = false;
    const sub = subscribeWithRetry({
      sb,
      name: `community-messenger-group-call-session:${sessionId}`,
      scope: "community-messenger-group-call:session",
      isCancelled: () => cancelled,
      build: (ch) =>
        ch.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "community_messenger_call_sessions",
            filter: `id=eq.${sessionId}`,
          },
          () => {
            void onGroupRoomRefreshRef.current();
          }
        ),
    });
    return () => {
      cancelled = true;
      sub.stop();
    };
  }, [args.enabled, currentSessionId]);

  useEffect(() => {
    if (!args.enabled) return;
    const activeCall = args.activeCall;
    if (!activeCall || activeCall.sessionMode !== "group") {
      const localSid = panelSessionIdRef.current;
      if (localSid && !activeCall) {
        return;
      }
      if (panel?.sessionId) {
        void cleanupMedia();
        setPanel(null);
      }
      return;
    }

    if (activeCall.status === "ringing") {
      if (panel?.sessionId === activeCall.id && (panel.mode === "connecting" || panel.mode === "active")) return;
      if (myParticipant?.status === "joined" && activeCall.isMineInitiator) {
        setPanel({
          kind: activeCall.callKind,
          mode: "dialing",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
        return;
      }
      if (myParticipant?.status === "invited") {
        if (suppressIncomingPanelForSessionIdRef.current === activeCall.id) return;
        setPanel({
          kind: activeCall.callKind,
          mode: "incoming",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
      }
      return;
    }

    if (activeCall.status === "active") {
      if (panel?.sessionId === activeCall.id && (panel.mode === "connecting" || panel.mode === "active")) return;
      if (myParticipant?.status === "joined") {
        activeSinceRef.current = new Date(activeCall.answeredAt ?? activeCall.startedAt).getTime();
        setPanel({
          kind: activeCall.callKind,
          mode: remotePeers.length > 0 ? "active" : "connecting",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
        return;
      }
      if (myParticipant?.status === "invited") {
        if (suppressIncomingPanelForSessionIdRef.current === activeCall.id) return;
        setPanel({
          kind: activeCall.callKind,
          mode: "incoming",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        });
      }
      return;
    }

    if (isTerminalIncomingCallStatus(activeCall.status)) {
      showEndedPanel(
        activeCall.callKind,
        activeCall.peerLabel,
        activeCall.status === "rejected"
          ? "declined"
          : activeCall.status === "missed"
            ? "missed"
            : activeCall.status === "cancelled"
              ? "canceled"
              : "ended",
        activeCall.endedAt ? new Date(activeCall.endedAt).getTime() : Date.now()
      );
      void cleanupMedia();
      setPanel(null);
    }
  }, [
    args.activeCall,
    args.enabled,
    cleanupMedia,
    myParticipant?.status,
    panel?.mode,
    panel?.sessionId,
    remotePeers.length,
    showEndedPanel,
  ]);

  useEffect(() => {
    if (!args.enabled || !args.activeCall || args.activeCall.sessionMode !== "group") return;
    if (!args.activeCall.isMineInitiator || args.activeCall.status !== "ringing") return;
    const sessionId = args.activeCall.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      let cfg = getMessengerCallSoundConfigCache();
      if (cfg === undefined || cfg === null) cfg = await fetchMessengerCallSoundConfig();
      const ms = incomingRingTimeoutMsFromConfig(cfg ?? undefined);
      if (cancelled) return;
      timer = setTimeout(() => {
        void (async () => {
          try {
            const patchJson = await patchCommunityMessengerCallMissedOnce(sessionId);
            if (patchJson.skipped) return;
            if (!patchJson.ok) {
              setErrorMessage(MESSENGER_CALL_USER_MSG.groupRingEndFailed);
              return;
            }
            await cleanupMedia();
            showEndedPanel(args.activeCall!.callKind, args.activeCall!.peerLabel, "missed", Date.now());
            setPanel(null);
            setErrorMessage(cmTr("cm_ui_group_call_ended_no_participants"));
            await args.onRefresh();
          } catch {
            setErrorMessage(MESSENGER_CALL_USER_MSG.groupRingEndFailed);
          }
        })();
      }, ms);
    })();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [args, cleanupMedia, showEndedPanel]);

  useEffect(() => {
    if (!args.enabled || !currentSessionId || !panel) return;
    if (panel.mode !== "connecting" && panel.mode !== "active") return;
    if (!amJoined || args.activeCall?.status !== "active") return;
    if (agoraJoinInFlightRef.current === currentSessionId) return;
    if (agoraSessionRef.current?.getClient()) return;

    const sessionId = currentSessionId;
    const callKind = panel.kind;
    agoraJoinInFlightRef.current = sessionId;
    let cancelled = false;

    void (async () => {
      try {
        stopCommunityMessengerCallTone();
        const permission = await ensureCallCanUseMedia(callKind);
        if (!permission.ok) {
          setErrorMessage(cmTr(getCallMediaPermissionBlockedMessageKey(callKind)));
          return;
        }
        const connection = await fetchGroupAgoraConnection(sessionId);
        if (cancelled || !mountedRef.current) return;
        if (!connection) {
          setErrorMessage(cmTr("cm_ui_group_call_join_failed"));
          return;
        }
        const agora = ensureAgoraSession();
        const joinResult = await joinCallEngineGroupPublishOnce({
          callId: sessionId,
          publish: () =>
            agora.joinAndPublish({
              viewerUserId: args.viewerUserId,
              callKind,
              connection,
            }),
        });
        if (!joinResult.ok) {
          setErrorMessage(cmTr("cm_ui_group_call_join_failed"));
          return;
        }
        if (cancelled || !mountedRef.current) return;
        setHasLocalMedia(true);
        setCameraSwitchSupported(agora.isCameraSwitchSupported());
        migrateCommunityMessengerMediaSessionKey(null, sessionId);
        setPanel((prev) => (prev ? { ...prev, mode: "connecting" } : prev));
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getCommunityMessengerMediaErrorMessage(error, callKind));
        }
      } finally {
        if (agoraJoinInFlightRef.current === sessionId) agoraJoinInFlightRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    amJoined,
    args.activeCall?.status,
    args.enabled,
    args.viewerUserId,
    currentSessionId,
    ensureAgoraSession,
    panel,
  ]);

  useEffect(() => {
    if (panel?.mode !== "active" && panel?.mode !== "connecting") return;
    const startedAt = activeSinceRef.current ?? Date.now();
    activeSinceRef.current = startedAt;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [panel?.mode]);

  useEffect(() => {
    if (!currentSessionId || firstConnectionRecordedRef.current) return;
    if (remotePeers.length === 0) return;
    if (sessionDialStartRef.current === null) sessionDialStartRef.current = Date.now();
    firstConnectionRecordedRef.current = true;
    const media = panel?.kind ?? args.activeCall?.callKind ?? "voice";
    messengerMonitorCallConnection(currentSessionId, Date.now() - sessionDialStartRef.current, media);
  }, [args.activeCall?.callKind, currentSessionId, panel?.kind, remotePeers.length]);

  useEffect(() => {
    if (!args.enabled) {
      groupCallTerminalSoundPrevRef.current = null;
      return;
    }
    const ac = args.activeCall;
    if (!ac || ac.sessionMode !== "group") {
      groupCallTerminalSoundPrevRef.current = null;
      return;
    }
    const sid = ac.id;
    const st = ac.status;
    const prevPair = groupCallTerminalSoundPrevRef.current;
    if (!prevPair || prevPair.id !== sid) {
      groupCallTerminalSoundPrevRef.current = { id: sid, status: st };
      return;
    }
    const prevSt = prevPair.status;
    groupCallTerminalSoundPrevRef.current = { id: sid, status: st };
    if (prevSt === st) return;
    const wasLive = prevSt === "ringing" || prevSt === "active";
    if (!wasLive) return;
    if (st === "missed") void playCommunityMessengerCallSignalSound("missed", { dedupeSessionId: sid });
    else if (st === "ended") void playCommunityMessengerCallSignalSound("call_end", { dedupeSessionId: sid });
  }, [args.activeCall?.id, args.activeCall?.sessionMode, args.activeCall?.status, args.enabled]);

  const dismissPanel = useCallback(() => {
    void cleanupMedia();
    setPanel(null);
    setEndedPanel(null);
    setErrorMessage(null);
  }, [cleanupMedia]);

  const startOutgoingCall = useCallback(
    async (kind: CommunityMessengerCallKind) => {
      if (!args.enabled) return;
      setBusy("call-start");
      setErrorMessage(null);
      setEndedPanel(null);
      sessionDialStartRef.current = Date.now();
      try {
        const permission = await ensureCallCanUseMedia(kind);
        if (!permission.ok) {
          setErrorMessage(cmTr(getCallMediaPermissionBlockedMessageKey(kind)));
          return;
        }
        setPanel({ kind, mode: "dialing", sessionId: null, peerLabel: args.roomLabel });
        const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(args.roomId)}/calls`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callKind: kind }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: CommunityMessengerCallSession;
        };
        if (!res.ok || !json.ok || !json.session) {
          setErrorMessage(
            json.error === "group_call_limit_exceeded"
              ? cmTr("cm_ui_group_call_limit_four")
              : cmTr("cm_ui_group_call_start_failed")
          );
          return;
        }
        setPanel({
          kind: json.session.callKind,
          mode: "dialing",
          sessionId: json.session.id,
          peerLabel: json.session.peerLabel,
        });
        await args.onRefresh();
      } catch (error) {
        const errorName =
          typeof error === "object" && error && "name" in error
            ? String((error as { name?: unknown }).name ?? "")
            : "";
        setErrorMessage(errorName ? getCommunityMessengerMediaErrorMessage(error, kind) : cmTr("cm_ui_group_call_start_failed"));
      } finally {
        setBusy(null);
      }
    },
    [args]
  );

  const acceptIncomingCall = useCallback(async (): Promise<boolean> => {
    const activeCall = args.activeCall;
    if (!args.enabled || !activeCall) return false;
    setBusy("call-accept");
    setErrorMessage(null);
    try {
      const permission = await ensureCallCanUseMedia(activeCall.callKind);
      if (!permission.ok) {
        setErrorMessage(cmTr(getCallMediaPermissionBlockedMessageKey(activeCall.callKind)));
        return false;
      }
      const acceptJson = await dispatchCallEngineSignal({
        type: "user_accept",
        session: activeCall,
        router: { replace: () => {} },
        source: "group_call_accept",
        markNativeAcceptPending: false,
      });
      if (!acceptJson.ok) {
        setErrorMessage(cmTr("cm_ui_group_call_accept_failed"));
        return false;
      }
      activeSinceRef.current = Date.now();
      sessionDialStartRef.current = Date.now();
      setPanel({
        kind: activeCall.callKind,
        mode: "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
      await args.onRefresh();
      return true;
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(
        errorName ? getCommunityMessengerMediaErrorMessage(error, activeCall.callKind) : cmTr("cm_ui_group_call_join_failed")
      );
      return false;
    } finally {
      setBusy(null);
    }
  }, [args]);

  const rejectIncomingCall = useCallback(async () => {
    const activeCall = args.activeCall;
    if (!args.enabled || !activeCall) return;
    setBusy("call-reject");
    suppressIncomingPanelForSessionIdRef.current = activeCall.id;
    setEndedPanel(null);
    await cleanupMedia();
    setPanel(null);
    try {
      const patchJson = await dispatchCallEngineSignal({
        type: "user_reject",
        sessionId: activeCall.id,
        source: "group_call_reject",
      });
      if (!patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.sessionRejectFailed);
        await args.onRefresh();
        return;
      }
      await args.onRefresh();
    } finally {
      suppressIncomingPanelForSessionIdRef.current = null;
      setBusy(null);
    }
  }, [args, cleanupMedia]);

  const cancelOutgoingCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    setBusy("call-cancel");
    try {
      const patchJson = await dispatchCallEngineSignal({
        type: "user_cancel",
        callId: sessionId,
        action: "cancel",
        source: "group_call_cancel",
      });
      if (!patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.groupCancelFailed);
        return;
      }
      await cleanupMedia();
      showEndedPanel(panel?.kind ?? args.activeCall?.callKind ?? "voice", panel?.peerLabel ?? args.roomLabel, "canceled", Date.now());
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, currentSessionId, panel, showEndedPanel]);

  const endActiveCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!args.enabled || !sessionId) return;
    setBusy("call-end");
    try {
      const joinedOthers = joinedParticipants.length;
      const patchJson =
        joinedOthers > 0
          ? await callEngineActions.leave({
              callId: sessionId,
              init: { durationSeconds: elapsedSeconds },
              source: "group_call_leave",
            })
          : await dispatchCallEngineSignal({
              type: "user_end",
              callId: sessionId,
              action: "end",
              init: { durationSeconds: elapsedSeconds },
              source: "group_call_end",
            });
      if (!patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.groupEndFailed);
        return;
      }
      await cleanupMedia();
      showEndedPanel(panel?.kind ?? args.activeCall?.callKind ?? "voice", panel?.peerLabel ?? args.roomLabel, "ended", Date.now());
      setPanel(null);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args, cleanupMedia, currentSessionId, elapsedSeconds, joinedParticipants.length, panel, showEndedPanel]);

  const retryConnection = useCallback(async () => {
    if (!args.enabled || !currentSessionId || !panel) return;
    setBusy("call-retry");
    setErrorMessage(cmTr("cm_ui_group_reconnecting"));
    try {
      await agoraSessionRef.current?.cleanup();
      agoraSessionRef.current = null;
      agoraJoinInFlightRef.current = null;
      const connection = await fetchGroupAgoraConnection(currentSessionId);
      if (!connection) {
        setErrorMessage(cmTr("cm_ui_group_call_join_failed"));
        return;
      }
      const agora = ensureAgoraSession();
      await agora.joinAndPublish({
        viewerUserId: args.viewerUserId,
        callKind: panel.kind,
        connection,
      });
      setHasLocalMedia(true);
      setCameraSwitchSupported(agora.isCameraSwitchSupported());
      setAgoraReconnecting(false);
    } finally {
      setBusy(null);
    }
  }, [args.enabled, args.viewerUserId, currentSessionId, ensureAgoraSession, panel]);

  const switchCameraFacing = useCallback(async () => {
    const agora = agoraSessionRef.current;
    if (!agora || !agora.isCameraSwitchSupported()) return;
    setBusy("camera");
    try {
      await agora.switchCameraFacing(localVideoRef.current);
      setCameraSwitchSupported(agora.isCameraSwitchSupported());
    } finally {
      setBusy(null);
    }
  }, []);

  const prepareDevices = useCallback(async () => {
    const kind = panel?.kind ?? args.activeCall?.callKind;
    if (!kind) return;
    setBusy("device-prepare");
    setErrorMessage(null);
    try {
      const permission = await ensureCallCanUseMedia(kind);
      if (!permission.ok) {
        setErrorMessage(cmTr(getCallMediaPermissionBlockedMessageKey(kind)));
        return;
      }
      setHasLocalMedia(true);
    } catch (error) {
      setErrorMessage(getCommunityMessengerMediaErrorMessage(error, kind));
    } finally {
      setBusy(null);
    }
  }, [args.activeCall?.callKind, panel?.kind]);

  const callStatusLabel = useMemo(() => {
    if (!panel) return "";
    if (panel.mode === "dialing") return cmTr("cm_ui_group_dialing_participants");
    if (panel.mode === "incoming") return cmTr("cm_ui_incoming_phone");
    if (panel.mode === "connecting") return cmTr("cm_ui_connecting");
    return cmTr("cm_ui_group_call_active_status");
  }, [panel]);

  const connectionBadge = useMemo(() => {
    if (agoraReconnecting) {
      return { label: cmTr("cm_ui_group_connection_partial_unstable"), tone: "poor" as const };
    }
    if (remotePeers.length === 0) {
      return panel?.mode === "active"
        ? { label: cmTr("cm_ui_group_waiting_participants"), tone: "normal" as const }
        : panel?.mode === "connecting"
          ? { label: cmTr("cm_ui_group_participants_connecting"), tone: "normal" as const }
          : null;
    }
    return { label: cmTr("cm_ui_group_participants_stable"), tone: "good" as const };
  }, [agoraReconnecting, panel?.mode, remotePeers.length]);

  const bindRemoteVideo: BindRemoteVideo = useCallback((userId, node) => {
    ensureAgoraSession().playRemoteVideo(userId, node);
  }, [ensureAgoraSession]);

  const bindRemoteAudio: BindRemoteAudio = useCallback((userId, node) => {
    ensureAgoraSession().playRemoteAudio(userId, node);
  }, [ensureAgoraSession]);

  return {
    panel,
    endedPanel,
    busy,
    errorMessage,
    elapsedSeconds,
    connectedAt,
    localStream: hasLocalMedia ? ({} as MediaStream) : null,
    localVideoRef,
    remotePeers,
    cameraSwitchSupported,
    switchCameraFacing,
    bindRemoteVideo,
    bindRemoteAudio,
    callStatusLabel,
    connectionBadge,
    participants,
    prepareDevices,
    dismissPanel,
    startOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    cancelOutgoingCall,
    endActiveCall,
    retryConnection,
  };
}

export type CommunityMessengerGroupCallHandle = ReturnType<typeof useCommunityMessengerGroupCall>;
