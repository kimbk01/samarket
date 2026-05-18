"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { runHistoryBackWithFallback } from "@/lib/navigation/history-back-fallback";

type HistoryBackTextLinkProps = {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
  ariaLabelKey?: MessageKey;
  /** @deprecated ariaLabelKey 사용 */
  "aria-label"?: string;
};

/**
 * 텍스트형 뒤로가기 — 히스토리 우선, 스택이 없으면 fallbackHref.
 */
export function HistoryBackTextLink({
  fallbackHref,
  className,
  children,
  ariaLabelKey,
  "aria-label": ariaLabel,
}: HistoryBackTextLinkProps) {
  const router = useRouter();
  const { t, tt } = useI18n();
  const resolvedAriaLabel = ariaLabelKey
    ? t(ariaLabelKey)
    : ariaLabel
      ? tt(ariaLabel)
      : t("nav_back");
  return (
    <button
      type="button"
      className={className}
      aria-label={resolvedAriaLabel}
      onClick={() => runHistoryBackWithFallback(router, fallbackHref)}
    >
      {children}
    </button>
  );
}
