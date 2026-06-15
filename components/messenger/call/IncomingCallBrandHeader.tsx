"use client";

import { Phone, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CallScreenViewModel } from "./call-ui.types";

/** 수신 통화 상단 — DiBay 음성·영상 통화 브랜드 라인 */
export function IncomingCallBrandHeader({
  mode,
  visualTheme = "starbucks",
  className = "",
}: {
  mode: CallScreenViewModel["mode"];
  visualTheme?: CallScreenViewModel["visualTheme"];
  className?: string;
}) {
  const { safeT } = useI18n();
  const isStarbucks = visualTheme === "starbucks";
  const appCallLine =
    mode === "video"
      ? safeT("cm_ui_dibay_video_call_brand", {
          fallbackKo: "DiBay 영상 통화",
          fallbackEn: "DiBay video call",
        })
      : safeT("cm_ui_dibay_voice_call_brand", {
          fallbackKo: "DiBay 음성 통화",
          fallbackEn: "DiBay voice call",
        });
  const CallKindIcon = mode === "video" ? Video : Phone;

  return (
    <div
      className={`flex max-w-full items-center justify-center gap-2 ${isStarbucks ? "text-[#F1F8F4]" : "text-white"} ${className}`.trim()}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isStarbucks ? "bg-[#D4E9E2]/16 text-[#F1F8F4] ring-1 ring-[#D4E9E2]/20" : "bg-white/10 text-white"
        }`}
        aria-hidden
      >
        <CallKindIcon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0 truncate sam-text-body font-semibold tracking-tight">{appCallLine}</span>
    </div>
  );
}
