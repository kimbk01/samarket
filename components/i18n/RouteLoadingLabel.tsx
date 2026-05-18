"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

type RouteLoadingLabelProps = {
  messageKey?: MessageKey;
  className?: string;
};

/** RSC `loading.tsx` 등에서 공통 로딩 문구 — `useI18n` 클라이언트 경계 */
export function RouteLoadingLabel({
  messageKey = "common_loading",
  className = "mt-3 sam-text-body text-sam-muted",
}: RouteLoadingLabelProps) {
  const { t } = useI18n();
  return <p className={className}>{t(messageKey)}</p>;
}
