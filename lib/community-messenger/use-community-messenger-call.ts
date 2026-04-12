"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  consumePrimedCommunityMessengerDevicePermission,
  discardPrimedCommunityMessengerDevicePermission,
} from "@/lib/community-messenger/call-permission";
import { bindMediaStreamToElement } from "@/lib/community-messenger/media-element";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCommunityMessengerMediaErrorMessage } from "@/lib/community-messenger/media-errors";
import { MESSENGER_CALL_USER_MSG, SIGNAL_POLL_SOFT_ERROR } from "@/lib/community-messenger/messenger-call-user-messages";
import {
  callSessionPhaseLabel,
  deriveCallSessionPhase,
} from "@/lib/call/call-session-state";
import { fetchMessengerIceServers, invalidateMessengerIceServerCache } from "@/lib/call/ice-servers";
import {
  applyVideoSenderBandwidthCap,
  applyVideoSenderDegradationPreference,
  buildMessengerRtcConfiguration,
} from "@/lib/call/webrtc-configuration";
import { collectMessengerWebRtcDiagnostics } from "@/lib/community-messenger/monitoring/webrtc-stats";
import {
  messengerMonitorCallConnection,
  messengerMonitorCallIceRestart,
  messengerMonitorCallTurnFallback,
  messengerMonitorCallWebRtcSample,
  messengerMonitorSignalingPost,
} from "@/lib/community-messenger/monitoring/client";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
  CommunityMessengerCallSignal,
} from "@/lib/community-messenger/types";

type CallPanelState = {
  kind: CommunityMessengerCallKind;
  mode: "dialing" | "incoming" | "connecting" | "active";
  sessionId: string | null;
  peerLabel: string;
};

type CallTransportState = "idle" | "connecting" | "connected" | "disconnected" | "failed";
type CallQuality = "good" | "normal" | "poor" | null;
type PendingIncomingAcceptance = {
  sessionId: string;
  peerUserId: string;
  peerLabel: string;
  callKind: CommunityMessengerCallKind;
};

const CALL_RING_TIMEOUT_MS = 35_000;
/** postgres_changes 로 시그널이 오면 HTTP 폴링은 느린 백업 주기만 유지 */
const CALL_SIGNAL_POLL_MS_REALTIME_OK = 7_000;
const CALL_SIGNAL_POLL_MS_FALLBACK = 2_000;
const CALL_SIGNAL_POLL_MS_HIDDEN_TAB = 14_000;
const ROOM_SNAPSHOT_REFRESH_MS_NEGOTIATING = 2_300;
/** 시그널 Realtime 구독 중이면 스냅샷 폴링만 느리게 — HTTP onRefresh 와 중복 완화 */
const ROOM_SNAPSHOT_REFRESH_MS_NEGOTIATING_REALTIME_OK = 6_500;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readCandidateInit(payload: Record<string, unknown>): RTCIceCandidateInit | null {
  const candidate = payload.candidate;
  return isRecord(candidate) ? (candidate as RTCIceCandidateInit) : null;
}

function readSessionDescription(
  payload: Record<string, unknown>,
  expectedType: "offer" | "answer"
): RTCSessionDescriptionInit | null {
  const sdp = typeof payload.sdp === "string" ? payload.sdp.trim() : "";
  if (!sdp) return null;
  return { type: expectedType, sdp };
}

