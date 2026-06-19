"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { CallBackground } from "@/components/messenger/call/CallBackground";
import { CallAvatar } from "@/components/messenger/call/CallAvatar";
import type { IncomingCallPeerSnapshot } from "@/lib/community-messenger/call-connecting-surface/incoming-call-peer-snapshot";

export type CallConnectingSurfaceProps = {
  snapshot: IncomingCallPeerSnapshot;
};

/** 수신 accept 후 단일 연결 중 UI — 발신 dial 문구·cm_ui_call_label 사용 금지 */
export function CallConnectingSurface({ snapshot }: CallConnectingSurfaceProps) {
  const { t, safeT } = useI18n();
  const mode = snapshot.callKind === "video" ? "video" : "voice";

  const subStatusText =
    snapshot.callKind === "video"
      ? safeT("cm_ui_samarket_video_call_brand", {
          fallbackKo: "사마켓 영상 통화",
          fallbackEn: "SAMarket video call",
        })
      : safeT("cm_ui_incoming_voice_ringing", {
          fallbackKo: "음성 통화",
          fallbackEn: "Voice call",
        });

  return (
    <div
      className="fixed inset-0 z-[2100] flex min-h-0 flex-col overflow-hidden"
      data-call-connecting-surface="1"
      data-call-id={snapshot.sessionId}
    >
      <CallScreenShell variant="page" className="overflow-hidden">
        <CallBackground mode={mode} phase="connecting" showVideo={false} theme="starbucks" />
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-end px-4 pb-[max(14px,calc(env(safe-area-inset-bottom)+8px))] pt-2">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start pt-[min(18vh,140px)]">
              <div className="w-full max-w-md px-2 text-center">
                <div className="mx-auto flex justify-center">
                  <CallAvatar
                    label={snapshot.peerLabel}
                    avatarUrl={snapshot.peerAvatarUrl}
                    pulse
                    theme="starbucks"
                  />
                </div>
                <p className="mt-5 sam-text-section-title font-semibold text-[#F1F8F4] sm:sam-text-hero">
                  {snapshot.peerLabel}
                </p>
                <p className="mt-2 sam-text-body-lg font-medium text-[#F1F8F4]/86">
                  {t("cm_ui_connecting")}
                </p>
                <p className="mt-2 sam-text-body-secondary leading-snug text-[#D4E9E2]/68 sm:sam-text-body">
                  {subStatusText}
                </p>
              </div>
            </div>
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
          </div>
        </div>
      </CallScreenShell>
    </div>
  );
}
