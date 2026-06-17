"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { Sam } from "@/lib/ui/css-vars";

const DEFAULT_TIMEOUT_MS = 3_000;

type Options = {
  active: boolean;
  timeoutMs?: number;
  onRetry?: () => void;
};

/**
 * 메인 탭 로딩 — 3초 초과 시 무한 스피너 대신 재시도 UI.
 */
export function useMainTabLoadTimeout({ active, timeoutMs = DEFAULT_TIMEOUT_MS, onRetry }: Options) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const timer = window.setTimeout(() => setSlow(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [active, timeoutMs]);

  return { slow, retry: onRetry };
}

type SlowLoadPanelProps = {
  onRetry?: () => void;
};

export function MainTabSlowLoadPanel({ onRetry }: SlowLoadPanelProps) {
  const { safeT } = useI18n();
  const body = safeT("common_loading_data_retry_body", {
    fallbackKo: "데이터를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.",
    fallbackEn: "Loading data. Please try again in a moment.",
  });
  const retryLabel = safeT("common_retry", {
    fallbackKo: "다시 시도",
    fallbackEn: "Retry",
  });

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 bg-sam-app px-4"
      data-main-tab-slow-load=""
    >
      <p className="sam-text-body text-center text-sam-muted">{body}</p>
      {onRetry ? (
        <button type="button" className={`${Sam.btn.secondary} px-4 py-2`} onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
