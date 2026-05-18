"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type RouteLoadingInlineProps = {
  messageKey?: MessageKey;
  className?: string;
};

/** 블록 내부 인라인 로딩 문구 (예: 카드 안 "불러오는 중…") */
export function RouteLoadingInline({
  messageKey = "common_loading",
  className,
}: RouteLoadingInlineProps) {
  const { t } = useI18n();
  return <span className={className}>{t(messageKey)}</span>;
}
