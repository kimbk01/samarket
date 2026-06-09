"use client";

import { useEffect, useState } from "react";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type CommunityMessengerIncomingCallOverlayProps = {
  session: CommunityMessengerCallSession;
  busyId: string | null;
  sessionActionError: string | null;
  incomingListError: string | null;
  onMinimize: () => void;
  onReject: (sessionId: string) => void;
  onAccept: (session: CommunityMessengerCallSession, acceptMode?: "voice" | "video") => void;
  /** 레거시 API 호환용 — 수신 벨은 항상 전체 화면(텔레그램형)으로만 표시한다. */
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
      const start = new Date(session.startedAt).getTime();
      if (!Number.isFinite(start)) {
        setRemainSec(null);
        return;
      }
      const end = start + sec * 1000;
      const rem = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      /* 0 이면 "남은 0초"만 남고 오버레이가 계속 떠 보이므로 표시 생략 */
      setRemainSec(rem <= 0 ? null : rem);
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
      cameraEnabled: session.callKind === "video",
      localVideoMinimized: true,
    },
    onBack: onMinimize,
    primaryActions:
      session.callKind === "video"
        ? [
            {
              id: "reject",
              label: busyId === `reject:${session.id}` ? t("cm_ui_rejecting") : t("cm_ui_reject"),
              icon: "decline",
              tone: "danger",
              disabled: busyId === `reject:${session.id}` || busyId === `accept:${session.id}`,
              onClick: () => void onReject(session.id),
            },
            {
              id: "accept-voice",
              label:
                busyId === `accept:${session.id}` ? t("cm_ui_connecting") : t("cm_ui_incoming_accept_voice"),
              icon: "accept",
              tone: "accept",
              disabled: busyId === `accept:${session.id}`,
              onClick: () => void onAccept(session, "voice"),
            },
            {
              id: "accept-video",
              label:
                busyId === `accept:${session.id}` ? t("cm_ui_connecting") : t("cm_ui_incoming_accept_video"),
              icon: "accept",
              tone: "accept",
              disabled: busyId === `accept:${session.id}`,
              onClick: () => void onAccept(session, "video"),
            },
          ]
        : [
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
              onClick: () => void onAccept(session, "voice"),
            },
          ],
  };

  return <CallScreen vm={incomingVm} variant="overlay" />;
}