export function useCommunityMessengerCall(args: {
  roomId: string;
  roomType: "direct" | "group";
  viewerUserId: string;
  peerUserId: string | null;
  peerLabel: string;
  activeCall: CommunityMessengerCallSession | null;
  onRefresh: () => Promise<void> | void;
}) {
  const [panel, setPanel] = useState<CallPanelState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transportState, setTransportState] = useState<CallTransportState>("idle");
  const [callQuality, setCallQuality] = useState<CallQuality>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const pendingIncomingAcceptanceRef = useRef<PendingIncomingAcceptance | null>(null);
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const activeSinceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const sessionCleanupTimerRef = useRef<number | null>(null);
  const autoRetryTimerRef = useRef<number | null>(null);
  /** 자동 ICE 재시도 횟수 — effect 클로저와 동기화하려 ref 사용, UI phase 용 state 와 함께 갱신 */
  const autoRetryAttemptRef = useRef(0);
  const [autoRetryAttempt, setAutoRetryAttempt] = useState(0);
  const mediaNegotiationStartedAtRef = useRef<number | null>(null);
  const firstConnectedMetricsSentRef = useRef(false);
  const iceRestartCountForMetricsRef = useRef(0);
  const locallyClosedSessionIdRef = useRef<string | null>(null);
  const pendingCallActionIdRef = useRef(0);
  const callSignalsRealtimeSubscribedRef = useRef(false);

  const currentSessionId = panel?.sessionId ?? args.activeCall?.id ?? null;

  const clearPendingSessionCleanup = useCallback(() => {
    if (sessionCleanupTimerRef.current === null) return;
    window.clearTimeout(sessionCleanupTimerRef.current);
    sessionCleanupTimerRef.current = null;
  }, []);

  const clearPendingAutoRetry = useCallback(() => {
    if (autoRetryTimerRef.current === null) return;
    window.clearTimeout(autoRetryTimerRef.current);
    autoRetryTimerRef.current = null;
  }, []);

  const invalidatePendingCallActions = useCallback(() => {
    pendingCallActionIdRef.current += 1;
  }, []);

  const cleanupMedia = useCallback(() => {
    clearPendingSessionCleanup();
    clearPendingAutoRetry();
    invalidatePendingCallActions();
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    for (const track of localStream?.getTracks() ?? []) track.stop();
    for (const track of remoteStream?.getTracks() ?? []) track.stop();
    discardPrimedCommunityMessengerDevicePermission();
    setLocalStream(null);
    setRemoteStream(null);
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    pendingIncomingAcceptanceRef.current = null;
    processedSignalIdsRef.current.clear();
    activeSinceRef.current = null;
    firstConnectedMetricsSentRef.current = false;
    mediaNegotiationStartedAtRef.current = null;
    iceRestartCountForMetricsRef.current = 0;
    autoRetryAttemptRef.current = 0;
    setAutoRetryAttempt(0);
    setElapsedSeconds(0);
    setTransportState("idle");
    setCallQuality(null);
  }, [clearPendingAutoRetry, clearPendingSessionCleanup, invalidatePendingCallActions, localStream, remoteStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPendingSessionCleanup();
      clearPendingAutoRetry();
      cleanupMedia();
    };
  }, [cleanupMedia, clearPendingAutoRetry, clearPendingSessionCleanup]);

  useEffect(() => {
    const node = localVideoRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, localStream, { muted: true });
    return () => {
      node.srcObject = null;
    };
  }, [localStream]);

  useEffect(() => {
    const node = remoteVideoRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, remoteStream);
    return () => {
      node.srcObject = null;
    };
  }, [remoteStream]);

  useEffect(() => {
    const node = remoteAudioRef.current;
    if (!node) return;
    bindMediaStreamToElement(node, remoteStream);
    return () => {
      node.srcObject = null;
    };
  }, [remoteStream]);

  useEffect(() => {
    if (panel?.mode !== "active") return;
    const startedAt = activeSinceRef.current ?? Date.now();
    activeSinceRef.current = startedAt;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [panel?.mode]);

  useEffect(() => {
    const activeCall = args.activeCall;
    if (!activeCall) {
      if (panel?.sessionId) {
        if (locallyClosedSessionIdRef.current === panel.sessionId) {
          locallyClosedSessionIdRef.current = null;
          cleanupMedia();
          setPanel(null);
          return;
        }
        clearPendingSessionCleanup();
        const dismissMs = panel.mode === "dialing" || panel.mode === "incoming" ? 0 : 350;
        sessionCleanupTimerRef.current = window.setTimeout(() => {
          cleanupMedia();
          setPanel(null);
          sessionCleanupTimerRef.current = null;
        }, dismissMs);
      }
      return;
    }

    if (locallyClosedSessionIdRef.current === activeCall.id) {
      return;
    }
    locallyClosedSessionIdRef.current = null;
    clearPendingSessionCleanup();

    if (activeCall.status === "ringing") {
      setPanel((prev) => {
        if (prev?.sessionId === activeCall.id && (prev.mode === "connecting" || prev.mode === "active")) return prev;
        return {
          kind: activeCall.callKind,
          mode: activeCall.isMineInitiator ? "dialing" : "incoming",
          sessionId: activeCall.id,
          peerLabel: activeCall.peerLabel,
        };
      });
      return;
    }

    if (activeCall.status === "active") {
      activeSinceRef.current = new Date(activeCall.answeredAt ?? activeCall.startedAt).getTime();
      setPanel({
        kind: activeCall.callKind,
        mode: transportState === "connected" ? "active" : "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
    }
  }, [args.activeCall, cleanupMedia, clearPendingSessionCleanup, panel?.mode, panel?.sessionId, transportState]);

  const ensureLocalStream = useCallback(async (kind: CommunityMessengerCallKind) => {
    if (localStream) return localStream;
    const primedStream = consumePrimedCommunityMessengerDevicePermission(kind);
    if (primedStream) {
      if (!mountedRef.current) {
        for (const track of primedStream.getTracks()) track.stop();
        throw new Error("unmounted");
      }
      setLocalStream(primedStream);
      return primedStream;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === "video",
    });
    if (!mountedRef.current) {
      for (const track of stream.getTracks()) track.stop();
      throw new Error("unmounted");
    }
    setLocalStream(stream);
    return stream;
  }, [localStream]);

  const sendSignal = useCallback(async (sessionId: string, toUserId: string, signalType: "offer" | "answer" | "ice-candidate" | "hangup", payload: Record<string, unknown>) => {
    const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, signalType, payload }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    const ok = res.ok && !!json.ok;
    messengerMonitorSignalingPost(sessionId, signalType, ok, res.status);
    if (!ok) {
      throw new Error(json.error ?? `${signalType}_signal_failed`);
    }
  }, []);

  useEffect(() => {
    if (!args.activeCall || args.activeCall.status !== "ringing" || !args.activeCall.isMineInitiator) return;
    const sessionId = args.activeCall.id;
    const peerUserId = args.activeCall.peerUserId;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (peerUserId) {
            await sendSignal(sessionId, peerUserId, "hangup", { reason: "missed" });
          }
          await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "missed" }),
          });
          cleanupMedia();
          setPanel(null);
          setErrorMessage("상대방이 받지 않아 부재중 통화로 처리되었습니다.");
          await args.onRefresh();
        } catch {
          /* ignore timeout failure */
        }
      })();
    }, CALL_RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [args, cleanupMedia, sendSignal]);

  const flushPendingCandidates = useCallback(async () => {
    const connection = peerConnectionRef.current;
    if (!connection || !connection.remoteDescription) return;
    const batch = pendingCandidatesRef.current.splice(0);
    await Promise.all(
      batch.map(async (candidate) => {
        try {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore candidate failures */
        }
      })
    );
  }, []);

  const ensurePeerConnection = useCallback(
    async (
      kind: CommunityMessengerCallKind,
      sessionId: string,
      peerUserId: string,
      options?: { replaceExisting?: boolean; iceTransportPolicy?: RTCIceTransportPolicy }
    ) => {
      const existing = peerConnectionRef.current;
      if (existing && !options?.replaceExisting) return existing;
      if (existing && options?.replaceExisting) {
        for (const t of remoteStream?.getTracks() ?? []) t.stop();
        existing.close();
        peerConnectionRef.current = null;
        pendingCandidatesRef.current = [];
        pendingOfferRef.current = null;
        invalidateMessengerIceServerCache();
      }
      const [stream, iceServers] = await Promise.all([ensureLocalStream(kind), fetchMessengerIceServers()]);
      mediaNegotiationStartedAtRef.current = Date.now();
      firstConnectedMetricsSentRef.current = false;
      const connection = new RTCPeerConnection(
        buildMessengerRtcConfiguration(iceServers, {
          iceTransportPolicy: options?.iceTransportPolicy ?? "all",
        })
      );
      setTransportState("connecting");
      const nextRemoteStream = new MediaStream();
      setRemoteStream(nextRemoteStream);
      for (const track of stream.getTracks()) {
        connection.addTrack(track, stream);
      }
      connection.ontrack = (event) => {
        if (event.streams.length === 0) {
          nextRemoteStream.addTrack(event.track);
        }
        for (const streamItem of event.streams) {
          for (const track of streamItem.getTracks()) {
            nextRemoteStream.addTrack(track);
          }
        }
        bindMediaStreamToElement(remoteVideoRef.current, nextRemoteStream);
        bindMediaStreamToElement(remoteAudioRef.current, nextRemoteStream);
      };
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(sessionId, peerUserId, "ice-candidate", {
          candidate: event.candidate.toJSON(),
        }).catch(() => {
          /* ignore transient ICE signal delivery failure */
        });
      };
      connection.onconnectionstatechange = () => {
        const state = connection.connectionState;
        if (state === "connected") {
          clearPendingAutoRetry();
          autoRetryAttemptRef.current = 0;
          setAutoRetryAttempt(0);
          setTransportState("connected");
          if (!firstConnectedMetricsSentRef.current && mediaNegotiationStartedAtRef.current) {
            firstConnectedMetricsSentRef.current = true;
            messengerMonitorCallConnection(sessionId, Date.now() - mediaNegotiationStartedAtRef.current, kind);
          }
          setPanel((prev) =>
            prev && prev.sessionId === sessionId ? { ...prev, mode: "active" } : prev
          );
          return;
        }
        if (state === "connecting" || state === "new") {
          setTransportState("connecting");
          setPanel((prev) =>
            prev && prev.sessionId === sessionId && prev.mode !== "incoming" ? { ...prev, mode: "connecting" } : prev
          );
          return;
        }
        if (state === "disconnected") {
          setTransportState("disconnected");
          setErrorMessage("네트워크가 잠시 불안정합니다. 자동으로 다시 연결합니다.");
          return;
        }
        if (state === "failed") {
          setTransportState("failed");
          setErrorMessage("통화 연결이 약해 자동 복구를 시도합니다.");
          return;
        }
        if (state === "closed") {
          setTransportState("idle");
        }
      };
      connection.oniceconnectionstatechange = () => {
        const state = connection.iceConnectionState;
        if (state === "connected" || state === "completed") {
          clearPendingAutoRetry();
          autoRetryAttemptRef.current = 0;
          setAutoRetryAttempt(0);
          setTransportState("connected");
          if (!firstConnectedMetricsSentRef.current && mediaNegotiationStartedAtRef.current) {
            firstConnectedMetricsSentRef.current = true;
            messengerMonitorCallConnection(sessionId, Date.now() - mediaNegotiationStartedAtRef.current, kind);
          }
          setPanel((prev) =>
            prev && prev.sessionId === sessionId ? { ...prev, mode: "active" } : prev
          );
          return;
        }
        if (state === "checking" || state === "new") {
          setTransportState("connecting");
          setPanel((prev) =>
            prev && prev.sessionId === sessionId && prev.mode !== "incoming" ? { ...prev, mode: "connecting" } : prev
          );
          return;
        }
        if (state === "disconnected") {
          setTransportState("disconnected");
          return;
        }
        if (state === "failed") {
          setTransportState("failed");
        }
      };
      peerConnectionRef.current = connection;
      return connection;
    },
    [clearPendingAutoRetry, ensureLocalStream, remoteStream, sendSignal]
  );

  const completeIncomingAcceptance = useCallback(
    async (pending: PendingIncomingAcceptance, offer: RTCSessionDescriptionInit) => {
      const connection = await ensurePeerConnection(pending.callKind, pending.sessionId, pending.peerUserId);
      const acceptRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(pending.sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const acceptJson = (await acceptRes.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!acceptRes.ok || !acceptJson.ok) {
        throw new Error(acceptJson.error ?? "call_accept_failed");
      }
      await args.onRefresh();

      await connection.setRemoteDescription(offer);
      await flushPendingCandidates();
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal(pending.sessionId, pending.peerUserId, "answer", { sdp: answer.sdp ?? "" });

      pendingOfferRef.current = null;
      pendingIncomingAcceptanceRef.current = null;
      activeSinceRef.current = Date.now();
      setErrorMessage(null);
      setTransportState("connecting");
      setPanel({
        kind: pending.callKind,
        mode: "connecting",
        sessionId: pending.sessionId,
        peerLabel: pending.peerLabel,
      });
      await args.onRefresh();
    },
    [args, ensurePeerConnection, flushPendingCandidates, sendSignal]
  );

  const applySignal = useCallback(
    async (signal: CommunityMessengerCallSignal) => {
      if (!String(args.viewerUserId ?? "").trim()) return;
      if (!messengerUserIdsEqual(signal.toUserId, args.viewerUserId)) return;

      if (signal.signalType === "offer") {
        const offer = readSessionDescription(signal.payload, "offer");
        if (!offer) return;

        // 수락 직후 시그널 목록을 돌 때, 폴링으로 이미 본 offer는 processed 에 들어가 있다.
        // 그 경우에도 아래 분기가 먼저 실행되어야 하며, pendingOfferRef 에만 의존하지 않는다.
        const pendingAcceptance = pendingIncomingAcceptanceRef.current;
        if (
          pendingAcceptance &&
          messengerUserIdsEqual(pendingAcceptance.sessionId, signal.sessionId) &&
          messengerUserIdsEqual(pendingAcceptance.peerUserId, signal.fromUserId)
        ) {
          try {
            await completeIncomingAcceptance(pendingAcceptance, offer);
            processedSignalIdsRef.current.add(signal.id);
          } catch {
            /* completeIncomingAcceptance 실패 시 id 미등록 → 폴링으로 재시도 */
          }
          return;
        }

        if (processedSignalIdsRef.current.has(signal.id)) return;

        if (peerConnectionRef.current && panel?.mode === "active" && args.peerUserId) {
          try {
            await peerConnectionRef.current.setRemoteDescription(offer);
            await flushPendingCandidates();
            const answer = await peerConnectionRef.current.createAnswer();
            await peerConnectionRef.current.setLocalDescription(answer);
            await sendSignal(signal.sessionId, String(args.peerUserId), "answer", { sdp: answer.sdp ?? "" });
            processedSignalIdsRef.current.add(signal.id);
          } catch {
            /* answer 실패 시 동일 offer 재시도 */
          }
          return;
        }
        pendingOfferRef.current = offer;
        processedSignalIdsRef.current.add(signal.id);
        return;
      }

      if (processedSignalIdsRef.current.has(signal.id)) return;
      processedSignalIdsRef.current.add(signal.id);

      if (signal.signalType === "answer") {
        const answer = readSessionDescription(signal.payload, "answer");
        if (!answer || !peerConnectionRef.current) return;
        if (!peerConnectionRef.current.currentRemoteDescription) {
          await peerConnectionRef.current.setRemoteDescription(answer);
          await flushPendingCandidates();
        }
        return;
      }

      if (signal.signalType === "ice-candidate") {
        const candidate = readCandidateInit(signal.payload);
        if (!candidate) return;
        if (!peerConnectionRef.current?.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore candidate failures */
        }
        return;
      }

      if (signal.signalType === "hangup") {
        const reason = typeof signal.payload.reason === "string" ? signal.payload.reason : "";
        const message =
          reason === "reject"
            ? "상대방이 통화를 거절했습니다."
            : reason === "cancel"
              ? "상대방이 통화 걸기를 취소했습니다."
              : reason === "missed"
                ? "상대방이 받지 않아 통화가 종료되었습니다."
                : "상대방이 통화를 종료했습니다.";
        cleanupMedia();
        setPanel(null);
        setErrorMessage(message);
        await args.onRefresh();
      }
    },
    [args, cleanupMedia, completeIncomingAcceptance, flushPendingCandidates, panel?.mode, sendSignal]
  );

  useEffect(() => {
    if (panel?.mode !== "active") return;
    const connection = peerConnectionRef.current;
    if (!connection) return;
    let cancelled = false;

    const timer = setInterval(() => {
      void (async () => {
        try {
          const sample = await collectMessengerWebRtcDiagnostics(connection);
          const sid = currentSessionId;
          if (sid && !cancelled) {
            messengerMonitorCallWebRtcSample(sid, sample);
          }
          let nextQuality: CallQuality = null;
          const rttMs = sample.roundTripTimeMs;
          if (rttMs != null && rttMs > 0) {
            if (rttMs < 150) nextQuality = "good";
            else if (rttMs < 350) nextQuality = "normal";
            else nextQuality = "poor";
          } else if (sample.packetLossPercent != null) {
            nextQuality = sample.packetLossPercent > 8 ? "poor" : "normal";
          }
          if (!cancelled) setCallQuality(nextQuality);
        } catch {
          /* ignore stats polling failure */
        }
      })();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentSessionId, panel?.mode, transportState]);

  useEffect(() => {
    if (!panel?.sessionId) return;
    if (panel.mode === "active" && transportState === "connected") return;
    let cancelled = false;
    let timerId: number | null = null;
    const refreshNow = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void args.onRefresh();
    };
    const scheduleNext = () => {
      if (cancelled) return;
      const gap = callSignalsRealtimeSubscribedRef.current
        ? ROOM_SNAPSHOT_REFRESH_MS_NEGOTIATING_REALTIME_OK
        : ROOM_SNAPSHOT_REFRESH_MS_NEGOTIATING;
      timerId = window.setTimeout(() => {
        refreshNow();
        scheduleNext();
      }, gap);
    };
    refreshNow();
    scheduleNext();
    const onVis = () => {
      if (cancelled || typeof document === "undefined") return;
      if (document.visibilityState === "visible") void args.onRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timerId != null) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [args, panel?.mode, panel?.sessionId, transportState]);

  // Realtime + 적응형 HTTP 백업 폴링 — 초기 GET 은 한 번만(bootstrap) 후 루프.
  useEffect(() => {
    const sessionId = currentSessionId;
    if (!sessionId || !panel) return;

    const needsSignalPoll =
      panel.mode === "dialing" ||
      panel.mode === "connecting" ||
      panel.mode === "incoming" ||
      panel.mode === "active";

    if (!needsSignalPoll) return;

    const pollSessionId = sessionId;
    const sb = getSupabaseClient();
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let backoffUntil = 0;
    let timerId: number | null = null;
    let signalPollFailStreak = 0;
    let signalSoftErrorActive = false;

    const markSignalPollFailure = () => {
      signalPollFailStreak += 1;
      if (signalPollFailStreak >= 8 && !signalSoftErrorActive) {
        signalSoftErrorActive = true;
        setErrorMessage((prev) => prev ?? SIGNAL_POLL_SOFT_ERROR);
      }
    };

    const markSignalPollSuccess = () => {
      signalPollFailStreak = 0;
      if (signalSoftErrorActive) {
        signalSoftErrorActive = false;
        setErrorMessage((prev) => (prev === SIGNAL_POLL_SOFT_ERROR ? null : prev));
      }
    };

    async function bootstrapSignals() {
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(pollSessionId)}/signals`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
      if (!res.ok || !json.ok) {
        markSignalPollFailure();
        return;
      }
      markSignalPollSuccess();
      for (const signal of json.signals ?? []) {
        if (cancelled) break;
        await applySignal(signal);
      }
    }

    function nextSignalPollGapMs(): number {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return CALL_SIGNAL_POLL_MS_HIDDEN_TAB;
      }
      if (sb && callSignalsRealtimeSubscribedRef.current) return CALL_SIGNAL_POLL_MS_REALTIME_OK;
      return CALL_SIGNAL_POLL_MS_FALLBACK;
    }

    async function pollSignals() {
      if (cancelled) return;
      if (Date.now() < backoffUntil) return;
      try {
        const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(pollSessionId)}/signals`, {
          cache: "no-store",
        });
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          backoffUntil = Date.now() + sec * 1000;
          markSignalPollFailure();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
        if (!res.ok || !json.ok) {
          markSignalPollFailure();
          return;
        }
        markSignalPollSuccess();
        backoffUntil = 0;
        for (const signal of json.signals ?? []) {
          if (cancelled) break;
          await applySignal(signal);
        }
      } catch {
        markSignalPollFailure();
      }
    }

    async function runLoop() {
      while (!cancelled) {
        await pollSignals();
        if (cancelled) break;
        const base = nextSignalPollGapMs();
        const wait =
          Date.now() < backoffUntil
            ? Math.min(120_000, Math.max(0, backoffUntil - Date.now()) + 25)
            : base;
        await new Promise<void>((resolve) => {
          if (cancelled) {
            resolve();
            return;
          }
          timerId = window.setTimeout(() => {
            timerId = null;
            resolve();
          }, Math.max(200, wait));
        });
      }
    }

    const onVis = () => {
      if (cancelled || typeof document === "undefined") return;
      if (document.visibilityState === "visible") void pollSignals();
    };
    document.addEventListener("visibilitychange", onVis);

    callSignalsRealtimeSubscribedRef.current = false;
    if (sb) {
      channel = sb
        .channel(`community-messenger-call-signals:${sessionId}:${args.viewerUserId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "community_messenger_call_signals",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | undefined;
            if (!row) return;
            void applySignal({
              id: String(row.id ?? ""),
              sessionId: String(row.session_id ?? ""),
              roomId: String(row.room_id ?? ""),
              fromUserId: String(row.from_user_id ?? ""),
              toUserId: String(row.to_user_id ?? ""),
              signalType: String(row.signal_type ?? "") as CommunityMessengerCallSignal["signalType"],
              payload: isRecord(row.payload) ? row.payload : {},
              createdAt: String(row.created_at ?? new Date().toISOString()),
            });
          }
        )
        .subscribe((status) => {
          callSignalsRealtimeSubscribedRef.current = status === "SUBSCRIBED";
        });
    }

    void (async () => {
      await bootstrapSignals();
      if (!cancelled) void runLoop();
    })();

    return () => {
      cancelled = true;
      callSignalsRealtimeSubscribedRef.current = false;
      if (timerId != null) window.clearTimeout(timerId);
      document.removeEventListener("visibilitychange", onVis);
      if (sb && channel) void sb.removeChannel(channel);
    };
  }, [applySignal, args.activeCall?.status, args.viewerUserId, currentSessionId, panel?.mode, panel?.sessionId]);

  const prepareDevices = useCallback(async () => {
    const kind = panel?.kind ?? args.activeCall?.callKind;
    if (!kind) return;
    setBusy("device-prepare");
    setErrorMessage(null);
    try {
      await ensureLocalStream(kind);
    } catch (error) {
      setErrorMessage(getCommunityMessengerMediaErrorMessage(error, kind));
    } finally {
      setBusy(null);
    }
  }, [args.activeCall?.callKind, ensureLocalStream, panel?.kind]);

  const dismissPanel = useCallback(() => {
    invalidatePendingCallActions();
    cleanupMedia();
    setPanel(null);
    setErrorMessage(null);
  }, [cleanupMedia, invalidatePendingCallActions]);

  const closeSessionImmediately = useCallback(
    (sessionId: string | null) => {
      invalidatePendingCallActions();
      if (sessionId) {
        locallyClosedSessionIdRef.current = sessionId;
      }
      cleanupMedia();
      setPanel(null);
      setErrorMessage(null);
    },
    [cleanupMedia, invalidatePendingCallActions]
  );

  const startOutgoingCall = useCallback(async (kind: CommunityMessengerCallKind) => {
    if (!args.peerUserId) return;
    const actionId = pendingCallActionIdRef.current + 1;
    pendingCallActionIdRef.current = actionId;
    setBusy("call-start");
    setErrorMessage(null);
    setPanel({
      kind,
      mode: "dialing",
      sessionId: null,
      peerLabel: args.peerLabel,
    });
    try {
      await Promise.all([ensureLocalStream(kind), fetchMessengerIceServers()]);
      if (pendingCallActionIdRef.current !== actionId) return;
      const res = await fetch(`/api/community-messenger/rooms/${encodeURIComponent(args.roomId)}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callKind: kind }),
      });
      if (pendingCallActionIdRef.current !== actionId) return;
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; session?: CommunityMessengerCallSession };
      if (!res.ok || !json.ok || !json.session) {
        setErrorMessage(
          json.error === "group_call_not_supported_yet"
            ? "그룹 통화 실연결은 다음 단계에서 지원합니다."
            : "통화 시작에 실패했습니다."
        );
        return;
      }
      const session = json.session;
      if (!session.peerUserId) {
        setErrorMessage("상대방 정보를 불러오지 못했습니다.");
        return;
      }
      if (pendingCallActionIdRef.current !== actionId) return;
      setPanel({
        kind: session.callKind,
        mode: "dialing",
        sessionId: session.id,
        peerLabel: session.peerLabel,
      });
      const connection = await ensurePeerConnection(session.callKind, session.id, session.peerUserId);
      if (pendingCallActionIdRef.current !== actionId) return;
      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: session.callKind === "video",
      });
      await connection.setLocalDescription(offer);
      if (pendingCallActionIdRef.current !== actionId) return;
      await sendSignal(session.id, session.peerUserId, "offer", { sdp: offer.sdp ?? "" });
      await args.onRefresh();
    } catch (error) {
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(errorName ? getCommunityMessengerMediaErrorMessage(error, kind) : "통화 연결을 시작하지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }, [args, ensureLocalStream, ensurePeerConnection, sendSignal]);

  /** 영상 통화: 오디오 우선에 가깝게 비디오 품질 저하 방식 설정 */
  useEffect(() => {
    if (transportState !== "connected" || panel?.kind !== "video") return;
    const pc = peerConnectionRef.current;
    if (!pc) return;
    void applyVideoSenderDegradationPreference(pc, "maintain-framerate");
  }, [transportState, panel?.kind]);

  /** RTT 악화 시 송신 해상도·비트레이트 상한 */
  useEffect(() => {
    if (transportState !== "connected" || panel?.kind !== "video") return;
    if (callQuality !== "poor") return;
    const pc = peerConnectionRef.current;
    if (!pc) return;
    void applyVideoSenderBandwidthCap(pc, 280_000, 2);
  }, [callQuality, transportState, panel?.kind]);

  const rejectIncomingCall = useCallback(async () => {
    if (!args.activeCall?.id) return;
    const sessionId = args.activeCall.id;
    const peerId = args.activeCall.peerUserId;
    setBusy("call-reject");
    try {
      if (peerId) {
        try {
          await sendSignal(sessionId, peerId, "hangup", { reason: "reject" });
        } catch {
          /* hangup 실패 시에도 PATCH 로 세션 종료 */
        }
      }
      const patchRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const patchJson = (await patchRes.json().catch(() => ({}))) as { ok?: boolean };
      if (!patchRes.ok || !patchJson.ok) {
        setErrorMessage(MESSENGER_CALL_USER_MSG.sessionRejectFailed);
        return;
      }
      await args.onRefresh();
      closeSessionImmediately(sessionId);
    } finally {
      setBusy(null);
    }
  }, [args, closeSessionImmediately, sendSignal]);

  const acceptIncomingCall = useCallback(async (): Promise<boolean> => {
    const activeCall = args.activeCall;
    if (!activeCall) return false;
    setBusy("call-accept");
    setErrorMessage(null);
    try {
      if (!activeCall.peerUserId) {
        setErrorMessage("상대방 정보를 불러오지 못했습니다.");
        return false;
      }
      pendingIncomingAcceptanceRef.current = {
        sessionId: activeCall.id,
        peerUserId: activeCall.peerUserId,
        peerLabel: activeCall.peerLabel,
        callKind: activeCall.callKind,
      };
      setTransportState("connecting");
      setPanel({
        kind: activeCall.callKind,
        mode: "connecting",
        sessionId: activeCall.id,
        peerLabel: activeCall.peerLabel,
      });
      await ensurePeerConnection(activeCall.callKind, activeCall.id, activeCall.peerUserId);
      const res = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}/signals`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; signals?: CommunityMessengerCallSignal[] };
      for (const signal of json.signals ?? []) {
        await applySignal(signal);
      }
      /* offer 처리 시 applySignal → completeIncomingAcceptance 가 루프 안에서 끝나면
       * pendingIncomingAcceptanceRef 가 비워진다. 그때 아래 `!pendingAcceptance` 분기로 가면
       * 성공인데도 false 를 반환해 자동 수락·후속 로직이 꼬인다. */
      if (!pendingIncomingAcceptanceRef.current) {
        const pc = peerConnectionRef.current;
        if (pc?.remoteDescription && pc.localDescription) {
          return true;
        }
        return false;
      }
      const waitUntil = Date.now() + 4_500;
      while (Date.now() < waitUntil) {
        const pendingAcceptance = pendingIncomingAcceptanceRef.current;
        if (!pendingAcceptance) {
          const pc = peerConnectionRef.current;
          return Boolean(pc?.remoteDescription && pc.localDescription);
        }
        if (!messengerUserIdsEqual(pendingAcceptance.sessionId, activeCall.id)) {
          return false;
        }
        const offer = pendingOfferRef.current;
        if (offer) {
          await completeIncomingAcceptance(pendingAcceptance, offer);
          return true;
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 250);
        });
        const retryRes = await fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(activeCall.id)}/signals`, {
          cache: "no-store",
        });
        const retryJson = (await retryRes.json().catch(() => ({}))) as {
          ok?: boolean;
          signals?: CommunityMessengerCallSignal[];
        };
        for (const signal of retryJson.signals ?? []) {
          await applySignal(signal);
        }
      }

      setErrorMessage("발신 측 연결 정보를 기다리는 중입니다. 자동으로 재시도합니다.");
      return false;
    } catch (error) {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      pendingCandidatesRef.current = [];
      const errorName =
        typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      setErrorMessage(
        error instanceof Error && error.message === "unmounted"
          ? "통화 화면을 다시 열어 주세요."
          : error instanceof Error &&
              (error.message === "call_accept_failed" ||
                error.message === "bad_action" ||
                error.message === "forbidden")
            ? "통화 수락 처리에 실패했습니다. 잠시 후 다시 수락해 주세요."
            : errorName
              ? getCommunityMessengerMediaErrorMessage(error, activeCall.callKind)
              : "통화 연결을 시작하지 못했습니다."
      );
      pendingIncomingAcceptanceRef.current = null;
      return false;
    } finally {
      setBusy(null);
    }
  }, [applySignal, args, completeIncomingAcceptance, ensurePeerConnection]);

  const cancelOutgoingCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!sessionId || !args.peerUserId) return;
    setBusy("call-cancel");
    closeSessionImmediately(sessionId);
    try {
      await Promise.allSettled([
        sendSignal(sessionId, args.peerUserId, "hangup", { reason: "cancel" }),
        fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        }),
      ]);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args.onRefresh, args.peerUserId, closeSessionImmediately, currentSessionId, sendSignal]);

  const endActiveCall = useCallback(async () => {
    const sessionId = currentSessionId;
    if (!sessionId || !args.peerUserId) return;
    setBusy("call-end");
    closeSessionImmediately(sessionId);
    try {
      await Promise.allSettled([
        sendSignal(sessionId, args.peerUserId, "hangup", { reason: "end" }),
        fetch(`/api/community-messenger/calls/sessions/${encodeURIComponent(sessionId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "end",
            durationSeconds: elapsedSeconds,
          }),
        }),
      ]);
      await args.onRefresh();
    } finally {
      setBusy(null);
    }
  }, [args.onRefresh, args.peerUserId, closeSessionImmediately, currentSessionId, elapsedSeconds, sendSignal]);

  const retryConnection = useCallback(
    async (fromAutoScheduledAttempt?: number) => {
      const sessionId = currentSessionId;
      if (!sessionId || !args.peerUserId || !panel) return;

      if (fromAutoScheduledAttempt !== undefined && fromAutoScheduledAttempt >= 2) {
        setBusy("call-retry");
        setErrorMessage("네트워크 복구를 시도하고 있습니다. (릴레이 경로)");
        setTransportState("connecting");
        try {
          peerConnectionRef.current?.close();
          peerConnectionRef.current = null;
          pendingCandidatesRef.current = [];
          iceRestartCountForMetricsRef.current += 1;
          messengerMonitorCallIceRestart(sessionId, iceRestartCountForMetricsRef.current);
          messengerMonitorCallTurnFallback(sessionId);
          const conn = await ensurePeerConnection(panel.kind, sessionId, args.peerUserId, {
            replaceExisting: true,
            iceTransportPolicy: "relay",
          });
          const offer = await conn.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: panel.kind === "video",
          });
          await conn.setLocalDescription(offer);
          await sendSignal(sessionId, args.peerUserId, "offer", { sdp: offer.sdp ?? "" });
        } finally {
          setBusy(null);
        }
        return;
      }

      const connection = peerConnectionRef.current;
      if (!connection) return;
      setBusy("call-retry");
      setErrorMessage("네트워크 복구를 시도하고 있습니다.");
      setTransportState("connecting");
      try {
        iceRestartCountForMetricsRef.current += 1;
        messengerMonitorCallIceRestart(sessionId, iceRestartCountForMetricsRef.current);
        const offer = await connection.createOffer({
          iceRestart: true,
          offerToReceiveAudio: true,
          offerToReceiveVideo: panel.kind === "video",
        });
        await connection.setLocalDescription(offer);
        await sendSignal(sessionId, args.peerUserId, "offer", { sdp: offer.sdp ?? "" });
      } finally {
        setBusy(null);
      }
    },
    [args.peerUserId, currentSessionId, ensurePeerConnection, panel, sendSignal]
  );

  useEffect(() => {
    if (!panel?.sessionId) {
      clearPendingAutoRetry();
      autoRetryAttemptRef.current = 0;
      setAutoRetryAttempt(0);
      return;
    }
    if (panel.mode === "incoming") {
      clearPendingAutoRetry();
      return;
    }
    if (transportState === "connected") {
      clearPendingAutoRetry();
      autoRetryAttemptRef.current = 0;
      setAutoRetryAttempt(0);
      return;
    }
    if ((transportState !== "disconnected" && transportState !== "failed") || busy === "call-retry") {
      clearPendingAutoRetry();
      return;
    }
    if (autoRetryAttemptRef.current >= 2) return;
    clearPendingAutoRetry();
    autoRetryTimerRef.current = window.setTimeout(() => {
      autoRetryTimerRef.current = null;
      autoRetryAttemptRef.current += 1;
      const next = autoRetryAttemptRef.current;
      setAutoRetryAttempt(next);
      void retryConnection(next);
    }, transportState === "failed" ? 400 : 1200);
    return () => {
      clearPendingAutoRetry();
    };
  }, [busy, clearPendingAutoRetry, panel?.mode, panel?.sessionId, retryConnection, transportState]);

  const { phase: callSessionPhase, context: callSessionContext } = useMemo(
    () =>
      deriveCallSessionPhase({
        panel: panel ? { mode: panel.mode } : null,
        transportState,
        busy,
        autoRetryAttempt,
      }),
    [busy, panel, transportState, autoRetryAttempt]
  );

  const callStatusLabel = useMemo(() => {
    if (!panel) return "";
    return callSessionPhaseLabel(callSessionPhase, callSessionContext.direction);
  }, [callSessionContext.direction, callSessionPhase, panel]);

  const connectionBadge = useMemo(() => {
    if (callSessionPhase === "reconnecting") {
      return { label: "재연결 중", tone: "poor" as const };
    }
    if (callSessionPhase === "failed") {
      return { label: "연결 실패", tone: "poor" as const };
    }
    if (transportState === "connected") {
      if (callQuality === "good") return { label: "연결 좋음", tone: "good" as const };
      if (callQuality === "poor") return { label: "연결 약함", tone: "poor" as const };
      return { label: "연결 안정", tone: "normal" as const };
    }
    if (transportState === "connecting") return { label: "연결 중", tone: "normal" as const };
    if (transportState === "disconnected") return { label: "끊김 감지", tone: "poor" as const };
    if (transportState === "failed") return { label: "연결 실패", tone: "poor" as const };
    return null;
  }, [callQuality, callSessionPhase, transportState]);

  return {
    panel,
    busy,
    errorMessage,
    elapsedSeconds,
    localStream,
    remoteStream,
    localVideoRef,
    remoteVideoRef,
    remoteAudioRef,
    callStatusLabel,
    callSessionPhase,
    callSessionContext,
    connectionBadge,
    prepareDevices,
    dismissPanel,
    closeSessionImmediately,
    startOutgoingCall,
    acceptIncomingCall,
    rejectIncomingCall,
    cancelOutgoingCall,
    endActiveCall,
    retryConnection,
  };
}
