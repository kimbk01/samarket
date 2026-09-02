"use client";

import { Headphones } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { SupportContext } from "@/lib/support/support-context";
import { navigateToSupportCenter } from "@/lib/support/open-support-center";

export function SupportFab({
  context,
  className = "",
}: {
  context: SupportContext;
  className?: string;
}) {
  const { safeT } = useI18n();

  return (
    <button
      type="button"
      data-support-fab="1"
      className={`pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full bg-sam-primary px-4 py-2.5 text-[14px] font-semibold text-white shadow-sam-elevated transition active:scale-[0.98] ${className}`.trim()}
      onClick={() => {
        navigateToSupportCenter(context);
      }}
    >
      <span>
        {safeT("support_fab_label", {
          fallbackKo: "고객센터",
          fallbackEn: "Support",
        })}
      </span>
      <Headphones className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
    </button>
  );
}
