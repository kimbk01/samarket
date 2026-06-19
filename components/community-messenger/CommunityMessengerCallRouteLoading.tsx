"use client";

import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { CallBackground } from "@/components/messenger/call/CallBackground";
import { CallHeader } from "@/components/messenger/call/CallHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * 통화 라우트(RSC 대기·클라 청크 로드) 동안 실제 통화 화면과 동일한 골격을 유지한다.
 * 별도 스피너 화면으로 바뀌지 않아 체감 단절·이중 전환을 줄인다.
 */
export function CommunityMessengerCallRouteLoading() {
  const { t } = useI18n();
  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <CallScreenShell variant="page" className="overflow-hidden">
        <CallBackground mode="video" phase="connecting" showVideo={false} theme="starbucks" />
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
          <CallHeader onBack={null} topLabel={null} trailing={null} />
          <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-end px-4 pb-[max(14px,calc(var(--safe-bottom)+8px))] pt-2">
            <div className="flex min-h-0 flex-1 flex-col justify-start pt-[min(18vh,140px)]">
              <div className="w-full max-w-md self-center px-2">
                <div className="px-6 text-center">
                  <div
                    className="mx-auto h-10 max-w-[220px] animate-pulse rounded-xl bg-[#D4E9E2]/24 sm:h-11"
                    aria-hidden
                  />
                  <p className="mt-3 sam-text-body-lg font-medium text-[#F1F8F4]/86 sm:sam-text-section-title">
                    {t("cm_ui_loading_call_screen")}
                  </p>
                  <p className="mt-2 sam-text-body-secondary leading-snug text-[#D4E9E2]/68 sm:sam-text-body">
                    {t("cm_ui_call_screen_ready_hint")}
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-t-3xl bg-gradient-to-t from-[#003D29]/88 via-[#006241]/42 to-transparent px-1 pt-12 pb-1">
              <div className="flex w-full flex-nowrap items-start justify-between gap-[clamp(0.35rem,1.8vw,0.9rem)]" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[clamp(48px,14vw,58px)] w-[clamp(48px,14vw,58px)] flex-1 basis-0 animate-pulse rounded-full bg-[#D4E9E2]/18" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </CallScreenShell>
    </div>
  );
}
