"use client";

import { useEffect, useState } from "react";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { computeIncomingRingRemainingSeconds } from "@/lib/community-messenger/messenger-call-ring-timeout";

export type CommunityMessengerIncomingCallOverlayProps = {
  session: CommunityMessengerCallSession;
  busyId: string | null;
  sessionActionError: string | null;
  incomingListError: string | null;
  onMinimize: () => void;
  onReject: (sessionId: string) => void;
  onAccept: (session: CommunityMessengerCallSession) => void;
  /** 레거시 API — 전용 통화 라우트(`/calls/*`)의 전체 수신 화면 VM 조립용 */
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
    placement: _placement = "global",
    ringTimeoutSeconds,
  } = props;

  const { t } = useI18n();
  const [remainSec, setRemainSec] = useState<number | null>(null);
  useEffect(() => {
    const sec = ringTimeoutSeconds;
    const dismissing =
      busyId === `reject:${session.id}` || busyId === `accept:${session.id}`;
    if (dismissing || sec == null || sec <= 0 || !session.startedAt) {
      setRemainSec(null);
      return;
    }
    const tick = () => {
      setRemainSec(computeIncomingRingRemainingSeconds(session.startedAt, sec));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busyId, ringTimeoutSeconds, session.id, session.startedAt]);

  const statusMain =
    session.callKind === "video" ? t("cm_ui_incoming_video_ringing") : t("cm_ui_incoming_voice_ringing");
  const baseSub = sessionActionError ?? incomingListError ?? "";
  const tail =
    remainSec != null && remainSec > 0
      ? `${baseSub ? " " : ""}${t("cm_ui_ring_remaining_seconds", { count: remainSec })}`
      : "";
  const subStatusText = (baseSub + tail).trim() || null;

  const incomingVm: CallScreenViewModel = {
    visualTheme: "starbucks",
    mode: session.callKind === "video" ? "video" : "voice",
    direction: "incoming",
    phase: "ringing",
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl ?? null,
    statusText: statusMain,
    subStatusText,
    topLabel: null,
    footerNote: null,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: false,
      localVideoMinimized: true,
    },
    onBack: onMinimize,
    primaryActions: [
      {
        id: "reject",
        label: busyId === `reject:${session.id}` ? t("cm_ui_rejecting") : t("cm_ui_reject"),
        icon: "decline",
        tone: "danger",
        disabled: busyId === `reject:${session.id}` || busyId === `accept:${session.id}`,
        onClick: () => void onReject(session.id),
      },
      {
        id: "accept",
        label: busyId === `accept:${session.id}` ? t("cm_ui_connecting") : t("cm_ui_accept"),
        icon: "accept",
        tone: "accept",
        disabled: busyId === `accept:${session.id}`,
        onClick: () => void onAccept(session),
      },
    ],
  };

  return <CallScreen vm={incomingVm} variant="overlay" />;
}
