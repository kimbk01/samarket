"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibaySpinner } from "@/components/ui/DibaySpinner";
import type { MessageKey } from "@/lib/i18n/messages";

type RouteLoadingInlineProps = {
  /** 스크린리더 문구 — 화면에는 DIBAY 스피너만 보인다 */
  messageKey?: MessageKey;
  className?: string;
};

/**
 * 블록 안 대기 표시 — 예전 「불러오는 중…」 글자만 → DIBAY 스피너 단일 정의(md)
 * (`docs/audit/loading-spinner-network-notice-design-2026-11-22.md` §3-1).
 */
export function RouteLoadingInline({ messageKey = "common_loading", className }: RouteLoadingInlineProps) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex justify-center ${className ?? ""}`}>
      <DibaySpinner size="md" label={t(messageKey)} />
    </span>
  );
}
