"use client";

import { useEffect, useState } from "react";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";

export type CommunityMessengerIncomingCallOverlayProps = {
  session: CommunityMessengerCallSession;
  busyId: string | null;
  sessionActionError: string | null;
  incomingListError: string | null;
  onMinimize: () => void;
  onReject: (sessionId: string) => void;
  onAccept: (session: CommunityMessengerCallSession) => void;
  /** 같은 메신저 방 URL 에 있을 때 상단 도킹(전체 화면 대신) */
  placement?: "global" | "in-room";
  /** 관리자 수신 타임아웃(초) — 남은 시간 표시 */
  ringTimeoutSeconds?: number | null;
};

/** 앱 루트 단일 전역 수신 오버레이 — `CallScreen` VM 조립만 담당 */
export function CommunityMessengerIncomingCallOverlay(props: CommunityMessengerIncomingCallOverlayProps) {
  const {
    session,
    busyId,
    sessionActionError,
    incomingListError,
    onMinimize,
    onReject,
    onAccept,
    placement = "global",
    ringTimeoutSeconds,
  } = props;

  const [remainSec, setRemainSec] = useState<number | null>(null);
  useEffect(() => {
    const sec = ringTimeoutSeconds;
    if (sec == null || sec <= 0 || !session.startedAt) {
      setRemainSec(null);
      return;
    }
    const tick = () => {
      const start = new Date(session.startedAt).getTime();
      if (!Number.isFinite(start)) {
        setRemainSec(null);
        return;
      }
      const end = start + sec * 1000;
      setRemainSec(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [ringTimeoutSeconds, session.startedAt, session.id]);

  const callTypeLabel = session.callKind === "video" ? "영상 통화" : "음성 통화";
  const baseSub = sessionActionError ?? incomingListError ?? "";
  const tail = remainSec != null ? `${baseSub ? " " : ""}· 남은 ${remainSec}초` : "";
  const subStatusText = (baseSub + tail).trim() || null;

  const incomingVm: CallScreenViewModel = {
    mode: session.callKind === "video" ? "video" : "voice",
    direction: "incoming",
    phase: "ringing",
    peerLabel: session.peerLabel,
    peerAvatarUrl: null,
    statusText: callTypeLabel,
    subStatusText,
    topLabel: null,
    footerNote: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: session.callKind === "video",
      localVideoMinimized: true,
    },
    onBack: onMinimize,
    primaryActions: [
      {
        id: "reject",
        label: busyId === `reject:${session.id}` ? "거절 중" : "거절",
        icon: "decline",
        tone: "danger",
        disabled: busyId === `reject:${session.id}` || busyId === `accept:${session.id}`,
        onClick: () => void onReject(session.id),
      },
      {
        id: "accept",
        label: busyId === `accept:${session.id}` ? "연결 중" : "수락",
        icon: "accept",
        tone: "accept",
        disabled: busyId === `accept:${session.id}`,
        onClick: () => void onAccept(session),
      },
    ],
  };

  const variant = placement === "in-room" ? "dock-top" : "overlay";
  return <CallScreen vm={incomingVm} variant={variant} />;
}
