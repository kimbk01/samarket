"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";
import { AppBackIcon, AppCloseIcon } from "@/components/navigation/AppBackButton";
import { SECTOR_HEADER_BACK_CLASS } from "@/lib/ui/sector-header-classes";

type SectorHeaderBackButtonProps = {
  backHref?: string;
  interceptBack?: () => boolean;
  preferHistoryBack?: boolean;
  onBack?: () => void;
  className?: string;
  ariaLabelKey?: MessageKey;
  ariaLabel?: string;
  variant?: "back" | "close";
};

export function SectorHeaderBackButton({
  backHref,
  interceptBack,
  preferHistoryBack,
  onBack,
  className = "",
  ariaLabelKey,
  ariaLabel,
  variant = "back",
}: SectorHeaderBackButtonProps) {
  const { t, tt } = useI18n();
  const router = useRouter();
  const mergedClass = `${SECTOR_HEADER_BACK_CLASS} ${className}`.trim();
  const resolvedAriaLabel = ariaLabelKey
    ? t(ariaLabelKey)
    : ariaLabel
      ? tt(ariaLabel)
      : variant === "close"
        ? t("common_close")
        : t("nav_back");
  const Icon = variant === "close" ? AppCloseIcon : AppBackIcon;

  if (preferHistoryBack === false && backHref != null) {
    return (
      <Link
        href={backHref}
        className={mergedClass}
        aria-label={resolvedAriaLabel}
        scroll={false}
        onClick={(e) => {
          if (interceptBack?.()) e.preventDefault();
        }}
      >
        <Icon />
      </Link>
    );
  }

  if (backHref != null) {
    return (
      <button
        type="button"
        onClick={() => {
          if (interceptBack?.()) return;
          runHistoryBackWithFallback(router, backHref);
        }}
        className={mergedClass}
        aria-label={resolvedAriaLabel}
      >
        <Icon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (interceptBack?.()) return;
        onBack ? onBack() : runHistoryBackWithFallback(router);
      }}
      className={mergedClass}
      aria-label={resolvedAriaLabel}
    >
      <Icon />
    </button>
  );
}
