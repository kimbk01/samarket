"use client";

import { Check, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallAvatar } from "./CallAvatar";

/** 수신 벨 — DiBaY 1:1 전용 스타벅스 그린 톤, 중앙 아바타·큰 터치 간격. */
export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  const { t } = useI18n();
  const isStarbucks = vm.visualTheme === "starbucks";
  const accept = vm.primaryActions.find((a) => a.icon === "accept" || a.tone === "accept") ?? null;
  const decline = vm.primaryActions.find((a) => a.icon === "decline" || a.tone === "danger") ?? null;

  const peerName = vm.peerLabel.trim() || "?";

  return (
    <div
      className={`relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+12px))] ${
        isStarbucks
          ? "bg-[radial-gradient(circle_at_50%_0%,rgba(212,233,226,0.20),transparent_34%),linear-gradient(180deg,#101827_0%,#064332_52%,#021E18_100%)]"
          : "bg-[#8B5E2E]"
      }`}
    >
      <div className="flex min-h-0 w-full max-w-md flex-1 flex-col items-center self-center">
        <div className="flex w-full shrink-0 flex-col items-center pt-[max(42px,8dvh)]" />

        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-2 py-4">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse theme={vm.visualTheme} />
          <h2
            className={`mt-6 text-center text-[clamp(1.35rem,5.5vw,2rem)] font-bold leading-tight tracking-tight ${
              isStarbucks ? "text-[#F1F8F4]" : "text-white"
            }`}
          >
            {peerName}
          </h2>
          <p
            className={`mt-2 text-center sam-text-body-lg font-medium ${
              isStarbucks ? "text-[#D4E9E2]/90" : "text-white/88"
            }`}
          >
            {vm.statusText}
          </p>
          {vm.subStatusText ? (
            <p
              className={`mt-2 max-w-[300px] text-center sam-text-body-secondary leading-snug ${
                isStarbucks ? "text-[#D4E9E2]/86" : "text-white/75"
              }`}
            >
              {vm.subStatusText}
            </p>
          ) : null}
        </div>

        <div className="flex w-full max-w-[360px] shrink-0 flex-col items-center gap-5 pb-1 pt-3">
          <div
            className={`flex w-full shrink-0 items-center justify-center ${
              isStarbucks ? "gap-[clamp(5rem,24vw,7.25rem)]" : "gap-[68px]"
            }`}
          >
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                disabled={decline?.disabled}
                onClick={() => decline?.onClick()}
                className={`flex h-[clamp(72px,22vw,88px)] w-[clamp(72px,22vw,88px)] shrink-0 items-center justify-center rounded-full text-white transition active:scale-[0.96] disabled:opacity-40 ${
                  isStarbucks
                    ? "bg-[#A9472B] shadow-[0_16px_34px_rgba(88,41,26,0.34)] ring-1 ring-[#F1F8F4]/18"
                    : "bg-[#FF3B30]"
                }`}
                aria-label={t("cm_ui_reject")}
              >
                <X className="h-[clamp(32px,10vw,44px)] w-[clamp(32px,10vw,44px)]" strokeWidth={2.8} />
              </button>
              <span className={`sam-text-section-title font-medium ${isStarbucks ? "text-[#F1F8F4]" : "text-white"}`}>
                {t("cm_ui_reject")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                disabled={accept?.disabled}
                onClick={() => accept?.onClick()}
                className={`flex h-[clamp(72px,22vw,88px)] w-[clamp(72px,22vw,88px)] shrink-0 items-center justify-center rounded-full text-white transition active:scale-[0.96] disabled:opacity-40 ${
                  isStarbucks
                    ? "bg-[#00754A] shadow-[0_16px_34px_rgba(0,61,41,0.34)] ring-1 ring-[#D4E9E2]/35"
                    : "bg-[#007AFF]"
                }`}
                aria-label={t("cm_ui_call_answer")}
              >
                <Check className="h-[clamp(30px,9vw,40px)] w-[clamp(30px,9vw,40px)]" strokeWidth={3.2} />
              </button>
              <span className={`sam-text-section-title font-medium ${isStarbucks ? "text-[#F1F8F4]" : "text-white"}`}>
                {t("cm_ui_call_answer")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
