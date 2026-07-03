"use client";

import { Phone, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  CALL_UI_PRIMARY_BTN_CLASS,
} from "@/lib/community-messenger/call-ui/call-ui-tokens";

type Props = {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  voiceBusy?: boolean;
  videoBusy?: boolean;
  disabled?: boolean;
};

/** Friend profile / call entry — Voice + Video stacked primary actions (2026 bottom sheet). */
export function CallKindBottomSheetActions({
  onVoiceCall,
  onVideoCall,
  voiceBusy = false,
  videoBusy = false,
  disabled = false,
}: Props) {
  const { t } = useI18n();

  return (
    <div className="mt-3 flex flex-col gap-3">
      <button
        type="button"
        onClick={onVoiceCall}
        disabled={disabled || voiceBusy}
        className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-[18px] sam-text-body font-semibold ${CALL_UI_PRIMARY_BTN_CLASS}`}
      >
        <Phone size={22} strokeWidth={2.4} aria-hidden />
        <span>{t("nav_voice_call_label")}</span>
        {voiceBusy ? (
          <span className="sam-text-xxs font-medium opacity-80">{t("cm_ui_connecting")}</span>
        ) : null}
      </button>
      <button
        type="button"
        onClick={onVideoCall}
        disabled={disabled || videoBusy}
        className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-[18px] sam-text-body font-semibold ${CALL_UI_PRIMARY_BTN_CLASS}`}
      >
        <Video size={22} strokeWidth={2.4} aria-hidden />
        <span>{t("nav_video_call_label")}</span>
        {videoBusy ? (
          <span className="sam-text-xxs font-medium opacity-80">{t("cm_ui_connecting")}</span>
        ) : null}
      </button>
    </div>
  );
}
