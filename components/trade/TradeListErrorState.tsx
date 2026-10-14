"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";

/** 거래 목록 로드 실패 — 빈 목록과 구분 (홈·카테고리 공용) */
export function TradeListErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-[14px] text-sam-muted">{t("trade_060")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 text-[14px] font-medium text-signature"
      >
        다시 시도
      </button>
    </div>
  );
}
