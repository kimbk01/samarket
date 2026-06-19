"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { CallBackground } from "@/components/messenger/call/CallBackground";
import { CallHeader } from "@/components/messenger/call/CallHeader";
import { CallAvatar } from "@/components/messenger/call/CallAvatar";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";

export type IncomingConnectingShellStatus =
  | "accepting"
  | "connecting_media"
  | "reconnecting"
  | "failed";

export type IncomingConnectingShellProps = {
  callId: string;
  peerLabel: string;
  peerAvatarUrl?: string | null;
  callKind: CommunityMessengerCallKind;
  status: IncomingConnectingShellStatus;
  failureMessage?: string | null;
  onDismiss?: () => void;
};

export function IncomingConnectingShell({
  callId,
  peerLabel,
  peerAvatarUrl = null,
  callKind,
  status,
  failureMessage = null,
  onDismiss,
}: IncomingConnectingShellProps) {
  const { t, safeT } = useI18n();
  const mode = callKind === "video" ? "video" : "voice";
  const isFailed = status === "failed";

  const statusText = isFailed
    ? safeT("common_content_unavailable", {
        fallbackKo: "연결할 수 없습니다",
        fallbackEn: "Could not connect",
      })
    : t("cm_ui_connecting");

  const subStatusText = isFailed
    ? failureMessage?.trim() ||
        safeT("cm_ui_call_accept_failed", {
          fallbackKo: "통화에 연결하지 못했습니다",
          fallbackEn: "Could not connect the call",
        })
    : callKind === "video"
      ? safeT("cm_ui_samarket_video_call_brand", {
          fallbackKo: "사마켓 영상 통화",
          fallbackEn: "SAMarket video call",
        })
      : t("cm_ui_outgoing_voice_dialing");

  return (
    <div
      className="absolute inset-0 z-[2] flex min-h-0 flex-col overflow-hidden"
      data-p2-a-incoming-shell="1"
      data-call-id={callId}
      data-shell-status={status}
    >
      <CallScreenShell variant="page" className="overflow-hidden">
        <CallBackground mode={mode} phase="connecting" showVideo={false} theme="starbucks" />
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <CallHeader onBack={null} topLabel={null} trailing={null} />
          <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-end px-4 pb-[max(14px,calc(env(safe-area-inset-bottom)+8px))] pt-2">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start pt-[min(18vh,140px)]">
              <div className="w-full max-w-md px-2 text-center">
                <div className="mx-auto flex justify-center">
                  <CallAvatar
                    label={peerLabel}
                    avatarUrl={peerAvatarUrl}
                    pulse={!isFailed}
                    theme="starbucks"
                  />
                </div>
                <p className="mt-5 sam-text-section-title font-semibold text-[#F1F8F4] sm:sam-text-hero">
                  {peerLabel}
                </p>
                <p className="mt-2 sam-text-body-lg font-medium text-[#F1F8F4]/86">{statusText}</p>
                <p className="mt-2 sam-text-body-secondary leading-snug text-[#D4E9E2]/68 sm:sam-text-body">
                  {subStatusText}
                </p>
              </div>
            </div>
            {isFailed && onDismiss ? (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  className="rounded-full bg-[#F1F8F4]/14 px-6 py-3 sam-text-body font-semibold text-[#F1F8F4] active:bg-[#F1F8F4]/22"
                  onClick={onDismiss}
                >
                  {t("nav_close")}
                </button>
              </div>
            ) : (
              <div
                className="rounded-t-3xl bg-gradient-to-t from-[#003D29]/88 via-[#006241]/42 to-transparent px-1 pt-12 pb-1"
                aria-hidden
              >
                <div className="flex w-full flex-nowrap items-start justify-between gap-[clamp(0.35rem,1.8vw,0.9rem)]">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-[clamp(48px,14vw,58px)] w-[clamp(48px,14vw,58px)] flex-1 basis-0 animate-pulse rounded-full bg-[#D4E9E2]/18"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </CallScreenShell>
    </div>
  );
}
