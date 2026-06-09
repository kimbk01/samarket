"use client";

import { Check, ChevronDown, Clock, MessageCircle, Phone, X } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CallScreenViewModel } from "./call-ui.types";

/** 수신 벨 — 텔레그램 iOS형: 풀스크린 단색, 상단 중앙 앱·통화 종류, 큰 이름, 중하단 보조/주 버튼. */
export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  const { t } = useI18n();
  const accept = vm.primaryActions.find((a) => a.icon === "accept" || a.tone === "accept") ?? null;
  const decline = vm.primaryActions.find((a) => a.icon === "decline" || a.tone === "danger") ?? null;

  const peerName = vm.peerLabel.trim() || "?";
  const appCallLine =
    vm.mode === "video" ? t("cm_ui_samarket_video_call_brand") : t("cm_ui_samarket_voice_call_brand");

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden bg-[#8B5E2E] px-5 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+12px))]">
      <button
        type="button"
        onClick={() => vm.onBack?.()}
        className="absolute right-3 top-[max(8px,env(safe-area-inset-top))] z-10 flex h-11 w-11 items-center justify-center rounded-full text-white/80 transition active:scale-[0.97] active:text-white"
        aria-label={t("cm_ui_minimize_call_window")}
      >
        <ChevronDown size={26} strokeWidth={2} />
      </button>

      <div className="flex min-h-0 flex-1 flex-col items-center">
        <div className="flex w-full max-w-[340px] shrink-0 flex-col items-center pt-[max(52px,11dvh)]">
          <div className="flex max-w-full items-center justify-center gap-2 text-white">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white" aria-hidden>
              <Phone size={18} strokeWidth={2} />
            </span>
            <span className="min-w-0 truncate sam-text-body font-medium tracking-tight">{appCallLine}…</span>
          </div>
          <h2 className="mt-5 text-center text-[1.75rem] font-bold leading-tight tracking-tight text-white sm:text-[2rem]">
            {peerName}
          </h2>
          {vm.subStatusText ? (
            <p className="mt-3 max-w-[300px] text-center sam-text-body-secondary leading-snug text-white/75">{vm.subStatusText}</p>
          ) : null}
        </div>

        <div className="flex min-h-0 w-full max-w-[360px] flex-1 flex-col items-center justify-end gap-6 pb-1 pt-6">
          <div className="flex w-full max-w-[340px] items-center justify-between">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => vm.onBack?.()}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-black/20 text-white transition active:scale-[0.96]"
                aria-label={t("cm_ui_send_message_from_call")}
              >
                <MessageCircle size={22} strokeWidth={2} />
              </button>
              <span className="max-w-[118px] text-center sam-text-body-secondary font-medium leading-tight text-white">
                {t("cm_ui_send_message_from_call")}
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => vm.onBack?.()}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-black/20 text-white transition active:scale-[0.96]"
                aria-label={t("cm_ui_remind_later")}
              >
                <Clock size={22} strokeWidth={2} />
              </button>
              <span className="max-w-[118px] text-center sam-text-body-secondary font-medium leading-tight text-white">
                {t("cm_ui_remind_later")}
              </span>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center justify-center gap-[68px]">
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                disabled={decline?.disabled}
                onClick={() => decline?.onClick()}
                className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-[#FF3B30] text-white transition active:scale-[0.96] disabled:opacity-40"
                aria-label={t("cm_ui_reject")}
              >
                <X size={44} strokeWidth={2.8} />
              </button>
              <span className="sam-text-section-title font-medium text-white">{t("cm_ui_reject")}</span>
            </div>
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                disabled={accept?.disabled}
                onClick={() => accept?.onClick()}
                className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white transition active:scale-[0.96] disabled:opacity-40"
                aria-label={t("cm_ui_call_answer")}
              >
                <Check size={40} strokeWidth={3.2} />
              </button>
              <span className="sam-text-section-title font-medium text-white">{t("cm_ui_call_answer")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
