"use client";

import { Phone, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { IncomingCallControls } from "@/components/messenger/call/IncomingCallControls";
import { IncomingCallPulse } from "@/components/messenger/call/IncomingCallPulse";

function peerInitial(label: string): string {
  const trimmed = label.trim();
  return [...trimmed][0] ?? "?";
}

export function IncomingCallPopup({
  peerLabel,
  peerPublicId,
  peerAvatarUrl,
  callKind,
  showStrangerHint = false,
  busyReject,
  busyAccept,
  onReject,
  onAccept,
}: {
  peerLabel: string;
  peerPublicId?: string | null;
  peerAvatarUrl?: string | null;
  callKind: "voice" | "video";
  showStrangerHint?: boolean;
  busyReject: boolean;
  busyAccept: boolean;
  onReject: () => void;
  onAccept: () => void;
}) {
  const { t, safeT } = useI18n();
  const Icon = callKind === "video" ? Video : Phone;
  const kindLabel =
    callKind === "video"
      ? safeT("cm_ui_dibay_video_call_brand", {
          fallbackKo: "DiBay 영상 통화",
          fallbackEn: "DiBay video call",
        })
      : safeT("cm_ui_dibay_voice_call_brand", {
          fallbackKo: "DiBay 음성 통화",
          fallbackEn: "DiBay voice call",
        });
  const normalizedPublicId = peerPublicId?.trim()?.replace(/^@/, "") || null;

  return (
    <div className="incoming-call-popup pointer-events-auto fixed inset-x-0 top-[max(8px,var(--safe-top))] px-3 sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2" role="dialog" aria-label={t("cm_ui_incoming_call_dialog")}>
      <div className="mx-auto flex min-h-[92px] max-w-[520px] items-center gap-3 overflow-hidden rounded-[20px] border border-white/12 bg-[#1E1E1E]/94 px-3 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
          <IncomingCallPulse kind={callKind} className="absolute inset-[-28px] scale-[0.56]" />
          <div className="relative z-[2] h-14 w-14 overflow-hidden rounded-full bg-[#F1F8F4] ring-1 ring-white/18">
            <SamarketThumbnail
              src={peerAvatarUrl}
              fill
              roundedClassName="rounded-full"
              className="bg-[#F1F8F4]"
              fallbackSrc=""
              fallbackNode={<span className="flex h-full w-full items-center justify-center sam-text-page-title font-bold text-[#00754A]">{peerInitial(peerLabel)}</span>}
            />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 z-[3] flex h-6 w-6 items-center justify-center rounded-full bg-[#00754A] text-white ring-2 ring-[#1E1E1E]">
            <Icon size={13} strokeWidth={2.6} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate sam-text-body font-bold leading-tight text-white">{peerLabel.trim() || t("cm_ui_other_party")}</p>
          {normalizedPublicId ? <p className="mt-0.5 truncate sam-text-xxs font-medium text-white/58">@{normalizedPublicId}</p> : null}
          {showStrangerHint ? (
            <p className="mt-0.5 truncate sam-text-xxs font-medium text-amber-200/90">{t("cm_social_stranger_incoming_call")}</p>
          ) : null}
          <p className="mt-0.5 truncate sam-text-helper font-semibold text-white/78">{kindLabel}</p>
        </div>
        <IncomingCallControls
          acceptLabel={t("cm_ui_accept")}
          rejectLabel={t("cm_ui_reject")}
          busyAccept={busyAccept}
          busyReject={busyReject}
          size="compact"
          onAccept={onAccept}
          onReject={onReject}
        />
      </div>
    </div>
  );
}
