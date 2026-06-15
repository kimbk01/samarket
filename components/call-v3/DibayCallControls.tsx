"use client";

import { PhoneOff } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dispatchCallV3Event } from "@/lib/call-v3/call-v3-events";

type Props = {
  variant: "incoming" | "outgoing" | "active";
  compact?: boolean;
};

export function DibayCallControls({ variant, compact }: Props) {
  const { t } = useI18n();

  if (variant === "incoming") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => dispatchCallV3Event({ type: "CALL_END_CLICK" })}
      className={`flex items-center justify-center rounded-full bg-[#FF3B30] text-white shadow-lg transition active:scale-95 ${
        compact ? "h-14 w-14" : "h-[clamp(72px,22vw,88px)] w-[clamp(72px,22vw,88px)]"
      }`}
      aria-label={t("cm_ui_end_call")}
    >
      <PhoneOff className={compact ? "h-6 w-6" : "h-8 w-8"} strokeWidth={2.5} />
    </button>
  );
}
