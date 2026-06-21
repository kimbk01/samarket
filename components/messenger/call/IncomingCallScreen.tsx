"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { IncomingCallControls } from "@/components/messenger/call/IncomingCallControls";
import { IncomingCallPulse } from "@/components/messenger/call/IncomingCallPulse";

function peerInitial(label: string): string {
  const trimmed = label.trim();
  return [...trimmed][0] ?? "?";
}

export function IncomingCallScreen({
  peerLabel,
  peerPublicId,
  peerAvatarUrl,
  callKind,
  busyReject,
  busyAccept,
  onReject,
  onAccept,
}: {
  peerLabel: string;
  peerPublicId?: string | null;
  peerAvatarUrl?: string | null;
  callKind: "voice" | "video";
  busyReject: boolean;
  busyAccept: boolean;
  onReject: () => void;
  onAccept: () => void;
}) {
  const { t, safeT } = useI18n();
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
    <div className="relative flex h-full min-h-[100dvh] flex-col overflow-hidden bg-[#121212] px-6 pb-[max(28px,calc(var(--safe-bottom)+16px))] pt-[max(32px,calc(var(--safe-top)+20px))] text-white">
      {peerAvatarUrl ? (
        <div className="pointer-events-none absolute inset-0 opacity-20 blur-2xl" aria-hidden>
          <SamarketThumbnail
            src={peerAvatarUrl}
            fill
            roundedClassName="rounded-none"
            className="scale-110 object-cover"
            fallbackSrc=""
          />
          <div className="absolute inset-0 bg-[#00754A]/40" />
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(0,117,74,0.28),transparent_42%),linear-gradient(180deg,#121212_0%,#1E1E1E_58%,#121212_100%)]" aria-hidden />
      )}
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <div className="relative flex h-32 w-32 items-center justify-center">
          <IncomingCallPulse kind={callKind} className="absolute inset-0" />
          <div className="relative z-[2] h-24 w-24 overflow-hidden rounded-full bg-[#F1F8F4] shadow-[0_18px_46px_rgba(0,0,0,0.35)] ring-2 ring-white/16">
            <SamarketThumbnail
              src={peerAvatarUrl}
              fill
              roundedClassName="rounded-full"
              className="bg-[#F1F8F4]"
              fallbackSrc=""
              fallbackNode={<span className="flex h-full w-full items-center justify-center text-[2rem] font-bold text-[#00754A]">{peerInitial(peerLabel)}</span>}
            />
          </div>
        </div>
        <h1 className="mt-7 max-w-full truncate text-[clamp(1.65rem,7vw,2.25rem)] font-bold leading-tight tracking-tight">
          {peerLabel.trim() || t("cm_ui_other_party")}
        </h1>
        {normalizedPublicId ? <p className="mt-1 max-w-full truncate sam-text-body font-medium text-white/68">@{normalizedPublicId}</p> : null}
        <p className="mt-4 sam-text-body-lg font-semibold text-white/88">{kindLabel}</p>
      </div>
      <div className="relative z-[1] mt-auto">
        <IncomingCallControls
          acceptLabel={t("cm_ui_accept")}
          rejectLabel={t("cm_ui_reject")}
          busyAccept={busyAccept}
          busyReject={busyReject}
          onAccept={onAccept}
          onReject={onReject}
        />
      </div>
    </div>
  );
}
