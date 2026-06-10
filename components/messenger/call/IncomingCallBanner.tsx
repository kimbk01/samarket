"use client";

import { Check, PhoneOff } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

function peerInitial(label: string): string {
  const t = label.trim();
  return [...t][0] ?? "?";
}

export type IncomingCallBannerProps = {
  peerLabel: string;
  callKind?: "voice" | "video";
  busyReject: boolean;
  busyAccept: boolean;
  onExpand: () => void;
  onReject: () => void;
  onAccept: () => void;
};

/** 수신 최소화 — DiBaY 1:1 통화 그린 상단 배너. */
export function IncomingCallBanner(props: IncomingCallBannerProps) {
  const { t } = useI18n();
  const { peerLabel, callKind = "voice", busyReject, busyAccept, onExpand, onReject, onAccept } = props;
  const kindLine = callKind === "video" ? t("cm_ui_video_call") : t("cm_ui_voice_call");

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-[60] px-3"
      role="dialog"
      aria-label={t("cm_ui_incoming_call_dialog")}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-[20px] bg-[linear-gradient(135deg,#00754A_0%,#006241_45%,#003D29_100%)] px-3 py-2.5 shadow-[0_12px_40px_rgba(0,61,41,0.34)] ring-1 ring-[#D4E9E2]/22">
        <button
          type="button"
          onClick={onExpand}
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-left transition active:scale-[0.99]"
          aria-label={t("cm_ui_open_call_screen")}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F1F8F4] text-[#006241]">
            <span className="sam-text-page-title font-semibold">{peerInitial(peerLabel)}</span>
          </div>
          <div className="min-w-0">
            <p className="truncate sam-text-helper font-medium text-[#D4E9E2]/82">{kindLine}</p>
            <p className="truncate sam-text-body-lg font-semibold text-[#F1F8F4]">{peerLabel}</p>
          </div>
        </button>
        <button
          type="button"
          disabled={busyReject || busyAccept}
          onClick={onReject}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#A9472B] text-white shadow-[0_10px_22px_rgba(88,41,26,0.28)] transition active:scale-[0.96] disabled:opacity-40"
          aria-label={t("cm_ui_reject")}
        >
          <PhoneOff size={24} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          disabled={busyAccept}
          onClick={onAccept}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#D4E9E2] text-[#003D29] shadow-[0_10px_22px_rgba(0,61,41,0.26)] transition active:scale-[0.96] disabled:opacity-40"
          aria-label={t("cm_ui_accept")}
        >
          <Check size={26} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
