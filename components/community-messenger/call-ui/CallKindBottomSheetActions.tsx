"use client";

import { Phone, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";

type Props = {
  onVoiceCall: () => void;
  onVideoCall: () => void;
  voiceBusy?: boolean;
  videoBusy?: boolean;
  disabled?: boolean;
};

/**
 * Friend profile / call entry — Voice primary + Video secondary (Overlay SSOT).
 */
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
      <DibayOverlayButton
        roleTone="primary"
        onClick={onVoiceCall}
        disabled={disabled || voiceBusy}
        loading={voiceBusy}
        className="!flex-none w-full"
      >
        <Phone size={20} strokeWidth={2.4} aria-hidden />
        <span>{t("nav_voice_call_label")}</span>
      </DibayOverlayButton>
      <DibayOverlayButton
        roleTone="secondary"
        onClick={onVideoCall}
        disabled={disabled || videoBusy}
        loading={videoBusy}
        className="!flex-none w-full"
      >
        <Video size={20} strokeWidth={2.4} aria-hidden />
        <span>{t("nav_video_call_label")}</span>
      </DibayOverlayButton>
    </div>
  );
}
