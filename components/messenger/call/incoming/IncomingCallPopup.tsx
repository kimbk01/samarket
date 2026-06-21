"use client";

import { Phone, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { IncomingCallControls } from "./IncomingCallControls";
import { IncomingCallPulse } from "./IncomingCallPulse";

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
  exiting = false,
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
  exiting?: boolean;
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
    <div
      className={`incoming-call-popup pointer-events-auto fixed inset-x-0 top-[max(8px,var(--safe-top))] px-[clamp(0.5rem,2vw,0.75rem)] sm:left-1/2 sm:right-auto sm:w-[min(520px,calc(100vw-2rem))] sm:-translate-x-1/2 ${exiting ? "incoming-call-popup--exit" : "incoming-call-popup--enter"}`}
      role="dialog"
      aria-label={t("cm_ui_incoming_call_dialog")}
    >
      <div className="incoming-call-popup__card mx-auto flex max-w-[520px] items-center gap-[clamp(0.5rem,2.5vw,0.75rem)] overflow-hidden rounded-[20px] px-[clamp(0.5rem,2.5vw,0.75rem)] py-[clamp(0.5rem,2vw,0.75rem)] backdrop-blur-xl">
        <div className="relative flex h-[clamp(3rem,13vw,3.5rem)] w-[clamp(3rem,13vw,3.5rem)] shrink-0 items-center justify-center">
          <IncomingCallPulse kind={callKind} compact className="absolute inset-[-28px] scale-[0.56]" />
          <div className="relative z-[2] h-full w-full overflow-hidden rounded-full bg-[#F1F8F4] ring-1 ring-[#D4E9E2]/35">
            <SamarketThumbnail
              src={peerAvatarUrl}
              fill
              roundedClassName="rounded-full"
              className="bg-[#F1F8F4]"
              fallbackSrc=""
              fallbackNode={
                <span className="flex h-full w-full items-center justify-center text-[clamp(1rem,4vw,1.25rem)] font-bold text-[#00754A]">
                  {peerInitial(peerLabel)}
                </span>
              }
            />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 z-[3] flex h-[clamp(1.25rem,4vw,1.5rem)] w-[clamp(1.25rem,4vw,1.5rem)] items-center justify-center rounded-full bg-[#00754A] text-white ring-2 ring-[#003D29]">
            <Icon className="h-[clamp(0.65rem,2.2vw,0.8125rem)] w-[clamp(0.65rem,2.2vw,0.8125rem)]" strokeWidth={2.6} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[clamp(0.875rem,3.6vw,1rem)] font-bold leading-tight text-[#F1F8F4]">
            {peerLabel.trim() || t("cm_ui_other_party")}
          </p>
          {normalizedPublicId ? (
            <p className="mt-0.5 truncate text-[clamp(0.625rem,2.6vw,0.75rem)] font-medium text-[#D4E9E2]/78">
              @{normalizedPublicId}
            </p>
          ) : null}
          {showStrangerHint ? (
            <p className="mt-0.5 truncate text-[clamp(0.625rem,2.6vw,0.75rem)] font-medium text-amber-200/90">
              {t("cm_social_stranger_incoming_call")}
            </p>
          ) : null}
          <p className="mt-0.5 truncate text-[clamp(0.6875rem,2.8vw,0.8125rem)] font-semibold text-[#D4E9E2]/92">
            {kindLabel}
          </p>
        </div>
        <IncomingCallControls
          acceptLabel={t("cm_ui_accept")}
          rejectLabel={t("cm_ui_reject")}
          busyAccept={busyAccept}
          busyReject={busyReject}
          mode="popup"
          onAccept={onAccept}
          onReject={onReject}
        />
      </div>
    </div>
  );
}
